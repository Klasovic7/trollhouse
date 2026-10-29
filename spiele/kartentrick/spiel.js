// ============================================================================
//  Kartentrick
// ----------------------------------------------------------------------------
//  20 Karten mit Fußballer-Bildern liegen offen auf dem Tisch. Ein Bild wird
//  vorgeschlagen - es steckt so oft im Feld, wie Spieler mitspielen. Die Karten
//  werden umgedreht, dann tauschen dreimal zwei Karten die Plätze. Nach einem
//  3-2-1-Countdown läuft jede*r mit dem Joystick (alle starten oben in der
//  Mitte) auf eine Karte und wählt sie aus. Eine gewählte Karte ist für alle
//  anderen gesperrt. Zum Schluss werden alle Karten aufgedeckt.
//  Wertung: richtig gewählt vor falsch gewählt vor nichts gewählt; unter den
//  Richtigen entscheidet, wer schneller gewählt hat.
//  Raumfelder beginnen mit "kt"; Subcollections: ktWahl (Auswahl), ktPos.
// ============================================================================
import {
  doc, setDoc, updateDoc, deleteDoc, collection, getDocs, onSnapshot,
  increment, writeBatch, runTransaction
} from "../../kern/firebase.js";
import {
  spielerKarte, zeigeDebug, initBereitSystem, renderWarteAvatare, avatarBild
} from "../../kern/ui.js";
import { speichereWertung, punkteFuerRang } from "../../kern/wertung.js";

const COUNTDOWN_MS = 3000;      // "Gleich geht's los" (wie bei den anderen Spielen)
const MAX_RUNDEN = 15;
const STANDARD_RUNDEN = 3;
const SPALTEN = 5, ZEILEN = 4, ANZAHL = SPALTEN * ZEILEN;   // 20 Karten
const TISCH_ZEILEN = ZEILEN + 1;                            // eine Reihe Platz oben fuer den Start
const ANZAHL_TAUSCH = 3;
const ZEIGEN_MS = 4500;         // Karten offen, Ziel wird gezeigt
const UMDREHEN_MS = 600;
const PAUSE_MS = 500;
const TAUSCH_MS = 1500;         // je Tausch (davon 1100 ms Bewegung)
const BEWEGUNG_MS = 1100;
const ZAEHLEN_MS = 3000;        // 3-2-1
const WAHL_MS = 20000;          // so lange darf man waehlen
const AUFDECKEN_MS = 4500;      // so lange bleibt das Ergebnis sichtbar
const T_TAUSCH_START = ZEIGEN_MS + UMDREHEN_MS + PAUSE_MS;
const T_ZAEHLEN = T_TAUSCH_START + ANZAHL_TAUSCH * TAUSCH_MS;
const T_WAHL = T_ZAEHLEN + ZAEHLEN_MS;
const MOTIVE = 22;
const BILD_VERSION = "393";
const TEMPO = 3.2;              // Zellen pro Sekunde
const KARTE = 0.82;
const FIGUR_R = 0.3;
const POS_INTERVALL_MS = 200;

const motivBilder = [];
function motivBild(i, beiGeladen) {
  if (!motivBilder[i]) {
    const img = new Image();
    img.onload = () => { img.__fertig = true; beiGeladen?.(); };
    img.src = `bilder/memory/f${String(i + 1).padStart(2, "0")}.webp?v=${BILD_VERSION}`;
    motivBilder[i] = img;
  }
  return motivBilder[i];
}
const avatarBilder = new Map();
function avatarImg(iconId, beiGeladen) {
  const pfad = avatarBild(iconId);
  if (!pfad) return null;
  if (!avatarBilder.has(pfad)) {
    const img = new Image();
    img.onload = () => { img.__fertig = true; beiGeladen?.(); };
    img.src = pfad;
    avatarBilder.set(pfad, img);
  }
  return avatarBilder.get(pfad);
}
function zufall(n) { return Math.floor(Math.random() * n); }
function mische(liste) {
  const a = [...liste];
  for (let i = a.length - 1; i > 0; i--) {
    const j = zufall(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Eine Runde: Anordnung (Motiv je Platz), Zielmotiv, drei Tausche.
function erzeugeRunde(spielerAnzahl) {
  const motive = mische([...Array(MOTIVE).keys()]);
  const ziel = motive[0];
  const andere = motive.slice(1, 1 + (ANZAHL - spielerAnzahl));
  const karten = mische([...Array(spielerAnzahl).fill(ziel), ...andere]);
  const tausch = [];
  const jetzt = [...karten];
  for (let i = 0; i < ANZAHL_TAUSCH; i++) {
    const a = zufall(ANZAHL);
    let b;
    do { b = zufall(ANZAHL); } while (b === a || jetzt[b] === jetzt[a]);
    [jetzt[a], jetzt[b]] = [jetzt[b], jetzt[a]];
    tausch.push([a, b]);
  }
  return { karten, ziel, tausch, ende: jetzt };
}

const VORLAGE = `
  <div id="kt-setup" class="bildschirm-karte" hidden>
    <p class="hinweis-text">Kartentrick: Ein Fußballer wird gezeigt - er steckt so oft im Feld, wie Spieler
      mitspielen. Die Karten werden umgedreht und vertauscht. Danach wählt jeder eine Karte aus:
      Wer eine richtige erwischt, punktet - und wer schneller war, bekommt mehr.</p>
    <div id="kt-einstellungen" hidden>
      <div class="setup-anzahl-zeile">
        <span>Anzahl Runden</span>
        <span class="anzahl-picker">
          <input id="kt-anzahl" type="text" inputmode="numeric" pattern="[0-9]*" class="anzahl-eingabe">
        </span>
      </div>
      <p id="kt-anzahl-max" class="hinweis-text"></p>
    </div>
    <p id="kt-setup-fehler" class="fehler-text"></p>
    <p><button id="kt-starten" class="btn-primaer" hidden>Spiel starten</button></p>
    <p id="kt-setup-warten" hidden><em>Warte, bis der Spielleiter das Spiel startet …</em></p>
    <div id="kt-bereit-bereich" class="bereit-bereich" hidden></div>
  </div>

  <div id="kt-vorbereitung-screen" class="bildschirm-karte pg-mitte" hidden>
    <p class="kategorie">Kartentrick</p>
    <p class="pg-vorb-text">Gleich geht's los: <strong id="kt-vorb-text"></strong></p>
    <p class="zg-countdown-ziffer" id="kt-countdown-ziffer"></p>
  </div>

  <div id="kt-spiel-screen" class="bildschirm-karte" hidden>
    <div class="kt-ziel">
      <img id="kt-ziel-bild" alt="" width="52" height="52">
      <div><strong id="kt-ziel-text"></strong><br><span id="kt-ziel-info"></span></div>
    </div>
    <div id="kt-canvas-wrap" class="pg-canvas-wrap">
      <canvas id="kt-canvas"></canvas>
    </div>
    <div id="kt-chips" class="rv-chips" hidden></div>
    <div class="mm-steuerung" id="kt-steuerung">
      <div class="mm-joy" id="kt-kreuz" aria-label="Joystick">
        <div class="mm-joy-knopf" id="kt-joy-knopf"></div>
      </div>
      <button type="button" id="kt-aktion" class="mm-aktion" disabled>Auswählen</button>
    </div>
    <p id="kt-hinweis" class="hinweis-text pg-hinweis"></p>
    <div id="kt-status" class="warten-block"></div>
  </div>

  <div id="kt-ergebnis-screen" class="bildschirm-karte" hidden>
    <p class="kategorie">Kartentrick</p>
    <h2 id="kt-erg-titel"></h2>
    <ul id="kt-erg-liste"></ul>
    <p><button id="kt-weiter" hidden>Weiter</button></p>
  </div>

  <div id="kt-endstand-screen" class="bildschirm-karte" hidden>
    <h1>Endstand</h1>
    <ul id="kt-endstand-liste"></ul>
    <p id="kt-endstand-warten" hidden><em>Der Spielleiter wählt gleich das nächste Spiel …</em></p>
    <p><button id="kt-gesamtwertung-btn" class="btn-primaer" type="button" hidden>Gesamtwertung</button></p>
  </div>
`;

let api = null;
let el = {};
let spielerListe = [];
let wahlDocs = [];
let posDocs = {};
let wahlUnsub = null, posUnsub = null;
let tickId = null;

let status = null;
let rundenIndex = -1;
let anzahlRunden = 0;
let entwurfRunden = STANDARD_RUNDEN;
let anzahlEntwurfTimer = null;
let layoutJson = "";
let layoutListe = [];
let vorbereitungSeit = 0;
let aufdeckSeit = 0;        // 0 = noch nicht aufgedeckt
let auswertungLaeuft = false;
let leiterBeschaeftigt = false;
let aktuelleRundeKey = "";
let spielfeld = null;
let bereitSystem = null;
let olympiadeAutoStart = false;

const $ = (id) => el.wurzel.querySelector("#" + id);

export async function starten(uebergebeneApi) {
  api = uebergebeneApi;
  el.wurzel = api.wurzel;
  el.wurzel.innerHTML = VORLAGE;
  bereitSystem = initBereitSystem(api, "kt");
  olympiadeAutoStart = false;

  verdrahteBedienelemente();
  starteListener();

  if (api.istLeiter && !api.raum?.ktStatus) {
    await updateDoc(api.raumRef(), {
      ktStatus: "setup", ktRundenIndex: 0, ktAnzahlRunden: 0, ktAnzahlEntwurf: STANDARD_RUNDEN,
      ktLayouts: "", ktVorbereitungSeit: 0, ktAufdeckSeit: 0
    });
  }
  tickId = setInterval(rundenTick, 150);
  window.addEventListener("resize", beiGroessenaenderung);
}

function verdrahteBedienelemente() {
  $("kt-anzahl").addEventListener("input", () => {
    const feld = $("kt-anzahl");
    const bereinigt = feld.value.replace(/[^0-9]/g, "");
    if (bereinigt !== feld.value) feld.value = bereinigt;
    schreibeEntwurfLive();
  });
  $("kt-anzahl").addEventListener("change", () => {
    const feld = $("kt-anzahl");
    let wert = parseInt(feld.value, 10);
    if (!Number.isFinite(wert) || wert < 1) wert = 1;
    if (wert > MAX_RUNDEN) wert = MAX_RUNDEN;
    feld.value = String(wert);
  });
  $("kt-anzahl").addEventListener("focus", () => { $("kt-anzahl").select(); });
  $("kt-starten").addEventListener("click", spielStarten);
  $("kt-weiter").addEventListener("click", weiter);
}

function schreibeEntwurfLive() {
  if (!api.istLeiter) return;
  clearTimeout(anzahlEntwurfTimer);
  anzahlEntwurfTimer = setTimeout(() => {
    const wert = parseInt($("kt-anzahl").value, 10);
    if (Number.isFinite(wert) && wert > 0) {
      updateDoc(api.raumRef(), { ktAnzahlEntwurf: wert }).catch(() => {});
    }
  }, 300);
}

function starteListener() {
  const basis = ["raeume", api.code];
  wahlUnsub = onSnapshot(collection(api.db, ...basis, "ktWahl"), (snap) => {
    const neu = [];
    snap.forEach((d) => neu.push(d.data()));
    wahlDocs = neu;
    spielfeld?.wahlGeaendert();
    if (status === "ausgewertet") zeigeErgebnisListe(rundenIndex);
    if (status === "runde_aktiv") aktualisiereStatus();
  });
  posUnsub = onSnapshot(collection(api.db, ...basis, "ktPos"), (snap) => {
    const neu = {};
    snap.forEach((d) => { neu[d.id] = d.data(); });
    posDocs = neu;
  });
}

export function beenden() {
  bereitSystem = null;
  [wahlUnsub, posUnsub].forEach((u) => { if (u) u(); });
  wahlUnsub = posUnsub = null;
  if (tickId) { clearInterval(tickId); tickId = null; }
  window.removeEventListener("resize", beiGroessenaenderung);
  if (spielfeld) { spielfeld.abbauen(); spielfeld = null; }
  clearTimeout(anzahlEntwurfTimer);
  el = {};
  spielerListe = [];
  wahlDocs = [];
  posDocs = {};
  status = null;
  rundenIndex = -1;
  anzahlRunden = 0;
  layoutJson = "";
  layoutListe = [];
  vorbereitungSeit = 0;
  aufdeckSeit = 0;
  auswertungLaeuft = false;
  leiterBeschaeftigt = false;
  aktuelleRundeKey = "";
}

export function spieler(liste) {
  spielerListe = liste;
  if (!el.wurzel) return;
  if (status === "setup" || !status) zeigeSetup();
  if (status === "runde_aktiv") aktualisiereStatus();
  if (status === "ausgewertet" && rundenIndex >= 0) zeigeErgebnisListe(rundenIndex);
  if (status === "beendet") zeigeEndstand();
}

export function raumDaten(daten) {
  if (!daten || !el.wurzel) return;
  status = daten.ktStatus ?? null;
  anzahlRunden = daten.ktAnzahlRunden ?? 0;
  entwurfRunden = daten.ktAnzahlEntwurf ?? STANDARD_RUNDEN;

  const json = daten.ktLayouts ?? "";
  if (json !== layoutJson) {
    layoutJson = json;
    try { layoutListe = json ? JSON.parse(json) : []; } catch { layoutListe = []; }
  }

  const neuerIndex = daten.ktRundenIndex ?? 0;
  const neuerStart = daten.ktVorbereitungSeit ?? 0;
  const neuAuf = daten.ktAufdeckSeit ?? 0;
  if (status === "runde_aktiv") {
    const key = neuerIndex + ":" + neuerStart;
    if (key !== aktuelleRundeKey) {
      aktuelleRundeKey = key;
      rundenIndex = neuerIndex;
      vorbereitungSeit = neuerStart;
      auswertungLaeuft = false;
      leiterBeschaeftigt = false;
      if (spielfeld) { spielfeld.abbauen(); spielfeld = null; }
    }
    if (neuAuf !== aufdeckSeit) leiterBeschaeftigt = false;
    aufdeckSeit = neuAuf;
  } else if (status === "ausgewertet") {
    rundenIndex = neuerIndex;
  }

  api.fortschritt(
    status === "runde_aktiv" || status === "ausgewertet" ? `${rundenIndex + 1}/${anzahlRunden}` : ""
  );

  alleVerstecken();
  if (status === "setup" || !status) {
    zeigeSetup();
    $("kt-setup").hidden = false;
  } else if (status === "runde_aktiv") {
    rundenTick();
  } else if (status === "ausgewertet") {
    zeigeErgebnis(rundenIndex);
    $("kt-ergebnis-screen").hidden = false;
  } else if (status === "beendet") {
    zeigeEndstand();
    $("kt-endstand-screen").hidden = false;
  }
}

function alleVerstecken() {
  ["kt-setup", "kt-vorbereitung-screen", "kt-spiel-screen", "kt-ergebnis-screen", "kt-endstand-screen"]
    .forEach((id) => { $(id).hidden = true; });
}

function zeigeSetup() {
  const anzahlFeld = $("kt-anzahl");
  if (api.olympiadeAnzahl) {
    const festgelegt = Math.min(Math.max(1, api.olympiadeAnzahl), MAX_RUNDEN);
    anzahlFeld.value = String(festgelegt);
    $("kt-anzahl-max").textContent =
      `In der Olympiade festgelegt: ${festgelegt} ${festgelegt === 1 ? "Runde" : "Runden"}.`;
    anzahlFeld.disabled = true;
  } else if (api.istLeiter) {
    if (!anzahlFeld.value) anzahlFeld.value = String(STANDARD_RUNDEN);
    $("kt-anzahl-max").textContent = `Bis zu ${MAX_RUNDEN} Runden.`;
    anzahlFeld.disabled = false;
  } else {
    anzahlFeld.value = String(entwurfRunden);
    $("kt-anzahl-max").textContent = `Bis zu ${MAX_RUNDEN} Runden.`;
    anzahlFeld.disabled = true;
  }
  $("kt-einstellungen").hidden = false;
  $("kt-starten").hidden = !api.istLeiter;
  $("kt-setup-warten").hidden = api.istLeiter;
  bereitSystem?.render();

  if (api.istLeiter && api.olympiadeAnzahl && !olympiadeAutoStart && bereitSystem?.alleBereit()) {
    olympiadeAutoStart = true;
    spielStarten();
  }
}

async function spielStarten() {
  $("kt-setup-fehler").textContent = "";
  if (spielerListe.length < 2) {
    $("kt-setup-fehler").textContent = "Für Kartentrick braucht ihr mindestens 2 Spieler.";
    return;
  }
  if (spielerListe.length > 10) {
    $("kt-setup-fehler").textContent = "Kartentrick geht mit höchstens 10 Spielern.";
    return;
  }
  let anzahl = parseInt($("kt-anzahl").value, 10);
  if (!Number.isFinite(anzahl) || anzahl < 1) anzahl = 1;
  if (anzahl > MAX_RUNDEN) anzahl = MAX_RUNDEN;
  const layouts = [];
  for (let i = 0; i < anzahl; i++) layouts.push(erzeugeRunde(spielerListe.length));

  $("kt-starten").disabled = true;
  try {
    await raeumeSpieldatenAuf();
    await updateDoc(api.raumRef(), {
      ktStatus: "runde_aktiv",
      ktRundenIndex: 0,
      ktAnzahlRunden: anzahl,
      ktLayouts: JSON.stringify(layouts),
      ktVorbereitungSeit: Date.now(),
      ktAufdeckSeit: 0
    });
  } catch (e) {
    zeigeDebug("Fehler beim Start: " + e.message);
  }
  $("kt-starten").disabled = false;
}

async function raeumeSpieldatenAuf() {
  for (const name of ["ktWahl", "ktPos"]) {
    const snap = await getDocs(collection(api.db, "raeume", api.code, name));
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  }
  wahlDocs = [];
  posDocs = {};
  await Promise.all(spielerListe.map((s) => updateDoc(api.spielerRef(s.id), { punkte: 0 })));
}

export async function vorZurueck() {
  try {
    await raeumeSpieldatenAuf();
    await updateDoc(api.raumRef(), {
      ktStatus: null, ktRundenIndex: 0, ktAnzahlRunden: 0, ktLayouts: "", ktVorbereitungSeit: 0, ktAufdeckSeit: 0
    });
    await api.zurueckZurAuswahl();
  } catch (e) {
    zeigeDebug("Fehler beim Zurückkehren: " + e.message);
  }
}

// ---------------------------------------------------------------- Auswertung
// Wahl je Spieler in der aktuellen Runde: { spielerId: { slot, ms } }
function wahlDieserRunde(pos) {
  const aktiveIds = new Set(spielerListe.map((s) => s.id));
  const karte = {};
  wahlDocs.forEach((d) => {
    if (d.typ === "c" && d.runde === pos && aktiveIds.has(d.spielerId)) karte[d.spielerId] = { slot: d.slot, ms: d.ms ?? 0 };
  });
  return karte;
}
function istRichtig(layout, slot) { return layout.ende[slot] === layout.ziel; }

// Reihenfolge: richtig (schnellste zuerst), dann falsch, dann ohne Wahl.
function rangListe(layout, wahl, spielerIds) {
  const gruppe = (id) => (wahl[id] === undefined ? 2 : istRichtig(layout, wahl[id].slot) ? 0 : 1);
  return [...spielerIds].sort((a, b) =>
    gruppe(a) - gruppe(b) || (wahl[a]?.ms ?? 0) - (wahl[b]?.ms ?? 0));
}
function berechnePunkte(layout, wahl, spielerIds) {
  const n = spielerIds.length;
  const ergebnis = {};
  rangListe(layout, wahl, spielerIds).forEach((id, i) => { ergebnis[id] = punkteFuerRang(i + 1, n); });
  return ergebnis;
}

async function waehle(slot, spielerId, pos, ms) {
  const r = (id) => doc(api.db, "raeume", api.code, "ktWahl", id);
  const refK = r(`${pos}_c${slot}`), refP = r(`${pos}_p${spielerId}`);
  await runTransaction(api.db, async (tx) => {
    const a = await tx.get(refK);
    const b = await tx.get(refP);
    if (a.exists() || b.exists()) throw new Error("ueberholt");
    tx.set(refK, { typ: "c", runde: pos, slot, spielerId, ms });
    tx.set(refP, { typ: "p", runde: pos, slot, spielerId, ms });
  });
}

function rundenTick() {
  if (!el.wurzel || status !== "runde_aktiv") return;
  const elapsedGesamt = Date.now() - vorbereitungSeit;
  if (elapsedGesamt < COUNTDOWN_MS) {
    $("kt-spiel-screen").hidden = true;
    $("kt-vorbereitung-screen").hidden = false;
    $("kt-vorb-text").textContent = `${spielerListe.length}× derselbe Fußballer`;
    const schritt = Math.min(2, Math.floor(elapsedGesamt / (COUNTDOWN_MS / 3)));
    $("kt-countdown-ziffer").textContent = ["3", "2", "1"][schritt];
  } else {
    $("kt-vorbereitung-screen").hidden = true;
    $("kt-spiel-screen").hidden = false;
    if (!spielfeld) starteSpielfeld();
  }
  if (api.istLeiter) leiterTick(elapsedGesamt - COUNTDOWN_MS);
}

async function leiterTick(t) {
  if (!api.istLeiter || status !== "runde_aktiv" || auswertungLaeuft || leiterBeschaeftigt) return;
  if (t < T_WAHL || spielerListe.length === 0) return;
  const layout = layoutListe[rundenIndex];
  if (!layout) return;
  const wahl = wahlDieserRunde(rundenIndex);

  if (!aufdeckSeit) {
    const alle = spielerListe.every((s) => wahl[s.id] !== undefined);
    const zeitUm = t - T_WAHL > WAHL_MS + 1500;
    if (!alle && !zeitUm) return;
    leiterBeschaeftigt = true;
    try {
      await updateDoc(api.raumRef(), { ktAufdeckSeit: Date.now() });
    } catch (e) {
      leiterBeschaeftigt = false;
      zeigeDebug("Fehler beim Aufdecken: " + e.message);
    }
    return;
  }

  if (Date.now() - aufdeckSeit < AUFDECKEN_MS) return;
  auswertungLaeuft = true;
  try {
    const punkte = berechnePunkte(layout, wahl, spielerListe.map((s) => s.id));
    const batch = writeBatch(api.db);
    Object.entries(punkte).forEach(([id, wert]) => {
      batch.update(api.spielerRef(id), { punkte: increment(wert) });
    });
    batch.update(api.raumRef(), { ktStatus: "ausgewertet" });
    await batch.commit();
  } catch (e) {
    zeigeDebug("Fehler bei der Auswertung: " + e.message);
    auswertungLaeuft = false;
  }
}

function aktualisiereStatus() {
  if (!el.wurzel) return;
  const wahl = wahlDieserRunde(rundenIndex);
  renderWarteAvatare($("kt-status"),
    aufdeckSeit ? [] : spielerListe.filter((sp) => wahl[sp.id] === undefined && sp.id !== api.spielerId));
}

// ------------------------------------------------------------------ Ergebnis
function formatZeit(ms) { return `${(ms / 1000).toFixed(1).replace(".", ",")} s`; }

function zeigeErgebnisListe(pos) {
  if (!el.wurzel) return;
  const layout = layoutListe[pos];
  if (!layout) return;
  const wahl = wahlDieserRunde(pos);
  const ids = spielerListe.map((s) => s.id);
  const punkte = berechnePunkte(layout, wahl, ids);
  const reihenfolge = rangListe(layout, wahl, ids);
  const liste = $("kt-erg-liste");
  liste.innerHTML = "";
  reihenfolge.forEach((id) => {
    const s = spielerListe.find((x) => x.id === id);
    const p = punkte[id] ?? 0;
    const w = wahl[id];
    const extra = w === undefined ? "Nichts gewählt"
      : istRichtig(layout, w.slot) ? `Richtig - nach ${formatZeit(w.ms)}` : "Falsche Karte";
    const li = document.createElement("li");
    li.innerHTML = spielerKarte(s.name, s.farbe, s.icon, p > 0 ? `+${p}` : "0", {
      extra, punkteRechts: s.punkte ?? 0
    });
    liste.appendChild(li);
  });
}

function zeigeErgebnis(pos) {
  $("kt-erg-titel").textContent = `Runde ${pos + 1} von ${anzahlRunden}`;
  zeigeErgebnisListe(pos);
  $("kt-weiter").hidden = !api.istLeiter;
  $("kt-weiter").textContent = pos + 1 >= anzahlRunden ? "Endstand anzeigen" : "Nächste Runde";
}

async function weiter() {
  $("kt-weiter").disabled = true;
  try {
    const naechster = rundenIndex + 1;
    if (naechster >= anzahlRunden) {
      await updateDoc(api.raumRef(), { ktStatus: "beendet" });
      speichereWertung(api, "kartentrick", Object.fromEntries(spielerListe.map((s) => [s.id, s.punkte ?? 0])));
    } else {
      await updateDoc(api.raumRef(), {
        ktStatus: "runde_aktiv",
        ktRundenIndex: naechster,
        ktVorbereitungSeit: Date.now(),
        ktAufdeckSeit: 0
      });
    }
  } catch (e) {
    zeigeDebug("Fehler beim Weiterschalten: " + e.message);
  }
  $("kt-weiter").disabled = false;
}

function zeigeEndstand() {
  if (!el.wurzel) return;
  const sortiert = [...spielerListe].sort((a, b) => (b.punkte ?? 0) - (a.punkte ?? 0));
  const liste = $("kt-endstand-liste");
  liste.innerHTML = "";
  sortiert.forEach((s, i) => {
    const li = document.createElement("li");
    li.innerHTML = spielerKarte(s.name, s.farbe, s.icon, s.punkte ?? 0, { rang: i + 1 });
    liste.appendChild(li);
  });
  $("kt-endstand-warten").hidden = api.istLeiter;
  const btn = $("kt-gesamtwertung-btn");
  if (btn) {
    btn.hidden = !(api.istLeiter && Boolean(api.olympiadeAnzahl));
    btn.onclick = () => api.zeigeGesamtwertung();
  }
}

// ------------------------------------------------------------------ Spielfeld
function beiGroessenaenderung() {
  if (spielfeld) spielfeld.layout();
}

function starteSpielfeld() {
  const layout = layoutListe[rundenIndex];
  if (!layout) return;
  spielfeld = baueSpielfeld(layout);
  aktualisiereStatus();
}

function baueSpielfeld(layout) {
  const canvas = $("kt-canvas");
  const wrap = $("kt-canvas-wrap");
  const knopf = $("kt-aktion");
  const hinweis = $("kt-hinweis");
  const kreuz = $("kt-kreuz");
  const chips = $("kt-chips");
  const ctx = canvas.getContext("2d");
  const ac = new AbortController();
  const sig = { signal: ac.signal };
  const pos = rundenIndex;
  const startT = vorbereitungSeit + COUNTDOWN_MS;     // Zeit 0 dieser Runde
  const N = spielerListe.length;

  // Zielbild oben
  const zielBild = $("kt-ziel-bild");
  zielBild.src = `bilder/memory/f${String(layout.ziel + 1).padStart(2, "0")}.webp?v=${BILD_VERSION}`;
  $("kt-ziel-text").textContent = `Gesucht: ${N}× im Feld`;

  const farbeVon = (id) => spielerListe.find((s) => s.id === id)?.farbe || "#7c3aed";
  const iconVon = (id) => spielerListe.find((s) => s.id === id)?.icon || "";

  let x = SPALTEN / 2, y = 0.5;        // alle starten oben in der Mitte
  const halten = { l: false, r: false, u: false, d: false };
  const joy = { x: 0, y: 0 };
  let ausstehend = false;
  let meldung = "";
  let rafId = 0, letzteZeit = performance.now();
  let c = 60, W = 300, H = 300, ox = 0, oy = 0;
  let rueck = null;
  let letztePosSendung = 0, letztePosKey = "", posTimer = null;
  const anzeige = new Map();
  let letzterKnopfKey = "", letzteChipsKey = "";

  function layoutBerechnen() {
    W = Math.floor(wrap.clientWidth || 300);
    const maxH = Math.max(240, (window.innerHeight || 700) - 440);
    c = Math.max(40, Math.min(W / (SPALTEN + 0.4), maxH / (TISCH_ZEILEN + 0.2), 96));
    ox = Math.round((W - SPALTEN * c) / 2);
    oy = Math.round(0.2 * c) + 4;
    H = Math.ceil(TISCH_ZEILEN * c) + oy + 6;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    baueRueck();
  }

  // ---- Zeitplan
  function zeit() { return Date.now() - startT; }
  function phase() {
    const t = zeit();
    if (aufdeckSeit) return { name: "aufdecken", t: Date.now() - aufdeckSeit };
    if (t < ZEIGEN_MS) return { name: "zeigen", t };
    if (t < ZEIGEN_MS + UMDREHEN_MS) return { name: "umdrehen", t: t - ZEIGEN_MS };
    if (t < T_TAUSCH_START) return { name: "pause", t };
    if (t < T_ZAEHLEN) {
      const k = Math.floor((t - T_TAUSCH_START) / TAUSCH_MS);
      const innen = (t - T_TAUSCH_START) - k * TAUSCH_MS;
      return { name: "tausch", k, p: Math.min(1, innen / BEWEGUNG_MS) };
    }
    if (t < T_WAHL) return { name: "zaehlen", t: t - T_ZAEHLEN };
    return { name: "wahl", t: t - T_WAHL };
  }

  // ---- Zustand
  function besitzerMap() {
    const m = new Map();     // Platz -> spielerId
    Object.entries(wahlDieserRunde(pos)).forEach(([id, w]) => m.set(w.slot, id));
    return m;
  }
  function meinePlatz(bm) {
    for (const [slot, id] of bm) if (id === api.spielerId) return slot;
    return null;
  }
  function slotMitte(slot) {
    return { x: (slot % SPALTEN) + 0.5, y: Math.floor(slot / SPALTEN) + 1.5 };
  }
  function kartePlatz(slot) {
    const m = slotMitte(slot);
    return { px: ox + m.x * c, py: oy + m.y * c };
  }
  function slotUnterFigur() {
    const sp = Math.floor(x), ze = Math.floor(y) - 1;
    if (sp < 0 || sp >= SPALTEN || ze < 0 || ze >= ZEILEN) return null;
    const m = slotMitte(ze * SPALTEN + sp);
    return Math.abs(x - m.x) <= KARTE / 2 + 0.02 && Math.abs(y - m.y) <= KARTE / 2 + 0.02 ? ze * SPALTEN + sp : null;
  }
  function festgelegt(bm) { return aufdeckSeit > 0 || meinePlatz(bm) !== null || ausstehend; }
  function darfLaufen(ph, bm) { return ph.name === "wahl" && !festgelegt(bm); }
  function lage(ph, bm) {
    const slot = slotUnterFigur();
    if (ph.name !== "wahl") return { modus: null, slot, grund: "phase" };
    if (meinePlatz(bm) !== null || ausstehend) return { modus: null, slot, grund: "gewaehlt" };
    if (slot === null) return { modus: null, slot, grund: "leer" };
    if (bm.has(slot)) return { modus: null, slot, grund: "belegt" };
    return { modus: "waehlen", slot, grund: "" };
  }

  async function aktion() {
    const ph = phase();
    const bm = besitzerMap();
    const l = lage(ph, bm);
    if (l.modus !== "waehlen" || ausstehend) return;
    ausstehend = true;
    stoppeHalten();
    meldung = "";
    try {
      await waehle(l.slot, api.spielerId, pos, Math.max(0, Date.now() - startT - T_WAHL));
      const m = slotMitte(l.slot);
      x = m.x; y = m.y;
    } catch (e) {
      if (e.message === "ueberholt") meldung = "Zu spät - diese Karte hat gerade jemand anderes gewählt!";
      else zeigeDebug("Fehler beim Wählen: " + e.message);
    }
    ausstehend = false;
    letzterKnopfKey = "";
  }

  function stoppeHalten() {
    Object.keys(halten).forEach((k) => { halten[k] = false; });
    if (typeof joyLos === "function") joyLos();
  }

  // ---- Eingabe
  const TASTEN = {
    ArrowLeft: "l", ArrowRight: "r", ArrowUp: "u", ArrowDown: "d",
    a: "l", d: "r", w: "u", s: "d", A: "l", D: "r", W: "u", S: "d"
  };
  window.addEventListener("keydown", (e) => {
    const t = e.target;
    if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA")) return;
    const r = TASTEN[e.key];
    if (r) { e.preventDefault(); halten[r] = true; return; }
    if (e.key === " " || e.key === "Enter" || e.key === "e" || e.key === "E") {
      if (e.repeat) return;
      e.preventDefault();
      aktion();
    }
  }, sig);
  window.addEventListener("keyup", (e) => {
    const r = TASTEN[e.key];
    if (r) halten[r] = false;
  }, sig);
  window.addEventListener("blur", stoppeHalten, sig);
  const joyKnopf = $("kt-joy-knopf");
  let joyId = null;
  function joySetze(e) {
    const r = kreuz.getBoundingClientRect();
    const radius = r.width / 2 - joyKnopf.offsetWidth / 2;
    let vx = (e.clientX - (r.left + r.width / 2)) / radius;
    let vy = (e.clientY - (r.top + r.height / 2)) / radius;
    const l = Math.hypot(vx, vy);
    if (l > 1) { vx /= l; vy /= l; }
    joy.x = vx; joy.y = vy;
    joyKnopf.style.transform = `translate(${vx * radius}px, ${vy * radius}px)`;
  }
  function joyLos() {
    joyId = null; joy.x = 0; joy.y = 0;
    joyKnopf.style.transform = "translate(0, 0)";
  }
  kreuz.addEventListener("pointerdown", (e) => {
    e.preventDefault();
    if (joyId !== null) return;
    joyId = e.pointerId;
    try { kreuz.setPointerCapture(e.pointerId); } catch { /* ok */ }
    joySetze(e);
  }, sig);
  kreuz.addEventListener("pointermove", (e) => { if (e.pointerId === joyId) joySetze(e); }, sig);
  ["pointerup", "pointercancel", "lostpointercapture"].forEach((ev) => {
    kreuz.addEventListener(ev, (e) => { if (e.pointerId === joyId) joyLos(); }, sig);
  });
  kreuz.addEventListener("contextmenu", (e) => e.preventDefault(), sig);
  knopf.addEventListener("click", aktion, sig);

  // ---- Positions-Sync
  function sendePosition(erzwingen) {
    const key = x.toFixed(2) + "," + y.toFixed(2);
    if (key === letztePosKey) return;
    const jetzt = performance.now();
    if (!erzwingen && jetzt - letztePosSendung < POS_INTERVALL_MS) {
      if (!posTimer) posTimer = setTimeout(() => { posTimer = null; sendePosition(true); }, POS_INTERVALL_MS);
      return;
    }
    letztePosSendung = jetzt;
    letztePosKey = key;
    setDoc(doc(api.db, "raeume", api.code, "ktPos", api.spielerId), {
      x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, r: pos
    }).catch(() => {});
  }

  // ---- Zeichnen
  function rundRechteck(k, px, py, bw, bh, r) {
    k.beginPath();
    k.moveTo(px + r, py);
    k.arcTo(px + bw, py, px + bw, py + bh, r);
    k.arcTo(px + bw, py + bh, px, py + bh, r);
    k.arcTo(px, py + bh, px, py, r);
    k.arcTo(px, py, px + bw, py, r);
    k.closePath();
  }
  function zeichneRueckseite(k, px, py, s, r) {
    k.fillStyle = "rgba(0,0,0,0.28)";
    rundRechteck(k, px + 2, py + 3, s, s, r);
    k.fill();
    const g = k.createLinearGradient(px, py, px + s, py + s);
    g.addColorStop(0, "#4f46e5");
    g.addColorStop(1, "#7c3aed");
    k.fillStyle = g;
    rundRechteck(k, px, py, s, s, r);
    k.fill();
    k.strokeStyle = "rgba(255,255,255,0.55)";
    k.lineWidth = Math.max(1.5, s * 0.03);
    rundRechteck(k, px + s * 0.07, py + s * 0.07, s * 0.86, s * 0.86, r * 0.7);
    k.stroke();
    k.fillStyle = "rgba(255,255,255,0.9)";
    k.font = `${Math.round(s * 0.42)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    k.textAlign = "center";
    k.textBaseline = "middle";
    k.fillText("⚽", px + s / 2, py + s / 2 + s * 0.02);
  }
  const RAND = 6;
  function baueRueck() {
    const dpr = window.devicePixelRatio || 1;
    const sz = KARTE * c;
    const sc = document.createElement("canvas");
    sc.width = Math.ceil((sz + 2 * RAND) * dpr);
    sc.height = sc.width;
    const k = sc.getContext("2d");
    k.setTransform(dpr, 0, 0, dpr, 0, 0);
    zeichneRueckseite(k, RAND, RAND, sz, sz * 0.13);
    rueck = sc;
  }
  // Eine Karte mit Mittelpunkt (mx,my); flip 0 = Rueckseite, 1 = Vorderseite (Motiv)
  function zeichneKarte(mx, my, motiv, flip, opt = {}) {
    const s = KARTE * c * (opt.skala || 1);
    const r = s * 0.13;
    ctx.save();
    ctx.translate(mx, my);
    const f = Math.max(0, Math.min(1, flip));
    const breite = Math.abs(Math.cos(f * Math.PI));        // 1 -> 0 -> 1
    const vorne = f > 0.5;
    ctx.scale(Math.max(0.03, breite), 1);
    if (!vorne) {
      if (rueck) ctx.drawImage(rueck, -s / 2 - RAND, -s / 2 - RAND, s + 2 * RAND, s + 2 * RAND);
      else zeichneRueckseite(ctx, -s / 2, -s / 2, s, r);
    } else {
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      rundRechteck(ctx, -s / 2 + 2, -s / 2 + 3, s, s, r);
      ctx.fill();
      ctx.fillStyle = "#fffdf5";
      rundRechteck(ctx, -s / 2, -s / 2, s, s, r);
      ctx.fill();
      const inn = s * 0.08;
      const bild = motivBild(motiv, () => {});
      ctx.save();
      rundRechteck(ctx, -s / 2 + inn, -s / 2 + inn, s - 2 * inn, s - 2 * inn, r * 0.7);
      ctx.clip();
      if (bild.__fertig) ctx.drawImage(bild, -s / 2 + inn, -s / 2 + inn, s - 2 * inn, s - 2 * inn);
      else { ctx.fillStyle = "#e5e7eb"; ctx.fillRect(-s / 2, -s / 2, s, s); }
      ctx.restore();
    }
    if (opt.rahmen) {
      ctx.lineWidth = Math.max(3, s * 0.07);
      ctx.strokeStyle = opt.rahmen;
      if (opt.leuchten) { ctx.shadowColor = opt.rahmen; ctx.shadowBlur = s * 0.3; }
      rundRechteck(ctx, -s / 2 - 2, -s / 2 - 2, s + 4, s + 4, r + 2);
      ctx.stroke();
    }
    ctx.restore();
  }
  function zeichneFigur(fx, fy, id, eigene) {
    const px = ox + fx * c, py = oy + fy * c, r = Math.max(9, FIGUR_R * c);
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(px + 2, py + r * 0.95, r * 0.95, r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px, py, r + (eigene ? 4 : 3), 0, Math.PI * 2);
    ctx.fillStyle = eigene ? "#ffffff" : "rgba(255,255,255,0.85)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px, py, r + 1, 0, Math.PI * 2);
    ctx.fillStyle = farbeVon(id);
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(px, py, r - 1, 0, Math.PI * 2);
    ctx.clip();
    const bild = avatarImg(iconVon(id), () => {});
    if (bild && bild.__fertig) ctx.drawImage(bild, px - r, py - r, r * 2, r * 2);
    ctx.restore();
    if (eigene) {
      ctx.font = `bold ${Math.max(9, Math.round(c * 0.17))}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      const tx = "DU", tw = ctx.measureText(tx).width + 8, th = Math.max(13, c * 0.24);
      ctx.fillStyle = "#ffffff";
      rundRechteck(ctx, px - tw / 2, py - r - th - 6, tw, th, 5);
      ctx.fill();
      ctx.fillStyle = "#111827";
      ctx.fillText(tx, px, py - r - 8);
    }
    ctx.restore();
  }
  function grosseZahl(text, sub) {
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.35)";
    rundRechteck(ctx, ox + c * 0.6, oy + c * 2.0, SPALTEN * c - c * 1.2, c * 1.9, 18);
    ctx.fill();
    ctx.fillStyle = "#ffffff";
    ctx.font = `800 ${Math.round(c * 1.25)}px system-ui, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(text, W / 2, oy + c * 2.75);
    if (sub) {
      ctx.font = `700 ${Math.round(c * 0.3)}px system-ui, sans-serif`;
      ctx.fillStyle = "#fde68a";
      ctx.fillText(sub, W / 2, oy + c * 3.55);
    }
    ctx.restore();
  }

  function zeichne() {
    const ph = phase();
    const bm = besitzerMap();
    ctx.clearRect(0, 0, W, H);
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#14532d");
    g.addColorStop(1, "#166534");
    ctx.fillStyle = g;
    rundRechteck(ctx, 0, 0, W, H, 12);
    ctx.fill();

    const l = lage(ph, bm);
    // Karten
    const bewegt = new Set();
    let tauschPaar = null;
    if (ph.name === "tausch") { tauschPaar = layout.tausch[ph.k]; bewegt.add(tauschPaar[0]); bewegt.add(tauschPaar[1]); }
    for (let i = 0; i < ANZAHL; i++) {
      if (bewegt.has(i)) continue;
      const m = kartePlatz(i);
      let flip = 0, motiv = layout.karten[i], rahmen = null, leuchten = false;
      if (ph.name === "zeigen") flip = 1;
      else if (ph.name === "umdrehen") flip = 1 - Math.min(1, ph.t / UMDREHEN_MS);
      else if (ph.name === "aufdecken") {
        flip = Math.min(1, ph.t / UMDREHEN_MS);
        motiv = layout.ende[i];
        if (flip >= 1 && layout.ende[i] === layout.ziel) { rahmen = "#22c55e"; leuchten = true; }
      }
      if (ph.name !== "aufdecken") {
        const bes = bm.get(i);
        if (bes) rahmen = farbeVon(bes);
        else if (l.modus === "waehlen" && l.slot === i) { rahmen = "#fde047"; leuchten = true; }
      } else if (bm.get(i) && flip >= 1) {
        // gewaehlte Karte: Ring in Spielerfarbe, bei falscher Wahl rot
        rahmen = layout.ende[i] === layout.ziel ? "#22c55e" : "#ef4444";
        leuchten = true;
      }
      const f2 = ph.name === "aufdecken" || ph.name === "zeigen" || ph.name === "umdrehen" ? flip : 0;
      zeichneKarte(m.px, m.py, motiv, f2, { rahmen, leuchten });
    }
    // gerade tauschende Karten (Rueckseiten) bewegen sich ueber Kreuz
    if (tauschPaar) {
      const [a, b] = tauschPaar;
      const A = kartePlatz(a), B = kartePlatz(b);
      const p = ph.p, e = p * p * (3 - 2 * p);
      const dx = B.px - A.px, dy = B.py - A.py, len = Math.hypot(dx, dy) || 1;
      const nx = -dy / len, ny = dx / len, bogen = Math.sin(Math.PI * e) * 0.5 * c;
      zeichneKarte(A.px + dx * e + nx * bogen, A.py + dy * e + ny * bogen, 0, 0, { skala: 1 + 0.12 * Math.sin(Math.PI * e) });
      zeichneKarte(B.px - dx * e - nx * bogen, B.py - dy * e - ny * bogen, 0, 0, { skala: 1 + 0.12 * Math.sin(Math.PI * e) });
    }
    if (ph.name === "zaehlen") {
      const rest = Math.max(1, Math.ceil((ZAEHLEN_MS - ph.t) / 1000));
      grosseZahl(String(rest));
    } else if (ph.name === "wahl" && ph.t < 800) {
      grosseZahl("LOS!");
    }

    // Figuren
    const gesetzt = new Map();
    bm.forEach((id, slot) => gesetzt.set(id, slot));
    spielerListe.forEach((s) => {
      if (s.id === api.spielerId) return;
      let a = anzeige.get(s.id);
      let ziel = { x: SPALTEN / 2, y: 0.5 };
      const slot = gesetzt.get(s.id);
      if (slot !== undefined) ziel = slotMitte(slot);
      else {
        const p = posDocs[s.id];
        if (p && p.r === pos && ph.name === "wahl") ziel = { x: p.x, y: p.y };
      }
      if (!a) { a = { x: ziel.x, y: ziel.y }; anzeige.set(s.id, a); }
      a.x += (ziel.x - a.x) * 0.3;
      a.y += (ziel.y - a.y) * 0.3;
      zeichneFigur(a.x, a.y, s.id, false);
    });
    zeichneFigur(x, y, api.spielerId, true);
    aktualisiereAnzeige(ph, bm, l);
  }

  function aktualisiereAnzeige(ph, bm, l) {
    const fest = festgelegt(bm);
    const key = [ph.name, ph.name === "tausch" ? ph.k : "", l.modus, l.grund, fest, meldung, bm.size].join("|");
    if (key !== letzterKnopfKey) {
      letzterKnopfKey = key;
      knopf.disabled = !l.modus;
      knopf.classList.toggle("bereit", Boolean(l.modus));
      kreuz.classList.toggle("gesperrt", !darfLaufen(ph, bm));
      if (!darfLaufen(ph, bm)) stoppeHalten();
      $("kt-steuerung").hidden = ph.name === "aufdecken";
      $("kt-ziel-info").textContent = ph.name === "aufdecken" ? "" : `${bm.size} / ${N} gewählt`;
      let text;
      if (ph.name === "zeigen") text = "Merk dir, wo dieser Fußballer liegt!";
      else if (ph.name === "umdrehen" || ph.name === "pause") text = "Die Karten werden umgedreht …";
      else if (ph.name === "tausch") text = "Aufpassen: Karten tauschen die Plätze!";
      else if (ph.name === "zaehlen") text = "Gleich darfst du laufen …";
      else if (ph.name === "aufdecken") {
        const w = wahlDieserRunde(pos)[api.spielerId];
        text = w === undefined ? "Du hast nichts gewählt."
          : istRichtig(layout, w.slot) ? "✅ Richtig getroffen!" : "❌ Falsche Karte.";
      } else if (meldung) text = meldung;
      else if (meinePlatz(bm) !== null) text = "Gewählt! Warte auf die anderen …";
      else if (l.grund === "belegt") text = "Diese Karte hat schon jemand gewählt.";
      else text = "Lauf auf eine Karte, die den Fußballer verbirgt, und tippe „Auswählen“.";
      hinweis.textContent = text;
    }
    // Ergebnis-Chips beim Aufdecken
    if (ph.name === "aufdecken" && ph.t > UMDREHEN_MS) {
      const wahl = wahlDieserRunde(pos);
      const reihen = rangListe(layout, wahl, spielerListe.map((s) => s.id));
      const ckey = reihen.map((id) => id + (wahl[id] ? wahl[id].slot : "-")).join("|");
      if (ckey !== letzteChipsKey) {
        letzteChipsKey = ckey;
        chips.hidden = false;
        chips.innerHTML = reihen.map((id) => {
          const s = spielerListe.find((x) => x.id === id);
          const w = wahl[id];
          const zeichen = w === undefined ? "–" : istRichtig(layout, w.slot) ? "✅" : "❌";
          return `<span class="rv-chip" style="--chip:${s.farbe || "#7c3aed"}"><i></i>${zeichen} ${escapeHtml(s.name)}</span>`;
        }).join("");
      }
    }
  }
  function escapeHtml(t) {
    return String(t ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  }

  // ---- Hauptschleife
  function schleife(jetzt) {
    rafId = requestAnimationFrame(schleife);
    const dt = Math.min(0.05, (jetzt - letzteZeit) / 1000);
    letzteZeit = jetzt;
    const ph = phase();
    const bm = besitzerMap();
    if (darfLaufen(ph, bm)) {
      const dx = (halten.r ? 1 : 0) - (halten.l ? 1 : 0) + joy.x;
      const dy = (halten.d ? 1 : 0) - (halten.u ? 1 : 0) + joy.y;
      const len = Math.hypot(dx, dy);
      if (len > 0.08) {
        const tempo = TEMPO * Math.min(1, 0.35 + len * 1.6);
        x += (dx / len) * tempo * dt;
        y += (dy / len) * tempo * dt;
        x = Math.max(0.15, Math.min(SPALTEN - 0.15, x));
        y = Math.max(0.15, Math.min(TISCH_ZEILEN - 0.15, y));
      }
      sendePosition(false);
    } else {
      const slot = meinePlatz(bm);
      if (slot !== null) { const m = slotMitte(slot); x = m.x; y = m.y; }
    }
    zeichne();
  }

  layoutBerechnen();
  rafId = requestAnimationFrame(schleife);

  return {
    layout: layoutBerechnen,
    wahlGeaendert() { letzterKnopfKey = ""; letzteChipsKey = ""; },
    abbauen() {
      cancelAnimationFrame(rafId);
      clearTimeout(posTimer);
      ac.abort();
      chips.hidden = true;
      chips.innerHTML = "";
      $("kt-steuerung").hidden = false;
      deleteDoc(doc(api.db, "raeume", api.code, "ktPos", api.spielerId)).catch(() => {});
    }
  };
}
