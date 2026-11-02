// ============================================================================
//  Farbton!
// ----------------------------------------------------------------------------
//  Jede Runde wird 5 Sekunden lang eine Farbe gezeigt. Danach hat jeder 30
//  Sekunden Zeit, sie mit drei Reglern (Helligkeit, Sättigung, Farbton) aus
//  dem Gedächtnis nachzumischen. Bewertet wird der Farbabstand (Prozent, siehe
//  logik.js). Punkte nach Rang (einheitliches Punktesystem). Nach jeder Runde
//  sieht man das Original und die Farbe jedes Spielers. Alle spielspezifischen
//  Raumfelder beginnen mit "ft"; die Abgaben liegen in "ftAntworten".
// ============================================================================
import {
  doc, setDoc, updateDoc, deleteDoc, collection, getDocs, onSnapshot,
  serverTimestamp, increment, writeBatch
} from "../../kern/firebase.js";
import { spielerKarte, zeigeDebug, initBereitSystem } from "../../kern/ui.js";
import { speichereWertung, punkteNachRang } from "../../kern/wertung.js";
import { hsbCss, genauigkeit, waehleFarben } from "./logik.js";

const MERK_SEKUNDEN = 5;
const BAU_SEKUNDEN = 30;
const AUSWERTUNG_PUFFER_MS = 12000;   // Sicherheitsnetz, falls jemand nie abgibt
const MAX_RUNDEN = 100;
const STANDARD_ANZAHL = 5;
const START_FARBE = [180, 50, 50];     // alle starten bei derselben Mittelfarbe

const VORLAGE = `
  <div id="ft-setup" class="bildschirm-karte" hidden>
    <p class="hinweis-text">Eine Farbe wird 5 Sekunden lang gezeigt - merk sie dir! Danach hast du 30 Sekunden Zeit,
      sie mit drei Reglern (Helligkeit, Sättigung, Farbton) nachzumischen. Wer am nächsten dran ist, bekommt die
      meisten Punkte. Mit "Abgeben" zählt deine Farbe.</p>

    <div id="ft-anzahl-zeile" class="setup-anzahlblock" hidden>
      <div class="setup-anzahl-zeile">
        <span>Anzahl Farben</span>
        <span class="anzahl-picker">
          <input id="ft-anzahl" type="text" inputmode="numeric" pattern="[0-9]*" min="1" class="anzahl-eingabe">
        </span>
      </div>
      <p id="ft-anzahl-max" class="hinweis-text"></p>
    </div>

    <p id="ft-setup-fehler" class="fehler-text"></p>
    <p><button id="ft-starten" class="btn-primaer" hidden>Spiel starten</button></p>
    <p id="ft-setup-warten" hidden><em>Warte, bis der Spielleiter das Spiel startet …</em></p>
    <div id="ft-bereit-bereich" class="bereit-bereich" hidden></div>
  </div>

  <div id="ft-runde-screen" class="bildschirm-karte ft-karte" hidden>
    <p class="kategorie">Farbton!</p>
    <div class="ft-zeitbalken"><div id="ft-zeitbalken-fuell"></div></div>
    <div id="ft-farbflaeche" class="ft-farbflaeche"><span id="ft-farbtext" class="ft-farbtext"></span></div>
    <div id="ft-regler" class="ft-regler" hidden>
      <input id="ft-b" type="range" min="0" max="100" step="1" aria-label="Helligkeit">
      <input id="ft-s" type="range" min="0" max="100" step="1" aria-label="Sättigung">
      <input id="ft-h" type="range" min="0" max="360" step="1" aria-label="Farbton">
    </div>
    <div class="ft-knoepfe"><button id="ft-abgeben" type="button" class="btn-primaer" hidden>Abgeben</button></div>
    <div id="ft-status" class="warten-block"></div>
  </div>

  <div id="ft-ergebnis-screen" class="bildschirm-karte ft-karte" hidden>
    <p class="kategorie">Farbton!</p>
    <div class="ft-original"><span>Original</span></div>
    <ul id="ft-erg-liste" class="ft-erg-liste"></ul>
    <p><button id="ft-weiter" hidden>Weiter</button></p>
  </div>

  <div id="ft-endstand-screen" class="bildschirm-karte" hidden>
    <h1>Endstand</h1>
    <ul id="ft-endstand-liste"></ul>
    <p id="ft-endstand-warten" hidden><em>Der Spielleiter wählt gleich das nächste Spiel …</em></p>
    <p><button id="ft-gesamtwertung-btn" class="btn-primaer" type="button" hidden>Gesamtwertung</button></p>
  </div>
`;

let api = null;
let el = {};
let spielerListe = [];
let alleAntworten = [];
let antwortenUnsub = null;
let tickId = null;

let status = null;
let rundenIndex = -1;
let anzahlRunden = 0;
let anzahlEntwurf = null;
let farben = [];
let startZeit = 0;
let mein = [...START_FARBE];
let beruehrt = false;
let abgegeben = false;
let auswertungLaeuft = false;
let anzahlEntwurfTimer = null;

let bereitSystem = null;
let olympiadeAutoStart = false;

const $ = (id) => el.wurzel.querySelector("#" + id);

export async function starten(uebergebeneApi) {
  api = uebergebeneApi;
  el.wurzel = api.wurzel;
  el.wurzel.innerHTML = VORLAGE;
  bereitSystem = initBereitSystem(api, "ft");
  olympiadeAutoStart = false;

  verdrahte();
  starteListener();

  if (api.istLeiter && !api.raum?.ftStatus) {
    await updateDoc(api.raumRef(), {
      ftStatus: "setup", ftRundenIndex: 0, ftAnzahlRunden: 0, ftAnzahlEntwurf: 0, ftFarben: [], ftStart: 0
    });
  }
  tickId = setInterval(tick, 200);
}

function verdrahte() {
  const feld = $("ft-anzahl");
  feld.addEventListener("input", () => {
    const bereinigt = feld.value.replace(/[^0-9]/g, "");
    if (bereinigt !== feld.value) feld.value = bereinigt;
    schreibeAnzahlEntwurfLive();
  });
  feld.addEventListener("change", () => {
    let wert = parseInt(feld.value, 10);
    if (!Number.isFinite(wert) || wert < 1) wert = 1;
    if (wert > MAX_RUNDEN) wert = MAX_RUNDEN;
    feld.value = String(wert);
  });
  feld.addEventListener("focus", () => feld.select());
  $("ft-starten").addEventListener("click", spielStarten);
  $("ft-weiter").addEventListener("click", weiter);
  $("ft-abgeben").addEventListener("click", () => abgeben(false));
  [["ft-h", 0], ["ft-s", 1], ["ft-b", 2]].forEach(([id, i]) => {
    $(id).addEventListener("input", () => {
      if (!baustufe() || abgegeben) return;
      mein[i] = Number($(id).value);
      beruehrt = true;
      zeichneRunde();
    });
  });
}

function schreibeAnzahlEntwurfLive() {
  if (!api.istLeiter) return;
  clearTimeout(anzahlEntwurfTimer);
  anzahlEntwurfTimer = setTimeout(() => {
    const wert = parseInt($("ft-anzahl").value, 10);
    if (Number.isFinite(wert) && wert > 0) updateDoc(api.raumRef(), { ftAnzahlEntwurf: wert }).catch(() => {});
  }, 300);
}

function starteListener() {
  antwortenUnsub = onSnapshot(collection(api.db, "raeume", api.code, "ftAntworten"), (snap) => {
    alleAntworten = [];
    snap.forEach((d) => alleAntworten.push(d.data()));
    if (status === "runde_aktiv") aktualisiereStatus();
    if (status === "ausgewertet") zeigeErgebnisListe(rundenIndex);
  });
}

export function beenden() {
  bereitSystem = null;
  if (antwortenUnsub) { antwortenUnsub(); antwortenUnsub = null; }
  if (tickId) { clearInterval(tickId); tickId = null; }
  clearTimeout(anzahlEntwurfTimer);
  el = {};
  spielerListe = []; alleAntworten = []; status = null; rundenIndex = -1; anzahlRunden = 0;
  anzahlEntwurf = null; farben = []; startZeit = 0; mein = [...START_FARBE]; beruehrt = false;
  abgegeben = false; auswertungLaeuft = false;
}

export function spieler(liste) {
  spielerListe = liste;
  if (!el.wurzel) return;
  if (status === "runde_aktiv") aktualisiereStatus();
  if (status === "ausgewertet" && rundenIndex >= 0) zeigeErgebnisListe(rundenIndex);
  if (status === "beendet") zeigeEndstand();
}

export function raumDaten(daten) {
  if (!daten || !el.wurzel) return;
  status = daten.ftStatus ?? null;
  anzahlRunden = daten.ftAnzahlRunden ?? 0;
  anzahlEntwurf = daten.ftAnzahlEntwurf ?? null;
  farben = daten.ftFarben ?? [];

  const neuerIndex = daten.ftRundenIndex ?? 0;
  const neuerStart = daten.ftStart ?? 0;
  if (status === "runde_aktiv" && (rundenIndex !== neuerIndex || startZeit !== neuerStart)) {
    rundenIndex = neuerIndex;
    startZeit = neuerStart;
    mein = [...START_FARBE]; beruehrt = false; abgegeben = false; auswertungLaeuft = false;
    $("ft-h").value = mein[0]; $("ft-s").value = mein[1]; $("ft-b").value = mein[2];
  } else if (status === "ausgewertet") {
    rundenIndex = neuerIndex;
  }

  api.fortschritt(status === "runde_aktiv" || status === "ausgewertet" ? `${rundenIndex + 1}/${anzahlRunden}` : "");

  ["ft-setup", "ft-runde-screen", "ft-ergebnis-screen", "ft-endstand-screen"].forEach((id) => { $(id).hidden = true; });
  if (status === "setup" || !status) {
    zeigeSetup();
    $("ft-setup").hidden = false;
  } else if (status === "runde_aktiv") {
    $("ft-runde-screen").hidden = false;
    zeichneRunde();
    aktualisiereStatus();
    tick();
  } else if (status === "ausgewertet") {
    $("ft-ergebnis-screen").hidden = false;
    zeigeErgebnis(rundenIndex);
  } else if (status === "beendet") {
    $("ft-endstand-screen").hidden = false;
    zeigeEndstand();
  }
}

function zeigeSetup() {
  const anzahlFeld = $("ft-anzahl");
  anzahlFeld.max = MAX_RUNDEN;
  const hinweis = `Bis zu ${MAX_RUNDEN} Farben.`;
  if (api.olympiadeAnzahl) {
    const festgelegt = Math.min(Math.max(1, api.olympiadeAnzahl), MAX_RUNDEN);
    anzahlFeld.value = String(festgelegt);
    $("ft-anzahl-max").textContent = `In der Olympiade festgelegt: ${festgelegt} ${festgelegt === 1 ? "Farbe" : "Farben"}.`;
    anzahlFeld.disabled = true;
  } else if (api.istLeiter) {
    if (!anzahlFeld.value) anzahlFeld.value = String(STANDARD_ANZAHL);
    $("ft-anzahl-max").textContent = hinweis;
    anzahlFeld.disabled = false;
  } else {
    anzahlFeld.value = String(anzahlEntwurf ?? STANDARD_ANZAHL);
    $("ft-anzahl-max").textContent = hinweis;
    anzahlFeld.disabled = true;
  }
  $("ft-anzahl-zeile").hidden = false;
  $("ft-starten").hidden = !api.istLeiter;
  $("ft-setup-warten").hidden = api.istLeiter;
  bereitSystem?.render();

  if (api.istLeiter && api.olympiadeAnzahl && !olympiadeAutoStart && bereitSystem?.alleBereit()) {
    olympiadeAutoStart = true;
    spielStarten();
  }
}

async function spielStarten() {
  $("ft-setup-fehler").textContent = "";
  if (spielerListe.length < 1) {
    $("ft-setup-fehler").textContent = "Für Farbton! braucht ihr mindestens einen Spieler.";
    return;
  }
  let anzahl = parseInt($("ft-anzahl").value, 10);
  if (!Number.isFinite(anzahl) || anzahl < 1) anzahl = 1;
  if (anzahl > MAX_RUNDEN) anzahl = MAX_RUNDEN;

  $("ft-starten").disabled = true;
  try {
    await raeumeSpieldatenAuf();
    await updateDoc(api.raumRef(), {
      ftStatus: "runde_aktiv", ftRundenIndex: 0, ftAnzahlRunden: anzahl,
      ftFarben: waehleFarben(anzahl).map(([h, s, b]) => ({ h, s, b })), ftStart: Date.now()
    });
  } catch (e) {
    zeigeDebug("Fehler beim Start: " + e.message);
  }
  $("ft-starten").disabled = false;
}

async function raeumeSpieldatenAuf() {
  const snap = await getDocs(collection(api.db, "raeume", api.code, "ftAntworten"));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  alleAntworten = [];
  await Promise.all(spielerListe.map((s) => updateDoc(api.spielerRef(s.id), { punkte: 0 })));
}

export async function vorZurueck() {
  try {
    await raeumeSpieldatenAuf();
    await updateDoc(api.raumRef(), {
      ftStatus: null, ftRundenIndex: 0, ftAnzahlRunden: 0, ftAnzahlEntwurf: 0, ftFarben: [], ftStart: 0
    });
    await api.zurueckZurAuswahl();
  } catch (e) {
    zeigeDebug("Fehler beim Zurückkehren: " + e.message);
  }
}

// ---- Runde ---------------------------------------------------------------------
const zielFarbe = (pos) => { const f = farben[pos]; return f ? [f.h, f.s, f.b] : START_FARBE; };
const verstrichen = () => Date.now() - startZeit;
const merkstufe = () => status === "runde_aktiv" && verstrichen() < MERK_SEKUNDEN * 1000;
const baustufe = () => status === "runde_aktiv" && !merkstufe() && verstrichen() < (MERK_SEKUNDEN + BAU_SEKUNDEN) * 1000;

function sliderHintergruende() {
  const [h, s, b] = mein;
  $("ft-b").style.background = `linear-gradient(90deg, #000, ${hsbCss(h, s, 100)})`;
  $("ft-s").style.background = `linear-gradient(90deg, ${hsbCss(h, 0, b)}, ${hsbCss(h, 100, b)})`;
  const reg = [0, 60, 120, 180, 240, 300, 360].map((x) => hsbCss(x, s, b)).join(",");
  $("ft-h").style.background = `linear-gradient(90deg, ${reg})`;
}

let letzteStufe = "";
function zeichneRunde() {
  if (!el.wurzel) return;
  const fl = $("ft-farbflaeche");
  const stufe = merkstufe() ? "merken" : "bauen";
  if (stufe === "merken") {
    fl.style.background = hsbCss(...zielFarbe(rundenIndex));
    $("ft-regler").hidden = true;
    $("ft-abgeben").hidden = true;
    $("ft-farbtext").textContent = "Merk dir die Farbe!";
  } else {
    fl.style.background = hsbCss(...mein);
    $("ft-regler").hidden = false;
    $("ft-abgeben").hidden = false;
    $("ft-farbtext").textContent = "";
    sliderHintergruende();
    $("ft-h").disabled = $("ft-s").disabled = $("ft-b").disabled = abgegeben;
  }
  if (stufe !== letzteStufe) { letzteStufe = stufe; aktualisiereStatus(); }
}

async function abgeben(automatisch) {
  if (status !== "runde_aktiv" || abgegeben) return;
  abgegeben = true;
  $("ft-abgeben").disabled = true;
  const genau = beruehrt ? genauigkeit(zielFarbe(rundenIndex), mein) : null;
  try {
    await setDoc(doc(api.db, "raeume", api.code, "ftAntworten", `${api.spielerId}_${rundenIndex}`), {
      spielerId: api.spielerId, spielerName: api.spielerName, rundenIndex,
      genauigkeit: genau, h: mein[0], s: mein[1], b: mein[2], zeitpunkt: serverTimestamp()
    });
  } catch (e) {
    abgegeben = false;
    $("ft-abgeben").disabled = false;
    zeigeDebug("Fehler beim Abgeben: " + e.message);
  }
  zeichneRunde();
  aktualisiereStatus();
}

function antwortenDieserRunde(pos) {
  const aktiv = new Set(spielerListe.map((s) => s.id));
  return alleAntworten.filter((a) => a.rundenIndex === pos && aktiv.has(a.spielerId));
}

function aktualisiereStatus() {
  if (!el.wurzel || status !== "runde_aktiv") return;
  const fertig = new Set(antwortenDieserRunde(rundenIndex).map((a) => a.spielerId));
  if (fertig.has(api.spielerId) && !abgegeben) abgegeben = true;   // z. B. nach Neuladen der Seite
  $("ft-abgeben").disabled = abgegeben;
  const offen = spielerListe.filter((s) => !fertig.has(s.id)).length;
  $("ft-status").textContent = merkstufe()
    ? "Gleich verschwindet die Farbe - dann mischst du sie aus dem Gedächtnis nach."
    : abgegeben
      ? (offen ? `Abgegeben! Noch ${offen} ${offen === 1 ? "Person mischt" : "Personen mischen"} …` : "Abgegeben!")
      : "Stell die Regler so ein, dass die Fläche wieder genau die gezeigte Farbe hat.";
}

function tick() {
  if (!el.wurzel || status !== "runde_aktiv") return;
  const v = verstrichen();
  const gesamt = (MERK_SEKUNDEN + BAU_SEKUNDEN) * 1000;
  $("ft-zeitbalken-fuell").style.width = (Math.max(0, gesamt - v) / gesamt * 100) + "%";
  const stufe = merkstufe() ? "merken" : "bauen";
  if (stufe !== letzteStufe) zeichneRunde();
  if (v >= gesamt && !abgegeben) abgeben(true);
  if (api.istLeiter) pruefeAuswertung(v);
}

// ---- Auswertung ---------------------------------------------------------------
function rundenPunkte(liste) {
  const mit = liste.filter((a) => Number.isFinite(a.genauigkeit) && a.genauigkeit > 0)
    .sort((a, b) => b.genauigkeit - a.genauigkeit);
  return punkteNachRang(mit, (a) => a.genauigkeit, spielerListe.length);
}

async function pruefeAuswertung(v) {
  if (!api.istLeiter || status !== "runde_aktiv" || auswertungLaeuft || spielerListe.length === 0) return;
  const antworten = antwortenDieserRunde(rundenIndex);
  const fertig = new Set(antworten.map((a) => a.spielerId));
  const fehlend = spielerListe.filter((s) => !fertig.has(s.id));
  const abgelaufen = v >= (MERK_SEKUNDEN + BAU_SEKUNDEN) * 1000 + AUSWERTUNG_PUFFER_MS;
  if (fehlend.length > 0 && !abgelaufen) return;

  auswertungLaeuft = true;
  try {
    if (fehlend.length) {
      await Promise.all(fehlend.map((s) => setDoc(doc(api.db, "raeume", api.code, "ftAntworten", `${s.id}_${rundenIndex}`), {
        spielerId: s.id, spielerName: s.name, rundenIndex, genauigkeit: null, h: null, s: null, b: null, zeitpunkt: serverTimestamp()
      })));
    }
    const kombiniert = [...antworten, ...fehlend.map((s) => ({ spielerId: s.id, genauigkeit: null }))];
    const punkte = rundenPunkte(kombiniert);
    const batch = writeBatch(api.db);
    Object.entries(punkte).forEach(([id, wert]) => batch.update(api.spielerRef(id), { punkte: increment(wert) }));
    batch.update(api.raumRef(), { ftStatus: "ausgewertet" });
    await batch.commit();
  } catch (e) {
    zeigeDebug("Fehler bei der Auswertung: " + e.message);
  }
  auswertungLaeuft = false;
}

function prozent(g) { return g == null ? "Nichts abgegeben" : `${g.toFixed(1).replace(".", ",")} %`; }

function zeigeErgebnisListe(pos) {
  if (!el.wurzel) return;
  const antworten = antwortenDieserRunde(pos);
  const punkte = rundenPunkte(antworten);
  const sortiert = [...antworten].sort((a, b) =>
    (b.genauigkeit ?? -1) - (a.genauigkeit ?? -1) || (a.spielerName || "").localeCompare(b.spielerName || "", "de"));

  const orig = el.wurzel.querySelector(".ft-original");
  orig.style.background = hsbCss(...zielFarbe(pos));

  const liste = $("ft-erg-liste");
  liste.innerHTML = "";
  sortiert.forEach((a) => {
    const s = spielerListe.find((x) => x.id === a.spielerId);
    const li = document.createElement("li");
    li.className = "ft-erg-zeile";
    li.innerHTML = spielerKarte(a.spielerName, s?.farbe, s?.icon, (punkte[a.spielerId] ?? 0) > 0 ? `+${punkte[a.spielerId]}` : "0",
      { extra: prozent(a.genauigkeit), punkteRechts: s ? (s.punkte ?? 0) : "?" });
    const feld = document.createElement("div");
    feld.className = "ft-erg-farbe" + (a.h == null || a.genauigkeit == null ? " leer" : "");
    if (a.h != null && a.genauigkeit != null) feld.style.background = hsbCss(a.h, a.s, a.b);
    else feld.textContent = "–";
    li.appendChild(feld);
    liste.appendChild(li);
  });
}

function zeigeErgebnis(pos) {
  zeigeErgebnisListe(pos);
  $("ft-weiter").hidden = !api.istLeiter;
  $("ft-weiter").textContent = pos + 1 >= anzahlRunden ? "Endstand anzeigen" : "Nächste Farbe";
}

async function weiter() {
  $("ft-weiter").disabled = true;
  try {
    const naechster = rundenIndex + 1;
    if (naechster >= anzahlRunden) {
      await updateDoc(api.raumRef(), { ftStatus: "beendet" });
      speichereWertung(api, "farbton", Object.fromEntries(spielerListe.map((s) => [s.id, s.punkte ?? 0])));
    } else {
      await updateDoc(api.raumRef(), { ftStatus: "runde_aktiv", ftRundenIndex: naechster, ftStart: Date.now() });
    }
  } catch (e) {
    zeigeDebug("Fehler beim Weiterschalten: " + e.message);
  }
  $("ft-weiter").disabled = false;
}

function zeigeEndstand() {
  if (!el.wurzel) return;
  const sortiert = [...spielerListe].sort((a, b) => (b.punkte ?? 0) - (a.punkte ?? 0));
  const liste = $("ft-endstand-liste");
  liste.innerHTML = "";
  sortiert.forEach((s, i) => {
    const li = document.createElement("li");
    li.innerHTML = spielerKarte(s.name, s.farbe, s.icon, s.punkte ?? 0, { rang: i + 1 });
    liste.appendChild(li);
  });
  $("ft-endstand-warten").hidden = api.istLeiter;
  const btn = $("ft-gesamtwertung-btn");
  if (btn) {
    btn.hidden = !(api.istLeiter && Boolean(api.olympiadeAnzahl));
    btn.onclick = () => api.zeigeGesamtwertung();
  }
}

export { rundenPunkte };
