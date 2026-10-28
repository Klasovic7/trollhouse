// ============================================================================
//  Wer ist es?
// ----------------------------------------------------------------------------
//  Jeder bekommt nacheinander Hinweise zu einer Person (bisher nur Kategorie
//  "Fußballer") - in zufälliger Reihenfolge, bei jeder Frage neu gemischt (v117,
//  vorher immer fest vom schwersten zum leichtesten). Wer zuerst buzzert, darf
//  als Erstes raten. Je weniger Hinweise bis dahin aufgedeckt waren, desto mehr
//  Punkte gibt es für eine richtige Antwort.
//
//  v359 (aktuelle Regeln): Platz 1 = n + 1 Punkte (n = Spieleranzahl), dann n - 1, n - 2 ...;
//  falsche Tipps kosten 1, 2, 3 ... Punkte je Person und Frage; ohne Lösung 0 Punkte; nach dem
//  letzten Hinweis bleiben 10 Sekunden. Die älteren Kommentare zu Buzzer/Hinweis-Punkten unten gelten nicht mehr.
//
//  Ablauf pro Runde (Felder im Raum-Dokument, alle mit Präfix "wi"):
//    frage_aktiv - Hinweise werden alle 7 Sekunden nachgelegt, alle raten gleichzeitig (seit v359 ohne Buzzer)
//    aufgeloest  - Antwort (oder "niemand wusste es") wird gezeigt
//    beendet     - Endstand
//
//  v95: Eine FALSCHE Antwort beendet die Runde NICHT mehr - sie kostet der
//  ratenden Person mindestens einen Punkt, alle sehen den geratenen Namen in
//  der Liste der bisherigen Fehlversuche, der nächste Hinweis wird sofort
//  aufgedeckt und jeder (auch die Person, die falsch lag) kann direkt weiter
//  buzzern. Nur eine RICHTIGE Antwort oder das manuelle Auflösen durch den
//  Spielleiter beendet die Runde (Status "aufgeloest").
//
//  v171: Der Punktabzug für falsche Antworten steigt jetzt pro Person UND pro
//  Frage an - der erste Fehlversuch kostet 1 Punkt, tippt dieselbe Person bei
//  DERSELBEN Frage danach nochmal falsch, kostet das 2 Punkte, beim dritten
//  Fehlversuch 3 usw. (siehe "vorherigeFalscheDerPerson" in antwortAbsenden()).
//  Andere Personen, die bei dieser Frage noch nicht falsch lagen, starten
//  weiterhin bei 1 Punkt Abzug - der Zähler ist also nicht global, sondern je
//  Frage und Person.
//
//  Wie bei Schätzfragen meldet sich dieses Modul über starten/raumDaten/spieler/
//  beenden zurück (siehe Kommentar in spiele/schaetzfragen/spiel.js).
// ============================================================================
import { updateDoc, increment, runTransaction, arrayUnion } from "../../kern/firebase.js";
import { spielerKarte, teamEndstandHtml, teamGruppeHtml, zeigeDebug, initBereitSystem } from "../../kern/ui.js";
import { erstelleTeams, ergaenzeFehlendeTeams } from "../../kern/teams.js";
import { speichereWertung, punkteFuerRang } from "../../kern/wertung.js";
import { pooleOhneWiederholung, aktualisierterVerlauf } from "../../kern/verlauf.js";

const HINWEIS_DAUER_MS = 7000;
// v359: Nach dem letzten Hinweis bleiben noch 10 Sekunden zum Lösen, danach wird aufgelöst.
const ANTWORT_ZEIT_MS = 10000;
const STANDARD_ANZAHL = 8;

const VORLAGE = `
  <div id="wi-setup" class="bildschirm-karte" hidden>
    <p class="hinweis-text">Ihr bekommt nacheinander Hinweise zu einem Fußballer - in
      zufälliger Reihenfolge. Alle raten gleichzeitig, so oft sie wollen. Wer zuerst richtig liegt,
      bekommt so viele Punkte wie Spieler im Raum plus einen Extrapunkt, der Zweite so viele
      wie Spieler minus 1, der Dritte minus 2 usw. Ein falscher Tipp kostet 1 Punkt,
      der nächste falsche bei derselben Frage 2, dann 3 ... Wer es nicht löst, bekommt 0.
      Nach dem letzten Hinweis bleiben noch 10 Sekunden.</p>

    <div id="wi-anzahl-zeile" class="setup-anzahlblock" hidden>
      <div class="setup-anzahl-zeile">
        <span>Anzahl Runden</span>
        <span class="anzahl-picker">
          <input id="wi-anzahl" type="text" inputmode="numeric" pattern="[0-9]*" min="1" value="8" class="anzahl-eingabe">
        </span>
      </div>
      <p id="wi-anzahl-max" class="hinweis-text"></p>
    </div>

    <div id="wi-teammodus-zeile" class="setup-modusblock" hidden>
      <div class="setup-moduszeile">
        <span class="modus-text-zeile">
          <span class="schalter-text">Teammodus</span>
          <details class="modus-info">
            <summary aria-label="Erklärung zum Teammodus">i</summary>
            <div>Jeder entscheidet sich für ein Team. Alle dürfen raten, aber die Punkte (richtig oder falsch) bekommt bzw. verliert immer nur die einzelne Person - der Team-Gesamtstand ist einfach die Summe aller Mitgliederpunkte.</div>
          </details>
        </span>
        <label class="schalter-zeile">
          <span class="schalter">
            <input type="checkbox" id="wi-teammodus">
            <span class="schalter-regler"></span>
          </span>
        </label>
      </div>
    </div>

    <div id="wi-teams" hidden>
      <div class="zt-team-grid">
        <button type="button" id="wi-team-wahl-blau" class="zt-team zt-team-blau zt-team-waehlbar">
          <h3>🔵 Team Blau</h3>
          <ul id="wi-team-blau"></ul>
        </button>
        <button type="button" id="wi-team-wahl-rot" class="zt-team zt-team-rot zt-team-waehlbar">
          <h3>🔴 Team Rot</h3>
          <ul id="wi-team-rot"></ul>
        </button>
      </div>
      <p><button id="wi-teams-zufall" class="btn-flach" hidden>Zufällige Teams</button></p>
    </div>

    <p id="wi-setup-fehler" class="fehler-text"></p>
    <p><button id="wi-starten" class="btn-primaer" hidden>Spiel starten</button></p>
    <p id="wi-setup-warten" hidden><em>Warte, bis der Spielleiter das Spiel startet …</em></p>
    <div id="wi-bereit-bereich" class="bereit-bereich" hidden></div>
  </div>

  <div id="wi-frage-screen" class="bildschirm-karte" hidden>
    <p class="kategorie">Fußballer</p>
    <p class="fortschritt" id="wi-frage-fortschritt"></p>
    <div class="wi-balken" id="wi-balken" aria-hidden="true"></div>

    <div class="wi-hinweis-aktuell" id="wi-hinweis-aktuell"></div>
    <ol class="wi-hinweis-liste" id="wi-hinweis-liste" reversed></ol>
    <p class="wi-countdown" id="wi-countdown"></p>

    <ul class="wi-falsch-liste" id="wi-falsch-liste" hidden></ul>

    <p id="wi-frage-status" class="hinweis-text"></p>

    <div id="wi-antwort-bereich">
      <ul class="wi-vorschlaege" id="wi-vorschlaege" hidden></ul>
      <p class="wi-antwort-zeile">
        <input id="wi-antwort-eingabe" type="text" placeholder="Name eintippen …" autocomplete="off" autocorrect="off" autocapitalize="words" spellcheck="false" enterkeyhint="send">
        <button id="wi-antwort-absenden">Absenden</button>
      </p>
      <p id="wi-antwort-fehler" class="fehler-text"></p>
    </div>

    <p><button id="wi-ueberspringen" class="btn-flach" hidden>Niemand weiß es - Frage auflösen</button></p>
  </div>

  <div id="wi-ergebnis-screen" class="bildschirm-karte" hidden>
    <p class="kategorie">Fußballer</p>
    <h2 id="wi-erg-status"></h2>
    <p>Gesucht war: <strong id="wi-erg-name"></strong></p>
    <ul id="wi-erg-liste"></ul>
    <p><button id="wi-weiter" hidden>Weiter</button></p>
  </div>

  <div id="wi-endstand-screen" class="bildschirm-karte" hidden>
    <h1>Endstand</h1>
    <div id="wi-endstand-teams" hidden></div>
    <ul id="wi-endstand-liste"></ul>
    <p id="wi-endstand-warten" hidden><em>Der Spielleiter wählt gleich das nächste Spiel …</em></p>
    <p><button id="wi-gesamtwertung-btn" class="btn-primaer" type="button" hidden>Gesamtwertung</button></p>
  </div>
`;

// ---------- Modulzustand ----------
let api = null;
let fragen = [];
let el = {};
let raum = {};
let spielerListe = [];

let index = -1;
let reihenfolge = [];
let gespielt = []; // Indizes der zuletzt gespielten Fragen (fuer Wiederholungsschutz)
// v117: pro Frage eine eigene, zufällige Hinweis-Reihenfolge (statt immer
// fest vom schwersten zum leichtesten) - ein Array parallel zu "reihenfolge",
// jeder Eintrag ist eine Permutation der Hinweis-Indizes dieser Frage.
let hinweisReihenfolgen = [];
let anzahlFragen = 0;
let anzahlEntwurf = null;
let anzahlEntwurfTimer = null;
let status = null;
let hinweisIndex = 1;
let hinweisSeit = 0;
let loeser = [];   // [{ id, platz, punkte }] in der Reihenfolge der richtigen Antworten (v359)
let antwortText = "";
let antwortKorrekt = null;
let falscheVersuche = [];
let gewuenschteAnzahl = 0;
let hinweisFortschreibenLaeuft = false;
let antwortZeitAblaufLaeuft = false;
let timerId = null;
let teammodus = false;
let teams = {};

const $ = (id) => el.wurzel.querySelector("#" + id);

function frageAn(pos) {
  return fragen[reihenfolge[pos]];
}

// v117: liefert die Hinweis-Reihenfolge für die Frage an Position "pos" - eine
// Permutation der Hinweis-Indizes. Fällt auf die unveränderte Reihenfolge
// zurück, falls (noch) keine gespeichert ist.
function hinweisPermutation(pos) {
  return hinweisReihenfolgen[pos] ?? frageAn(pos)?.hinweise.map((_, i) => i) ?? [];
}

function mischeIndizes(werte) {
  const gemischt = [...werte];
  for (let i = gemischt.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [gemischt[i], gemischt[j]] = [gemischt[j], gemischt[i]];
  }
  return gemischt;
}

// Nachname reicht auch - Groß-/Kleinschreibung und Akzente spielen keine Rolle.
function normalisiere(text) {
  return (text ?? "")
    .toLowerCase()
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .trim();
}

// v94: Tippfehler-Toleranz. In der Hektik beim Buzzern werden Namen oft leicht
// falsch getippt ("Osimen" statt "Osimhen") - das soll trotzdem als richtig
// zählen. Klassische Levenshtein-Distanz (Anzahl Einfuegen/Loeschen/Ersetzen,
// um von a zu b zu kommen); je laenger das Wort, desto mehr Abweichung ist
// erlaubt, damit kurze Namen nicht versehentlich mit einem komplett anderen
// kurzen Namen verwechselt werden.
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const zeile = new Array(n + 1);
  for (let j = 0; j <= n; j++) zeile[j] = j;
  for (let i = 1; i <= m; i++) {
    let vorherige = zeile[0];
    zeile[0] = i;
    for (let j = 1; j <= n; j++) {
      const temp = zeile[j];
      const kosten = a[i - 1] === b[j - 1] ? 0 : 1;
      zeile[j] = Math.min(zeile[j] + 1, zeile[j - 1] + 1, vorherige + kosten);
      vorherige = temp;
    }
  }
  return zeile[n];
}

function toleranzFuer(laenge) {
  if (laenge <= 4) return 0;
  if (laenge <= 7) return 1;
  return 2;
}

function passtUngefaehr(a, b) {
  if (!a || !b) return false;
  if (a === b) return true;
  const toleranz = toleranzFuer(Math.max(a.length, b.length));
  return toleranz > 0 && levenshtein(a, b) <= toleranz;
}

// v143: Vorher zaehlte als "Nachname" nur das allerletzte Wort - bei mehr-
// teiligen Nachnamen wie "Virgil van Dijk" oder "Kevin de Bruyne" wurde damit
// nur "Dijk"/"Bruyne" akzeptiert, "van Dijk"/"de Bruyne" aber faelschlich als
// falsch gewertet. Jetzt werden alle moeglichen Endungen ab dem zweiten Wort
// geprueft (bei drei Woertern also sowohl das letzte Wort als auch die
// letzten zwei), sodass jede gaengige Nachname-Schreibweise durchgeht.
function istAntwortRichtig(eingabe, name) {
  const a = normalisiere(eingabe);
  if (!a) return false;
  if (passtUngefaehr(a, normalisiere(name))) return true;
  const woerter = name.split(" ");
  for (let i = 1; i < woerter.length; i++) {
    const nachnameKandidat = normalisiere(woerter.slice(i).join(" "));
    if (passtUngefaehr(a, nachnameKandidat)) return true;
  }
  return false;
}


// v377: Namensvorschläge beim Tippen - man wählt einen Namen aus der Liste,
// dadurch gibt es keine Tippfehler mehr. Treffer: Wortanfang eines beliebigen
// Namensteils zuerst (Nachname vor Vorname), dann irgendwo im Namen.
function vorschlaegeFuer(eingabe) {
  const q = normalisiere(eingabe);
  if (q.length < 2) return [];
  const treffer = [];
  const gesehen = new Set();
  for (const f of fragen) {
    const name = f.name;
    if (gesehen.has(name)) continue;
    const n = normalisiere(name);
    const woerter = n.split(" ");
    let rang = -1;
    if (n === q) rang = 0;
    else if (woerter.slice(1).some((_, i) => woerter.slice(i + 1).join(" ").startsWith(q))) rang = 1;
    else if (woerter.some((w) => w.startsWith(q)) || n.startsWith(q)) rang = 2;
    else if (n.includes(q)) rang = 3;
    if (rang >= 0) { gesehen.add(name); treffer.push({ name, rang }); }
  }
  treffer.sort((a, b) => a.rang - b.rang || a.name.localeCompare(b.name, "de"));
  return treffer.slice(0, 5).map((t) => t.name);
}

function zeigeVorschlaege() {
  const liste = $("wi-vorschlaege");
  const eingabe = $("wi-antwort-eingabe").value;
  const namen = vorschlaegeFuer(eingabe);
  liste.innerHTML = "";
  // Schon vollständig gewählt -> Liste einklappen
  const gewaehlt = namen.length === 1 && normalisiere(namen[0]) === normalisiere(eingabe);
  if (!namen.length || gewaehlt) { liste.hidden = true; return; }
  for (const name of namen) {
    const li = document.createElement("li");
    const b = document.createElement("button");
    b.type = "button";
    b.textContent = name;
    // pointerdown + preventDefault: das Eingabefeld behält den Fokus (Tastatur bleibt offen)
    b.addEventListener("pointerdown", (e) => e.preventDefault());
    b.addEventListener("click", () => {
      $("wi-antwort-eingabe").value = name;
      $("wi-antwort-fehler").textContent = "";
      liste.hidden = true;
    });
    li.appendChild(b);
    liste.appendChild(li);
  }
  liste.hidden = false;
}

function eingabeIstGueltigerName(text) {
  const q = normalisiere(text);
  return fragen.some((f) => normalisiere(f.name) === q);
}

function formatiertePunkte(p) {
  return p > 0 ? `+${p}` : `${p}`;
}

// ============================================================================
//  Start
// ============================================================================
// Bereit-System (v190) - siehe kern/ui.js
let bereitSystem = null;
// v199: verhindert, dass der Bereit-Auto-Start (siehe zeigeSetup) mehrfach feuert.
let olympiadeAutoStart = false;

export async function starten(uebergebeneApi) {
  api = uebergebeneApi;
  el.wurzel = api.wurzel;
  el.wurzel.innerHTML = VORLAGE;
  bereitSystem = initBereitSystem(api, "wi");
  olympiadeAutoStart = false;

  if (fragen.length === 0) {
    const antwort = await fetch(new URL("fragen.json", import.meta.url), { cache: "no-store" });
    if (!antwort.ok) throw new Error("fragen.json konnte nicht geladen werden");
    fragen = await antwort.json();
  }

  verdrahteBedienelemente();

  if (api.istLeiter && !api.raum?.wiStatus) {
    await setzeGrundzustand("setup");
  }

  timerId = setInterval(() => { aktualisiereCountdown(); pruefeHinweisFortschritt(); }, 300);

  // v196/v199: Olympiade - die Anzahl steht schon vorab fest, wird hier nur
  // vorbelegt (Tick warten, bis spielerListe gefuellt ist). Gestartet wird
  // trotzdem erst, wenn alle Mitspieler*innen "Bereit" geklickt haben - das
  // uebernimmt der Aufruf in zeigeSetup() weiter unten.
  // v201: die Anzahl wird nicht mehr hier vorbelegt, sondern bei jedem
  // Render in zeigeSetup() direkt aus api.olympiadeAnzahl gesetzt (siehe
  // dort) - das war vorher nur einmalig hier passiert und ist danach beim
  // naechsten Render wieder verlorengegangen.
}

function verdrahteBedienelemente() {
  $("wi-anzahl").addEventListener("input", () => {
    const feld = $("wi-anzahl");
    const bereinigt = feld.value.replace(/[^0-9]/g, "");
    if (bereinigt !== feld.value) feld.value = bereinigt;
 
    schreibeAnzahlEntwurfLive();
  });
  $("wi-anzahl").addEventListener("change", () => anzahlUebernehmen());
  // v105: als type="number" ließ sich der vorhandene Wert beim Fokussieren nicht
  // markieren - jetzt ein Textfeld mit numerischer Tastatur, select() funktioniert.
  $("wi-anzahl").addEventListener("focus", () => { $("wi-anzahl").select(); });
  $("wi-teammodus").addEventListener("change", teammodusUmschalten);
  $("wi-team-wahl-blau").addEventListener("click", () => waehleEigenesTeam("blau"));
  $("wi-team-wahl-rot").addEventListener("click", () => waehleEigenesTeam("rot"));
  $("wi-teams-zufall").addEventListener("click", zufaelligeTeams);
  $("wi-starten").addEventListener("click", spielStarten);
  $("wi-antwort-absenden").addEventListener("click", antwortAbsenden);
  $("wi-antwort-eingabe").addEventListener("keydown", (e) => { if (e.key === "Enter") antwortAbsenden(); });
  $("wi-antwort-eingabe").addEventListener("input", () => { $("wi-antwort-fehler").textContent = ""; zeigeVorschlaege(); });
  $("wi-antwort-eingabe").addEventListener("focus", zeigeVorschlaege);
  $("wi-ueberspringen").addEventListener("click", ueberspringen);
  $("wi-weiter").addEventListener("click", weiter);
}

export function beenden() {
  bereitSystem = null;
  if (timerId) { clearInterval(timerId); timerId = null; }
  el = {}; raum = {}; spielerListe = [];
  index = -1; reihenfolge = []; hinweisReihenfolgen = []; anzahlFragen = 0; status = null;
  hinweisIndex = 1; hinweisSeit = 0; loeser = [];
  antwortText = ""; antwortKorrekt = null; falscheVersuche = []; gewuenschteAnzahl = 0; anzahlEntwurf = null;
  hinweisFortschreibenLaeuft = false;
  teammodus = false; teams = {};
}

export function spieler(liste) {
  spielerListe = liste;
  if (!el.wurzel) return;
  if (status === "setup" || !status) zeigeSetup();
  else if (status === "frage_aktiv") zeigeFrage();
  else if (status === "aufgeloest") zeigeErgebnis();
  else if (status === "beendet") zeigeEndstand();
}

// ============================================================================
//  Reaktion auf das Raum-Dokument
// ============================================================================
export function raumDaten(daten) {
  if (!daten || !el.wurzel) return;
  raum = daten;
  status = daten.wiStatus ?? null;
  reihenfolge = daten.wiReihenfolge ?? [];
  gespielt = daten.wiGespielt ?? [];
  // v124: Firestore erlaubt keine verschachtelten Arrays - pro Frage wird die
  // Hinweis-Reihenfolge deshalb als kommagetrennte Zeichenkette abgelegt und
  // hier wieder in ein Zahlen-Array zurückverwandelt.
  hinweisReihenfolgen = (daten.wiHinweisReihenfolgen ?? []).map((eintrag) =>
    typeof eintrag === "string" ? eintrag.split(",").map(Number) : (eintrag ?? [])
  );
  anzahlFragen = daten.wiAnzahlFragen ?? 0;
  anzahlEntwurf = daten.wiAnzahlEntwurf ?? null;
  hinweisIndex = daten.wiHinweisIndex ?? 1;
  hinweisSeit = daten.wiHinweisSeit ?? 0;
  loeser = daten.wiLoeser ?? [];
  antwortText = daten.wiAntwortText ?? "";
  antwortKorrekt = daten.wiAntwortKorrekt ?? null;
  falscheVersuche = daten.wiFalscheVersuche ?? [];
  teammodus = !!daten.wiTeammodus;
  teams = daten.wiTeams ?? {};

  if ($("wi-teammodus").checked !== teammodus) $("wi-teammodus").checked = teammodus;

  const neuerIndex = daten.wiFragenIndex ?? 0;
  if (index !== neuerIndex) {
    index = neuerIndex;
    $("wi-antwort-eingabe").value = "";
    $("wi-antwort-fehler").textContent = "";
    $("wi-vorschlaege").hidden = true;
  }

  // v112: die frühere "Frage X von Y"-Zeile auf dem Bildschirm ist jetzt die
  // gemeinsame Fortschrittsanzeige oben im Spielkopf (siehe api.fortschritt) -
  // dort steht sie während der Setup-/Endstand-Screens aber nicht sinnvoll zur
  // Verfügung, deshalb nur bei aktiver Frage bzw. Ergebnis anzeigen.
  api.fortschritt(
    status === "frage_aktiv" || status === "aufgeloest"
      ? `${index + 1}/${anzahlFragen}`
      : ""
  );

  alleVerstecken();
  if (status === "setup" || !status) {
    zeigeSetup();
    $("wi-setup").hidden = false;
  } else if (status === "frage_aktiv") {
    zeigeFrage();
    $("wi-frage-screen").hidden = false;
  } else if (status === "aufgeloest") {
    zeigeErgebnis();
    $("wi-ergebnis-screen").hidden = false;
  } else if (status === "beendet") {
    zeigeEndstand();
    $("wi-endstand-screen").hidden = false;
  }
}

function alleVerstecken() {
  ["wi-setup", "wi-frage-screen", "wi-ergebnis-screen", "wi-endstand-screen"]
    .forEach((id) => { $(id).hidden = true; });
}

// ============================================================================
//  Setup
// ============================================================================
function zeigeSetup() {
  // v201-Fix: vorher wurde die Anzahl nur einmalig beim Leiter per
  // setTimeout in starten() vorbelegt - jeder weitere zeigeSetup()-Aufruf
  // (z. B. wenn ein Mitspieler auf "Bereit" tippt) hat gewuenschteAnzahl NIE
  // angepasst, wodurch das Feld (und die tatsaechlich gespielte Anzahl!)
  // wieder auf den normalen Standardwert zurueckfiel, statt der in der
  // Olympiade-Planung festgelegten Zahl. api.olympiadeAnzahl ist bei ALLEN
  // Clients (Leiter wie Mitspieler*innen) gleichermaßen verfuegbar - bei
  // jedem Render fest darauf setzen und das Feld komplett sperren.
  const inOlympiade = Boolean(api.olympiadeAnzahl);
  if (inOlympiade) {
    gewuenschteAnzahl = Math.min(Math.max(1, api.olympiadeAnzahl), fragen.length);
    $("wi-anzahl").max = String(Math.max(1, fragen.length));
    $("wi-anzahl").value = String(gewuenschteAnzahl);
    $("wi-anzahl-max").textContent = `In der Olympiade festgelegt: ${gewuenschteAnzahl} ${gewuenschteAnzahl === 1 ? "Runde" : "Runden"}.`;
    $("wi-anzahl-zeile").hidden = false;
    $("wi-anzahl").disabled = true;
  } else if (api.istLeiter) {
    if (gewuenschteAnzahl === 0) gewuenschteAnzahl = Math.min(STANDARD_ANZAHL, fragen.length);
    $("wi-anzahl").max = String(Math.max(1, fragen.length));
    $("wi-anzahl").value = String(gewuenschteAnzahl);
    $("wi-anzahl-max").textContent = `Insgesamt ${fragen.length} Runden verfügbar.`;
    $("wi-anzahl-zeile").hidden = false;
    $("wi-anzahl").disabled = false;
  } else {
    gewuenschteAnzahl = anzahlEntwurf ?? Math.min(STANDARD_ANZAHL, fragen.length);
    $("wi-anzahl").max = String(Math.max(1, fragen.length));
    $("wi-anzahl").value = String(gewuenschteAnzahl);
    $("wi-anzahl-max").textContent = `Insgesamt ${fragen.length} Runden verfügbar.`;
    $("wi-anzahl-zeile").hidden = false;
    $("wi-anzahl").disabled = true;
  }
  // v200: in der Olympiade entfaellt der Team-Modus komplett - alle spielen
  // einzeln, damit sich niemand extra dafuer koordinieren muss.
  if (inOlympiade) teammodus = false;
  $("wi-teammodus-zeile").hidden = inOlympiade;
  const teamSchalter = $("wi-teammodus");
  teamSchalter.checked = teammodus;
  teamSchalter.disabled = !api.istLeiter;
  $("wi-teams").hidden = !teammodus;
  $("wi-teams-zufall").hidden = !api.istLeiter;
  if (teammodus) {
    rendereTeamListe("blau");
    rendereTeamListe("rot");
  }
  $("wi-starten").hidden = !api.istLeiter;
  $("wi-setup-warten").hidden = api.istLeiter;
  bereitSystem?.render();

  // v199: In der Olympiade ist die Anzahl schon vorab festgelegt, aber es
  // soll trotzdem ganz normal erst "Bereit" geklickt werden muessen - sobald
  // alle Mitspieler*innen bereit sind, startet das Spiel automatisch, ohne
  // dass der Leiter selbst noch auf "Spiel starten" tippen muss.
  if (api.istLeiter && api.olympiadeAnzahl && !olympiadeAutoStart && bereitSystem?.alleBereit()) {
    olympiadeAutoStart = true;
    spielStarten();
  }
}

// v109: Teammodus - alle dürfen buzzern, gewinnt aber das ganze Team die Punkte
// (siehe antwortAbsenden). Jeder wählt sich selbst ein Team; nur der Spielleiter
// darf über "Zufällige Teams" alle Zuordnungen neu auswürfeln.
async function teammodusUmschalten() {
  if (!api.istLeiter) return;
  const aktiviert = $("wi-teammodus").checked;
  const neueTeams = aktiviert ? teams : {};
  try {
    await updateDoc(api.raumRef(), { wiTeammodus: aktiviert, wiTeams: neueTeams });
  } catch (e) {
    $("wi-teammodus").checked = teammodus;
    zeigeDebug("Teammodus konnte nicht geändert werden: " + e.message);
  }
}

async function waehleEigenesTeam(team) {
  if (!teammodus) return;
  try {
    await updateDoc(api.raumRef(), { wiTeams: { ...teams, [api.spielerId]: team } });
  } catch (e) {
    zeigeDebug("Team konnte nicht gewählt werden: " + e.message);
  }
}

async function zufaelligeTeams() {
  if (!api.istLeiter || !teammodus) return;
  $("wi-teams-zufall").disabled = true;
  try {
    await updateDoc(api.raumRef(), {
      wiTeams: erstelleTeams(spielerListe.map((spieler) => spieler.id))
    });
  } catch (e) {
    zeigeDebug("Teams konnten nicht neu gemischt werden: " + e.message);
  }
  $("wi-teams-zufall").disabled = false;
}

function rendereTeamListe(team) {
  const liste = $("wi-team-" + team);
  liste.innerHTML = "";
  spielerListe.filter((spieler) => teams[spieler.id] === team).forEach((spieler) => {
    const li = document.createElement("li");
    li.textContent = spieler.name + (spieler.id === api.spielerId ? " (du)" : "");
    liste.appendChild(li);
  });
  if (!liste.children.length) {
    const li = document.createElement("li");
    li.textContent = "Noch niemand";
    liste.appendChild(li);
  }
  $("wi-team-wahl-" + team).classList.toggle("zt-team-eigenes", teams[api.spielerId] === team);
}

// v104: ersetzt den fruehereren Plus/Minus-Stepper - das Zahlenfeld wird
// beim Verlassen (change) auf [1, Anzahl verfuegbarer Fragen] begrenzt.
// v214: Schreibt den vom Leiter eingegebenen "Anzahl"-Wert entprellt live in
// den Raum, damit Mitspieler*innen im Setup-Bildschirm sofort den
// tatsaechlichen Stand sehen statt eines stehengebliebenen Default-Werts.
function schreibeAnzahlEntwurfLive() {
  if (!api.istLeiter) return;
  clearTimeout(anzahlEntwurfTimer);
  anzahlEntwurfTimer = setTimeout(() => {
    const wert = parseInt($("wi-anzahl").value, 10);
    if (Number.isFinite(wert) && wert > 0) {
      updateDoc(api.raumRef(), { wiAnzahlEntwurf: wert }).catch(() => {});
    }
  }, 300);
}

function anzahlUebernehmen() {
  if (!api.istLeiter) return;
  let wert = parseInt($("wi-anzahl").value, 10);
  if (!Number.isFinite(wert) || wert < 1) wert = 1;
  if (wert > fragen.length) wert = fragen.length;
  gewuenschteAnzahl = wert;
  $("wi-anzahl").value = String(wert);
}

async function setzeGrundzustand(wiStatus) {
  await updateDoc(api.raumRef(), {
    wiStatus, wiReihenfolge: [], wiHinweisReihenfolgen: [], wiFragenIndex: 0, wiAnzahlFragen: 0, wiAnzahlEntwurf: 0,
    wiHinweisIndex: 1, wiHinweisSeit: 0, wiGebuzzertVon: null, wiGebuzzertSeit: 0,
    wiAntwortText: "", wiAntwortKorrekt: null, wiPunkteDieserRunde: 0,
    wiFalscheVersuche: [], wiLoeser: [], wiTeammodus: false, wiTeams: {}, wiRundenDelta: {}
  });
}

async function raeumeSpieldatenAuf() {
  await Promise.all(spielerListe.map((s) => updateDoc(api.spielerRef(s.id), { punkte: 0 })));
}

async function spielStarten() {
  $("wi-setup-fehler").textContent = "";
  if (fragen.length === 0) {
    $("wi-setup-fehler").textContent = "Es sind noch keine Fußballer hinterlegt.";
    return;
  }
  anzahlUebernehmen();
  $("wi-starten").disabled = true;
  try {
    await raeumeSpieldatenAuf();
    const anzahl = Math.min(gewuenschteAnzahl || fragen.length, fragen.length);
    // Wiederholungsschutz: bevorzugt Fragen ziehen, die in diesem Raum noch
    // nicht drankamen (siehe kern/verlauf.js).
    const { kandidaten, wurdeZurueckgesetzt } = pooleOhneWiederholung(fragen.map((_, i) => i), gespielt, anzahl);
    const neueReihenfolge = mischeIndizes(kandidaten).slice(0, anzahl);
    const neuerGespielt = aktualisierterVerlauf(gespielt, neueReihenfolge, wurdeZurueckgesetzt);
    // v117 hatte hier pro Frage eine zufällige Hinweis-Reihenfolge erzeugt -
    // in v168 wieder zurückgestellt auf die feste Autoren-Reihenfolge: viele
    // Hinweise bauen bewusst aufeinander auf (z. B. "Wechselte danach nach
    // München" -> "Wurde DORT Rekordtorschütze") oder sind absichtlich von
    // vage/schwer zu konkret/leicht sortiert - eine zufällige Reihenfolge
    // konnte diese Bezüge zerstören (ein Hinweis erschien, bevor der Hinweis
    // kam, auf den er sich bezieht).
    // Als kommagetrennte Zeichenkette statt verschachteltem Array speichern -
    // Firestore-Dokumente dürfen kein Array-im-Array enthalten (siehe raumDaten()).
    const neueHinweisReihenfolgen = neueReihenfolge.map((frageIndex) =>
      fragen[frageIndex].hinweise.map((_, i) => i).join(",")
    );
    const neueTeams = teammodus
      ? ergaenzeFehlendeTeams(teams, spielerListe.map((spieler) => spieler.id))
      : teams;
    await updateDoc(api.raumRef(), {
      wiStatus: "frage_aktiv", wiFragenIndex: 0, wiAnzahlFragen: anzahl,
      wiReihenfolge: neueReihenfolge, wiHinweisReihenfolgen: neueHinweisReihenfolgen,
      wiGespielt: neuerGespielt,
      wiHinweisIndex: 1, wiHinweisSeit: Date.now(),
      wiGebuzzertVon: null, wiGebuzzertSeit: 0, wiAntwortText: "", wiAntwortKorrekt: null, wiPunkteDieserRunde: 0,
      wiFalscheVersuche: [], wiLoeser: [], wiTeammodus: teammodus, wiTeams: neueTeams, wiRundenDelta: {}
    });
  } catch (e) {
    zeigeDebug("Fehler beim Start: " + e.message);
  }
  $("wi-starten").disabled = false;
}

// v90: Gleicher Rückweg-Haken wie bei Schätzfragen (siehe dort, v87) - der obere
// Button in der Kopfzeile räumt darüber die Rundendaten dieses Spiels mit auf.
export async function vorZurueck() {
  await raeumeSpieldatenAuf();
  await setzeGrundzustand("setup");
  await api.zurueckZurAuswahl();
}

// ============================================================================
//  Frage: Hinweise, Buzzer, Antwort
// ============================================================================
function zeigeFrage() {
  const frage = frageAn(index);
  if (!frage) return;

  // v112: "Frage X von Y" steht jetzt oben im Spielkopf (api.fortschritt) - an
  // dieser Stelle zeigen wir stattdessen, der wievielte Hinweis gerade dran ist.
  const gesamt = frage.hinweise.length;
  const sichtbar = Math.min(Math.max(hinweisIndex, 1), gesamt);
  const perm = hinweisPermutation(index);
  $("wi-frage-fortschritt").textContent = `Hinweis ${sichtbar} von ${gesamt}`;
  const balken = $("wi-balken");
  balken.innerHTML = "";
  for (let i = 0; i < gesamt; i++) {
    const punkt = document.createElement("span");
    if (i < sichtbar) punkt.className = i === sichtbar - 1 ? "aktuell" : "gezeigt";
    balken.appendChild(punkt);
  }
  // Neuester Hinweis groß oben mit Nummer, die früheren darunter (neu -> alt),
  // alle gut lesbar und nummeriert.
  const aktuell = $("wi-hinweis-aktuell");
  aktuell.innerHTML = "";
  const nr = document.createElement("span");
  nr.className = "wi-nr";
  nr.textContent = String(sichtbar);
  const txt = document.createElement("span");
  txt.className = "wi-hinweis-text";
  txt.textContent = frage.hinweise[perm[sichtbar - 1] ?? sichtbar - 1] ?? "";
  aktuell.append(nr, txt);

  const liste = $("wi-hinweis-liste");
  liste.innerHTML = "";
  for (let i = sichtbar - 2; i >= 0; i--) {
    const li = document.createElement("li");
    const n = document.createElement("span");
    n.className = "wi-nr";
    n.textContent = String(i + 1);
    const t = document.createElement("span");
    t.className = "wi-hinweis-text";
    t.textContent = frage.hinweise[perm[i] ?? i];
    li.append(n, t);
    liste.appendChild(li);
  }

  // v95: Bisherige Fehlversuche dieser Runde - für alle sichtbar, damit man
  // nicht denselben schon genannten falschen Namen nochmal versucht.
  const falschListe = $("wi-falsch-liste");
  falschListe.innerHTML = "";
  falscheVersuche.forEach((v) => {
    const li = document.createElement("li");
    const abzug = v.abzug ?? 1;
    li.textContent = `${v.name}: „${v.text}“ - falsch (-${abzug} ${abzug === 1 ? "Punkt" : "Punkte"})`;
    falschListe.appendChild(li);
  });
  falschListe.hidden = falscheVersuche.length === 0;

  // v359: Kein Buzzer mehr - alle raten gleichzeitig weiter, bis sie es haben.
  // Platz 1 bekommt n + 1 Punkte, danach n - 1, n - 2 ... (n = Spieleranzahl).
  const ichGeloest = loeser.find((l) => l.id === api.spielerId);
  $("wi-antwort-bereich").hidden = !!ichGeloest;
  $("wi-ueberspringen").hidden = !api.istLeiter || sichtbar < gesamt;
  const geloestText = loeser.map((l) => `${l.platz}. ${spielerListe.find((x) => x.id === l.id)?.name ?? "?"}`).join(", ");
  const teile = [];
  if (ichGeloest) teile.push(`✅ Richtig! Du bist auf Platz ${ichGeloest.platz} (+${ichGeloest.punkte} Punkte). Die anderen raten noch …`);
  if (loeser.length) teile.push(`Schon gelöst: ${geloestText}`);
  $("wi-frage-status").textContent = teile.join(" · ");
}

function aktualisiereCountdown() {
  if (!el.wurzel) return;
  if (status !== "frage_aktiv") { $("wi-countdown").textContent = ""; return; }
  const frage = frageAn(index);
  if (!frage) return;
  const gesamt = frage.hinweise.length;
  if (hinweisIndex >= gesamt) {
    // Nach dem letzten Hinweis bleiben noch ANTWORT_ZEIT_MS zum Lösen.
    const rest = Math.max(0, ANTWORT_ZEIT_MS - (Date.now() - hinweisSeit));
    $("wi-countdown").textContent = `Letzter Hinweis - noch ${Math.ceil(rest / 1000)}s zum Lösen`;
    return;
  }
  const rest = Math.max(0, HINWEIS_DAUER_MS - (Date.now() - hinweisSeit));
  $("wi-countdown").textContent = `Nächster Hinweis in ${Math.ceil(rest / 1000)}s`;
}

// Nur der Spielleiter-Client schreibt das Fortschalten in den Raum - sonst
// würden mehrere Geräte gleichzeitig denselben nächsten Hinweis aufdecken.
async function pruefeHinweisFortschritt() {
  if (!api?.istLeiter || status !== "frage_aktiv" || hinweisFortschreibenLaeuft) return;
  const frage = frageAn(index);
  if (!frage) return;
  // v359: Die Runde endet, wenn alle (aktuellen) Mitspieler gelöst haben oder nach dem
  // letzten Hinweis ANTWORT_ZEIT_MS (10 s) vergangen sind.
  const alleGeloest = spielerListe.length > 0 && spielerListe.every((s) => loeser.some((l) => l.id === s.id));
  const zeitUm = hinweisIndex >= frage.hinweise.length && Date.now() - hinweisSeit >= ANTWORT_ZEIT_MS;
  if (alleGeloest || zeitUm) {
    hinweisFortschreibenLaeuft = true;
    try {
      await runTransaction(api.db, async (tx) => {
        const snap = await tx.get(api.raumRef());
        const d = snap.data();
        if (!d || d.wiStatus !== "frage_aktiv" || (d.wiFragenIndex ?? 0) !== index) return;
        tx.update(api.raumRef(), { wiStatus: "aufgeloest" });
      });
    } catch (e) {
      zeigeDebug("Fehler beim Auflösen: " + e.message);
    }
    hinweisFortschreibenLaeuft = false;
    return;
  }
  if (hinweisIndex >= frage.hinweise.length) return;
  if (Date.now() - hinweisSeit < HINWEIS_DAUER_MS) return;

  hinweisFortschreibenLaeuft = true;
  try {
    await updateDoc(api.raumRef(), { wiHinweisIndex: increment(1), wiHinweisSeit: Date.now() });
  } catch (e) {
    zeigeDebug("Fehler beim Aufdecken des nächsten Hinweises: " + e.message);
  }
  hinweisFortschreibenLaeuft = false;
}

// ============================================================================
//  Antworten (v359): Alle raten gleichzeitig, jede*r beliebig oft.
//  Richtig: Platz k = Anzahl bisher Richtiger + 1 -> n + 1 Punkte für Platz 1, dann n - 1,
//  n - 2 ... (der Letzte bekommt 1). Falsch: Abzug 1, 2, 3 ... je Person und Frage.
//  Wer es bis zum Ende nicht löst, bekommt 0 für diese Frage.
//  Die Transaktion sorgt dafür, dass bei gleichzeitigen Antworten die Plätze sauber
//  nacheinander vergeben werden.
// ============================================================================
async function antwortAbsenden() {
  if (status !== "frage_aktiv" || loeser.some((l) => l.id === api.spielerId)) return;
  const text = $("wi-antwort-eingabe").value.trim();
  if (!text) {
    $("wi-antwort-fehler").textContent = "Bitte eine Antwort eingeben.";
    return;
  }
  if (!eingabeIstGueltigerName(text)) {
    const moeglich = vorschlaegeFuer(text);
    if (moeglich.length === 1) {
      $("wi-antwort-eingabe").value = moeglich[0];
      $("wi-antwort-fehler").textContent = "Bitte nochmal auf Absenden tippen.";
    } else {
      $("wi-antwort-fehler").textContent = "Bitte einen Namen aus der Vorschlagsliste antippen.";
      zeigeVorschlaege();
    }
    return;
  }
  $("wi-antwort-fehler").textContent = "";
  $("wi-antwort-absenden").disabled = true;
  try {
    const frage = frageAn(index);
    const richtig = istAntwortRichtig(text, frage.name);
    const n = spielerListe.length;
    let art = "";
    let abzugGemerkt = 0;
    await runTransaction(api.db, async (tx) => {
      const snap = await tx.get(api.raumRef());
      const daten = snap.data();
      if (!daten || daten.wiStatus !== "frage_aktiv" || (daten.wiFragenIndex ?? 0) !== index) { art = "zuspaet"; return; }
      const geloest = daten.wiLoeser ?? [];
      if (geloest.some((l) => l.id === api.spielerId)) { art = "schon"; return; }
      if (richtig) {
        const platz = geloest.length + 1;
        const punkte = punkteFuerRang(platz, n);
        const neu = [...geloest, { id: api.spielerId, platz, punkte }];
        const upd = { wiLoeser: neu, ["wiRundenDelta." + api.spielerId]: increment(punkte) };
        if (neu.length >= n) upd.wiStatus = "aufgeloest";
        tx.update(api.raumRef(), upd);
        tx.update(api.spielerRef(), { punkte: increment(punkte) });
        art = "richtig";
      } else {
        const abzug = (daten.wiFalscheVersuche ?? []).filter((v) => v.spielerId === api.spielerId).length + 1;
        tx.update(api.raumRef(), {
          wiFalscheVersuche: arrayUnion({ name: api.spielerName, text, spielerId: api.spielerId, abzug }),
          ["wiRundenDelta." + api.spielerId]: increment(-abzug)
        });
        tx.update(api.spielerRef(), { punkte: increment(-abzug) });
        abzugGemerkt = abzug;
        art = "falsch";
      }
    });
    $("wi-antwort-eingabe").value = "";
    $("wi-vorschlaege").hidden = true;
    if (art === "zuspaet") $("wi-antwort-fehler").textContent = "Zu spät - die Runde ist schon vorbei.";
    else if (art === "falsch") $("wi-antwort-fehler").textContent = `Leider falsch (-${abzugGemerkt} ${abzugGemerkt === 1 ? "Punkt" : "Punkte"}). Versuch es nochmal!`;
  } catch (e) {
    zeigeDebug("Fehler beim Absenden der Antwort: " + e.message);
  }
  $("wi-antwort-absenden").disabled = false;
}

// Spielleiter kann jederzeit abbrechen, wenn eine Runde feststeckt (z. B. weil
// niemand mehr buzzert, oder der Ratende die Antwort nie abschickt).
async function ueberspringen() {
  if (!api.istLeiter) return;
  try {
    await updateDoc(api.raumRef(), {
      wiStatus: "aufgeloest", wiAntwortText: "", wiAntwortKorrekt: null,
      wiPunkteDieserRunde: 0, wiGebuzzertVon: null, wiGebuzzertSeit: 0
    });
  } catch (e) {
    zeigeDebug("Fehler beim Überspringen: " + e.message);
  }
}

// ============================================================================
//  Auswertung
// ============================================================================
function zeigeErgebnis() {
  const frage = frageAn(index);
  if (!frage) return;
  $("wi-erg-name").textContent = frage.name;

  if (!loeser.length) {
    $("wi-erg-status").textContent = "Niemand hat es gelöst";
  } else {
    const erster = spielerListe.find((s) => s.id === loeser[0].id)?.name ?? "?";
    $("wi-erg-status").textContent = loeser.length === 1
      ? `${erster} hat es als Einziger/Einzige erkannt! 🎉`
      : `${erster} war am schnellsten! 🎉`;
  }
  const platzText = (id) => {
    const l = loeser.find((x) => x.id === id);
    return l ? `Platz ${l.platz}` : "nicht gelöst";
  };

  const liste = $("wi-erg-liste");

  // v110: Im Teammodus nach Team gruppiert (Kachel mit Gesamtpunktzahl oben,
  // einzelne Spieler mit eigenen Punkten darunter) statt einer gemeinsamen Liste.
  // v112: Sowohl richtige als auch falsche Antworten verändern nur die Punkte der
  // einzelnen Person. Da eine Runde bei Wer ist es? aus mehreren Buzzer-Versuchen
  // bestehen kann, reicht "hatGewonnen" (nur der letzte, auflösende Versuch) nicht
  // mehr aus - "wiRundenDelta" merkt sich für JEDE Person die Summe ihrer Punkte
  // in DIESER Runde (auch einen zwischenzeitlichen Fehlversuch einer anderen Person).
  if (teammodus) {
    liste.innerHTML = teamGruppeHtml(spielerListe, teams, (s) => {
      return spielerKarte(
        s.name, s.farbe, s.icon,
        formatiertePunkte(raum.wiRundenDelta?.[s.id] ?? 0),
        { extra: platzText(s.id), punkteRechts: s.punkte ?? 0 }
      );
    });
  } else {
    liste.innerHTML = "";
    [...spielerListe].sort((a, b) => (raum.wiRundenDelta?.[b.id] ?? 0) - (raum.wiRundenDelta?.[a.id] ?? 0)).forEach((s) => {
      const li = document.createElement("li");
      li.innerHTML = spielerKarte(
        s.name, s.farbe, s.icon,
        formatiertePunkte(raum.wiRundenDelta?.[s.id] ?? 0),
        { extra: platzText(s.id), punkteRechts: s.punkte ?? 0 }
      );
      liste.appendChild(li);
    });
  }

  $("wi-weiter").hidden = !api.istLeiter;
  $("wi-weiter").textContent = index + 1 >= anzahlFragen ? "Endstand anzeigen" : "Nächste Frage";
}

async function weiter() {
  $("wi-weiter").disabled = true;
  try {
    const naechster = index + 1;
    if (naechster >= anzahlFragen) {
      await updateDoc(api.raumRef(), { wiStatus: "beendet" });
      speichereWertung(api, "wer-ist-es", Object.fromEntries(spielerListe.map((s) => [s.id, s.punkte ?? 0])));
    } else {
      await updateDoc(api.raumRef(), {
        wiStatus: "frage_aktiv", wiFragenIndex: naechster,
        wiHinweisIndex: 1, wiHinweisSeit: Date.now(),
        wiGebuzzertVon: null, wiGebuzzertSeit: 0, wiAntwortText: "", wiAntwortKorrekt: null, wiPunkteDieserRunde: 0,
        wiFalscheVersuche: [], wiLoeser: [], wiRundenDelta: {}
      });
    }
  } catch (e) {
    zeigeDebug("Fehler beim Weiterschalten: " + e.message);
  }
  $("wi-weiter").disabled = false;
}

function zeigeEndstand() {
  if (!el.wurzel) return;
  const sortiert = [...spielerListe].sort((a, b) => (b.punkte ?? 0) - (a.punkte ?? 0));
  const liste = $("wi-endstand-liste");
  liste.innerHTML = "";
  sortiert.forEach((s, i) => {
    const li = document.createElement("li");
    li.innerHTML = spielerKarte(s.name, s.farbe, s.icon, s.punkte ?? 0, { rang: i + 1 });
    liste.appendChild(li);
  });
  const teamsEl = $("wi-endstand-teams");
  teamsEl.hidden = !teammodus;
  if (teammodus) teamsEl.innerHTML = teamEndstandHtml(spielerListe, teams);
  $("wi-endstand-warten").hidden = api.istLeiter;
  // v202: in einer laufenden Olympiade fuehrt dieser Button jetzt zur
  // Gesamtwertung statt direkt zum naechsten Spiel - "Naechstes Spiel"
  // gibt es von dort aus als eigenen Button (siehe oeffneWertungDialog()
  // in app.js). So bleibt der eigene Endstand erst einmal sichtbar.
  const wiGesamtwertungBtn = $("wi-gesamtwertung-btn");
  if (wiGesamtwertungBtn) {
    wiGesamtwertungBtn.hidden = !(api.istLeiter && Boolean(api.olympiadeAnzahl));
    wiGesamtwertungBtn.onclick = () => api.zeigeGesamtwertung();
  }
}

// Für lokale Logiktests exportiert; das Spiel selbst verwendet dieselben Funktionen.
export { istAntwortRichtig, mischeIndizes };
