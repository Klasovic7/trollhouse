// ============================================================================
//  Nachmalen!
// ----------------------------------------------------------------------------
//  Jede Runde bekommen alle dieselbe Form (Haus, Stern, Herz, Spirale, Blume
//  ...) als gestrichelte Vorlage angezeigt und zeichnen sie mit dem Finger
//  nach - innerhalb von 30 Sekunden. Bewertet wird, wie genau die eigene Linie
//  auf der Vorlage liegt (Prozent, siehe logik.js). Punkte gibt es nach Rang
//  (einheitliches Punktesystem). Nach der Runde sieht man alle Zeichnungen
//  übereinander. Alle spielspezifischen Raumfelder beginnen mit "nz"; die
//  Zeichnungen liegen in der Subcollection "nzAntworten".
// ============================================================================
import {
  doc, setDoc, updateDoc, deleteDoc, collection, getDocs, onSnapshot,
  serverTimestamp, increment, writeBatch
} from "../../kern/firebase.js";
import { spielerKarte, zeigeDebug, initBereitSystem } from "../../kern/ui.js";
import { speichereWertung, punkteNachRang } from "../../kern/wertung.js";
import { FORMEN, formPerId, waehleFormen, bewerteZeichnung, packe, entpacke, strichLaenge, zielPunkte, abstandZuZiel, liveProzent, genauWert } from "./logik.js";

const ZEIT_SEKUNDEN = 30;
const AUSWERTUNG_PUFFER_MS = 12000;   // Sicherheitsnetz, falls jemand nie abgibt
const MAX_RUNDEN = FORMEN.length;
const STANDARD_ANZAHL = 5;
const RAND = 0.8;                     // Form füllt 80 % der halben Zeichenfläche
const SCHWER = { 1: "leicht", 2: "mittel", 3: "schwer" };
const FARBEN = ["#f87171", "#60a5fa", "#4ade80", "#fbbf24", "#c084fc", "#f472b6", "#2dd4bf", "#fb923c"];

const VORLAGE = `
  <div id="nz-setup" class="bildschirm-karte" hidden>
    <p class="hinweis-text">Alle sehen dieselbe Form als gestrichelte Vorlage - vom Haus bis zur Spirale.
      Sobald du den Finger aufsetzt, verschwindet die Vorlage: du musst sie dir merken und aus dem Gedächtnis
      zeichnen. Beim Malen siehst du live deine Treffsicherheit, der Strich wird rot (daneben) oder grün (genau).
      Du hast 30 Sekunden. Wer am genauesten zeichnet,
      bekommt die meisten Punkte. Mit "Löschen" darfst du neu ansetzen, mit "Abgeben" zählt es.</p>

    <div id="nz-anzahl-zeile" class="setup-anzahlblock" hidden>
      <div class="setup-anzahl-zeile">
        <span>Anzahl Formen</span>
        <span class="anzahl-picker">
          <input id="nz-anzahl" type="text" inputmode="numeric" pattern="[0-9]*" min="1" class="anzahl-eingabe">
        </span>
      </div>
      <p id="nz-anzahl-max" class="hinweis-text"></p>
    </div>

    <p id="nz-setup-fehler" class="fehler-text"></p>
    <p><button id="nz-starten" class="btn-primaer" hidden>Spiel starten</button></p>
    <p id="nz-setup-warten" hidden><em>Warte, bis der Spielleiter das Spiel startet …</em></p>
    <div id="nz-bereit-bereich" class="bereit-bereich" hidden></div>
  </div>

  <div id="nz-runde-screen" class="bildschirm-karte nz-karte" hidden>
    <p class="kategorie">Nachmalen!</p>
    <h2 id="nz-form-name"></h2>
    <div class="nz-zeitbalken"><div id="nz-zeitbalken-fuell"></div></div>
    <canvas id="nz-canvas" class="nz-canvas"></canvas>
    <div class="nz-knoepfe">
      <button id="nz-loeschen" type="button" class="btn-sekundaer">Löschen</button>
      <button id="nz-abgeben" type="button" class="btn-primaer">Abgeben</button>
    </div>
    <div id="nz-status" class="warten-block"></div>
  </div>

  <div id="nz-ergebnis-screen" class="bildschirm-karte nz-karte" hidden>
    <p class="kategorie">Nachmalen!</p>
    <h2 id="nz-erg-name"></h2>
    <canvas id="nz-erg-canvas" class="nz-canvas"></canvas>
    <ul id="nz-erg-liste"></ul>
    <p><button id="nz-weiter" hidden>Weiter</button></p>
  </div>

  <div id="nz-endstand-screen" class="bildschirm-karte" hidden>
    <h1>Endstand</h1>
    <ul id="nz-endstand-liste"></ul>
    <p id="nz-endstand-warten" hidden><em>Der Spielleiter wählt gleich das nächste Spiel …</em></p>
    <p><button id="nz-gesamtwertung-btn" class="btn-primaer" type="button" hidden>Gesamtwertung</button></p>
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
let formIds = [];
let startZeit = 0;
let striche = [];            // eigene Striche (normierte Koordinaten)
let aktuellerStrich = null;
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
  bereitSystem = initBereitSystem(api, "nz");
  olympiadeAutoStart = false;

  verdrahte();
  starteListener();

  if (api.istLeiter && !api.raum?.nzStatus) {
    await updateDoc(api.raumRef(), {
      nzStatus: "setup", nzRundenIndex: 0, nzAnzahlRunden: 0, nzAnzahlEntwurf: 0, nzFormen: [], nzStart: 0
    });
  }
  tickId = setInterval(tick, 200);
}

function verdrahte() {
  const feld = $("nz-anzahl");
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
  $("nz-starten").addEventListener("click", spielStarten);
  $("nz-weiter").addEventListener("click", weiter);
  $("nz-loeschen").addEventListener("click", () => {
    if (abgegeben || status !== "runde_aktiv") return;
    striche = []; aktuellerStrich = null;
    zeichneRunde();
  });
  $("nz-abgeben").addEventListener("click", () => abgeben(false));

  const c = $("nz-canvas");
  c.addEventListener("pointerdown", zeigerRunter);
  c.addEventListener("pointermove", zeigerBewegt);
  c.addEventListener("pointerup", zeigerHoch);
  c.addEventListener("pointercancel", zeigerHoch);
  c.addEventListener("touchstart", (e) => e.preventDefault(), { passive: false });
  c.addEventListener("touchmove", (e) => e.preventDefault(), { passive: false });
}

function schreibeAnzahlEntwurfLive() {
  if (!api.istLeiter) return;
  clearTimeout(anzahlEntwurfTimer);
  anzahlEntwurfTimer = setTimeout(() => {
    const wert = parseInt($("nz-anzahl").value, 10);
    if (Number.isFinite(wert) && wert > 0) updateDoc(api.raumRef(), { nzAnzahlEntwurf: wert }).catch(() => {});
  }, 300);
}

function starteListener() {
  antwortenUnsub = onSnapshot(collection(api.db, "raeume", api.code, "nzAntworten"), (snap) => {
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
  anzahlEntwurf = null; formIds = []; startZeit = 0; striche = []; aktuellerStrich = null;
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
  status = daten.nzStatus ?? null;
  anzahlRunden = daten.nzAnzahlRunden ?? 0;
  anzahlEntwurf = daten.nzAnzahlEntwurf ?? null;
  formIds = daten.nzFormen ?? [];

  const neuerIndex = daten.nzRundenIndex ?? 0;
  const neuerStart = daten.nzStart ?? 0;
  if (status === "runde_aktiv" && (rundenIndex !== neuerIndex || startZeit !== neuerStart)) {
    rundenIndex = neuerIndex;
    startZeit = neuerStart; vorlageWeg = false;
    striche = []; aktuellerStrich = null; abgegeben = false; auswertungLaeuft = false;
  } else if (status === "ausgewertet") {
    rundenIndex = neuerIndex;
  }

  api.fortschritt(status === "runde_aktiv" || status === "ausgewertet" ? `${rundenIndex + 1}/${anzahlRunden}` : "");

  ["nz-setup", "nz-runde-screen", "nz-ergebnis-screen", "nz-endstand-screen"].forEach((id) => { $(id).hidden = true; });
  if (status === "setup" || !status) {
    zeigeSetup();
    $("nz-setup").hidden = false;
  } else if (status === "runde_aktiv") {
    $("nz-runde-screen").hidden = false;
    $("nz-form-name").textContent = formPerId(formIds[rundenIndex]).name;
    zeichneRunde();
    aktualisiereStatus();
    tick();
  } else if (status === "ausgewertet") {
    $("nz-ergebnis-screen").hidden = false;
    zeigeErgebnis(rundenIndex);
  } else if (status === "beendet") {
    $("nz-endstand-screen").hidden = false;
    zeigeEndstand();
  }
}

function zeigeSetup() {
  const anzahlFeld = $("nz-anzahl");
  anzahlFeld.max = MAX_RUNDEN;
  const hinweis = `Jede Form kommt nur einmal vor, bis zu ${MAX_RUNDEN} Formen.`;
  if (api.olympiadeAnzahl) {
    const festgelegt = Math.min(Math.max(1, api.olympiadeAnzahl), MAX_RUNDEN);
    anzahlFeld.value = String(festgelegt);
    $("nz-anzahl-max").textContent = `In der Olympiade festgelegt: ${festgelegt} ${festgelegt === 1 ? "Form" : "Formen"}.`;
    anzahlFeld.disabled = true;
  } else if (api.istLeiter) {
    if (!anzahlFeld.value) anzahlFeld.value = String(STANDARD_ANZAHL);
    if (!anzahlEntwurf) schreibeAnzahlEntwurfLive();   // Mitspieler sollen den Standardwert sofort sehen
    $("nz-anzahl-max").textContent = hinweis;
    anzahlFeld.disabled = false;
  } else {
    anzahlFeld.value = String(anzahlEntwurf || STANDARD_ANZAHL);
    $("nz-anzahl-max").textContent = hinweis;
    anzahlFeld.disabled = true;
  }
  $("nz-anzahl-zeile").hidden = false;
  $("nz-starten").hidden = !api.istLeiter;
  $("nz-setup-warten").hidden = api.istLeiter;
  bereitSystem?.render();

  if (api.istLeiter && api.olympiadeAnzahl && !olympiadeAutoStart && bereitSystem?.alleBereit()) {
    olympiadeAutoStart = true;
    spielStarten();
  }
}

async function spielStarten() {
  $("nz-setup-fehler").textContent = "";
  if (spielerListe.length < 1) {
    $("nz-setup-fehler").textContent = "Für Nachmalen! braucht ihr mindestens einen Spieler.";
    return;
  }
  let anzahl = parseInt($("nz-anzahl").value, 10);
  if (!Number.isFinite(anzahl) || anzahl < 1) anzahl = 1;
  if (anzahl > MAX_RUNDEN) anzahl = MAX_RUNDEN;

  $("nz-starten").disabled = true;
  try {
    await raeumeSpieldatenAuf();
    await updateDoc(api.raumRef(), {
      nzStatus: "runde_aktiv", nzRundenIndex: 0, nzAnzahlRunden: anzahl,
      nzFormen: waehleFormen(anzahl), nzStart: Date.now()
    });
  } catch (e) {
    zeigeDebug("Fehler beim Start: " + e.message);
  }
  $("nz-starten").disabled = false;
}

async function raeumeSpieldatenAuf() {
  const snap = await getDocs(collection(api.db, "raeume", api.code, "nzAntworten"));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  alleAntworten = [];
  await Promise.all(spielerListe.map((s) => updateDoc(api.spielerRef(s.id), { punkte: 0 })));
}

export async function vorZurueck() {
  try {
    await raeumeSpieldatenAuf();
    await updateDoc(api.raumRef(), {
      nzStatus: null, nzRundenIndex: 0, nzAnzahlRunden: 0, nzAnzahlEntwurf: 0, nzFormen: [], nzStart: 0
    });
    await api.zurueckZurAuswahl();
  } catch (e) {
    zeigeDebug("Fehler beim Zurückkehren: " + e.message);
  }
}

// ---- Zeichnen ------------------------------------------------------------------
function richteCanvasEin(canvas) {
  const css = Math.round(canvas.clientWidth) || 300;
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  if (canvas.width !== css * dpr) { canvas.width = css * dpr; canvas.height = css * dpr; }
  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { ctx, css };
}

function bildPunkt(css, p) { return [(css / 2) * (1 + p[0] * RAND), (css / 2) * (1 + p[1] * RAND)]; }

function pfadZeichnen(ctx, css, liste, geschlossen) {
  ctx.beginPath();
  liste.forEach((p, i) => { const [x, y] = bildPunkt(css, p); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
  if (geschlossen) ctx.closePath();
}

function vorlageZeichnen(ctx, css, form, stark = false) {
  ctx.save();
  ctx.lineWidth = stark ? 2.5 : 2;
  ctx.setLineDash([7, 7]);
  ctx.strokeStyle = stark ? "rgba(255,255,255,.55)" : "rgba(255,255,255,.4)";
  ctx.lineJoin = "round";
  pfadZeichnen(ctx, css, form.pt, form.geschlossen);
  ctx.stroke();
  ctx.restore();
}

function striceZeichnen(ctx, css, liste, farbe, breite, alpha = 1) {
  ctx.save();
  ctx.lineWidth = breite; ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.strokeStyle = farbe; ctx.globalAlpha = alpha;
  for (const st of liste) {
    if (!st.length) continue;
    if (st.length === 1) {
      const [x, y] = bildPunkt(css, st[0]);
      ctx.beginPath(); ctx.arc(x, y, breite / 2, 0, Math.PI * 2); ctx.fillStyle = farbe; ctx.fill();
      continue;
    }
    pfadZeichnen(ctx, css, st, false);
    ctx.stroke();
  }
  ctx.restore();
}

let zielCache = null, zielCacheId = "", vorlageWeg = false;
function zielFuerRunde() {
  const id = formIds[rundenIndex];
  if (zielCacheId !== id) { zielCache = zielPunkte(formPerId(id)); zielCacheId = id; }
  return zielCache;
}
const farbeFuer = (t) => `hsl(${Math.round(t * 125)}, 85%, ${Math.round(46 + 6 * t)}%)`;

// Strich Segment für Segment einfärben: rot = weit weg von der Form, grün = genau
function liveStricheZeichnen(ctx, css, liste, ziel) {
  ctx.save();
  ctx.lineWidth = 5; ctx.lineCap = "round"; ctx.lineJoin = "round";
  for (const st of liste) {
    if (!st._w) st._w = [];
    for (let i = st._w.length; i < st.length; i++) st._w[i] = genauWert(abstandZuZiel(st[i], ziel));
    if (st.length === 1) continue;
    for (let i = 1; i < st.length; i++) {
      const [x0, y0] = bildPunkt(css, st[i - 1]), [x1, y1] = bildPunkt(css, st[i]);
      ctx.strokeStyle = farbeFuer((st._w[i] + st._w[i - 1]) / 2);
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    }
  }
  ctx.restore();
}

function zeichneRunde() {
  if (!el.wurzel) return;
  const canvas = $("nz-canvas");
  const { ctx, css } = richteCanvasEin(canvas);
  ctx.clearRect(0, 0, css, css);
  const meine = aktuellerStrich ? [...striche, aktuellerStrich] : striche;
  const ziel = zielFuerRunde();
  const hatGemalt = meine.length > 0;
  if (hatGemalt) vorlageWeg = true;
  if (!vorlageWeg) vorlageZeichnen(ctx, css, formPerId(formIds[rundenIndex]));
  // große Prozentzahl in der Mitte (Treffsicherheit live, nach dem Abgeben die Endwertung)
  let zahl = null;
  if (hatGemalt && abgegeben) {
    const mein = antwortenDieserRunde(rundenIndex).find((a) => a.spielerId === api.spielerId);
    zahl = mein && Number.isFinite(mein.genauigkeit) ? mein.genauigkeit : liveProzent(ziel, meine);
  } else if (hatGemalt) zahl = liveProzent(ziel, meine);
  if (zahl !== null) {
    ctx.save();
    ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.font = `800 ${Math.round(css * 0.2)}px system-ui, sans-serif`;
    ctx.fillStyle = farbeFuer(Math.max(0, Math.min(1, zahl / 90)));
    ctx.globalAlpha = 0.55;
    ctx.fillText(zahl.toFixed(1).replace(".", ",") + " %", css / 2, css / 2);
    ctx.restore();
  }
  if (!abgegeben) {
    $("nz-status").textContent = vorlageWeg
      ? "Rot = daneben, grün = genau. Die Zahl zeigt deine Treffsicherheit."
      : "Präg dir die Form ein - sie verschwindet, sobald du anfängst!";
  }
  liveStricheZeichnen(ctx, css, meine, ziel);
}

function eigeneFarbe() {
  const s = spielerListe.find((x) => x.id === api.spielerId);
  return s?.farbe || "#2dd4bf";
}

function zeigerPunkt(e) {
  const r = e.currentTarget.getBoundingClientRect();
  return [((e.clientX - r.left) / r.width * 2 - 1) / RAND, ((e.clientY - r.top) / r.height * 2 - 1) / RAND];
}

function drawErlaubt() { return status === "runde_aktiv" && !abgegeben && Date.now() - startZeit < ZEIT_SEKUNDEN * 1000; }

function zeigerRunter(e) {
  if (!drawErlaubt()) return;
  e.preventDefault();
  try { e.currentTarget.setPointerCapture(e.pointerId); } catch (_) { /* nicht kritisch */ }
  aktuellerStrich = [zeigerPunkt(e)];
  zeichneRunde();
}

function zeigerBewegt(e) {
  if (!aktuellerStrich || !drawErlaubt()) return;
  e.preventDefault();
  const p = zeigerPunkt(e);
  const l = aktuellerStrich[aktuellerStrich.length - 1];
  if (Math.hypot(p[0] - l[0], p[1] - l[1]) < 0.006) return;
  aktuellerStrich.push(p);
  zeichneRunde();
}

function zeigerHoch() {
  if (!aktuellerStrich) return;
  if (aktuellerStrich.length > 1) striche.push(aktuellerStrich);
  aktuellerStrich = null;
  zeichneRunde();
}

async function abgeben(automatisch) {
  if (status !== "runde_aktiv" || abgegeben) return;
  zeigerHoch();
  if (!automatisch && !striche.length) { $("nz-status").textContent = "Zeichne erst etwas nach."; return; }
  abgegeben = true;
  $("nz-abgeben").disabled = true; $("nz-loeschen").disabled = true;
  const form = formPerId(formIds[rundenIndex]);
  const genau = striche.length ? bewerteZeichnung(form, striche) : null;
  try {
    await setDoc(doc(api.db, "raeume", api.code, "nzAntworten", `${api.spielerId}_${rundenIndex}`), {
      spielerId: api.spielerId, spielerName: api.spielerName, rundenIndex,
      genauigkeit: genau, pfad: packe(striche), zeitpunkt: serverTimestamp()
    });
  } catch (e) {
    abgegeben = false;
    $("nz-abgeben").disabled = false; $("nz-loeschen").disabled = false;
    zeigeDebug("Fehler beim Abgeben: " + e.message);
  }
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
  $("nz-abgeben").disabled = abgegeben;
  $("nz-loeschen").disabled = abgegeben;
  const offen = spielerListe.filter((s) => !fertig.has(s.id)).length;
  $("nz-status").textContent = abgegeben
    ? (offen ? `Abgegeben! Noch ${offen} ${offen === 1 ? "Person zeichnet" : "Personen zeichnen"} …` : "Abgegeben!")
    : "";
}

function tick() {
  if (!el.wurzel || status !== "runde_aktiv") return;
  const verstrichen = Date.now() - startZeit;
  const rest = Math.max(0, ZEIT_SEKUNDEN * 1000 - verstrichen);
  $("nz-zeitbalken-fuell").style.width = (rest / (ZEIT_SEKUNDEN * 1000) * 100) + "%";
  if (rest <= 0 && !abgegeben) abgeben(true);
  if (api.istLeiter) pruefeAuswertung(verstrichen);
}

// ---- Auswertung ---------------------------------------------------------------
function rundenPunkte(liste) {
  const mit = liste.filter((a) => Number.isFinite(a.genauigkeit) && a.genauigkeit > 0)
    .sort((a, b) => b.genauigkeit - a.genauigkeit);
  return punkteNachRang(mit, (a) => a.genauigkeit, spielerListe.length);
}

async function pruefeAuswertung(verstrichen) {
  if (!api.istLeiter || status !== "runde_aktiv" || auswertungLaeuft || spielerListe.length === 0) return;
  const antworten = antwortenDieserRunde(rundenIndex);
  const fertig = new Set(antworten.map((a) => a.spielerId));
  const fehlend = spielerListe.filter((s) => !fertig.has(s.id));
  const abgelaufen = verstrichen >= ZEIT_SEKUNDEN * 1000 + AUSWERTUNG_PUFFER_MS;
  if (fehlend.length > 0 && !abgelaufen) return;

  auswertungLaeuft = true;
  try {
    if (fehlend.length) {
      await Promise.all(fehlend.map((s) => setDoc(doc(api.db, "raeume", api.code, "nzAntworten", `${s.id}_${rundenIndex}`), {
        spielerId: s.id, spielerName: s.name, rundenIndex, genauigkeit: null, pfad: [], zeitpunkt: serverTimestamp()
      })));
    }
    const kombiniert = [...antworten, ...fehlend.map((s) => ({ spielerId: s.id, genauigkeit: null }))];
    const punkte = rundenPunkte(kombiniert);
    const batch = writeBatch(api.db);
    Object.entries(punkte).forEach(([id, wert]) => batch.update(api.spielerRef(id), { punkte: increment(wert) }));
    batch.update(api.raumRef(), { nzStatus: "ausgewertet" });
    await batch.commit();
  } catch (e) {
    zeigeDebug("Fehler bei der Auswertung: " + e.message);
  }
  auswertungLaeuft = false;
}

function prozent(g) { return g == null ? "Nichts abgegeben" : `${g.toFixed(1).replace(".", ",")} %`; }

function farbeVon(id, i) {
  return spielerListe.find((x) => x.id === id)?.farbe || FARBEN[i % FARBEN.length];
}

function zeigeErgebnisListe(pos) {
  if (!el.wurzel) return;
  const antworten = antwortenDieserRunde(pos);
  const punkte = rundenPunkte(antworten);
  const sortiert = [...antworten].sort((a, b) =>
    (b.genauigkeit ?? -1) - (a.genauigkeit ?? -1) || (a.spielerName || "").localeCompare(b.spielerName || "", "de"));

  const form = formPerId(formIds[pos]);
  const canvas = $("nz-erg-canvas");
  const { ctx, css } = richteCanvasEin(canvas);
  ctx.clearRect(0, 0, css, css);
  vorlageZeichnen(ctx, css, form, true);
  sortiert.slice().reverse().forEach((a, i) => {
    striceZeichnen(ctx, css, entpacke(a.pfad), farbeVon(a.spielerId, i), 4, 0.8);
  });

  const liste = $("nz-erg-liste");
  liste.innerHTML = "";
  sortiert.forEach((a) => {
    const s = spielerListe.find((x) => x.id === a.spielerId);
    const li = document.createElement("li");
    li.innerHTML = spielerKarte(a.spielerName, s?.farbe, s?.icon, (punkte[a.spielerId] ?? 0) > 0 ? `+${punkte[a.spielerId]}` : "0",
      { extra: `Genauigkeit: ${prozent(a.genauigkeit)}`, punkteRechts: s ? (s.punkte ?? 0) : "?" });
    liste.appendChild(li);
  });
}

function zeigeErgebnis(pos) {
  const form = formPerId(formIds[pos]);
  $("nz-erg-name").textContent = `${form.name} (${SCHWER[form.schwer]})`;
  zeigeErgebnisListe(pos);
  $("nz-weiter").hidden = !api.istLeiter;
  $("nz-weiter").textContent = pos + 1 >= anzahlRunden ? "Endstand anzeigen" : "Nächste Form";
}

async function weiter() {
  $("nz-weiter").disabled = true;
  try {
    const naechster = rundenIndex + 1;
    if (naechster >= anzahlRunden) {
      await updateDoc(api.raumRef(), { nzStatus: "beendet" });
      speichereWertung(api, "nachzeichnen", Object.fromEntries(spielerListe.map((s) => [s.id, s.punkte ?? 0])));
    } else {
      await updateDoc(api.raumRef(), { nzStatus: "runde_aktiv", nzRundenIndex: naechster, nzStart: Date.now() });
    }
  } catch (e) {
    zeigeDebug("Fehler beim Weiterschalten: " + e.message);
  }
  $("nz-weiter").disabled = false;
}

function zeigeEndstand() {
  if (!el.wurzel) return;
  const sortiert = [...spielerListe].sort((a, b) => (b.punkte ?? 0) - (a.punkte ?? 0));
  const liste = $("nz-endstand-liste");
  liste.innerHTML = "";
  sortiert.forEach((s, i) => {
    const li = document.createElement("li");
    li.innerHTML = spielerKarte(s.name, s.farbe, s.icon, s.punkte ?? 0, { rang: i + 1 });
    liste.appendChild(li);
  });
  $("nz-endstand-warten").hidden = api.istLeiter;
  const btn = $("nz-gesamtwertung-btn");
  if (btn) {
    btn.hidden = !(api.istLeiter && Boolean(api.olympiadeAnzahl));
    btn.onclick = () => api.zeigeGesamtwertung();
  }
}

export { rundenPunkte, strichLaenge };
