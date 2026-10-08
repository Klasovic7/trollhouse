// ============================================================================
//  Größenvergleich
// ----------------------------------------------------------------------------
//  Jede Runde sieht man zwei Silhouetten nebeneinander: ein blaues Vorbild mit
//  angegebener echter Größe (z. B. "Eiffelturm: 330 m hoch") und eine rote
//  Silhouette, deren Größe man mit einem Schieberegler selbst einstellt
//  ("Wie lang ist der Blauwal?"). Alle schätzen gleichzeitig; wer prozentual
//  am nächsten an der echten Größe liegt, bekommt die meisten Punkte (Rang-
//  Punkte wie bei Zeitgefühl!, plus ein Extrapunkt für die beste Schätzung).
//
//  Raumfelder beginnen mit "gv": gvStatus (setup | runde_aktiv | ausgewertet |
//  beendet), gvRundenIndex, gvAnzahlRunden, gvAnzahlEntwurf, gvRundeStart,
//  gvPaare (vom Spielleiter im Voraus erzeugte Runden). Die Schätzungen liegen
//  getrennt in der Subcollection "gvAntworten".
//
//  Tier-Silhouetten: PhyloPic (phylopic.org), gemeinfrei (CC0 / Public Domain).
// ============================================================================
import {
  doc, setDoc, updateDoc, deleteDoc, collection, getDocs, onSnapshot,
  serverTimestamp, increment, writeBatch
} from "../../kern/firebase.js";
import { spielerKarte, zeigeDebug, initBereitSystem, escapeHtml } from "../../kern/ui.js";
import { speichereWertung } from "../../kern/wertung.js";
import { OBJEKTE, OBJEKT_NACH_ID, formatMeter, objektSvg, ausdehnung } from "./objekte.js";

const MAX_RUNDEN = 15;
const STANDARD_ANZAHL = 5;
const DAUER_MS = 30000;               // Bedenkzeit pro Runde
const TIMEOUT_SICHERHEIT_MS = 45000;  // Spielleiter wertet spätestens dann aus
const SLIDER_MAX = 1000;
const FEIN_SCHRITT = 6;

// Zeichenfläche (SVG-Koordinaten)
const SZ_B = 1000, SZ_H = 640, SZ_BODEN = 590;
const SZ_RAND_L = 64, SZ_RAND_R = 30, SZ_OBEN = 40, SZ_LUECKE = 60;

const VORLAGE = `
  <div id="gv-setup" class="bildschirm-karte" hidden>
    <h1>📏 Größenvergleich</h1>
    <p class="hinweis-text">Links siehst du ein blaues Vorbild mit echter Größe, rechts eine rote
      Silhouette, die du mit dem Regler auf die richtige Größe ziehst - zum Beispiel: Wie hoch
      ist ein Elefant, wenn der Mensch daneben 1,75 m misst? Wer prozentual am nächsten dran ist,
      bekommt die meisten Punkte.</p>

    <div id="gv-anzahl-zeile" class="setup-anzahlblock" hidden>
      <div class="setup-anzahl-zeile">
        <span>Anzahl Runden</span>
        <span class="anzahl-picker">
          <input id="gv-anzahl" type="text" inputmode="numeric" pattern="[0-9]*" min="1" class="anzahl-eingabe">
        </span>
      </div>
      <p id="gv-anzahl-max" class="hinweis-text"></p>
    </div>

    <p id="gv-setup-fehler" class="fehler-text"></p>
    <p><button id="gv-starten" class="btn-primaer" hidden>Spiel starten</button></p>
    <p id="gv-setup-warten" hidden><em>Warte, bis der Spielleiter das Spiel startet …</em></p>
    <div id="gv-bereit-bereich" class="bereit-bereich" hidden></div>
    <p class="hinweis-text gv-quelle">Tier-Silhouetten: PhyloPic (gemeinfrei, CC0).</p>
  </div>

  <div id="gv-runde-screen" class="bildschirm-karte" hidden>
    <p class="kategorie">Größenvergleich</p>
    <h2 id="gv-frage"></h2>
    <div id="gv-timer" class="gv-timer" aria-hidden="true"><i></i></div>
    <svg id="gv-szene" class="gv-szene" viewBox="0 0 ${SZ_B} ${SZ_H}" role="img" aria-label="Größenvergleich"></svg>
    <div class="gv-schaetzung">Deine Schätzung: <strong id="gv-wert">–</strong></div>
    <div class="gv-regler-zeile">
      <button id="gv-minus" class="gv-fein" type="button" aria-label="Kleiner">−</button>
      <input id="gv-regler" class="gv-regler" type="range" min="0" max="${SLIDER_MAX}" step="1" value="500">
      <button id="gv-plus" class="gv-fein" type="button" aria-label="Größer">+</button>
    </div>
    <p><button id="gv-senden" class="btn-primaer" type="button">Das ist meine Schätzung</button></p>
    <div id="gv-status" class="warten-block"></div>
  </div>

  <div id="gv-ergebnis-screen" class="bildschirm-karte" hidden>
    <p class="kategorie">Größenvergleich</p>
    <h2 id="gv-erg-titel"></h2>
    <svg id="gv-erg-szene" class="gv-szene" viewBox="0 0 ${SZ_B} ${SZ_H}" role="img" aria-label="Auflösung"></svg>
    <ul id="gv-erg-liste"></ul>
    <p><button id="gv-weiter" hidden>Weiter</button></p>
  </div>

  <div id="gv-endstand-screen" class="bildschirm-karte" hidden>
    <h1>Endstand</h1>
    <ul id="gv-endstand-liste"></ul>
    <p id="gv-endstand-warten" hidden><em>Der Spielleiter wählt gleich das nächste Spiel …</em></p>
    <p><button id="gv-gesamtwertung-btn" class="btn-primaer" type="button" hidden>Gesamtwertung</button></p>
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
let paare = [];
let rundeStart = 0;
let anzahlEntwurfTimer = null;
let eigeneAbgegeben = false;
let sendeLaeuft = false;
let auswertungLaeuft = false;
let aktuelleRundeKey = null;
let sliderWert = 500;

let bereitSystem = null;
let olympiadeAutoStart = false;

const $ = (id) => el.wurzel.querySelector("#" + id);

// ---- Rundenerzeugung (nur Spielleiter) -------------------------------------
function gross(o) { const e = ausdehnung(o); return Math.max(e.b, e.h); }
function mischen(liste) {
  const a = [...liste];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function zwischen(a, b) { return a + Math.random() * (b - a); }
function runden3(x) { return Number(x.toPrecision(3)); }

export function erzeugePaare(anzahl) {
  const ergebnis = [];
  let zielReihe = [];
  let letzteRef = null;
  for (let i = 0; i < anzahl; i++) {
    if (zielReihe.length === 0) zielReihe = mischen(OBJEKTE);
    const ziel = zielReihe.pop();
    let kandidaten = OBJEKTE.filter((r) => {
      if (r.id === ziel.id || r.id === letzteRef) return false;
      const v = gross(ziel) / gross(r);
      return (v >= 1.3 && v <= 8) || (1 / v >= 1.3 && 1 / v <= 8);
    });
    if (kandidaten.length === 0) kandidaten = OBJEKTE.filter((r) => r.id !== ziel.id);
    const ref = kandidaten[Math.floor(Math.random() * kandidaten.length)];
    letzteRef = ref.id;

    // Schieberegler-Bereich: zufällig und asymmetrisch um die echte Größe, damit
    // die Mitte des Reglers nichts verrät.
    let faktorUnten = zwischen(1.7, 4);
    let faktorOben = zwischen(1.7, 4);
    const gz = gross(ziel), gr = gross(ref);
    const proMeter = gz / ziel.m;
    while (gz * faktorOben > gr * 12) faktorOben *= 0.85;
    while ((proMeter * (ziel.m / faktorUnten)) < gr / 12) faktorUnten *= 0.85;
    const lo = runden3(ziel.m / faktorUnten);
    const hi = runden3(ziel.m * faktorOben);
    // Startposition (Anteil 0..1 auf dem Regler), nicht in der Nähe der Lösung
    const wahr = Math.log(ziel.m / lo) / Math.log(hi / lo);
    let start;
    do { start = zwischen(0.1, 0.9); } while (Math.abs(start - wahr) < 0.15);
    ergebnis.push({ ref: ref.id, ziel: ziel.id, lo, hi, start: Math.round(start * SLIDER_MAX) });
  }
  return ergebnis;
}

export function meterAusSlider(paar, v) {
  return paar.lo * Math.pow(paar.hi / paar.lo, v / SLIDER_MAX);
}

// ---- Szene zeichnen --------------------------------------------------------
function ausdehnungBei(o, meter) {
  const e = ausdehnung(o);
  const k = meter / o.m;
  return { b: e.b * k, h: e.h * k };
}

function layoutFuer(paar) {
  const ref = OBJEKT_NACH_ID[paar.ref], ziel = OBJEKT_NACH_ID[paar.ziel];
  const eR = ausdehnung(ref);
  const eZ = ausdehnungBei(ziel, paar.hi);
  const verfuegbarB = SZ_B - SZ_RAND_L - SZ_RAND_R - SZ_LUECKE;
  const sB = verfuegbarB / (eR.b + eZ.b);
  const sH = (SZ_BODEN - SZ_OBEN) / Math.max(eR.h, eZ.h);
  const s = Math.min(sB, sH);
  const gesamtB = (eR.b + eZ.b) * s + SZ_LUECKE;
  const links = SZ_RAND_L + (SZ_B - SZ_RAND_L - SZ_RAND_R - gesamtB) / 2;
  return { ref, ziel, s, refX: links, zielX: links + eR.b * s + SZ_LUECKE, eR };
}

// Maßlinie (vertikal bei "hoch", sonst waagerecht unter dem Objekt)
function masslinie(o, meter, x, farbe, s, beschriftung) {
  const e = ausdehnungBei(o, meter);
  const txt = escapeHtml(beschriftung ?? `${formatMeter(meter)} m`);
  const stil = `stroke="${farbe}" stroke-width="3" fill="none"`;
  if (o.art === "hoch") {
    const y1 = SZ_BODEN, y2 = SZ_BODEN - e.h * s, xl = x - 14;
    return `<g class="gv-mass"><path d="M${xl} ${y1}V${y2}M${xl - 7} ${y1}H${xl + 7}M${xl - 7} ${y2}H${xl + 7}" ${stil}/>` +
      `<text x="${xl - 12}" y="${(y1 + y2) / 2}" fill="${farbe}" text-anchor="middle" ` +
      `transform="rotate(-90 ${xl - 12} ${(y1 + y2) / 2})" class="gv-mass-text">${txt}</text></g>`;
  }
  const y = SZ_BODEN + 20, x2 = x + e.b * s;
  return `<g class="gv-mass"><path d="M${x} ${y}H${x2}M${x} ${y - 7}V${y + 7}M${x2} ${y - 7}V${y + 7}" ${stil}/>` +
    `<text x="${(x + x2) / 2}" y="${y + 30}" fill="${farbe}" text-anchor="middle" class="gv-mass-text">${txt}</text></g>`;
}

function zielGruppe(L, meter, farbe, optionen = {}) {
  const pxProMeter = L.s;
  const ziel = L.ziel;
  // Skalierung: Objekt der echten Größe m wird auf "meter" gestreckt
  const k = meter / ziel.m;
  const e = ausdehnung(ziel);
  const hoehePx = e.h * k * pxProMeter;
  const einheitenProM = ziel.art === "hoch" ? ziel.vb[1] / ziel.m : ziel.vb[0] / ziel.m;
  const sc = (pxProMeter * k) / einheitenProM;
  const attr = optionen.umriss
    ? `fill="none" stroke="${farbe}" stroke-width="4" stroke-linejoin="round" vector-effect="non-scaling-stroke"`
    : `fill="${farbe}" fill-opacity="${optionen.deckkraft ?? 1}"`;
  const pfade = ziel.pfade.map((d) =>
    `<path d="${d}" fill-rule="evenodd" ${optionen.umriss ? 'vector-effect="non-scaling-stroke"' : ""}/>`).join("");
  return `<g transform="translate(${L.zielX.toFixed(2)} ${(SZ_BODEN - hoehePx).toFixed(2)}) scale(${sc})" ${attr}>${pfade}</g>`;
}

function refGruppe(L) {
  return objektSvg(L.ref, L.refX, SZ_BODEN, L.s, 'fill="#3b82f6"');
}

function bodenLinie() {
  return `<path d="M10 ${SZ_BODEN}H${SZ_B - 10}" stroke="#cbd5e1" stroke-width="3" stroke-linecap="round"/>`;
}

function zeichneRundenSzene(paar, meter) {
  const L = layoutFuer(paar);
  $("gv-szene").innerHTML =
    bodenLinie() + refGruppe(L) +
    masslinie(L.ref, L.ref.m, L.refX, "#2563eb", L.s) +
    zielGruppe(L, meter, "#ef4444") +
    masslinie(L.ziel, meter, L.zielX, "#dc2626", L.s);
}

function formatPlusMinus(verhaeltnis) {
  const p = Math.round((verhaeltnis - 1) * 100);
  return `${p > 0 ? "+" : p < 0 ? "−" : "±"}${Math.abs(p)} %`;
}

function frageText(paar) {
  const z = OBJEKT_NACH_ID[paar.ziel];
  const wort = z.art === "hoch" ? "hoch" : z.art === "lang" ? "lang" : "breit";
  return `Wie ${wort} ist ${z.artikel} ${z.name}?`;
}
function refText(paar) {
  const r = OBJEKT_NACH_ID[paar.ref];
  const artikel = r.artikel.charAt(0).toUpperCase() + r.artikel.slice(1);
  return `${artikel} ${r.name} ist ${formatMeter(r.m)} m ${r.art}.`;
}

// ---- Lebenszyklus ----------------------------------------------------------
export async function starten(uebergebeneApi) {
  api = uebergebeneApi;
  el.wurzel = api.wurzel;
  el.wurzel.innerHTML = VORLAGE;
  bereitSystem = initBereitSystem(api, "gv");
  olympiadeAutoStart = false;

  verdrahteBedienelemente();
  starteListener();

  if (api.istLeiter && !api.raum?.gvStatus) {
    await updateDoc(api.raumRef(), {
      gvStatus: "setup", gvRundenIndex: 0, gvAnzahlRunden: 0, gvAnzahlEntwurf: 0,
      gvRundeStart: 0, gvPaare: []
    });
  }
  tickId = setInterval(tick, 150);
}

function verdrahteBedienelemente() {
  const feld = $("gv-anzahl");
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
  feld.addEventListener("focus", () => { feld.select(); });
  $("gv-starten").addEventListener("click", spielStarten);
  $("gv-regler").addEventListener("input", () => reglerGeaendert(Number($("gv-regler").value)));
  $("gv-minus").addEventListener("click", () => reglerGeaendert(sliderWert - FEIN_SCHRITT));
  $("gv-plus").addEventListener("click", () => reglerGeaendert(sliderWert + FEIN_SCHRITT));
  $("gv-senden").addEventListener("click", () => sendeSchaetzung(false));
  $("gv-weiter").addEventListener("click", weiter);
}

function schreibeAnzahlEntwurfLive() {
  if (!api.istLeiter) return;
  clearTimeout(anzahlEntwurfTimer);
  anzahlEntwurfTimer = setTimeout(() => {
    const wert = parseInt($("gv-anzahl").value, 10);
    if (Number.isFinite(wert) && wert > 0) {
      updateDoc(api.raumRef(), { gvAnzahlEntwurf: wert }).catch(() => {});
    }
  }, 300);
}

function starteListener() {
  antwortenUnsub = onSnapshot(collection(api.db, "raeume", api.code, "gvAntworten"), (snap) => {
    alleAntworten = [];
    snap.forEach((d) => alleAntworten.push(d.data()));
    if (status === "runde_aktiv") aktualisiereStatus();
    if (status === "ausgewertet") zeigeErgebnisInhalt(rundenIndex);
  });
}

export function beenden() {
  bereitSystem = null;
  if (antwortenUnsub) { antwortenUnsub(); antwortenUnsub = null; }
  if (tickId) { clearInterval(tickId); tickId = null; }
  clearTimeout(anzahlEntwurfTimer);
  el = {};
  spielerListe = []; alleAntworten = []; paare = [];
  status = null; rundenIndex = -1; anzahlRunden = 0; anzahlEntwurf = null;
  rundeStart = 0; eigeneAbgegeben = false; sendeLaeuft = false; auswertungLaeuft = false;
  aktuelleRundeKey = null; sliderWert = 500;
}

export function spieler(liste) {
  spielerListe = liste;
  if (!el.wurzel) return;
  if (status === "runde_aktiv") aktualisiereStatus();
  if (status === "ausgewertet" && rundenIndex >= 0) zeigeErgebnisInhalt(rundenIndex);
  if (status === "beendet") zeigeEndstand();
}

export function raumDaten(daten) {
  if (!daten || !el.wurzel) return;
  status = daten.gvStatus ?? null;
  anzahlRunden = daten.gvAnzahlRunden ?? 0;
  anzahlEntwurf = daten.gvAnzahlEntwurf ?? null;
  paare = daten.gvPaare ?? [];
  const neuerIndex = daten.gvRundenIndex ?? 0;
  const neuerStart = daten.gvRundeStart ?? 0;

  if (status === "runde_aktiv") {
    const key = `${neuerIndex}_${neuerStart}`;
    if (key !== aktuelleRundeKey) {
      aktuelleRundeKey = key;
      rundenIndex = neuerIndex;
      rundeStart = neuerStart;
      eigeneAbgegeben = false;
      sendeLaeuft = false;
      auswertungLaeuft = false;
      bereiteRundeVor();
    }
  } else if (status === "ausgewertet") {
    rundenIndex = neuerIndex;
    aktuelleRundeKey = null;
  } else {
    aktuelleRundeKey = null;
  }

  api.fortschritt(
    status === "runde_aktiv" || status === "ausgewertet" ? `${rundenIndex + 1}/${anzahlRunden}` : ""
  );

  alleVerstecken();
  if (status === "setup" || !status) {
    zeigeSetup();
    $("gv-setup").hidden = false;
  } else if (status === "runde_aktiv") {
    $("gv-runde-screen").hidden = false;
    aktualisiereStatus();
  } else if (status === "ausgewertet") {
    zeigeErgebnis(rundenIndex);
    $("gv-ergebnis-screen").hidden = false;
  } else if (status === "beendet") {
    zeigeEndstand();
    $("gv-endstand-screen").hidden = false;
  }
}

function alleVerstecken() {
  ["gv-setup", "gv-runde-screen", "gv-ergebnis-screen", "gv-endstand-screen"]
    .forEach((id) => { $(id).hidden = true; });
}

function zeigeSetup() {
  const anzahlFeld = $("gv-anzahl");
  anzahlFeld.max = MAX_RUNDEN;
  const hinweis = `Bis zu ${MAX_RUNDEN} Runden - Tiere, Bauwerke und Fahrzeuge bunt gemischt.`;
  if (api.olympiadeAnzahl) {
    const festgelegt = Math.min(Math.max(1, api.olympiadeAnzahl), MAX_RUNDEN);
    anzahlFeld.value = String(festgelegt);
    $("gv-anzahl-max").textContent =
      `In der Olympiade festgelegt: ${festgelegt} ${festgelegt === 1 ? "Runde" : "Runden"}.`;
    anzahlFeld.disabled = true;
  } else if (api.istLeiter) {
    if (!anzahlFeld.value) anzahlFeld.value = String(STANDARD_ANZAHL);
    $("gv-anzahl-max").textContent = hinweis;
    anzahlFeld.disabled = false;
  } else {
    anzahlFeld.value = String(anzahlEntwurf ?? STANDARD_ANZAHL);
    $("gv-anzahl-max").textContent = hinweis;
    anzahlFeld.disabled = true;
  }
  $("gv-anzahl-zeile").hidden = false;
  $("gv-starten").hidden = !api.istLeiter;
  $("gv-setup-warten").hidden = api.istLeiter;
  bereitSystem?.render();

  if (api.istLeiter && api.olympiadeAnzahl && !olympiadeAutoStart && bereitSystem?.alleBereit()) {
    olympiadeAutoStart = true;
    spielStarten();
  }
}

async function spielStarten() {
  $("gv-setup-fehler").textContent = "";
  if (spielerListe.length < 1) {
    $("gv-setup-fehler").textContent = "Für den Größenvergleich braucht ihr mindestens einen Spieler.";
    return;
  }
  let anzahl = parseInt($("gv-anzahl").value, 10);
  if (!Number.isFinite(anzahl) || anzahl < 1) anzahl = 1;
  if (anzahl > MAX_RUNDEN) anzahl = MAX_RUNDEN;

  $("gv-starten").disabled = true;
  try {
    await raeumeSpieldatenAuf();
    await updateDoc(api.raumRef(), {
      gvStatus: "runde_aktiv",
      gvRundenIndex: 0,
      gvAnzahlRunden: anzahl,
      gvPaare: erzeugePaare(anzahl),
      gvRundeStart: Date.now()
    });
  } catch (e) {
    zeigeDebug("Fehler beim Start: " + e.message);
  }
  $("gv-starten").disabled = false;
}

async function raeumeSpieldatenAuf() {
  const snap = await getDocs(collection(api.db, "raeume", api.code, "gvAntworten"));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  alleAntworten = [];
  await Promise.all(spielerListe.map((s) => updateDoc(api.spielerRef(s.id), { punkte: 0 })));
}

export async function vorZurueck() {
  try {
    await raeumeSpieldatenAuf();
    await updateDoc(api.raumRef(), {
      gvStatus: null, gvRundenIndex: 0, gvAnzahlRunden: 0, gvAnzahlEntwurf: 0, gvRundeStart: 0, gvPaare: []
    });
    await api.zurueckZurAuswahl();
  } catch (e) {
    zeigeDebug("Fehler beim Zurückkehren: " + e.message);
  }
}

// ---- Runde -----------------------------------------------------------------
function bereiteRundeVor() {
  const paar = paare[rundenIndex];
  if (!paar) return;
  $("gv-frage").textContent = frageText(paar);
  $("gv-regler").disabled = false;
  $("gv-minus").disabled = false;
  $("gv-plus").disabled = false;
  $("gv-senden").disabled = false;
  $("gv-senden").hidden = false;
  sliderWert = paar.start;
  $("gv-regler").value = String(sliderWert);
  zeigeSchaetzung(paar);
  zeichneRundenSzene(paar, meterAusSlider(paar, sliderWert));
  $("gv-status").innerHTML = "";
  aktualisiereTimer();
}

function reglerGeaendert(neu) {
  if (status !== "runde_aktiv" || eigeneAbgegeben) return;
  const paar = paare[rundenIndex];
  if (!paar) return;
  sliderWert = Math.max(0, Math.min(SLIDER_MAX, Math.round(neu)));
  $("gv-regler").value = String(sliderWert);
  zeigeSchaetzung(paar);
  zeichneRundenSzene(paar, meterAusSlider(paar, sliderWert));
}

function zeigeSchaetzung(paar) {
  const m = meterAusSlider(paar, sliderWert);
  $("gv-wert").textContent = `${formatMeter(m)} m`;
}

function restzeitMs() {
  return DAUER_MS - (Date.now() - rundeStart);
}

function aktualisiereTimer() {
  const bar = $("gv-timer");
  if (!bar) return;
  const rest = Math.max(0, restzeitMs());
  bar.firstElementChild.style.width = `${(rest / DAUER_MS) * 100}%`;
  bar.classList.toggle("gv-timer-knapp", rest <= 5000 && rest > 0);
}

function tick() {
  if (!el.wurzel || status !== "runde_aktiv") return;
  aktualisiereTimer();
  if (!eigeneAbgegeben && !sendeLaeuft && restzeitMs() <= 0) sendeSchaetzung(true);
  if (api.istLeiter) pruefeAuswertung();
}

function antwortenDieserRunde(pos) {
  const aktiveIds = new Set(spielerListe.map((s) => s.id));
  return alleAntworten.filter((a) => a.rundenIndex === pos && aktiveIds.has(a.spielerId));
}

function aktualisiereStatus() {
  if (!el.wurzel || status !== "runde_aktiv") return;
  const geantwortet = new Set(antwortenDieserRunde(rundenIndex).map((a) => a.spielerId));
  if (geantwortet.has(api.spielerId)) sperreEingabe();
  const wartende = spielerListe.filter((s) => !geantwortet.has(s.id));
  const box = $("gv-status");
  if (eigeneAbgegeben) {
    box.innerHTML = wartende.length
      ? `<p class="hinweis-text">Abgegeben! Es fehlen noch ${wartende.length} von ${spielerListe.length}.</p>`
      : `<p class="hinweis-text">Alle haben abgegeben …</p>`;
  }
}

function sperreEingabe() {
  eigeneAbgegeben = true;
  $("gv-regler").disabled = true;
  $("gv-minus").disabled = true;
  $("gv-plus").disabled = true;
  $("gv-senden").hidden = true;
}

async function sendeSchaetzung(automatisch) {
  if (status !== "runde_aktiv" || eigeneAbgegeben || sendeLaeuft) return;
  const paar = paare[rundenIndex];
  if (!paar) return;
  sendeLaeuft = true;
  const meter = meterAusSlider(paar, sliderWert);
  sperreEingabe();
  if (automatisch) $("gv-status").innerHTML = `<p class="hinweis-text">Zeit abgelaufen - deine Einstellung wurde abgegeben.</p>`;
  try {
    await setDoc(doc(api.db, "raeume", api.code, "gvAntworten", `${api.spielerId}_${rundenIndex}`), {
      spielerId: api.spielerId,
      spielerName: api.spielerName,
      rundenIndex,
      meter,
      zeitpunkt: serverTimestamp()
    });
  } catch (e) {
    eigeneAbgegeben = false;
    sendeLaeuft = false;
    $("gv-regler").disabled = false;
    $("gv-minus").disabled = false;
    $("gv-plus").disabled = false;
    $("gv-senden").hidden = false;
    zeigeDebug("Fehler beim Senden: " + e.message);
  }
}

// ---- Auswertung ------------------------------------------------------------
function abstandVon(antwort, zielMeter) {
  return antwort.meter == null || !(antwort.meter > 0)
    ? Infinity
    : Math.abs(Math.log(antwort.meter / zielMeter));
}

// Rang-Punkte wie bei Zeitgefühl!: wer am weitesten weg ist, bekommt 0, jeder
// Rang näher dran +1, Gleichstand teilt sich den Wert; die beste Schätzung
// bekommt zusätzlich einen Extrapunkt. Gemessen wird das Verhältnis (Faktor),
// nicht der absolute Meterunterschied - 2 m zu viel bei einer Maus ist etwas
// anderes als 2 m zu viel bei einem Wal.
export function berechnePunkteFuerAntworten(antwortenListe, zielMeter) {
  const sortiert = [...antwortenListe].sort((a, b) => abstandVon(a, zielMeter) - abstandVon(b, zielMeter));
  const ergebnis = {};
  let vorherigerAbstand = null;
  let vorherigeRangpunkte = null;
  const kleinster = sortiert.length ? abstandVon(sortiert[0], zielMeter) : Infinity;
  sortiert.forEach((antwort, i) => {
    const abstand = abstandVon(antwort, zielMeter);
    const rangpunkte = (vorherigerAbstand !== null && abstand === vorherigerAbstand)
      ? vorherigeRangpunkte
      : sortiert.length - 1 - i;
    const bonus = Number.isFinite(kleinster) && abstand === kleinster ? 1 : 0;
    ergebnis[antwort.spielerId] = rangpunkte + bonus;
    vorherigerAbstand = abstand;
    vorherigeRangpunkte = rangpunkte;
  });
  return ergebnis;
}

function zielMeterDerRunde(pos) {
  const paar = paare[pos];
  return paar ? OBJEKT_NACH_ID[paar.ziel].m : 1;
}

function berechneRundenpunkte(pos) {
  return berechnePunkteFuerAntworten(antwortenDieserRunde(pos), zielMeterDerRunde(pos));
}

async function pruefeAuswertung() {
  if (!api.istLeiter || status !== "runde_aktiv" || auswertungLaeuft) return;
  if (spielerListe.length === 0) return;
  const antworten = antwortenDieserRunde(rundenIndex);
  const geantwortetIds = new Set(antworten.map((a) => a.spielerId));
  const fehlend = spielerListe.filter((sp) => !geantwortetIds.has(sp.id));
  const zeitAbgelaufen = Date.now() - rundeStart >= TIMEOUT_SICHERHEIT_MS;
  if (fehlend.length > 0 && !zeitAbgelaufen) return;

  auswertungLaeuft = true;
  try {
    if (fehlend.length > 0) {
      await Promise.all(fehlend.map((sp) =>
        setDoc(doc(api.db, "raeume", api.code, "gvAntworten", `${sp.id}_${rundenIndex}`), {
          spielerId: sp.id, spielerName: sp.name, rundenIndex, meter: null, zeitpunkt: serverTimestamp()
        })
      ));
    }
    const kombiniert = [...antworten, ...fehlend.map((sp) => ({ spielerId: sp.id, meter: null }))];
    const punkte = berechnePunkteFuerAntworten(kombiniert, zielMeterDerRunde(rundenIndex));
    const batch = writeBatch(api.db);
    Object.entries(punkte).forEach(([id, wert]) => {
      batch.update(api.spielerRef(id), { punkte: increment(wert) });
    });
    batch.update(api.raumRef(), { gvStatus: "ausgewertet" });
    await batch.commit();
  } catch (e) {
    zeigeDebug("Fehler bei der Auswertung: " + e.message);
  }
  auswertungLaeuft = false;
}

// ---- Ergebnis --------------------------------------------------------------
function zeigeErgebnis(pos) {
  const paar = paare[pos];
  if (!paar) return;
  const z = OBJEKT_NACH_ID[paar.ziel];
  $("gv-erg-titel").textContent =
    `${z.artikel.charAt(0).toUpperCase() + z.artikel.slice(1)} ${z.name} ist ${formatMeter(z.m)} m ${z.art}.`;
  zeigeErgebnisInhalt(pos);
  $("gv-weiter").hidden = !api.istLeiter;
  $("gv-weiter").textContent = pos + 1 >= anzahlRunden ? "Endstand anzeigen" : "Nächste Runde";
}

function zeigeErgebnisInhalt(pos) {
  if (!el.wurzel) return;
  const paar = paare[pos];
  if (!paar) return;
  const z = OBJEKT_NACH_ID[paar.ziel];
  const antworten = antwortenDieserRunde(pos);
  const punkte = berechneRundenpunkte(pos);

  const L = layoutFuer(paar);
  let svg = bodenLinie() + refGruppe(L) + masslinie(L.ref, L.ref.m, L.refX, "#2563eb", L.s);
  svg += zielGruppe(L, z.m, "#22c55e", { deckkraft: 0.85 });
  svg += masslinie(L.ziel, z.m, L.zielX, "#16a34a", L.s);
  antworten.forEach((a) => {
    if (!(a.meter > 0)) return;
    const s = spielerListe.find((x) => x.id === a.spielerId);
    svg += zielGruppe(L, a.meter, s?.farbe || "#7f8c8d", { umriss: true });
  });
  $("gv-erg-szene").innerHTML = svg;

  const sortiert = [...antworten].sort((a, b) => {
    const d = (punkte[b.spielerId] ?? 0) - (punkte[a.spielerId] ?? 0);
    if (d !== 0) return d;
    return (a.spielerName || "").localeCompare(b.spielerName || "", "de");
  });
  const liste = $("gv-erg-liste");
  liste.innerHTML = "";
  sortiert.forEach((a) => {
    const s = spielerListe.find((x) => x.id === a.spielerId);
    const extra = a.meter > 0
      ? `${formatMeter(a.meter)} m (${formatPlusMinus(a.meter / z.m)})`
      : "Keine Schätzung";
    const li = document.createElement("li");
    li.innerHTML = spielerKarte(a.spielerName, s?.farbe, s?.icon, punkte[a.spielerId] > 0 ? `+${punkte[a.spielerId]}` : "0",
      { extra, punkteRechts: s ? (s.punkte ?? 0) : "?" });
    liste.appendChild(li);
  });
}

async function weiter() {
  $("gv-weiter").disabled = true;
  try {
    const naechster = rundenIndex + 1;
    if (naechster >= anzahlRunden) {
      await updateDoc(api.raumRef(), { gvStatus: "beendet" });
      speichereWertung(api, "groessenvergleich", Object.fromEntries(spielerListe.map((s) => [s.id, s.punkte ?? 0])));
    } else {
      await updateDoc(api.raumRef(), {
        gvStatus: "runde_aktiv",
        gvRundenIndex: naechster,
        gvRundeStart: Date.now()
      });
    }
  } catch (e) {
    zeigeDebug("Fehler beim Weiterschalten: " + e.message);
  }
  $("gv-weiter").disabled = false;
}

function zeigeEndstand() {
  if (!el.wurzel) return;
  const sortiert = [...spielerListe].sort((a, b) => (b.punkte ?? 0) - (a.punkte ?? 0));
  const liste = $("gv-endstand-liste");
  liste.innerHTML = "";
  sortiert.forEach((s, i) => {
    const li = document.createElement("li");
    li.innerHTML = spielerKarte(s.name, s.farbe, s.icon, s.punkte ?? 0, { rang: i + 1 });
    liste.appendChild(li);
  });
  $("gv-endstand-warten").hidden = api.istLeiter;
  const btn = $("gv-gesamtwertung-btn");
  btn.hidden = !(api.istLeiter && Boolean(api.olympiadeAnzahl));
  btn.onclick = () => api.zeigeGesamtwertung();
}
