// ============================================================================
//  Revierkampf
// ----------------------------------------------------------------------------
//  Das Spielfeld besteht aus kleinen Quadraten, die zu Gebieten zusammengefasst
//  sind - eines pro Spieler. Alle Gebiete sind fast gleich groß, aber nie exakt
//  (jede Größe kommt nur einmal vor). Alle starten in der Feldmitte und laufen
//  mit dem Joystick in ein Gebiet. Mit "Gebiet sichern" gehört es einem selbst
//  und ist für die anderen gesperrt (wer zuerst kommt - per Transaktion).
//  Haben alle gewählt (oder ist die Wahlzeit um), werden die Quadrate sichtbar.
//  Dann verschwindet reihum aus jeder Farbe ein Quadrat nach dem anderen - wer
//  zuletzt noch Quadrate hat, hatte das größte Gebiet. Platz nach Gebietsgröße.
//  Raumfelder beginnen mit "rv"; Subcollections: rvWahl (Gebietswahl), rvPos.
// ============================================================================
import {
  doc, setDoc, updateDoc, deleteDoc, collection, getDocs, onSnapshot,
  increment, writeBatch, runTransaction
} from "../../kern/firebase.js";
import {
  spielerKarte, zeigeDebug, initBereitSystem, renderWarteAvatare, avatarBild
} from "../../kern/ui.js";
import { speichereWertung, punkteFuerRang } from "../../kern/wertung.js";
import { erzeugeFeld } from "./feld.js";

const COUNTDOWN_MS = 3000;
const MAX_RUNDEN = 15;
const STANDARD_RUNDEN = 3;
const WAHL_MS = 25000;        // so lange darf man ein Gebiet aussuchen
const ENTHUELLT_MS = 2800;    // so lange sind alle Quadrate sichtbar, bevor sie verschwinden
const SCHRITT_MS = 330;       // ein Quadrat pro Farbe alle ... ms
const ENDE_MS = 2600;         // Pause nach dem letzten Verschwinden
const TEMPO = 3.4;            // Zellen pro Sekunde
const FIGUR_R = 0.34;         // Figurenradius in Zellen
const POS_INTERVALL_MS = 200;
const LEER = "#cbd5e1";       // Farbe eines noch freien Gebiets

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

const VORLAGE = `
  <div id="rv-setup" class="bildschirm-karte" hidden>
    <p class="hinweis-text">Revierkampf: Alle starten in der Mitte und sichern sich ein Gebiet. Danach werden die
      Quadrate sichtbar und verschwinden nach und nach - wer am Ende noch die meisten hat, gewinnt.
      Die Gebiete sind fast gleich groß - schau genau hin!</p>
    <div id="rv-einstellungen" hidden>
      <div class="setup-anzahl-zeile">
        <span>Anzahl Runden</span>
        <span class="anzahl-picker">
          <input id="rv-anzahl" type="text" inputmode="numeric" pattern="[0-9]*" class="anzahl-eingabe">
        </span>
      </div>
      <p id="rv-anzahl-max" class="hinweis-text"></p>
    </div>
    <p id="rv-setup-fehler" class="fehler-text"></p>
    <p><button id="rv-starten" class="btn-primaer" hidden>Spiel starten</button></p>
    <p id="rv-setup-warten" hidden><em>Warte, bis der Spielleiter das Spiel startet …</em></p>
    <div id="rv-bereit-bereich" class="bereit-bereich" hidden></div>
  </div>

  <div id="rv-vorbereitung-screen" class="bildschirm-karte pg-mitte" hidden>
    <p class="kategorie">Revierkampf</p>
    <p class="pg-vorb-text">Gleich geht's los: <strong id="rv-vorb-gebiete"></strong></p>
    <p class="zg-countdown-ziffer" id="rv-countdown-ziffer"></p>
  </div>

  <div id="rv-spiel-screen" class="bildschirm-karte" hidden>
    <div class="pg-kopf">
      <span id="rv-zeit-text" class="pg-zeit-text">⏱ 25 s</span>
      <span id="rv-gewaehlt-text" class="mm-paare-text"></span>
    </div>
    <div id="rv-canvas-wrap" class="pg-canvas-wrap">
      <canvas id="rv-canvas"></canvas>
    </div>
    <div id="rv-chips" class="rv-chips" hidden></div>
    <div class="mm-steuerung" id="rv-steuerung">
      <div class="mm-joy" id="rv-kreuz" aria-label="Joystick">
        <div class="mm-joy-knopf" id="rv-joy-knopf"></div>
      </div>
      <button type="button" id="rv-aktion" class="mm-aktion" disabled>Gebiet sichern</button>
    </div>
    <p id="rv-hinweis" class="hinweis-text pg-hinweis"></p>
    <div id="rv-status" class="warten-block"></div>
  </div>

  <div id="rv-ergebnis-screen" class="bildschirm-karte" hidden>
    <p class="kategorie">Revierkampf</p>
    <h2 id="rv-erg-titel"></h2>
    <ul id="rv-erg-liste"></ul>
    <p><button id="rv-weiter" hidden>Weiter</button></p>
  </div>

  <div id="rv-endstand-screen" class="bildschirm-karte" hidden>
    <h1>Endstand</h1>
    <ul id="rv-endstand-liste"></ul>
    <p id="rv-endstand-warten" hidden><em>Der Spielleiter wählt gleich das nächste Spiel …</em></p>
    <p><button id="rv-gesamtwertung-btn" class="btn-primaer" type="button" hidden>Gesamtwertung</button></p>
  </div>
`;

let api = null;
let el = {};
let spielerListe = [];
let wahlDocs = [];          // alle Gebietswahlen (alle Runden)
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
let enthuelltSeit = 0;      // 0 = noch in der Wahlphase
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
  bereitSystem = initBereitSystem(api, "rv");
  olympiadeAutoStart = false;

  verdrahteBedienelemente();
  starteListener();

  if (api.istLeiter && !api.raum?.rvStatus) {
    await updateDoc(api.raumRef(), {
      rvStatus: "setup", rvRundenIndex: 0, rvAnzahlRunden: 0, rvAnzahlEntwurf: STANDARD_RUNDEN,
      rvLayouts: "", rvVorbereitungSeit: 0, rvEnthuelltSeit: 0
    });
  }
  tickId = setInterval(rundenTick, 150);
  window.addEventListener("resize", beiGroessenaenderung);
}

function verdrahteBedienelemente() {
  $("rv-anzahl").addEventListener("input", () => {
    const feld = $("rv-anzahl");
    const bereinigt = feld.value.replace(/[^0-9]/g, "");
    if (bereinigt !== feld.value) feld.value = bereinigt;
    schreibeEntwurfLive();
  });
  $("rv-anzahl").addEventListener("change", () => {
    const feld = $("rv-anzahl");
    let wert = parseInt(feld.value, 10);
    if (!Number.isFinite(wert) || wert < 1) wert = 1;
    if (wert > MAX_RUNDEN) wert = MAX_RUNDEN;
    feld.value = String(wert);
  });
  $("rv-anzahl").addEventListener("focus", () => { $("rv-anzahl").select(); });
  $("rv-starten").addEventListener("click", spielStarten);
  $("rv-weiter").addEventListener("click", weiter);
}

function schreibeEntwurfLive() {
  if (!api.istLeiter) return;
  clearTimeout(anzahlEntwurfTimer);
  anzahlEntwurfTimer = setTimeout(() => {
    const wert = parseInt($("rv-anzahl").value, 10);
    if (Number.isFinite(wert) && wert > 0) {
      updateDoc(api.raumRef(), { rvAnzahlEntwurf: wert }).catch(() => {});
    }
  }, 300);
}

function starteListener() {
  const basis = ["raeume", api.code];
  wahlUnsub = onSnapshot(collection(api.db, ...basis, "rvWahl"), (snap) => {
    const neu = [];
    snap.forEach((d) => neu.push(d.data()));
    wahlDocs = neu;
    spielfeld?.wahlGeaendert();
    if (status === "ausgewertet") zeigeErgebnisListe(rundenIndex);
    if (status === "runde_aktiv") aktualisiereStatus();
  });
  posUnsub = onSnapshot(collection(api.db, ...basis, "rvPos"), (snap) => {
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
  enthuelltSeit = 0;
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
  status = daten.rvStatus ?? null;
  anzahlRunden = daten.rvAnzahlRunden ?? 0;
  entwurfRunden = daten.rvAnzahlEntwurf ?? STANDARD_RUNDEN;

  const json = daten.rvLayouts ?? "";
  if (json !== layoutJson) {
    layoutJson = json;
    try { layoutListe = json ? JSON.parse(json) : []; } catch { layoutListe = []; }
  }

  const neuerIndex = daten.rvRundenIndex ?? 0;
  const neuerStart = daten.rvVorbereitungSeit ?? 0;
  const neuEnth = daten.rvEnthuelltSeit ?? 0;
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
    if (neuEnth !== enthuelltSeit) leiterBeschaeftigt = false;
    enthuelltSeit = neuEnth;
  } else if (status === "ausgewertet") {
    rundenIndex = neuerIndex;
  }

  api.fortschritt(
    status === "runde_aktiv" || status === "ausgewertet" ? `${rundenIndex + 1}/${anzahlRunden}` : ""
  );

  alleVerstecken();
  if (status === "setup" || !status) {
    zeigeSetup();
    $("rv-setup").hidden = false;
  } else if (status === "runde_aktiv") {
    rundenTick();
  } else if (status === "ausgewertet") {
    zeigeErgebnis(rundenIndex);
    $("rv-ergebnis-screen").hidden = false;
  } else if (status === "beendet") {
    zeigeEndstand();
    $("rv-endstand-screen").hidden = false;
  }
}

function alleVerstecken() {
  ["rv-setup", "rv-vorbereitung-screen", "rv-spiel-screen", "rv-ergebnis-screen", "rv-endstand-screen"]
    .forEach((id) => { $(id).hidden = true; });
}

function zeigeSetup() {
  const anzahlFeld = $("rv-anzahl");
  if (api.olympiadeAnzahl) {
    const festgelegt = Math.min(Math.max(1, api.olympiadeAnzahl), MAX_RUNDEN);
    anzahlFeld.value = String(festgelegt);
    $("rv-anzahl-max").textContent =
      `In der Olympiade festgelegt: ${festgelegt} ${festgelegt === 1 ? "Runde" : "Runden"}.`;
    anzahlFeld.disabled = true;
  } else if (api.istLeiter) {
    if (!anzahlFeld.value) anzahlFeld.value = String(STANDARD_RUNDEN);
    $("rv-anzahl-max").textContent = `Bis zu ${MAX_RUNDEN} Runden.`;
    anzahlFeld.disabled = false;
  } else {
    anzahlFeld.value = String(entwurfRunden);
    $("rv-anzahl-max").textContent = `Bis zu ${MAX_RUNDEN} Runden.`;
    anzahlFeld.disabled = true;
  }
  $("rv-einstellungen").hidden = false;
  $("rv-starten").hidden = !api.istLeiter;
  $("rv-setup-warten").hidden = api.istLeiter;
  bereitSystem?.render();

  if (api.istLeiter && api.olympiadeAnzahl && !olympiadeAutoStart && bereitSystem?.alleBereit()) {
    olympiadeAutoStart = true;
    spielStarten();
  }
}

async function spielStarten() {
  $("rv-setup-fehler").textContent = "";
  if (spielerListe.length < 2) {
    $("rv-setup-fehler").textContent = "Für Revierkampf braucht ihr mindestens 2 Spieler.";
    return;
  }
  let anzahl = parseInt($("rv-anzahl").value, 10);
  if (!Number.isFinite(anzahl) || anzahl < 1) anzahl = 1;
  if (anzahl > MAX_RUNDEN) anzahl = MAX_RUNDEN;
  const layouts = [];
  for (let i = 0; i < anzahl; i++) layouts.push(erzeugeFeld(spielerListe.length));

  $("rv-starten").disabled = true;
  try {
    await raeumeSpieldatenAuf();
    await updateDoc(api.raumRef(), {
      rvStatus: "runde_aktiv",
      rvRundenIndex: 0,
      rvAnzahlRunden: anzahl,
      rvLayouts: JSON.stringify(layouts),
      rvVorbereitungSeit: Date.now(),
      rvEnthuelltSeit: 0
    });
  } catch (e) {
    zeigeDebug("Fehler beim Start: " + e.message);
  }
  $("rv-starten").disabled = false;
}

async function raeumeSpieldatenAuf() {
  for (const name of ["rvWahl", "rvPos"]) {
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
      rvStatus: null, rvRundenIndex: 0, rvAnzahlRunden: 0, rvLayouts: "", rvVorbereitungSeit: 0, rvEnthuelltSeit: 0
    });
    await api.zurueckZurAuswahl();
  } catch (e) {
    zeigeDebug("Fehler beim Zurückkehren: " + e.message);
  }
}

// ---------------------------------------------------------------- Auswertung
// Gebiet je Spieler in der aktuellen Runde: { spielerId: gebietsNr }
function wahlDieserRunde(pos) {
  const aktiveIds = new Set(spielerListe.map((s) => s.id));
  const karte = {};
  wahlDocs.forEach((d) => {
    if (d.typ === "r" && d.runde === pos && aktiveIds.has(d.spielerId)) karte[d.spielerId] = d.region;
  });
  return karte;
}
// Wie viele Schritte das Verschwinden dauert: bis nur noch ein Gebiet Quadrate hat.
function abbauSchritte(layout, besetzt) {
  const gr = besetzt.map((g) => layout.ord[g].length).sort((a, b) => b - a);
  return gr.length >= 2 ? gr[1] : 0;
}
function gesamtDauer(layout, besetzt) {
  return ENTHUELLT_MS + abbauSchritte(layout, besetzt) * SCHRITT_MS + ENDE_MS;
}

// Rangpunkte nach Gebietsgröße (größtes Gebiet = Platz 1), Gleichstand teilt sich den Wert.
function berechnePunkte(layout, wahl, spielerIds) {
  const n = spielerIds.length;
  const eintraege = spielerIds.map((id) => ({
    id, groesse: wahl[id] !== undefined ? layout.ord[wahl[id]].length : 0
  })).sort((a, b) => b.groesse - a.groesse);
  const ergebnis = {};
  let vorher = null, vorherPunkte = null;
  eintraege.forEach((e, i) => {
    const p = vorher !== null && e.groesse === vorher ? vorherPunkte : punkteFuerRang(i + 1, n);
    ergebnis[e.id] = p;
    vorher = e.groesse; vorherPunkte = p;
  });
  return ergebnis;
}

async function beanspruche(region, spielerId, pos) {
  const r = (id) => doc(api.db, "raeume", api.code, "rvWahl", id);
  const refR = r(`${pos}_r${region}`), refP = r(`${pos}_p${spielerId}`);
  await runTransaction(api.db, async (tx) => {
    const a = await tx.get(refR);
    const b = await tx.get(refP);
    if (a.exists() || b.exists()) throw new Error("ueberholt");
    tx.set(refR, { typ: "r", runde: pos, region, spielerId });
    tx.set(refP, { typ: "p", runde: pos, region, spielerId });
  });
}

function rundenTick() {
  if (!el.wurzel || status !== "runde_aktiv") return;
  const elapsedGesamt = Date.now() - vorbereitungSeit;
  if (elapsedGesamt < COUNTDOWN_MS) {
    $("rv-spiel-screen").hidden = true;
    $("rv-vorbereitung-screen").hidden = false;
    $("rv-vorb-gebiete").textContent = `${spielerListe.length} Gebiete`;
    const schritt = Math.min(2, Math.floor(elapsedGesamt / (COUNTDOWN_MS / 3)));
    $("rv-countdown-ziffer").textContent = ["3", "2", "1"][schritt];
  } else {
    $("rv-vorbereitung-screen").hidden = true;
    $("rv-spiel-screen").hidden = false;
    if (!spielfeld) starteSpielfeld();
    if (!enthuelltSeit) {
      const rest = Math.max(0, Math.ceil((WAHL_MS - (elapsedGesamt - COUNTDOWN_MS)) / 1000));
      $("rv-zeit-text").textContent = `⏱ ${rest} s`;
    } else {
      $("rv-zeit-text").textContent = "🔍 Wer hat mehr?";
    }
  }
  if (api.istLeiter) leiterTick(elapsedGesamt);
}

async function leiterTick(elapsedGesamt) {
  if (!api.istLeiter || status !== "runde_aktiv" || auswertungLaeuft || leiterBeschaeftigt) return;
  if (elapsedGesamt < COUNTDOWN_MS || spielerListe.length === 0) return;
  const layout = layoutListe[rundenIndex];
  if (!layout) return;
  const wahl = wahlDieserRunde(rundenIndex);

  if (!enthuelltSeit) {
    const alleGewaehlt = spielerListe.every((s) => wahl[s.id] !== undefined);
    const zeitUm = elapsedGesamt - COUNTDOWN_MS > WAHL_MS + 1500;
    if (!alleGewaehlt && !zeitUm) return;
    leiterBeschaeftigt = true;
    try {
      // Wer nichts gewählt hat, bekommt ein zufälliges freies Gebiet.
      const belegt = new Set(Object.values(wahl));
      const frei = mische([...Array(layout.ord.length).keys()].filter((g) => !belegt.has(g)));
      for (const s of spielerListe) {
        if (wahl[s.id] !== undefined || !frei.length) continue;
        const g = frei.shift();
        try { await beanspruche(g, s.id, rundenIndex); } catch { /* jemand war schneller */ }
      }
      await updateDoc(api.raumRef(), { rvEnthuelltSeit: Date.now() });
    } catch (e) {
      leiterBeschaeftigt = false;
      zeigeDebug("Fehler bei der Wahl: " + e.message);
    }
    return;
  }

  const besetzt = Object.values(wahl);
  if (Date.now() - enthuelltSeit < gesamtDauer(layout, besetzt)) return;
  auswertungLaeuft = true;
  try {
    const punkte = berechnePunkte(layout, wahl, spielerListe.map((s) => s.id));
    const batch = writeBatch(api.db);
    Object.entries(punkte).forEach(([id, wert]) => {
      batch.update(api.spielerRef(id), { punkte: increment(wert) });
    });
    batch.update(api.raumRef(), { rvStatus: "ausgewertet" });
    await batch.commit();
  } catch (e) {
    zeigeDebug("Fehler bei der Auswertung: " + e.message);
    auswertungLaeuft = false;
  }
}

function aktualisiereStatus() {
  if (!el.wurzel) return;
  const wahl = wahlDieserRunde(rundenIndex);
  const gewaehlt = Object.keys(wahl).length;
  $("rv-gewaehlt-text").textContent = `🗺️ ${gewaehlt} / ${spielerListe.length} gewählt`;
  renderWarteAvatare($("rv-status"), enthuelltSeit ? [] : spielerListe.filter((sp) => wahl[sp.id] === undefined && sp.id !== api.spielerId));
}

// ------------------------------------------------------------------ Ergebnis
function zeigeErgebnisListe(pos) {
  if (!el.wurzel) return;
  const layout = layoutListe[pos];
  if (!layout) return;
  const wahl = wahlDieserRunde(pos);
  const ids = spielerListe.map((s) => s.id);
  const punkte = berechnePunkte(layout, wahl, ids);
  const groesse = (s) => (wahl[s.id] !== undefined ? layout.ord[wahl[s.id]].length : 0);
  const zeilen = [...spielerListe].sort((a, b) => groesse(b) - groesse(a) || (a.name || "").localeCompare(b.name || "", "de"));
  const liste = $("rv-erg-liste");
  liste.innerHTML = "";
  zeilen.forEach((s) => {
    const p = punkte[s.id] ?? 0;
    const li = document.createElement("li");
    li.innerHTML = spielerKarte(s.name, s.farbe, s.icon, p > 0 ? `+${p}` : "0", {
      extra: groesse(s) ? `Gebiet: ${groesse(s)} Quadrate` : "Kein Gebiet",
      punkteRechts: s.punkte ?? 0
    });
    liste.appendChild(li);
  });
}

function zeigeErgebnis(pos) {
  $("rv-erg-titel").textContent = `Runde ${pos + 1} von ${anzahlRunden}`;
  zeigeErgebnisListe(pos);
  $("rv-weiter").hidden = !api.istLeiter;
  $("rv-weiter").textContent = pos + 1 >= anzahlRunden ? "Endstand anzeigen" : "Nächste Runde";
}

async function weiter() {
  $("rv-weiter").disabled = true;
  try {
    const naechster = rundenIndex + 1;
    if (naechster >= anzahlRunden) {
      await updateDoc(api.raumRef(), { rvStatus: "beendet" });
      speichereWertung(api, "revier", Object.fromEntries(spielerListe.map((s) => [s.id, s.punkte ?? 0])));
    } else {
      await updateDoc(api.raumRef(), {
        rvStatus: "runde_aktiv",
        rvRundenIndex: naechster,
        rvVorbereitungSeit: Date.now(),
        rvEnthuelltSeit: 0
      });
    }
  } catch (e) {
    zeigeDebug("Fehler beim Weiterschalten: " + e.message);
  }
  $("rv-weiter").disabled = false;
}

function zeigeEndstand() {
  if (!el.wurzel) return;
  const sortiert = [...spielerListe].sort((a, b) => (b.punkte ?? 0) - (a.punkte ?? 0));
  const liste = $("rv-endstand-liste");
  liste.innerHTML = "";
  sortiert.forEach((s, i) => {
    const li = document.createElement("li");
    li.innerHTML = spielerKarte(s.name, s.farbe, s.icon, s.punkte ?? 0, { rang: i + 1 });
    liste.appendChild(li);
  });
  $("rv-endstand-warten").hidden = api.istLeiter;
  const btn = $("rv-gesamtwertung-btn");
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
  const canvas = $("rv-canvas");
  const wrap = $("rv-canvas-wrap");
  const knopf = $("rv-aktion");
  const hinweis = $("rv-hinweis");
  const kreuz = $("rv-kreuz");
  const chips = $("rv-chips");
  const ctx = canvas.getContext("2d");
  const ac = new AbortController();
  const sig = { signal: ac.signal };
  const pos = rundenIndex;

  const { w, h, reg, ord } = layout;
  const n = ord.length;
  // Zelle -> Reihenfolge-Nr. im Verschwinden (Schritt, in dem sie weg ist)
  const weg = new Array(w * h).fill(0);
  ord.forEach((liste) => liste.forEach((z, i) => { weg[z] = i + 1; }));
  // Ankerzelle je Gebiet (nahe am Schwerpunkt) - hier "steht" der Besitzer
  const anker = ord.map((liste) => {
    let sx = 0, sy = 0;
    liste.forEach((z) => { sx += z % w; sy += Math.floor(z / w); });
    sx /= liste.length; sy /= liste.length;
    let best = liste[0], bd = Infinity;
    liste.forEach((z) => {
      const d = Math.hypot((z % w) - sx, Math.floor(z / w) - sy);
      if (d < bd) { bd = d; best = z; }
    });
    return { x: (best % w) + 0.5, y: Math.floor(best / w) + 0.5 };
  });

  const farbeVon = (id) => spielerListe.find((s) => s.id === id)?.farbe || "#7c3aed";
  const iconVon = (id) => spielerListe.find((s) => s.id === id)?.icon || "";

  let x = w / 2, y = h / 2;          // Startposition: Feldmitte (alle gleich)
  const halten = { l: false, r: false, u: false, d: false };
  const joy = { x: 0, y: 0 };
  let ausstehend = false;
  let meldung = "";
  let rafId = 0, letzteZeit = performance.now();
  let c = 40, W = 300, H = 300, ox = 0, oy = 0;
  let boden = null, bodenKey = "";
  let letztePosSendung = 0, letztePosKey = "", posTimer = null;
  const anzeige = new Map();
  let letzterKnopfKey = "", letzteChipsKey = "";

  function groesseSetzen() {
    ox = Math.round((W - w * c) / 2);
    oy = Math.round(0.1 * c) + 2;
    H = Math.ceil(h * c + 0.2 * c) + 4;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    boden = null; bodenKey = "";
  }
  function layoutBerechnen() {
    W = Math.floor(wrap.clientWidth || 300);
    c = Math.min(W / (w + 0.2), 64);
    groesseSetzen();
    // Auf kleinen Handys so verkleinern, dass alles ohne Scrollen auf den Bildschirm passt
    for (let i = 0; i < 4 && c > 12; i++) {
      const unten = hinweis.getBoundingClientRect().bottom + window.scrollY;
      const ueber = unten + 12 - (window.innerHeight || 700);
      if (ueber <= 0) break;
      c = Math.max(12, c - ueber / (h + 0.2));
      groesseSetzen();
    }
  }

  // ---- Zustand
  function besitzerMap() {
    const m = new Map();   // Gebiet -> spielerId
    const w2 = wahlDieserRunde(pos);
    Object.entries(w2).forEach(([id, g]) => m.set(g, id));
    return m;
  }
  function gebietUnterFigur() {
    const sx = Math.max(0, Math.min(w - 1, Math.floor(x))), sy = Math.max(0, Math.min(h - 1, Math.floor(y)));
    return reg[sy * w + sx];
  }
  function meinGebiet(bm) {
    for (const [g, id] of bm) if (id === api.spielerId) return g;
    return null;
  }
  function lage(bm) {
    const mein = meinGebiet(bm);
    const g = gebietUnterFigur();
    if (enthuelltSeit) return { modus: null, g, grund: "enth" };
    if (mein !== null || ausstehend) return { modus: null, g, grund: "gewaehlt" };
    if (bm.has(g)) return { modus: null, g, grund: "belegt" };
    return { modus: "sichern", g, grund: "" };
  }
  function festgelegt(bm) { return enthuelltSeit > 0 || meinGebiet(bm) !== null || ausstehend; }

  async function aktion() {
    const bm = besitzerMap();
    const l = lage(bm);
    if (l.modus !== "sichern" || ausstehend) return;
    ausstehend = true;
    stoppeHalten();
    meldung = "";
    try {
      await beanspruche(l.g, api.spielerId, pos);
      x = anker[l.g].x; y = anker[l.g].y;
    } catch (e) {
      if (e.message === "ueberholt") meldung = "Zu spät - dieses Gebiet hat gerade jemand anderes gesichert!";
      else zeigeDebug("Fehler beim Sichern: " + e.message);
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
    if (r) { e.preventDefault(); if (!festgelegt(besitzerMap())) halten[r] = true; return; }
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
  const joyKnopf = $("rv-joy-knopf");
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
    if (festgelegt(besitzerMap()) || joyId !== null) return;
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
    setDoc(doc(api.db, "raeume", api.code, "rvPos", api.spielerId), {
      x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, r: pos
    }).catch(() => {});
  }

  // ---- Zeichnen
  function rundRechteck(px, py, bw, bh, r) {
    ctx.beginPath();
    ctx.moveTo(px + r, py);
    ctx.arcTo(px + bw, py, px + bw, py + bh, r);
    ctx.arcTo(px + bw, py + bh, px, py + bh, r);
    ctx.arcTo(px, py + bh, px, py, r);
    ctx.arcTo(px, py, px + bw, py, r);
    ctx.closePath();
  }
  // Grenzlinien eines Gebiets g
  function kanten(g, farbe, breite) {
    ctx.strokeStyle = farbe;
    ctx.lineWidth = breite;
    ctx.lineCap = "square";
    ctx.beginPath();
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const k = j * w + i, mein = reg[k];
        const px = ox + i * c, py = oy + j * c;
        const r = i === w - 1 ? -1 : reg[k + 1];
        if (r !== mein && (mein === g || r === g)) { ctx.moveTo(px + c, py); ctx.lineTo(px + c, py + c); }
        const u = j === h - 1 ? -1 : reg[k + w];
        if (u !== mein && (mein === g || u === g)) { ctx.moveTo(px, py + c); ctx.lineTo(px + c, py + c); }
        if (mein === g) {
          if (i === 0) { ctx.moveTo(px, py); ctx.lineTo(px, py + c); }
          if (j === 0) { ctx.moveTo(px, py); ctx.lineTo(px + c, py); }
        }
      }
    }
    ctx.stroke();
  }
  function zeichneFigur(fx, fy, id, eigene) {
    const px = ox + fx * c, py = oy + fy * c, r = Math.max(8, FIGUR_R * c);
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(px + 1.5, py + r * 0.95, r * 0.95, r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px, py, r + (eigene ? 3.5 : 2.5), 0, Math.PI * 2);
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
    const bild = avatarImg(iconVon(id), () => { bodenKey = "!"; });
    if (bild && bild.__fertig) ctx.drawImage(bild, px - r, py - r, r * 2, r * 2);
    ctx.restore();
    if (eigene) {
      ctx.font = `bold ${Math.max(9, Math.round(c * 0.3))}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      const tx = "DU", tw = ctx.measureText(tx).width + 8, th = Math.max(13, c * 0.4);
      ctx.fillStyle = "#ffffff";
      rundRechteck(px - tw / 2, py - r - th - 5, tw, th, 5);
      ctx.fill();
      ctx.fillStyle = "#111827";
      ctx.fillText(tx, px, py - r - 7);
    }
    ctx.restore();
  }

  // Wie viele Schritte des Verschwindens sind schon vorbei?
  function abbauStand(bm) {
    if (!enthuelltSeit) return { phase: 0, schritt: 0, anteil: 0, max: 0 };
    const besetzt = [...bm.keys()];
    const max = abbauSchritte(layout, besetzt);
    const t = Date.now() - enthuelltSeit;
    if (t < ENTHUELLT_MS) return { phase: 1, schritt: 0, anteil: 0, max };
    const dt = t - ENTHUELLT_MS;
    const schritt = Math.min(max, Math.floor(dt / SCHRITT_MS));
    const anteil = schritt >= max ? 0 : (dt - schritt * SCHRITT_MS) / SCHRITT_MS;
    return { phase: schritt >= max ? 3 : 2, schritt, anteil, max };
  }

  function zeichneEnthuellt(bm, st) {
    ctx.fillStyle = "#0f172a";
    rundRechteck(0, 0, W, H, 12);
    ctx.fill();
    // Hintergrundraster
    ctx.fillStyle = "#162036";
    for (let k = 0; k < w * h; k++) {
      ctx.fillRect(ox + (k % w) * c + 1, oy + Math.floor(k / w) * c + 1, c - 2, c - 2);
    }
    const einblend = st.phase === 1 ? Math.min(1, (Date.now() - enthuelltSeit) / 500) : 1;
    const pad = Math.max(1, c * 0.07);
    for (let k = 0; k < w * h; k++) {
      const g = reg[k];
      const bes = bm.get(g);
      const px = ox + (k % w) * c, py = oy + Math.floor(k / w) * c;
      let skala = 1;
      if (bes) {
        if (weg[k] <= st.schritt) continue;
        if (st.phase === 2 && weg[k] === st.schritt + 1) skala = 1 - Math.max(0, (st.anteil - 0.35) / 0.65) * 0.9;
        ctx.fillStyle = farbeVon(bes);
      } else ctx.fillStyle = LEER;
      const s = (c - 2 * pad) * skala * (0.4 + 0.6 * einblend);
      ctx.globalAlpha = bes || st.phase > 1 ? 1 : einblend;
      rundRechteck(px + (c - s) / 2, py + (c - s) / 2, s, s, Math.max(1.5, s * 0.18));
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    if (st.phase === 3) {
      // Sieger-Markierung: Krone über den übrig gebliebenen Quadraten
      const sieger = [...bm.entries()].sort((a, b) => ord[b[0]].length - ord[a[0]].length)[0];
      if (sieger) {
        const a = anker[sieger[0]];
        ctx.font = `${Math.round(c * 1.2)}px system-ui, "Apple Color Emoji", sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("👑", ox + a.x * c, oy + a.y * c);
      }
    }
  }

  function zeichne() {
    const bm = besitzerMap();
    const st = abbauStand(bm);
    if (st.phase > 0) {
      zeichneEnthuellt(bm, st);
      aktualisiereChips(bm, st);
      aktualisiereKnopf(bm, lage(bm), st);
      return;
    }
    const key = [...bm.entries()].map(([g, id]) => g + id).sort().join("|") + "|" + W + "x" + H + "|" + c;
    if (!boden || key !== bodenKey) {
      boden = baueBodenSicher(bm);
      bodenKey = key;
    }
    ctx.clearRect(0, 0, W, H);
    ctx.drawImage(boden, 0, 0, W, H);
    const l = lage(bm);
    if (l.modus === "sichern") {
      ctx.fillStyle = "rgba(255,255,255,0.32)";
      for (let k = 0; k < w * h; k++) {
        if (reg[k] === l.g) ctx.fillRect(ox + (k % w) * c, oy + Math.floor(k / w) * c, Math.ceil(c), Math.ceil(c));
      }
      kanten(l.g, "#fde047", Math.max(3, c * 0.2));
    }
    // Figuren der anderen (geglättet); wer schon ein Gebiet hat, steht in dessen Mitte
    const gesetzt = new Map();
    bm.forEach((id, g) => gesetzt.set(id, g));
    spielerListe.forEach((s) => {
      if (s.id === api.spielerId) return;
      let a = anzeige.get(s.id);
      const g = gesetzt.get(s.id);
      let ziel = null;
      if (g !== undefined) ziel = anker[g];
      else {
        const p = posDocs[s.id];
        if (p && p.r === pos) ziel = { x: p.x, y: p.y };
      }
      if (!ziel) ziel = { x: w / 2, y: h / 2 };
      if (!a) { a = { x: ziel.x, y: ziel.y }; anzeige.set(s.id, a); }
      a.x += (ziel.x - a.x) * 0.3;
      a.y += (ziel.y - a.y) * 0.3;
      zeichneFigur(a.x, a.y, s.id, false);
    });
    zeichneFigur(x, y, api.spielerId, true);
    aktualisiereKnopf(bm, l, st);
  }

  // Der Boden wird in einen eigenen Canvas gezeichnet; dazu tauschen wir kurz den Zeichenkontext.
  function baueBodenSicher(bm) {
    const dpr = window.devicePixelRatio || 1;
    const sc = document.createElement("canvas");
    sc.width = Math.round(W * dpr); sc.height = Math.round(H * dpr);
    const sctx = sc.getContext("2d");
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    zeichneBodenAuf(sctx, bm);
    return sc;
  }
  function zeichneBodenAuf(k2, bm) {
    k2.fillStyle = "#0f172a";
    k2.beginPath(); k2.roundRect ? k2.roundRect(0, 0, W, H, 12) : k2.rect(0, 0, W, H); k2.fill();
    for (let k = 0; k < w * h; k++) {
      const bes = bm.get(reg[k]);
      k2.fillStyle = bes ? farbeVon(bes) : LEER;
      k2.fillRect(ox + (k % w) * c, oy + Math.floor(k / w) * c, Math.ceil(c), Math.ceil(c));
    }
    k2.strokeStyle = "#0b1020";
    k2.lineWidth = Math.max(2, c * 0.14);
    k2.lineCap = "square";
    k2.beginPath();
    for (let j = 0; j < h; j++) {
      for (let i = 0; i < w; i++) {
        const k = j * w + i, mein = reg[k];
        const px = ox + i * c, py = oy + j * c;
        if (i < w - 1 && reg[k + 1] !== mein) { k2.moveTo(px + c, py); k2.lineTo(px + c, py + c); }
        if (j < h - 1 && reg[k + w] !== mein) { k2.moveTo(px, py + c); k2.lineTo(px + c, py + c); }
        if (i === 0) { k2.moveTo(px, py); k2.lineTo(px, py + c); }
        if (j === 0) { k2.moveTo(px, py); k2.lineTo(px + c, py); }
        if (i === w - 1) { k2.moveTo(px + c, py); k2.lineTo(px + c, py + c); }
        if (j === h - 1) { k2.moveTo(px, py + c); k2.lineTo(px + c, py + c); }
      }
    }
    k2.stroke();
  }

  function aktualisiereChips(bm, st) {
    chips.hidden = false;
    const gr = new Map(), rest = new Map();
    bm.forEach((id, g) => { gr.set(id, ord[g].length); rest.set(id, Math.max(0, ord[g].length - st.schritt)); });
    // Platz nach Gebietsgroesse (Gleichstand teilt sich den Platz)
    const sortiert = spielerListe.filter((s) => gr.has(s.id)).sort((a, b) => gr.get(b.id) - gr.get(a.id));
    const platz = new Map();
    sortiert.forEach((s, i) => {
      platz.set(s.id, i > 0 && gr.get(s.id) === gr.get(sortiert[i - 1].id) ? platz.get(sortiert[i - 1].id) : i + 1);
    });
    // Wer keine Quadrate mehr hat (oder am Ende uebrig ist), bekommt seinen Platz
    const fertig = (id) => rest.get(id) === 0 || st.phase === 3;
    const key = sortiert.map((s) => s.id + ":" + rest.get(s.id) + ":" + fertig(s.id)).join("|");
    if (key === letzteChipsKey) return;
    letzteChipsKey = key;
    chips.innerHTML = sortiert.map((s) => {
      const farbe = s.farbe || "#7c3aed";
      const f = fertig(s.id);
      const inhalt = f
        ? `<b class="rv-platz">${platz.get(s.id)}.</b> ${escapeHtml(s.name)} <b>${gr.get(s.id)}</b>`
        : `${escapeHtml(s.name)} <b>${rest.get(s.id)}</b>`;
      return `<span class="rv-chip${f ? " fertig" : ""}" style="--chip:${farbe}"><i></i>${inhalt}</span>`;
    }).join("");
  }
  function escapeHtml(t) {
    return String(t ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
  }

  function aktualisiereKnopf(bm, l, st) {
    const fest = festgelegt(bm);
    const key = [l.modus, l.grund, fest, meldung, st.phase, st.schritt, bm.size].join("|");
    if (key === letzterKnopfKey) return;
    letzterKnopfKey = key;
    knopf.disabled = !l.modus;
    knopf.classList.toggle("bereit", Boolean(l.modus));
    kreuz.classList.toggle("gesperrt", fest);
    if (fest) stoppeHalten();
    $("rv-steuerung").hidden = st.phase > 0;
    $("rv-gewaehlt-text").textContent = `🗺️ ${bm.size} / ${spielerListe.length} gewählt`;
    let text;
    if (st.phase === 1) text = "Alle haben gewählt - jetzt werden die Quadrate sichtbar!";
    else if (st.phase === 2) text = "Aus jeder Farbe verschwindet ein Quadrat nach dem anderen …";
    else if (st.phase === 3) text = "Das war's - gleich kommt die Wertung.";
    else if (meldung) text = meldung;
    else if (meinGebiet(bm) !== null) text = "Du hast dein Gebiet. Warte auf die anderen …";
    else if (l.grund === "belegt") text = "Dieses Gebiet ist schon vergeben - such dir ein anderes.";
    else text = "Lauf in ein Gebiet und sichere es dir. Welches ist wohl am größten?";
    hinweis.textContent = text;
  }

  // ---- Hauptschleife
  function schleife(jetzt) {
    rafId = requestAnimationFrame(schleife);
    const dt = Math.min(0.05, (jetzt - letzteZeit) / 1000);
    letzteZeit = jetzt;
    const bm = besitzerMap();
    if (!festgelegt(bm)) {
      const dx = (halten.r ? 1 : 0) - (halten.l ? 1 : 0) + joy.x;
      const dy = (halten.d ? 1 : 0) - (halten.u ? 1 : 0) + joy.y;
      const len = Math.hypot(dx, dy);
      if (len > 0.08) {
        const tempo = TEMPO * Math.min(1, 0.35 + len * 1.6);
        x += (dx / len) * tempo * dt;
        y += (dy / len) * tempo * dt;
        x = Math.max(0.15, Math.min(w - 0.15, x));
        y = Math.max(0.15, Math.min(h - 0.15, y));
      }
      sendePosition(false);
    } else {
      // Gebiet wurde (auch zugeteilt) gesetzt: Figur steht in der Mitte des Gebiets
      const g = meinGebiet(bm);
      if (g !== null) { x = anker[g].x; y = anker[g].y; }
    }
    zeichne();
  }

  layoutBerechnen();
  rafId = requestAnimationFrame(schleife);

  return {
    layout: layoutBerechnen,
    wahlGeaendert() { letzterKnopfKey = ""; },
    abbauen() {
      cancelAnimationFrame(rafId);
      clearTimeout(posTimer);
      ac.abort();
      chips.hidden = true;
      $("rv-steuerung").hidden = false;
      deleteDoc(doc(api.db, "raeume", api.code, "rvPos", api.spielerId)).catch(() => {});
    }
  };
}
