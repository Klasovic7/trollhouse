// ============================================================================
//  Wann war es?
// ----------------------------------------------------------------------------
//  Baugleich zu "Wer ist es?" (siehe spiele/wer-ist-es/spiel.js für die
//  ausführlichen Kommentare zum Ablauf) - nur dass statt eines Fußballers ein
//  JAHR gesucht wird. Jeder bekommt nacheinander Hinweise zu einem Jahr, in
//  fester (Autoren-)Reihenfolge. Wer zuerst buzzert, darf raten. Je weniger
//  Hinweise bis dahin aufgedeckt waren, desto mehr Punkte gibt es für eine
//  richtige Antwort.
//
//  v359 (aktuelle Regeln): Platz 1 = n + 1 Punkte (n = Spieleranzahl), dann n - 1, n - 2 ...;
//  falsche Tipps kosten 1, 2, 3 ... Punkte je Person und Frage; ohne Lösung 0 Punkte; nach dem
//  letzten Hinweis bleiben 10 Sekunden. Die älteren Kommentare zu Buzzer/Hinweis-Punkten unten gelten nicht mehr.
//
//  Ablauf pro Runde (Felder im Raum-Dokument, alle mit Präfix "ww"):
//    frage_aktiv - Hinweise werden alle 7 Sekunden nachgelegt, alle raten gleichzeitig (seit v359 ohne Buzzer)
//    aufgeloest  - Antwort (oder "niemand wusste es") wird gezeigt
//    beendet     - Endstand
//
//  Punkte: Eine FALSCHE Antwort beendet die Runde nicht - sie kostet der
//  ratenden Person mindestens einen Punkt, alle sehen den geratenen Wert in
//  der Liste der bisherigen Fehlversuche, der nächste Hinweis wird sofort
//  aufgedeckt und jeder (auch die Person, die falsch lag) kann direkt weiter
//  buzzern. Nur eine RICHTIGE Antwort oder das manuelle Auflösen durch den
//  Spielleiter beendet die Runde (Status "aufgeloest").
//  Der Punktabzug steigt pro Person UND pro Frage an - der erste Fehlversuch
//  kostet 1 Punkt, tippt dieselbe Person bei DERSELBEN Frage danach nochmal
//  falsch, kostet das 2 Punkte, beim dritten Fehlversuch 3 usw. Andere
//  Personen, die bei dieser Frage noch nicht falsch lagen, starten weiterhin
//  bei 1 Punkt Abzug.
//
//  v1: Erste Version, mit 3 Jahren zum Ausprobieren (siehe jahre.json).
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
  <div id="ww-setup" class="bildschirm-karte" hidden>
    <h1>📅 Wann war es?</h1>
    <p class="hinweis-text">Ihr bekommt nacheinander Hinweise zu einem Jahr - in
      fester Reihenfolge. Alle raten gleichzeitig, so oft sie wollen. Wer zuerst das richtige
      Jahr nennt, bekommt so viele Punkte wie Spieler im Raum plus einen Extrapunkt, der Zweite so viele
      wie Spieler minus 1, der Dritte minus 2 usw. Ein falscher Tipp kostet 1 Punkt,
      der nächste falsche bei derselben Frage 2, dann 3 ... Wer es nicht löst, bekommt 0.
      Nach dem letzten Hinweis bleiben noch 10 Sekunden.</p>

    <div id="ww-anzahl-zeile" class="setup-anzahlblock" hidden>
      <div class="setup-anzahl-zeile">
        <span>Anzahl Runden</span>
        <span class="anzahl-picker">
          <input id="ww-anzahl" type="text" inputmode="numeric" pattern="[0-9]*" min="1" value="8" class="anzahl-eingabe">
        </span>
      </div>
      <p id="ww-anzahl-max" class="hinweis-text"></p>
    </div>

    <div id="ww-teammodus-zeile" class="setup-modusblock" hidden>
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
            <input type="checkbox" id="ww-teammodus">
            <span class="schalter-regler"></span>
          </span>
        </label>
      </div>
    </div>

    <div id="ww-teams" hidden>
      <div class="zt-team-grid">
        <button type="button" id="ww-team-wahl-blau" class="zt-team zt-team-blau zt-team-waehlbar">
          <h3>🔵 Team Blau</h3>
          <ul id="ww-team-blau"></ul>
        </button>
        <button type="button" id="ww-team-wahl-rot" class="zt-team zt-team-rot zt-team-waehlbar">
          <h3>🔴 Team Rot</h3>
          <ul id="ww-team-rot"></ul>
        </button>
      </div>
      <p><button id="ww-teams-zufall" class="btn-flach" hidden>Zufällige Teams</button></p>
    </div>

    <p id="ww-setup-fehler" class="fehler-text"></p>
    <p><button id="ww-starten" class="btn-primaer" hidden>Spiel starten</button></p>
    <p id="ww-setup-warten" hidden><em>Warte, bis der Spielleiter das Spiel startet …</em></p>
    <div id="ww-bereit-bereich" class="bereit-bereich" hidden></div>
  </div>

  <div id="ww-frage-screen" class="bildschirm-karte" hidden>
    <p class="kategorie">Jahr</p>
    <p class="fortschritt" id="ww-frage-fortschritt"></p>

    <p class="wi-hinweis-aktuell" id="ww-hinweis-aktuell"></p>
    <ul class="wi-hinweis-liste" id="ww-hinweis-liste"></ul>
    <p class="wi-countdown" id="ww-countdown"></p>

    <ul class="wi-falsch-liste" id="ww-falsch-liste" hidden></ul>

    <p id="ww-frage-status" class="hinweis-text"></p>

    <div id="ww-antwort-bereich">
      <p class="wi-antwort-zeile">
        <input id="ww-antwort-eingabe" type="text" inputmode="numeric" pattern="[0-9]*" placeholder="In welchem Jahr war das?" autocomplete="off">
        <button id="ww-antwort-absenden">Absenden</button>
      </p>
      <p id="ww-antwort-fehler" class="fehler-text"></p>
    </div>

    <p><button id="ww-ueberspringen" class="btn-flach" hidden>Niemand weiß es - Frage auflösen</button></p>
  </div>

  <div id="ww-ergebnis-screen" class="bildschirm-karte" hidden>
    <p class="kategorie">Jahr</p>
    <h2 id="ww-erg-status"></h2>
    <p>Gesucht war das Jahr: <strong id="ww-erg-jahr"></strong></p>
    <ul id="ww-erg-liste"></ul>
    <p><button id="ww-weiter" hidden>Weiter</button></p>
  </div>

  <div id="ww-endstand-screen" class="bildschirm-karte" hidden>
    <h1>Endstand</h1>
    <div id="ww-endstand-teams" hidden></div>
    <ul id="ww-endstand-liste"></ul>
    <p id="ww-endstand-warten" hidden><em>Der Spielleiter wählt gleich das nächste Spiel …</em></p>
    <p><button id="ww-gesamtwertung-btn" class="btn-primaer" type="button" hidden>Gesamtwertung</button></p>
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

function mischeIndizes(werte) {
  const gemischt = [...werte];
  for (let i = gemischt.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [gemischt[i], gemischt[j]] = [gemischt[j], gemischt[i]];
  }
  return gemischt;
}

// Extrahiert die erste Zahl aus der Eingabe - so zählen auch Eingaben wie
// "im Jahr 1969" oder "1969?" als "1969".
function extrahiereJahr(text) {
  const treffer = (text ?? "").match(/-?\d+/);
  return treffer ? parseInt(treffer[0], 10) : null;
}

function istAntwortRichtig(eingabe, jahr) {
  const zahl = extrahiereJahr(eingabe);
  return zahl !== null && zahl === jahr;
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
  bereitSystem = initBereitSystem(api, "ww");
  olympiadeAutoStart = false;

  if (fragen.length === 0) {
    const antwort = await fetch(new URL("jahre.json", import.meta.url), { cache: "no-store" });
    if (!antwort.ok) throw new Error("jahre.json konnte nicht geladen werden");
    fragen = await antwort.json();
  }

  verdrahteBedienelemente();

  if (api.istLeiter && !api.raum?.wwStatus) {
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
  $("ww-anzahl").addEventListener("input", () => {
    const feld = $("ww-anzahl");
    const bereinigt = feld.value.replace(/[^0-9]/g, "");
    if (bereinigt !== feld.value) feld.value = bereinigt;
 
    schreibeAnzahlEntwurfLive();
  });
  $("ww-anzahl").addEventListener("change", () => anzahlUebernehmen());
  $("ww-anzahl").addEventListener("focus", () => { $("ww-anzahl").select(); });
  $("ww-teammodus").addEventListener("change", teammodusUmschalten);
  $("ww-team-wahl-blau").addEventListener("click", () => waehleEigenesTeam("blau"));
  $("ww-team-wahl-rot").addEventListener("click", () => waehleEigenesTeam("rot"));
  $("ww-teams-zufall").addEventListener("click", zufaelligeTeams);
  $("ww-starten").addEventListener("click", spielStarten);
  $("ww-antwort-absenden").addEventListener("click", antwortAbsenden);
  $("ww-antwort-eingabe").addEventListener("keydown", (e) => { if (e.key === "Enter") antwortAbsenden(); });
  $("ww-ueberspringen").addEventListener("click", ueberspringen);
  $("ww-weiter").addEventListener("click", weiter);
}

export function beenden() {
  bereitSystem = null;
  if (timerId) { clearInterval(timerId); timerId = null; }
  el = {}; raum = {}; spielerListe = [];
  index = -1; reihenfolge = []; anzahlFragen = 0; status = null;
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
  status = daten.wwStatus ?? null;
  reihenfolge = daten.wwReihenfolge ?? [];
  gespielt = daten.wwGespielt ?? [];
  anzahlFragen = daten.wwAnzahlFragen ?? 0;
  anzahlEntwurf = daten.wwAnzahlEntwurf ?? null;
  hinweisIndex = daten.wwHinweisIndex ?? 1;
  hinweisSeit = daten.wwHinweisSeit ?? 0;
  loeser = daten.wwLoeser ?? [];
  antwortText = daten.wwAntwortText ?? "";
  antwortKorrekt = daten.wwAntwortKorrekt ?? null;
  falscheVersuche = daten.wwFalscheVersuche ?? [];
  teammodus = !!daten.wwTeammodus;
  teams = daten.wwTeams ?? {};

  if ($("ww-teammodus").checked !== teammodus) $("ww-teammodus").checked = teammodus;

  const neuerIndex = daten.wwFragenIndex ?? 0;
  if (index !== neuerIndex) {
    index = neuerIndex;
    $("ww-antwort-eingabe").value = "";
    $("ww-antwort-fehler").textContent = "";
  }

  api.fortschritt(
    status === "frage_aktiv" || status === "aufgeloest"
      ? `${index + 1}/${anzahlFragen}`
      : ""
  );

  alleVerstecken();
  if (status === "setup" || !status) {
    zeigeSetup();
    $("ww-setup").hidden = false;
  } else if (status === "frage_aktiv") {
    zeigeFrage();
    $("ww-frage-screen").hidden = false;
  } else if (status === "aufgeloest") {
    zeigeErgebnis();
    $("ww-ergebnis-screen").hidden = false;
  } else if (status === "beendet") {
    zeigeEndstand();
    $("ww-endstand-screen").hidden = false;
  }
}

function alleVerstecken() {
  ["ww-setup", "ww-frage-screen", "ww-ergebnis-screen", "ww-endstand-screen"]
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
    $("ww-anzahl").max = String(Math.max(1, fragen.length));
    $("ww-anzahl").value = String(gewuenschteAnzahl);
    $("ww-anzahl-max").textContent = `In der Olympiade festgelegt: ${gewuenschteAnzahl} ${gewuenschteAnzahl === 1 ? "Runde" : "Runden"}.`;
    $("ww-anzahl-zeile").hidden = false;
    $("ww-anzahl").disabled = true;
  } else if (api.istLeiter) {
    if (gewuenschteAnzahl === 0) gewuenschteAnzahl = Math.min(STANDARD_ANZAHL, fragen.length);
    $("ww-anzahl").max = String(Math.max(1, fragen.length));
    $("ww-anzahl").value = String(gewuenschteAnzahl);
    $("ww-anzahl-max").textContent = `Insgesamt ${fragen.length} Runden verfügbar.`;
    $("ww-anzahl-zeile").hidden = false;
    $("ww-anzahl").disabled = false;
  } else {
    gewuenschteAnzahl = anzahlEntwurf ?? Math.min(STANDARD_ANZAHL, fragen.length);
    $("ww-anzahl").max = String(Math.max(1, fragen.length));
    $("ww-anzahl").value = String(gewuenschteAnzahl);
    $("ww-anzahl-max").textContent = `Insgesamt ${fragen.length} Runden verfügbar.`;
    $("ww-anzahl-zeile").hidden = false;
    $("ww-anzahl").disabled = true;
  }
  // v200: in der Olympiade entfaellt der Team-Modus komplett - alle spielen
  // einzeln, damit sich niemand extra dafuer koordinieren muss.
  if (inOlympiade) teammodus = false;
  $("ww-teammodus-zeile").hidden = inOlympiade;
  const teamSchalter = $("ww-teammodus");
  teamSchalter.checked = teammodus;
  teamSchalter.disabled = !api.istLeiter;
  $("ww-teams").hidden = !teammodus;
  $("ww-teams-zufall").hidden = !api.istLeiter;
  if (teammodus) {
    rendereTeamListe("blau");
    rendereTeamListe("rot");
  }
  $("ww-starten").hidden = !api.istLeiter;
  $("ww-setup-warten").hidden = api.istLeiter;
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

async function teammodusUmschalten() {
  if (!api.istLeiter) return;
  const aktiviert = $("ww-teammodus").checked;
  const neueTeams = aktiviert ? teams : {};
  try {
    await updateDoc(api.raumRef(), { wwTeammodus: aktiviert, wwTeams: neueTeams });
  } catch (e) {
    $("ww-teammodus").checked = teammodus;
    zeigeDebug("Teammodus konnte nicht geändert werden: " + e.message);
  }
}

async function waehleEigenesTeam(team) {
  if (!teammodus) return;
  try {
    await updateDoc(api.raumRef(), { wwTeams: { ...teams, [api.spielerId]: team } });
  } catch (e) {
    zeigeDebug("Team konnte nicht gewählt werden: " + e.message);
  }
}

async function zufaelligeTeams() {
  if (!api.istLeiter || !teammodus) return;
  $("ww-teams-zufall").disabled = true;
  try {
    await updateDoc(api.raumRef(), {
      wwTeams: erstelleTeams(spielerListe.map((spieler) => spieler.id))
    });
  } catch (e) {
    zeigeDebug("Teams konnten nicht neu gemischt werden: " + e.message);
  }
  $("ww-teams-zufall").disabled = false;
}

function rendereTeamListe(team) {
  const liste = $("ww-team-" + team);
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
  $("ww-team-wahl-" + team).classList.toggle("zt-team-eigenes", teams[api.spielerId] === team);
}

// v214: Schreibt den vom Leiter eingegebenen "Anzahl"-Wert entprellt live in
// den Raum, damit Mitspieler*innen im Setup-Bildschirm sofort den
// tatsaechlichen Stand sehen statt eines stehengebliebenen Default-Werts.
function schreibeAnzahlEntwurfLive() {
  if (!api.istLeiter) return;
  clearTimeout(anzahlEntwurfTimer);
  anzahlEntwurfTimer = setTimeout(() => {
    const wert = parseInt($("ww-anzahl").value, 10);
    if (Number.isFinite(wert) && wert > 0) {
      updateDoc(api.raumRef(), { wwAnzahlEntwurf: wert }).catch(() => {});
    }
  }, 300);
}

function anzahlUebernehmen() {
  if (!api.istLeiter) return;
  let wert = parseInt($("ww-anzahl").value, 10);
  if (!Number.isFinite(wert) || wert < 1) wert = 1;
  if (wert > fragen.length) wert = fragen.length;
  gewuenschteAnzahl = wert;
  $("ww-anzahl").value = String(wert);
}

async function setzeGrundzustand(wwStatus) {
  await updateDoc(api.raumRef(), {
    wwStatus, wwReihenfolge: [], wwFragenIndex: 0, wwAnzahlFragen: 0, wwAnzahlEntwurf: 0,
    wwHinweisIndex: 1, wwHinweisSeit: 0, wwGebuzzertVon: null, wwGebuzzertSeit: 0,
    wwAntwortText: "", wwAntwortKorrekt: null, wwPunkteDieserRunde: 0,
    wwFalscheVersuche: [], wwLoeser: [], wwTeammodus: false, wwTeams: {}, wwRundenDelta: {}
  });
}

async function raeumeSpieldatenAuf() {
  await Promise.all(spielerListe.map((s) => updateDoc(api.spielerRef(s.id), { punkte: 0 })));
}

async function spielStarten() {
  $("ww-setup-fehler").textContent = "";
  if (fragen.length === 0) {
    $("ww-setup-fehler").textContent = "Es sind noch keine Jahre hinterlegt.";
    return;
  }
  anzahlUebernehmen();
  $("ww-starten").disabled = true;
  try {
    await raeumeSpieldatenAuf();
    const anzahl = Math.min(gewuenschteAnzahl || fragen.length, fragen.length);
    // Wiederholungsschutz: bevorzugt Fragen ziehen, die in diesem Raum noch
    // nicht drankamen (siehe kern/verlauf.js).
    const { kandidaten, wurdeZurueckgesetzt } = pooleOhneWiederholung(fragen.map((_, i) => i), gespielt, anzahl);
    const neueReihenfolge = mischeIndizes(kandidaten).slice(0, anzahl);
    const neuerGespielt = aktualisierterVerlauf(gespielt, neueReihenfolge, wurdeZurueckgesetzt);
    const neueTeams = teammodus
      ? ergaenzeFehlendeTeams(teams, spielerListe.map((spieler) => spieler.id))
      : teams;
    await updateDoc(api.raumRef(), {
      wwStatus: "frage_aktiv", wwFragenIndex: 0, wwAnzahlFragen: anzahl,
      wwReihenfolge: neueReihenfolge, wwGespielt: neuerGespielt,
      wwHinweisIndex: 1, wwHinweisSeit: Date.now(),
      wwGebuzzertVon: null, wwGebuzzertSeit: 0, wwAntwortText: "", wwAntwortKorrekt: null, wwPunkteDieserRunde: 0,
      wwFalscheVersuche: [], wwLoeser: [], wwTeammodus: teammodus, wwTeams: neueTeams, wwRundenDelta: {}
    });
  } catch (e) {
    zeigeDebug("Fehler beim Start: " + e.message);
  }
  $("ww-starten").disabled = false;
}

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

  const gesamt = frage.hinweise.length;
  const sichtbar = Math.min(Math.max(hinweisIndex, 1), gesamt);
  $("ww-frage-fortschritt").textContent = `Hinweis ${sichtbar} von ${gesamt}`;
  $("ww-hinweis-aktuell").textContent = frage.hinweise[sichtbar - 1] ?? "";

  const liste = $("ww-hinweis-liste");
  liste.innerHTML = "";
  for (let i = 0; i < sichtbar - 1; i++) {
    const li = document.createElement("li");
    li.textContent = frage.hinweise[i];
    liste.appendChild(li);
  }

  const falschListe = $("ww-falsch-liste");
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
  $("ww-antwort-bereich").hidden = !!ichGeloest;
  $("ww-ueberspringen").hidden = !api.istLeiter || sichtbar < gesamt;
  const geloestText = loeser.map((l) => `${l.platz}. ${spielerListe.find((x) => x.id === l.id)?.name ?? "?"}`).join(", ");
  const teile = [];
  if (ichGeloest) teile.push(`✅ Richtig! Du bist auf Platz ${ichGeloest.platz} (+${ichGeloest.punkte} Punkte). Die anderen raten noch …`);
  if (loeser.length) teile.push(`Schon gelöst: ${geloestText}`);
  $("ww-frage-status").textContent = teile.join(" · ");
}

function aktualisiereCountdown() {
  if (!el.wurzel) return;
  if (status !== "frage_aktiv") { $("ww-countdown").textContent = ""; return; }
  const frage = frageAn(index);
  if (!frage) return;
  const gesamt = frage.hinweise.length;
  if (hinweisIndex >= gesamt) {
    // Nach dem letzten Hinweis bleiben noch ANTWORT_ZEIT_MS zum Lösen.
    const rest = Math.max(0, ANTWORT_ZEIT_MS - (Date.now() - hinweisSeit));
    $("ww-countdown").textContent = `Letzter Hinweis - noch ${Math.ceil(rest / 1000)}s zum Lösen`;
    return;
  }
  const rest = Math.max(0, HINWEIS_DAUER_MS - (Date.now() - hinweisSeit));
  $("ww-countdown").textContent = `Nächster Hinweis in ${Math.ceil(rest / 1000)}s`;
}

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
        if (!d || d.wwStatus !== "frage_aktiv" || (d.wwFragenIndex ?? 0) !== index) return;
        tx.update(api.raumRef(), { wwStatus: "aufgeloest" });
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
    await updateDoc(api.raumRef(), { wwHinweisIndex: increment(1), wwHinweisSeit: Date.now() });
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
  const text = $("ww-antwort-eingabe").value.trim();
  if (!text) {
    $("ww-antwort-fehler").textContent = "Bitte eine Antwort eingeben.";
    return;
  }
  $("ww-antwort-fehler").textContent = "";
  $("ww-antwort-absenden").disabled = true;
  try {
    const frage = frageAn(index);
    const richtig = istAntwortRichtig(text, frage.jahr);
    const n = spielerListe.length;
    let art = "";
    let abzugGemerkt = 0;
    await runTransaction(api.db, async (tx) => {
      const snap = await tx.get(api.raumRef());
      const daten = snap.data();
      if (!daten || daten.wwStatus !== "frage_aktiv" || (daten.wwFragenIndex ?? 0) !== index) { art = "zuspaet"; return; }
      const geloest = daten.wwLoeser ?? [];
      if (geloest.some((l) => l.id === api.spielerId)) { art = "schon"; return; }
      if (richtig) {
        const platz = geloest.length + 1;
        const punkte = punkteFuerRang(platz, n);
        const neu = [...geloest, { id: api.spielerId, platz, punkte }];
        const upd = { wwLoeser: neu, ["wwRundenDelta." + api.spielerId]: increment(punkte) };
        if (neu.length >= n) upd.wwStatus = "aufgeloest";
        tx.update(api.raumRef(), upd);
        tx.update(api.spielerRef(), { punkte: increment(punkte) });
        art = "richtig";
      } else {
        const abzug = (daten.wwFalscheVersuche ?? []).filter((v) => v.spielerId === api.spielerId).length + 1;
        tx.update(api.raumRef(), {
          wwFalscheVersuche: arrayUnion({ name: api.spielerName, text, spielerId: api.spielerId, abzug }),
          ["wwRundenDelta." + api.spielerId]: increment(-abzug)
        });
        tx.update(api.spielerRef(), { punkte: increment(-abzug) });
        abzugGemerkt = abzug;
        art = "falsch";
      }
    });
    $("ww-antwort-eingabe").value = "";
    if (art === "zuspaet") $("ww-antwort-fehler").textContent = "Zu spät - die Runde ist schon vorbei.";
    else if (art === "falsch") $("ww-antwort-fehler").textContent = `Leider falsch (-${abzugGemerkt} ${abzugGemerkt === 1 ? "Punkt" : "Punkte"}). Versuch es nochmal!`;
  } catch (e) {
    zeigeDebug("Fehler beim Absenden der Antwort: " + e.message);
  }
  $("ww-antwort-absenden").disabled = false;
}

async function ueberspringen() {
  if (!api.istLeiter) return;
  try {
    await updateDoc(api.raumRef(), {
      wwStatus: "aufgeloest", wwAntwortText: "", wwAntwortKorrekt: null,
      wwPunkteDieserRunde: 0, wwGebuzzertVon: null, wwGebuzzertSeit: 0
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
  $("ww-erg-jahr").textContent = frage.jahr;

  if (!loeser.length) {
    $("ww-erg-status").textContent = "Niemand hat es gelöst";
  } else {
    const erster = spielerListe.find((s) => s.id === loeser[0].id)?.name ?? "?";
    $("ww-erg-status").textContent = loeser.length === 1
      ? `${erster} hat es als Einziger/Einzige erkannt! 🎉`
      : `${erster} war am schnellsten! 🎉`;
  }
  const platzText = (id) => {
    const l = loeser.find((x) => x.id === id);
    return l ? `Platz ${l.platz}` : "nicht gelöst";
  };

  const liste = $("ww-erg-liste");

  if (teammodus) {
    liste.innerHTML = teamGruppeHtml(spielerListe, teams, (s) => {
      return spielerKarte(
        s.name, s.farbe, s.icon,
        formatiertePunkte(raum.wwRundenDelta?.[s.id] ?? 0),
        { extra: platzText(s.id), punkteRechts: s.punkte ?? 0 }
      );
    });
  } else {
    liste.innerHTML = "";
    [...spielerListe].sort((a, b) => (raum.wwRundenDelta?.[b.id] ?? 0) - (raum.wwRundenDelta?.[a.id] ?? 0)).forEach((s) => {
      const li = document.createElement("li");
      li.innerHTML = spielerKarte(
        s.name, s.farbe, s.icon,
        formatiertePunkte(raum.wwRundenDelta?.[s.id] ?? 0),
        { extra: platzText(s.id), punkteRechts: s.punkte ?? 0 }
      );
      liste.appendChild(li);
    });
  }

  $("ww-weiter").hidden = !api.istLeiter;
  $("ww-weiter").textContent = index + 1 >= anzahlFragen ? "Endstand anzeigen" : "Nächste Frage";
}

async function weiter() {
  $("ww-weiter").disabled = true;
  try {
    const naechster = index + 1;
    if (naechster >= anzahlFragen) {
      await updateDoc(api.raumRef(), { wwStatus: "beendet" });
      speichereWertung(api, "wann-war-es", Object.fromEntries(spielerListe.map((s) => [s.id, s.punkte ?? 0])));
    } else {
      await updateDoc(api.raumRef(), {
        wwStatus: "frage_aktiv", wwFragenIndex: naechster,
        wwHinweisIndex: 1, wwHinweisSeit: Date.now(),
        wwGebuzzertVon: null, wwGebuzzertSeit: 0, wwAntwortText: "", wwAntwortKorrekt: null, wwPunkteDieserRunde: 0,
        wwFalscheVersuche: [], wwLoeser: [], wwRundenDelta: {}
      });
    }
  } catch (e) {
    zeigeDebug("Fehler beim Weiterschalten: " + e.message);
  }
  $("ww-weiter").disabled = false;
}

function zeigeEndstand() {
  if (!el.wurzel) return;
  const sortiert = [...spielerListe].sort((a, b) => (b.punkte ?? 0) - (a.punkte ?? 0));
  const liste = $("ww-endstand-liste");
  liste.innerHTML = "";
  sortiert.forEach((s, i) => {
    const li = document.createElement("li");
    li.innerHTML = spielerKarte(s.name, s.farbe, s.icon, s.punkte ?? 0, { rang: i + 1 });
    liste.appendChild(li);
  });
  const teamsEl = $("ww-endstand-teams");
  teamsEl.hidden = !teammodus;
  if (teammodus) teamsEl.innerHTML = teamEndstandHtml(spielerListe, teams);
  $("ww-endstand-warten").hidden = api.istLeiter;
  // v202: in einer laufenden Olympiade fuehrt dieser Button jetzt zur
  // Gesamtwertung statt direkt zum naechsten Spiel - "Naechstes Spiel"
  // gibt es von dort aus als eigenen Button (siehe oeffneWertungDialog()
  // in app.js). So bleibt der eigene Endstand erst einmal sichtbar.
  const wwGesamtwertungBtn = $("ww-gesamtwertung-btn");
  if (wwGesamtwertungBtn) {
    wwGesamtwertungBtn.hidden = !(api.istLeiter && Boolean(api.olympiadeAnzahl));
    wwGesamtwertungBtn.onclick = () => api.zeigeGesamtwertung();
  }
}

// Für lokale Logiktests exportiert; das Spiel selbst verwendet dieselben Funktionen.
export { istAntwortRichtig, mischeIndizes };
