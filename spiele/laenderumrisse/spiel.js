// ============================================================================
//  Länderumrisse
// ----------------------------------------------------------------------------
//  Pro Runde wird die Silhouette eines Landes gezeigt (SVG-Umriss aus
//  öffentlichen Geodaten, siehe laender.json) - die Antwort wird per
//  Texteingabe getippt (kein Multiple-Choice). Groß-/Kleinschreibung und
//  Umlaute spielen keine Rolle, und sowohl die deutsche als auch die
//  englische Schreibweise (plus ein paar gängige Aliase, z. B. "UK" oder
//  "USA") zählen als richtig - siehe das Feld "antworten" in laender.json
//  und die Funktion normalisiere() unten, die exakt zur Erzeugung der Datei
//  passen muss (siehe generate.js im Entwicklungs-Skript). Wer richtig
//  tippt, bekommt einen Punkt; wer am schnellsten richtig getippt hat,
//  bekommt zusätzlich einen Bonuspunkt. Danach folgt die Auflösung mit allen
//  Antworten, und es geht zur nächsten (immer neuen) Silhouette weiter - bis
//  die eingestellte Rundenzahl erreicht ist. Alle spielspezifischen
//  Raumfelder beginnen mit "lu"; die Tipp-Antworten liegen getrennt in der
//  Subcollection "luAntworten".
// ============================================================================
import {
  doc, setDoc, updateDoc, deleteDoc, collection, getDocs, onSnapshot,
  serverTimestamp, increment, writeBatch
} from "../../kern/firebase.js";
import { spielerKarte, renderWarteAvatare, zeigeDebug, initBereitSystem, escapeHtml } from "../../kern/ui.js";
import { speichereWertung } from "../../kern/wertung.js";

const STANDARD_ZEIT_SEKUNDEN = 15;
const MIN_ZEIT = 5;
const MAX_ZEIT = 45;
const STANDARD_ANZAHL = 10;
// Wie lange die Rundenergebnis-Anzeige (richtiges Land + wer was getippt hat)
// zu sehen ist, bevor der Spielleiter automatisch weiterschaltet.
const RUNDENERGEBNIS_ANZEIGE_MS = 3500;
// Buchstaben-Hinweise: der erste (zufällige) Buchstabe des Landesnamens
// erscheint 15s nach Rundenstart, danach im 8-Sekunden-Takt ein weiterer.
const ERSTE_AUFDECKUNG_MS = 15000;
const AUFDECK_ABSTAND_MS = 8000;

let alleLaender = [];
let ladeFehler = "";

async function ladeLaenderDaten() {
  if (alleLaender.length > 0 || ladeFehler) return;
  try {
    const antwort = await fetch(new URL("./laender.json", import.meta.url));
    alleLaender = await antwort.json();
  } catch (e) {
    ladeFehler = "Die Länderdaten konnten nicht geladen werden: " + e.message;
  }
}

// Muss 1:1 zu normalisiere() in generate.js passen, mit der die "antworten"-
// Listen in laender.json erzeugt wurden - sonst würden richtige Tipps nicht
// mehr erkannt.
function normalisiere(text) {
  return text
    .toLowerCase()
    .replace(/ß/g, "ss")
    .normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// Nur echte Buchstaben (inkl. Umlaute) gelten als "aufdeckbar" - Leerzeichen,
// Bindestriche o. Ä. werden immer direkt angezeigt (siehe Blitzquiz-Wortratespiel,
// von dem dieses Muster übernommen ist).
function istBuchstabe(zeichen) {
  return /[a-zA-ZÀ-ÖØ-öø-ÿ]/.test(zeichen);
}

function buchstabenIndizes(name) {
  const indizes = [];
  for (let i = 0; i < name.length; i++) {
    if (istBuchstabe(name[i])) indizes.push(i);
  }
  return indizes;
}

function mischeArray(werte) {
  const kopie = [...werte];
  for (let i = kopie.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [kopie[i], kopie[j]] = [kopie[j], kopie[i]];
  }
  return kopie;
}

// Der letzte Buchstabe bleibt immer verdeckt, damit sich das Rätsel nicht von
// allein auflöst.
function maxAufdeckAnzahl(name) {
  return Math.max(0, buchstabenIndizes(name).length - 1);
}

function gewuenschteAufdeckAnzahl(elapsedMs, maximal) {
  if (elapsedMs < ERSTE_AUFDECKUNG_MS) return 0;
  const wert = 1 + Math.floor((elapsedMs - ERSTE_AUFDECKUNG_MS) / AUFDECK_ABSTAND_MS);
  return Math.min(maximal, wert);
}

const VORLAGE = `
  <div id="lu-setup" class="bildschirm-karte" hidden>
    <p class="hinweis-text">Nur der Umriss ist zu sehen - welches Land ist das? Tippt den Namen per
      Texteingabe; Groß-/Kleinschreibung ist egal und sowohl Deutsch als auch Englisch zählt. Richtig
      bringt einen Punkt, am schnellsten richtig einen Bonuspunkt dazu.</p>

    <div id="lu-anzahl-zeile" class="setup-anzahlblock" hidden>
      <div class="setup-anzahl-zeile">
        <span>Anzahl Runden</span>
        <span class="anzahl-picker">
          <input id="lu-anzahl" type="text" inputmode="numeric" pattern="[0-9]*" min="1" class="anzahl-eingabe">
        </span>
      </div>
      <p id="lu-anzahl-max" class="hinweis-text"></p>
    </div>

    <div class="setup-anzahlblock">
      <div class="setup-anzahl-zeile">
        <span>Zeit zum Tippen (Sekunden)</span>
        <span class="anzahl-picker">
          <input id="lu-zeit" type="text" inputmode="numeric" pattern="[0-9]*" min="5" class="anzahl-eingabe">
        </span>
      </div>
    </div>

    <p id="lu-setup-fehler" class="fehler-text"></p>
    <p><button id="lu-starten" class="btn-primaer" hidden>Spiel starten</button></p>
    <p id="lu-setup-warten" hidden><em>Warte, bis der Spielleiter das Spiel startet …</em></p>
    <div id="lu-bereit-bereich" class="bereit-bereich" hidden></div>
  </div>

  <div id="lu-frage-screen" class="bildschirm-karte" hidden>
    <p class="kategorie">Länderumrisse</p>
    <div id="lu-umriss-anzeige" class="lu-umriss-anzeige"></div>
    <div id="lu-buchstaben-reihe" class="lu-buchstaben-reihe"></div>
    <p id="lu-frage-hinweis" class="hinweis-text"></p>
    <p class="lu-antwort-zeile">
      <input id="lu-antwort-eingabe" type="text" placeholder="Land eingeben …" autocomplete="off">
      <button id="lu-antwort-absenden" type="button">Absenden</button>
    </p>
    <div id="lu-frage-status" class="warten-block"></div>
  </div>

  <div id="lu-rundenergebnis-screen" class="bildschirm-karte" hidden>
    <p class="kategorie">Länderumrisse</p>
    <h2 id="lu-re-titel"></h2>
    <ul id="lu-re-liste"></ul>
  </div>

  <div id="lu-endstand-screen" class="bildschirm-karte" hidden>
    <h1>Endstand</h1>
    <ul id="lu-endstand-liste"></ul>
    <p id="lu-endstand-warten" hidden><em>Der Spielleiter wählt gleich das nächste Spiel …</em></p>
    <p><button id="lu-gesamtwertung-btn" class="btn-primaer" type="button" hidden>Gesamtwertung</button></p>
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
let verwendeteIds = [];
let aktuellesLandId = null;
let frageSeit = 0;
let rundenergebnisSeit = 0;
let buchstabenReihenfolge = [];
let aufdeckAnzahl = 0;
let aufdeckAnzahlGerendert = -1;
let aufdeckFortschreibenLaeuft = false;

let eigeneAntwortGesetzt = false;
// Verhindert, dass der Spielleiter denselben automatischen Übergang mehrfach
// auslöst (z. B. bei jedem Tick) - wird jeweils beim Erkennen einer NEUEN
// Runde/eines neuen Rundenergebnisses zurückgesetzt (siehe raumDaten()).
let auswertungAusgeloest = false;
let rundenergebnisAusgeloest = false;
// v205-Lehre (Zeitgefühl!): Frage-Karte bzw. Rundenergebnis-Liste nur EINMAL
// pro Runde per innerHTML aufbauen, nicht bei jedem raumDaten()-Aufruf neu -
// sonst flackern Eingabefeld/Avatare.
let frageGerendert = false;
let rundenergebnisGerendert = false;

let bereitSystem = null;
let olympiadeAutoStart = false;

const $ = (id) => el.wurzel.querySelector("#" + id);

function landFuerId(id) {
  return alleLaender.find((l) => l.id === id) ?? null;
}

function findeLandZuText(text) {
  const normalisiert = normalisiere(text);
  if (!normalisiert) return null;
  return alleLaender.find((l) => l.antworten?.includes(normalisiert)) ?? null;
}

function neueRundeLandId(bisherigeIds) {
  const uebrig = alleLaender.filter((l) => !bisherigeIds.includes(l.id));
  const pool = uebrig.length > 0 ? uebrig : alleLaender;
  return pool[Math.floor(Math.random() * pool.length)].id;
}

// Als kommagetrennte Zeichenkette statt Array gespeichert - Firestore erlaubt
// kein Array-im-Array/-Objekt in einem einzelnen Feld hier nicht relevant,
// aber so bleibt das Format konsistent einfach und leicht zu parsen.
function neueBuchstabenReihenfolge(landId) {
  const land = landFuerId(landId);
  if (!land) return "";
  return mischeArray(buchstabenIndizes(land.name)).join(",");
}

export async function starten(uebergebeneApi) {
  api = uebergebeneApi;
  el.wurzel = api.wurzel;
  el.wurzel.innerHTML = VORLAGE;
  bereitSystem = initBereitSystem(api, "lu");
  olympiadeAutoStart = false;

  await ladeLaenderDaten();
  if (ladeFehler) $("lu-setup-fehler").textContent = ladeFehler;

  verdrahteBedienelemente();
  starteListener();

  if (api.istLeiter && !api.raum?.luStatus) {
    await updateDoc(api.raumRef(), {
      luStatus: "setup", luRundeIndex: 0, luAnzahlRunden: 0,
      luZeitSekunden: STANDARD_ZEIT_SEKUNDEN, luVerwendeteIds: [], luLandId: null,
      luBuchstabenReihenfolge: "", luAufdeckAnzahl: 0,
      luFrageSeit: 0, luRundenergebnisSeit: 0
    });
  }

  tickId = setInterval(spielTick, 200);
}

function verdrahteBedienelemente() {
  $("lu-anzahl").addEventListener("input", () => {
    const feld = $("lu-anzahl");
    const bereinigt = feld.value.replace(/[^0-9]/g, "");
    if (bereinigt !== feld.value) feld.value = bereinigt;
  });
  $("lu-anzahl").addEventListener("change", () => {
    const feld = $("lu-anzahl");
    const max = Math.max(1, alleLaender.length || 1);
    let wert = parseInt(feld.value, 10);
    if (!Number.isFinite(wert) || wert < 1) wert = 1;
    if (wert > max) wert = max;
    feld.value = String(wert);
  });
  $("lu-anzahl").addEventListener("focus", () => { $("lu-anzahl").select(); });

  $("lu-zeit").addEventListener("input", () => {
    const feld = $("lu-zeit");
    const bereinigt = feld.value.replace(/[^0-9]/g, "");
    if (bereinigt !== feld.value) feld.value = bereinigt;
  });
  $("lu-zeit").addEventListener("change", () => {
    const feld = $("lu-zeit");
    let wert = parseInt(feld.value, 10);
    if (!Number.isFinite(wert) || wert < MIN_ZEIT) wert = MIN_ZEIT;
    if (wert > MAX_ZEIT) wert = MAX_ZEIT;
    feld.value = String(wert);
  });
  $("lu-zeit").addEventListener("focus", () => { $("lu-zeit").select(); });

  $("lu-starten").addEventListener("click", spielStarten);
  $("lu-antwort-absenden").addEventListener("click", antwortAbsenden);
  $("lu-antwort-eingabe").addEventListener("keydown", (e) => { if (e.key === "Enter") antwortAbsenden(); });
}

function starteListener() {
  antwortenUnsub = onSnapshot(collection(api.db, "raeume", api.code, "luAntworten"), (snap) => {
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
  verwendeteIds = [];
  aktuellesLandId = null;
  frageSeit = 0;
  rundenergebnisSeit = 0;
  buchstabenReihenfolge = [];
  aufdeckAnzahl = 0;
  aufdeckAnzahlGerendert = -1;
  aufdeckFortschreibenLaeuft = false;
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
  status = daten.luStatus ?? null;
  anzahlRunden = daten.luAnzahlRunden ?? 0;
  zeitSekunden = daten.luZeitSekunden ?? STANDARD_ZEIT_SEKUNDEN;
  verwendeteIds = daten.luVerwendeteIds ?? [];
  aktuellesLandId = daten.luLandId ?? null;
  buchstabenReihenfolge = daten.luBuchstabenReihenfolge
    ? daten.luBuchstabenReihenfolge.split(",").map(Number)
    : [];
  aufdeckAnzahl = daten.luAufdeckAnzahl ?? 0;

  const neueRunde = daten.luRundeIndex ?? 0;
  const neuerFrageSeit = daten.luFrageSeit ?? 0;
  if (status === "frage" && (rundeIndex !== neueRunde || frageSeit !== neuerFrageSeit)) {
    rundeIndex = neueRunde;
    frageSeit = neuerFrageSeit;
    eigeneAntwortGesetzt = false;
    auswertungAusgeloest = false;
    frageGerendert = false;
    aufdeckAnzahlGerendert = -1;
  } else {
    rundeIndex = neueRunde;
  }

  const neuerRundenergebnisSeit = daten.luRundenergebnisSeit ?? 0;
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
    $("lu-setup").hidden = false;
  } else if (status === "frage") {
    if (!frageGerendert) {
      frageGerendert = true;
      zeigeFrage();
    } else {
      aktualisiereFrageStatus();
      rendereBuchstabenAnzeige();
    }
    $("lu-frage-screen").hidden = false;
  } else if (status === "rundenergebnis") {
    if (!rundenergebnisGerendert) {
      rundenergebnisGerendert = true;
      zeigeRundenergebnis();
    }
    $("lu-rundenergebnis-screen").hidden = false;
  } else if (status === "beendet") {
    zeigeEndstand();
    $("lu-endstand-screen").hidden = false;
  }
}

function alleVerstecken() {
  ["lu-setup", "lu-frage-screen", "lu-rundenergebnis-screen", "lu-endstand-screen"]
    .forEach((id) => { $(id).hidden = true; });
}

function zeigeSetup() {
  const maxRunden = Math.max(1, alleLaender.length || 1);
  const anzahlFeld = $("lu-anzahl");
  anzahlFeld.max = maxRunden;
  const inOlympiade = Boolean(api.olympiadeAnzahl);
  if (inOlympiade) {
    const festgelegt = Math.min(Math.max(1, api.olympiadeAnzahl), maxRunden);
    anzahlFeld.value = String(festgelegt);
    $("lu-anzahl-max").textContent =
      `In der Olympiade festgelegt: ${festgelegt} ${festgelegt === 1 ? "Runde" : "Runden"}.`;
    anzahlFeld.disabled = true;
  } else {
    if (!anzahlFeld.value) anzahlFeld.value = String(Math.min(STANDARD_ANZAHL, maxRunden));
    $("lu-anzahl-max").textContent = `Bis zu ${maxRunden} Runden, jede mit einem neuen Land.`;
    anzahlFeld.disabled = !api.istLeiter;
  }
  $("lu-anzahl-zeile").hidden = false;

  const zeitFeld = $("lu-zeit");
  if (!zeitFeld.value) zeitFeld.value = String(STANDARD_ZEIT_SEKUNDEN);
  zeitFeld.disabled = !api.istLeiter;

  $("lu-starten").hidden = !api.istLeiter || alleLaender.length === 0;
  $("lu-setup-warten").hidden = api.istLeiter;
  bereitSystem?.render();

  if (api.istLeiter && api.olympiadeAnzahl && !olympiadeAutoStart && bereitSystem?.alleBereit()) {
    olympiadeAutoStart = true;
    spielStarten();
  }
}

async function spielStarten() {
  $("lu-setup-fehler").textContent = "";
  if (spielerListe.length < 2) {
    $("lu-setup-fehler").textContent = "Für Länderumrisse braucht ihr mindestens zwei Spieler.";
    return;
  }
  if (alleLaender.length === 0) {
    $("lu-setup-fehler").textContent = ladeFehler || "Die Länderdaten sind nicht verfügbar.";
    return;
  }

  const maxRunden = Math.max(1, alleLaender.length);
  let anzahl = parseInt($("lu-anzahl").value, 10);
  if (!Number.isFinite(anzahl) || anzahl < 1) anzahl = 1;
  if (anzahl > maxRunden) anzahl = maxRunden;

  let zeit = parseInt($("lu-zeit").value, 10);
  if (!Number.isFinite(zeit) || zeit < MIN_ZEIT) zeit = MIN_ZEIT;
  if (zeit > MAX_ZEIT) zeit = MAX_ZEIT;

  const landId = neueRundeLandId([]);

  $("lu-starten").disabled = true;
  try {
    await raeumeSpieldatenAuf();
    await updateDoc(api.raumRef(), {
      luStatus: "frage",
      luRundeIndex: 0,
      luAnzahlRunden: anzahl,
      luZeitSekunden: zeit,
      luVerwendeteIds: [landId],
      luLandId: landId,
      luBuchstabenReihenfolge: neueBuchstabenReihenfolge(landId),
      luAufdeckAnzahl: 0,
      luFrageSeit: Date.now(),
      luRundenergebnisSeit: 0
    });
  } catch (e) {
    zeigeDebug("Fehler beim Start: " + e.message);
  }
  $("lu-starten").disabled = false;
}

async function raeumeSpieldatenAuf() {
  const snap = await getDocs(collection(api.db, "raeume", api.code, "luAntworten"));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  alleAntworten = [];
  await Promise.all(spielerListe.map((s) => updateDoc(api.spielerRef(s.id), { punkte: 0 })));
}

export async function vorZurueck() {
  try {
    await raeumeSpieldatenAuf();
    await updateDoc(api.raumRef(), {
      luStatus: null, luRundeIndex: 0, luAnzahlRunden: 0,
      luZeitSekunden: STANDARD_ZEIT_SEKUNDEN, luVerwendeteIds: [], luLandId: null,
      luBuchstabenReihenfolge: "", luAufdeckAnzahl: 0,
      luFrageSeit: 0, luRundenergebnisSeit: 0
    });
    await api.zurueckZurAuswahl();
  } catch (e) {
    zeigeDebug("Fehler beim Zurückkehren: " + e.message);
  }
}

function zeigeFrage() {
  const land = landFuerId(aktuellesLandId);
  $("lu-umriss-anzeige").innerHTML = land
    ? `<svg viewBox="0 0 200 200" class="lu-svg" role="img" aria-label="Umriss eines Landes"><path d="${land.pfad}" fill-rule="evenodd"/></svg>`
    : "";

  $("lu-antwort-eingabe").value = "";
  $("lu-antwort-eingabe").disabled = false;
  $("lu-antwort-absenden").disabled = false;
  aktualisiereFrageStatus();
  rendereBuchstabenAnzeige();
}

// Zeigt für jeden Buchstaben des Landesnamens ein Kästchen (Leerzeichen/
// Bindestriche als Lücke ohne Kästchen) - analog zum Wortrate-Rätsel bei
// Blitzquiz. Wird nur neu gebaut, wenn sich aufdeckAnzahl tatsächlich
// geändert hat (v205-Lehre: sonst würde die Reihe bei jedem raumDaten()-
// Aufruf flackern).
function rendereBuchstabenAnzeige() {
  if (!el.wurzel || status !== "frage") return;
  if (aufdeckAnzahl === aufdeckAnzahlGerendert) return;
  aufdeckAnzahlGerendert = aufdeckAnzahl;

  const land = landFuerId(aktuellesLandId);
  const reihe = $("lu-buchstaben-reihe");
  reihe.innerHTML = "";
  if (!land) return;

  const aufgedeckt = new Set(buchstabenReihenfolge.slice(0, aufdeckAnzahl));
  for (let i = 0; i < land.name.length; i++) {
    const zeichen = land.name[i];
    const span = document.createElement("span");
    if (!istBuchstabe(zeichen)) {
      span.className = "lu-buchstabe-luecke";
      span.textContent = zeichen;
    } else {
      span.className = "lu-buchstabe-kasten" + (aufgedeckt.has(i) ? " lu-aufgedeckt" : "");
      span.textContent = aufgedeckt.has(i) ? zeichen.toUpperCase() : "";
    }
    reihe.appendChild(span);
  }
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
  $("lu-antwort-eingabe").disabled = eigeneAntwortGesetzt;
  $("lu-antwort-absenden").disabled = eigeneAntwortGesetzt;
  $("lu-frage-hinweis").textContent = eigeneAntwortGesetzt
    ? "Getippt! Warte auf die anderen …"
    : "Welches Land ist das?";
  renderWarteAvatare(
    $("lu-frage-status"),
    spielerListe.filter((sp) => !geantwortetIds.has(sp.id))
  );
}

async function antwortAbsenden() {
  if (status !== "frage" || eigeneAntwortGesetzt) return;
  const eingabeFeld = $("lu-antwort-eingabe");
  const text = eingabeFeld.value.trim();
  if (!text) return;

  eigeneAntwortGesetzt = true;
  eingabeFeld.disabled = true;
  $("lu-antwort-absenden").disabled = true;
  $("lu-frage-hinweis").textContent = "Getippt! Warte auf die anderen …";
  try {
    const getipptesLand = findeLandZuText(text);
    await setDoc(doc(api.db, "raeume", api.code, "luAntworten", `${api.spielerId}_${rundeIndex}`), {
      spielerId: api.spielerId,
      spielerName: api.spielerName,
      rundeIndex,
      antwortText: text,
      richtig: Boolean(getipptesLand && getipptesLand.id === aktuellesLandId),
      elapsedMs: Date.now() - frageSeit,
      zeitpunkt: serverTimestamp()
    });
  } catch (e) {
    eigeneAntwortGesetzt = false;
    eingabeFeld.disabled = false;
    $("lu-antwort-absenden").disabled = false;
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
      $("lu-frage-hinweis").textContent = rest > 0
        ? `Noch ${Math.ceil(rest / 1000)}s, um zu tippen`
        : "Zeit ist um!";
    }
    if (api.istLeiter) {
      pruefeFrageAuswertung(elapsed);
      pruefeBuchstabenAufdeckung(elapsed);
    }
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
    batch.update(api.raumRef(), { luStatus: "rundenergebnis", luRundenergebnisSeit: Date.now() });
    await batch.commit();
  } catch (e) {
    auswertungAusgeloest = false;
    zeigeDebug("Fehler bei der Auswertung: " + e.message);
  }
}

// Nur der Spielleiter-Client schreibt das Aufdecken in den Raum - sonst
// würden mehrere Geräte gleichzeitig denselben nächsten Schritt aufdecken
// (siehe gleiches Muster bei Blitzquiz' Wortrate-Rätsel).
async function pruefeBuchstabenAufdeckung(elapsed) {
  if (!api.istLeiter || status !== "frage" || aufdeckFortschreibenLaeuft) return;
  const land = landFuerId(aktuellesLandId);
  if (!land) return;
  const maximal = maxAufdeckAnzahl(land.name);
  const gewuenscht = gewuenschteAufdeckAnzahl(elapsed, maximal);
  if (gewuenscht <= aufdeckAnzahl) return;

  aufdeckFortschreibenLaeuft = true;
  try {
    await updateDoc(api.raumRef(), { luAufdeckAnzahl: gewuenscht });
  } catch (e) {
    zeigeDebug("Fehler beim Aufdecken: " + e.message);
  }
  aufdeckFortschreibenLaeuft = false;
}

function zeigeRundenergebnis() {
  const land = landFuerId(aktuellesLandId);
  $("lu-re-titel").textContent = `Das war: ${land ? land.name : "?"}`;

  const antworten = antwortenDieserRunde();
  const richtigeAntworten = antworten.filter((a) => a.richtig);
  const schnellsteId = richtigeAntworten.length > 0
    ? richtigeAntworten.reduce((a, b) => (a.elapsedMs <= b.elapsedMs ? a : b)).spielerId
    : null;

  const sortiert = [...spielerListe].sort((a, b) => (a.name || "").localeCompare(b.name || "", "de"));
  const liste = $("lu-re-liste");
  liste.innerHTML = "";
  sortiert.forEach((s) => {
    const antwort = antworten.find((a) => a.spielerId === s.id);
    let beschreibung;
    if (!antwort) beschreibung = "Nicht rechtzeitig getippt";
    else if (antwort.richtig && s.id === schnellsteId) beschreibung = `Richtig (${escapeHtml(antwort.antwortText)}) - am schnellsten! +2`;
    else if (antwort.richtig) beschreibung = `Richtig (${escapeHtml(antwort.antwortText)}) +1`;
    else beschreibung = `Getippt: ${escapeHtml(antwort.antwortText || "?")}`;
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
      await updateDoc(api.raumRef(), { luStatus: "beendet" });
      speichereWertung(api, "laenderumrisse", Object.fromEntries(spielerListe.map((s) => [s.id, s.punkte ?? 0])));
    } else {
      const landId = neueRundeLandId(verwendeteIds);
      await updateDoc(api.raumRef(), {
        luStatus: "frage",
        luRundeIndex: rundeIndex + 1,
        luVerwendeteIds: [...verwendeteIds, landId],
        luLandId: landId,
        luBuchstabenReihenfolge: neueBuchstabenReihenfolge(landId),
        luAufdeckAnzahl: 0,
        luFrageSeit: Date.now(),
        luRundenergebnisSeit: 0
      });
    }
  } catch (e) {
    zeigeDebug("Fehler beim Weiterschalten: " + e.message);
  }
}

function zeigeEndstand() {
  if (!el.wurzel) return;
  const sortiert = [...spielerListe].sort((a, b) => (b.punkte ?? 0) - (a.punkte ?? 0));
  const liste = $("lu-endstand-liste");
  liste.innerHTML = "";
  sortiert.forEach((s, i) => {
    const li = document.createElement("li");
    li.innerHTML = spielerKarte(s.name, s.farbe, s.icon, s.punkte ?? 0, { rang: i + 1 });
    liste.appendChild(li);
  });
  $("lu-endstand-warten").hidden = api.istLeiter;
  const luGesamtwertungBtn = $("lu-gesamtwertung-btn");
  if (luGesamtwertungBtn) {
    luGesamtwertungBtn.hidden = !(api.istLeiter && Boolean(api.olympiadeAnzahl));
    luGesamtwertungBtn.onclick = () => api.zeigeGesamtwertung();
  }
}
