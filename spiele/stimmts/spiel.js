// ============================================================================
//  Stimmt's?
// ----------------------------------------------------------------------------
//  Pro Runde wird eine Behauptung gezeigt ("Stimmt's?") - alle tippen, ob sie
//  wahr oder falsch ist. Die Fragen liegen in fragen.json (kuratierte,
//  allgemein bekannte Fakten und Mythen samt kurzer Erklärung). Wer richtig
//  tippt, bekommt einen Punkt; wer am schnellsten richtig getippt hat,
//  bekommt zusätzlich einen Bonuspunkt. Danach folgt die Auflösung mit
//  Erklärung und allen Antworten, und es geht zur nächsten (immer neuen)
//  Behauptung weiter - bis die eingestellte Rundenzahl erreicht ist. Das
//  Grundgerüst (Ablauf, Punktelogik, Rundenübergänge) ist bewusst eng an
//  Länderumrisse angelehnt. Alle spielspezifischen Raumfelder beginnen mit
//  "st"; die Tipp-Antworten liegen getrennt in der Subcollection
//  "stAntworten".
// ============================================================================
import {
  doc, setDoc, updateDoc, deleteDoc, collection, getDocs, onSnapshot,
  serverTimestamp, increment, writeBatch
} from "../../kern/firebase.js";
import { spielerKarte, renderWarteAvatare, zeigeDebug, initBereitSystem } from "../../kern/ui.js";
import { speichereWertung } from "../../kern/wertung.js";

const STANDARD_ZEIT_SEKUNDEN = 12;
const MIN_ZEIT = 5;
const MAX_ZEIT = 30;
const STANDARD_ANZAHL = 10;
// Wie lange die Rundenergebnis-Anzeige (Auflösung + Erklärung + wer was
// getippt hat) zu sehen ist, bevor der Spielleiter automatisch weiterschaltet.
const RUNDENERGEBNIS_ANZEIGE_MS = 5000;

let alleFragen = [];
let ladeFehler = "";

async function ladeFragenDaten() {
  if (alleFragen.length > 0 || ladeFehler) return;
  try {
    const antwort = await fetch(new URL("./fragen.json", import.meta.url));
    alleFragen = await antwort.json();
  } catch (e) {
    ladeFehler = "Die Fragen konnten nicht geladen werden: " + e.message;
  }
}

const VORLAGE = `
  <div id="st-setup" class="bildschirm-karte" hidden>
    <h1>🤔 Stimmt's?</h1>
    <p class="hinweis-text">Eine Behauptung erscheint - stimmt sie, oder ist sie erfunden? Tippt
      "Stimmt" oder "Stimmt nicht". Richtig bringt einen Punkt, am schnellsten richtig einen
      Bonuspunkt dazu.</p>

    <div id="st-anzahl-zeile" class="setup-anzahlblock" hidden>
      <div class="setup-anzahl-zeile">
        <span>Anzahl Runden</span>
        <span class="anzahl-picker">
          <input id="st-anzahl" type="text" inputmode="numeric" pattern="[0-9]*" min="1" class="anzahl-eingabe">
        </span>
      </div>
      <p id="st-anzahl-max" class="hinweis-text"></p>
    </div>

    <div class="setup-anzahlblock">
      <div class="setup-anzahl-zeile">
        <span>Zeit zum Tippen (Sekunden)</span>
        <span class="anzahl-picker">
          <input id="st-zeit" type="text" inputmode="numeric" pattern="[0-9]*" min="5" class="anzahl-eingabe">
        </span>
      </div>
    </div>

    <p id="st-setup-fehler" class="fehler-text"></p>
    <p><button id="st-starten" class="btn-primaer" hidden>Spiel starten</button></p>
    <p id="st-setup-warten" hidden><em>Warte, bis der Spielleiter das Spiel startet …</em></p>
    <div id="st-bereit-bereich" class="bereit-bereich" hidden></div>
  </div>

  <div id="st-frage-screen" class="bildschirm-karte" hidden>
    <p class="kategorie">Stimmt's?</p>
    <p id="st-aussage" class="st-aussage"></p>
    <p id="st-frage-hinweis" class="hinweis-text"></p>
    <div class="st-antwort-tasten">
      <button id="st-antwort-ja" type="button" class="st-antwort-btn st-antwort-ja">Stimmt</button>
      <button id="st-antwort-nein" type="button" class="st-antwort-btn st-antwort-nein">Stimmt nicht</button>
    </div>
    <div id="st-frage-status" class="warten-block"></div>
  </div>

  <div id="st-rundenergebnis-screen" class="bildschirm-karte" hidden>
    <p class="kategorie">Stimmt's?</p>
    <h2 id="st-re-titel"></h2>
    <p id="st-re-erklaerung" class="hinweis-text"></p>
    <ul id="st-re-liste"></ul>
  </div>

  <div id="st-endstand-screen" class="bildschirm-karte" hidden>
    <h1>Endstand</h1>
    <ul id="st-endstand-liste"></ul>
    <p id="st-endstand-warten" hidden><em>Der Spielleiter wählt gleich das nächste Spiel …</em></p>
    <p><button id="st-gesamtwertung-btn" class="btn-primaer" type="button" hidden>Gesamtwertung</button></p>
  </div>
`;

let api = null;
let el = {};
let spielerListe = [];
let alleAntworten = [];
let antwortenUnsub = null;
let tickId = null;

let status = null;
let rundeIndex = -1;
let anzahlRunden = 0;
let zeitSekunden = STANDARD_ZEIT_SEKUNDEN;
let verwendeteIndizes = [];
let aktuellerFrageIndex = null;
let frageSeit = 0;
let rundenergebnisSeit = 0;

let eigeneAntwortGesetzt = false;
// Verhindert, dass der Spielleiter denselben automatischen Übergang mehrfach
// auslöst (z. B. bei jedem Tick) - wird jeweils beim Erkennen einer NEUEN
// Runde/eines neuen Rundenergebnisses zurückgesetzt (siehe raumDaten()).
let auswertungAusgeloest = false;
let rundenergebnisAusgeloest = false;
// v205-Lehre (Zeitgefühl!): Frage-Karte bzw. Rundenergebnis-Liste nur EINMAL
// pro Runde per innerHTML aufbauen, nicht bei jedem raumDaten()-Aufruf neu -
// sonst flackern Buttons/Avatare.
let frageGerendert = false;
let rundenergebnisGerendert = false;

let bereitSystem = null;
let olympiadeAutoStart = false;

const $ = (id) => el.wurzel.querySelector("#" + id);

function frageFuerIndex(index) {
  return index != null ? (alleFragen[index] ?? null) : null;
}

function neueRundeFrageIndex(bisherigeIndizes) {
  const uebrigeIndizes = alleFragen.map((_, i) => i).filter((i) => !bisherigeIndizes.includes(i));
  const pool = uebrigeIndizes.length > 0 ? uebrigeIndizes : alleFragen.map((_, i) => i);
  return pool[Math.floor(Math.random() * pool.length)];
}

export async function starten(uebergebeneApi) {
  api = uebergebeneApi;
  el.wurzel = api.wurzel;
  el.wurzel.innerHTML = VORLAGE;
  bereitSystem = initBereitSystem(api, "st");
  olympiadeAutoStart = false;

  await ladeFragenDaten();
  if (ladeFehler) $("st-setup-fehler").textContent = ladeFehler;

  verdrahteBedienelemente();
  starteListener();

  if (api.istLeiter && !api.raum?.stStatus) {
    await updateDoc(api.raumRef(), {
      stStatus: "setup", stRundeIndex: 0, stAnzahlRunden: 0,
      stZeitSekunden: STANDARD_ZEIT_SEKUNDEN, stVerwendeteIndizes: [], stFrageIndex: null,
      stFrageSeit: 0, stRundenergebnisSeit: 0
    });
  }

  tickId = setInterval(spielTick, 200);
}

function verdrahteBedienelemente() {
  $("st-anzahl").addEventListener("input", () => {
    const feld = $("st-anzahl");
    const bereinigt = feld.value.replace(/[^0-9]/g, "");
    if (bereinigt !== feld.value) feld.value = bereinigt;
  });
  $("st-anzahl").addEventListener("change", () => {
    const feld = $("st-anzahl");
    const max = Math.max(1, alleFragen.length || 1);
    let wert = parseInt(feld.value, 10);
    if (!Number.isFinite(wert) || wert < 1) wert = 1;
    if (wert > max) wert = max;
    feld.value = String(wert);
  });
  $("st-anzahl").addEventListener("focus", () => { $("st-anzahl").select(); });

  $("st-zeit").addEventListener("input", () => {
    const feld = $("st-zeit");
    const bereinigt = feld.value.replace(/[^0-9]/g, "");
    if (bereinigt !== feld.value) feld.value = bereinigt;
  });
  $("st-zeit").addEventListener("change", () => {
    const feld = $("st-zeit");
    let wert = parseInt(feld.value, 10);
    if (!Number.isFinite(wert) || wert < MIN_ZEIT) wert = MIN_ZEIT;
    if (wert > MAX_ZEIT) wert = MAX_ZEIT;
    feld.value = String(wert);
  });
  $("st-zeit").addEventListener("focus", () => { $("st-zeit").select(); });

  $("st-starten").addEventListener("click", spielStarten);
  $("st-antwort-ja").addEventListener("click", () => antwortGetippt(true));
  $("st-antwort-nein").addEventListener("click", () => antwortGetippt(false));
}

function starteListener() {
  antwortenUnsub = onSnapshot(collection(api.db, "raeume", api.code, "stAntworten"), (snap) => {
    alleAntworten = [];
    snap.forEach((d) => alleAntworten.push(d.data()));
    if (status === "frage") aktualisiereFrageStatus();
  });
}

export function beenden() {
  bereitSystem = null;
  if (antwortenUnsub) { antwortenUnsub(); antwortenUnsub = null; }
  if (tickId) { clearInterval(tickId); tickId = null; }
  el = {};
  spielerListe = [];
  alleAntworten = [];
  status = null;
  rundeIndex = -1;
  anzahlRunden = 0;
  zeitSekunden = STANDARD_ZEIT_SEKUNDEN;
  verwendeteIndizes = [];
  aktuellerFrageIndex = null;
  frageSeit = 0;
  rundenergebnisSeit = 0;
  eigeneAntwortGesetzt = false;
  auswertungAusgeloest = false;
  rundenergebnisAusgeloest = false;
  frageGerendert = false;
  rundenergebnisGerendert = false;
}

export function spieler(liste) {
  spielerListe = liste;
  if (!el.wurzel) return;
  if (status === "frage") {
    aktualisiereFrageStatus();
  } else if (status === "beendet") {
    zeigeEndstand();
  }
}

export function raumDaten(daten) {
  if (!daten || !el.wurzel) return;
  status = daten.stStatus ?? null;
  anzahlRunden = daten.stAnzahlRunden ?? 0;
  zeitSekunden = daten.stZeitSekunden ?? STANDARD_ZEIT_SEKUNDEN;
  verwendeteIndizes = daten.stVerwendeteIndizes ?? [];
  aktuellerFrageIndex = daten.stFrageIndex ?? null;

  const neueRunde = daten.stRundeIndex ?? 0;
  const neuerFrageSeit = daten.stFrageSeit ?? 0;
  if (status === "frage" && (rundeIndex !== neueRunde || frageSeit !== neuerFrageSeit)) {
    rundeIndex = neueRunde;
    frageSeit = neuerFrageSeit;
    eigeneAntwortGesetzt = false;
    auswertungAusgeloest = false;
    frageGerendert = false;
  } else {
    rundeIndex = neueRunde;
  }

  const neuerRundenergebnisSeit = daten.stRundenergebnisSeit ?? 0;
  if (status === "rundenergebnis" && rundenergebnisSeit !== neuerRundenergebnisSeit) {
    rundenergebnisAusgeloest = false;
    rundenergebnisGerendert = false;
  }
  rundenergebnisSeit = neuerRundenergebnisSeit;

  api.fortschritt(
    ["frage", "rundenergebnis"].includes(status) ? `${rundeIndex + 1}/${anzahlRunden}` : ""
  );

  alleVerstecken();
  if (status === "setup" || !status) {
    zeigeSetup();
    $("st-setup").hidden = false;
  } else if (status === "frage") {
    if (!frageGerendert) {
      frageGerendert = true;
      zeigeFrage();
    } else {
      aktualisiereFrageStatus();
    }
    $("st-frage-screen").hidden = false;
  } else if (status === "rundenergebnis") {
    if (!rundenergebnisGerendert) {
      rundenergebnisGerendert = true;
      zeigeRundenergebnis();
    }
    $("st-rundenergebnis-screen").hidden = false;
  } else if (status === "beendet") {
    zeigeEndstand();
    $("st-endstand-screen").hidden = false;
  }
}

function alleVerstecken() {
  ["st-setup", "st-frage-screen", "st-rundenergebnis-screen", "st-endstand-screen"]
    .forEach((id) => { $(id).hidden = true; });
}

function zeigeSetup() {
  const maxRunden = Math.max(1, alleFragen.length || 1);
  const anzahlFeld = $("st-anzahl");
  anzahlFeld.max = maxRunden;
  const inOlympiade = Boolean(api.olympiadeAnzahl);
  if (inOlympiade) {
    const festgelegt = Math.min(Math.max(1, api.olympiadeAnzahl), maxRunden);
    anzahlFeld.value = String(festgelegt);
    $("st-anzahl-max").textContent =
      `In der Olympiade festgelegt: ${festgelegt} ${festgelegt === 1 ? "Runde" : "Runden"}.`;
    anzahlFeld.disabled = true;
  } else {
    if (!anzahlFeld.value) anzahlFeld.value = String(Math.min(STANDARD_ANZAHL, maxRunden));
    $("st-anzahl-max").textContent = `Bis zu ${maxRunden} Runden, jede mit einer neuen Behauptung.`;
    anzahlFeld.disabled = !api.istLeiter;
  }
  $("st-anzahl-zeile").hidden = false;

  const zeitFeld = $("st-zeit");
  if (!zeitFeld.value) zeitFeld.value = String(STANDARD_ZEIT_SEKUNDEN);
  zeitFeld.disabled = !api.istLeiter;

  $("st-starten").hidden = !api.istLeiter || alleFragen.length === 0;
  $("st-setup-warten").hidden = api.istLeiter;
  bereitSystem?.render();

  if (api.istLeiter && api.olympiadeAnzahl && !olympiadeAutoStart && bereitSystem?.alleBereit()) {
    olympiadeAutoStart = true;
    spielStarten();
  }
}

async function spielStarten() {
  $("st-setup-fehler").textContent = "";
  if (spielerListe.length < 2) {
    $("st-setup-fehler").textContent = "Für Stimmt's? braucht ihr mindestens zwei Spieler.";
    return;
  }
  if (alleFragen.length === 0) {
    $("st-setup-fehler").textContent = ladeFehler || "Die Fragen sind nicht verfügbar.";
    return;
  }

  const maxRunden = Math.max(1, alleFragen.length);
  let anzahl = parseInt($("st-anzahl").value, 10);
  if (!Number.isFinite(anzahl) || anzahl < 1) anzahl = 1;
  if (anzahl > maxRunden) anzahl = maxRunden;

  let zeit = parseInt($("st-zeit").value, 10);
  if (!Number.isFinite(zeit) || zeit < MIN_ZEIT) zeit = MIN_ZEIT;
  if (zeit > MAX_ZEIT) zeit = MAX_ZEIT;

  const frageIndex = neueRundeFrageIndex([]);

  $("st-starten").disabled = true;
  try {
    await raeumeSpieldatenAuf();
    await updateDoc(api.raumRef(), {
      stStatus: "frage",
      stRundeIndex: 0,
      stAnzahlRunden: anzahl,
      stZeitSekunden: zeit,
      stVerwendeteIndizes: [frageIndex],
      stFrageIndex: frageIndex,
      stFrageSeit: Date.now(),
      stRundenergebnisSeit: 0
    });
  } catch (e) {
    zeigeDebug("Fehler beim Start: " + e.message);
  }
  $("st-starten").disabled = false;
}

async function raeumeSpieldatenAuf() {
  const snap = await getDocs(collection(api.db, "raeume", api.code, "stAntworten"));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  alleAntworten = [];
  await Promise.all(spielerListe.map((s) => updateDoc(api.spielerRef(s.id), { punkte: 0 })));
}

export async function vorZurueck() {
  try {
    await raeumeSpieldatenAuf();
    await updateDoc(api.raumRef(), {
      stStatus: null, stRundeIndex: 0, stAnzahlRunden: 0,
      stZeitSekunden: STANDARD_ZEIT_SEKUNDEN, stVerwendeteIndizes: [], stFrageIndex: null,
      stFrageSeit: 0, stRundenergebnisSeit: 0
    });
    await api.zurueckZurAuswahl();
  } catch (e) {
    zeigeDebug("Fehler beim Zurückkehren: " + e.message);
  }
}

function zeigeFrage() {
  const frage = frageFuerIndex(aktuellerFrageIndex);
  $("st-aussage").textContent = frage ? frage.aussage : "";
  $("st-antwort-ja").disabled = false;
  $("st-antwort-nein").disabled = false;
  $("st-antwort-ja").classList.remove("st-eigene-wahl");
  $("st-antwort-nein").classList.remove("st-eigene-wahl");
  aktualisiereFrageStatus();
}

function antwortenDieserRunde() {
  const aktiveIds = new Set(spielerListe.map((s) => s.id));
  return alleAntworten.filter((a) => a.rundeIndex === rundeIndex && aktiveIds.has(a.spielerId));
}

function aktualisiereFrageStatus() {
  if (!el.wurzel || status !== "frage") return;
  const antworten = antwortenDieserRunde();
  const geantwortetIds = new Set(antworten.map((a) => a.spielerId));
  eigeneAntwortGesetzt = geantwortetIds.has(api.spielerId);
  $("st-antwort-ja").disabled = eigeneAntwortGesetzt;
  $("st-antwort-nein").disabled = eigeneAntwortGesetzt;
  $("st-frage-hinweis").textContent = eigeneAntwortGesetzt
    ? "Getippt! Warte auf die anderen …"
    : "Stimmt das - oder nicht?";
  renderWarteAvatare(
    $("st-frage-status"),
    spielerListe.filter((sp) => !geantwortetIds.has(sp.id))
  );
}

async function antwortGetippt(getippterWert) {
  if (status !== "frage" || eigeneAntwortGesetzt) return;
  eigeneAntwortGesetzt = true;
  $("st-antwort-ja").disabled = true;
  $("st-antwort-nein").disabled = true;
  (getippterWert ? $("st-antwort-ja") : $("st-antwort-nein")).classList.add("st-eigene-wahl");
  try {
    const frage = frageFuerIndex(aktuellerFrageIndex);
    await setDoc(doc(api.db, "raeume", api.code, "stAntworten", `${api.spielerId}_${rundeIndex}`), {
      spielerId: api.spielerId,
      spielerName: api.spielerName,
      rundeIndex,
      getippterWert,
      richtig: Boolean(frage) && getippterWert === frage.richtig,
      elapsedMs: Date.now() - frageSeit,
      zeitpunkt: serverTimestamp()
    });
  } catch (e) {
    eigeneAntwortGesetzt = false;
    $("st-antwort-ja").disabled = false;
    $("st-antwort-nein").disabled = false;
    $("st-antwort-ja").classList.remove("st-eigene-wahl");
    $("st-antwort-nein").classList.remove("st-eigene-wahl");
    zeigeDebug("Fehler beim Tippen: " + e.message);
  }
}

// Wird alle 200ms aufgerufen - treibt (rein lokal anhand der geteilten
// Zeitstempel) die Countdown-Texte und, für den Spielleiter, die
// automatischen Übergänge zwischen den Phasen voran.
function spielTick() {
  if (!el.wurzel) return;
  const jetzt = Date.now();

  if (status === "frage") {
    const elapsed = jetzt - frageSeit;
    const rest = Math.max(0, zeitSekunden * 1000 - elapsed);
    if (!eigeneAntwortGesetzt) {
      $("st-frage-hinweis").textContent = rest > 0
        ? `Noch ${Math.ceil(rest / 1000)}s, um zu tippen`
        : "Zeit ist um!";
    }
    if (api.istLeiter) pruefeFrageAuswertung(elapsed);
  } else if (status === "rundenergebnis") {
    if (api.istLeiter && !rundenergebnisAusgeloest && jetzt - rundenergebnisSeit >= RUNDENERGEBNIS_ANZEIGE_MS) {
      rundenergebnisAusgeloest = true;
      naechsterSchrittNachRundenergebnis();
    }
  }
}

async function pruefeFrageAuswertung(elapsed) {
  if (!api.istLeiter || status !== "frage" || auswertungAusgeloest) return;
  const antworten = antwortenDieserRunde();
  const geantwortetIds = new Set(antworten.map((a) => a.spielerId));
  const fehlend = spielerListe.filter((sp) => !geantwortetIds.has(sp.id));
  const zeitAbgelaufen = elapsed >= zeitSekunden * 1000;
  if (fehlend.length > 0 && !zeitAbgelaufen) return;

  auswertungAusgeloest = true;
  try {
    const richtigeAntworten = antworten.filter((a) => a.richtig);
    const batch = writeBatch(api.db);
    richtigeAntworten.forEach((a) => {
      batch.update(api.spielerRef(a.spielerId), { punkte: increment(1) });
    });
    if (richtigeAntworten.length > 0) {
      const schnellste = richtigeAntworten.reduce((a, b) => (a.elapsedMs <= b.elapsedMs ? a : b));
      batch.update(api.spielerRef(schnellste.spielerId), { punkte: increment(1) });
    }
    batch.update(api.raumRef(), { stStatus: "rundenergebnis", stRundenergebnisSeit: Date.now() });
    await batch.commit();
  } catch (e) {
    auswertungAusgeloest = false;
    zeigeDebug("Fehler bei der Auswertung: " + e.message);
  }
}

function zeigeRundenergebnis() {
  const frage = frageFuerIndex(aktuellerFrageIndex);
  $("st-re-titel").textContent = frage
    ? (frage.richtig ? "Stimmt! ✓" : "Stimmt nicht! ✗")
    : "?";
  $("st-re-erklaerung").textContent = frage ? frage.erklaerung : "";

  const antworten = antwortenDieserRunde();
  const richtigeAntworten = antworten.filter((a) => a.richtig);
  const schnellsteId = richtigeAntworten.length > 0
    ? richtigeAntworten.reduce((a, b) => (a.elapsedMs <= b.elapsedMs ? a : b)).spielerId
    : null;

  const sortiert = [...spielerListe].sort((a, b) => (a.name || "").localeCompare(b.name || "", "de"));
  const liste = $("st-re-liste");
  liste.innerHTML = "";
  sortiert.forEach((s) => {
    const antwort = antworten.find((a) => a.spielerId === s.id);
    const getipptesLabel = (a) => (a.getippterWert ? "Stimmt" : "Stimmt nicht");
    let beschreibung;
    if (!antwort) beschreibung = "Nicht rechtzeitig getippt";
    else if (antwort.richtig && s.id === schnellsteId) beschreibung = `Getippt: ${getipptesLabel(antwort)} - am schnellsten! +2`;
    else if (antwort.richtig) beschreibung = `Getippt: ${getipptesLabel(antwort)} +1`;
    else beschreibung = `Getippt: ${getipptesLabel(antwort)}`;
    const li = document.createElement("li");
    li.innerHTML = spielerKarte(
      s.name, s.farbe, s.icon,
      antwort?.richtig ? "✓" : "✗",
      { extra: beschreibung, punkteRechts: s.punkte ?? 0 }
    );
    liste.appendChild(li);
  });
}

async function naechsterSchrittNachRundenergebnis() {
  try {
    if (rundeIndex + 1 >= anzahlRunden) {
      await updateDoc(api.raumRef(), { stStatus: "beendet" });
      speichereWertung(api, "stimmts", Object.fromEntries(spielerListe.map((s) => [s.id, s.punkte ?? 0])));
    } else {
      const frageIndex = neueRundeFrageIndex(verwendeteIndizes);
      await updateDoc(api.raumRef(), {
        stStatus: "frage",
        stRundeIndex: rundeIndex + 1,
        stVerwendeteIndizes: [...verwendeteIndizes, frageIndex],
        stFrageIndex: frageIndex,
        stFrageSeit: Date.now(),
        stRundenergebnisSeit: 0
      });
    }
  } catch (e) {
    zeigeDebug("Fehler beim Weiterschalten: " + e.message);
  }
}

function zeigeEndstand() {
  if (!el.wurzel) return;
  const sortiert = [...spielerListe].sort((a, b) => (b.punkte ?? 0) - (a.punkte ?? 0));
  const liste = $("st-endstand-liste");
  liste.innerHTML = "";
  sortiert.forEach((s, i) => {
    const li = document.createElement("li");
    li.innerHTML = spielerKarte(s.name, s.farbe, s.icon, s.punkte ?? 0, { rang: i + 1 });
    liste.appendChild(li);
  });
  $("st-endstand-warten").hidden = api.istLeiter;
  const stGesamtwertungBtn = $("st-gesamtwertung-btn");
  if (stGesamtwertungBtn) {
    stGesamtwertungBtn.hidden = !(api.istLeiter && Boolean(api.olympiadeAnzahl));
    stGesamtwertungBtn.onclick = () => api.zeigeGesamtwertung();
  }
}
