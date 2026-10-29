// ============================================================================
//  Schnellschuss
// ----------------------------------------------------------------------------
//  Auf jedem Handy gibt es einen großen Knopf. Nach und nach poppt ein Emoji
//  auf. Ist es etwas Gutes (Fußball, Basketball, Pokal ...), tippt man so schnell
//  wie möglich. Ist es etwas Schlechtes (Bombe, Tomate ...), darf man NICHT tippen:
//  wer trotzdem tippt, bekommt einen Minuspunkt.
//  Wertung je gutem Bild: Wer zuerst tippt, bekommt so viele Punkte wie Spieler
//  mitspielen, der Zweite einen weniger usw. Der Letzte bekommt 1 Punkt, wer gar
//  nicht tippt 0.
//  Die Reaktionszeit wird auf jedem Handy selbst gemessen (ab dem Moment, in dem
//  das Bild dort erscheint) - so spielt die Netzlaufzeit keine Rolle.
//  Raumfelder beginnen mit "sk"; Subcollection: skTipp.
// ============================================================================
import {
  doc, setDoc, updateDoc, deleteDoc, collection, getDocs, onSnapshot, writeBatch
} from "../../kern/firebase.js";
import { zeigeDebug, initBereitSystem, spielerKarte } from "../../kern/ui.js";
import { speichereWertungNachPlatz } from "../../kern/wertung.js";

const COUNTDOWN_MS = 3000;       // "Gleich geht's los"
const START_PAUSE_MS = 900;      // Pause nach dem Countdown bis zum ersten Bild
const MAX_BILDER = 40;
const STANDARD_BILDER = 15;
const NACHLAUF_MS = 1800;        // so lange warten wir nach dem letzten Bild auf Tipps
const ABRECHNUNG_MS = 1500;      // ein Bild gilt erst nach dieser Zeit als abgerechnet
const GUT = ["⚽", "🏀", "🎾", "🏈", "🏐", "🏉", "🎱"];
const SCHLECHT = ["💣", "🍅", "💩", "🧨", "☠️", "💥", "🤢"];

function zufall(n) { return Math.floor(Math.random() * n); }
function waehle(liste) { return liste[zufall(liste.length)]; }

// Folge von Bildern: { e: Emoji, gut: bool, gap: Pause davor, dauer: Anzeigedauer }
function erzeugeFolge(anzahl) {
  const folge = [];
  let schlechteHintereinander = 0, letztes = "";
  for (let k = 0; k < anzahl; k++) {
    const tempo = anzahl > 1 ? k / (anzahl - 1) : 0;        // 0 -> 1: wird immer schneller
    let schlecht = k > 0 && schlechteHintereinander < 2 && Math.random() < 0.32;
    let e;
    do { e = waehle(schlecht ? SCHLECHT : GUT); } while (e === letztes);
    letztes = e;
    schlechteHintereinander = schlecht ? schlechteHintereinander + 1 : 0;
    const dauer = Math.round((schlecht ? 1450 : 1750) * (1 - 0.35 * tempo));
    const gap = 450 + zufall(800);
    folge.push({ e, gut: !schlecht, gap, dauer });
  }
  return folge;
}
// Beginn und Ende jedes Bildes, in ms ab dem ersten Bild
function zeitplan(folge) {
  const plan = [];
  let t = 0;
  folge.forEach((b) => {
    t += b.gap;
    plan.push({ von: t, bis: t + b.dauer });
    t += b.dauer;
  });
  return { plan, gesamt: t };
}

const VORLAGE = `
  <div id="sk-setup" class="bildschirm-karte" hidden>
    <p class="hinweis-text">Schnellschuss: Es poppen nacheinander Emojis auf. Bei etwas Gutem (⚽ 🏀 🏈)
      tippt ihr so schnell wie möglich - der Schnellste bekommt die meisten Punkte. Bei etwas Schlechtem
      (💣 🍅 💩) darf niemand tippen, sonst gibt es einen Minuspunkt.</p>
    <div id="sk-einstellungen" hidden>
      <div class="setup-anzahl-zeile">
        <span>Anzahl Bilder</span>
        <span class="anzahl-picker">
          <input id="sk-anzahl" type="text" inputmode="numeric" pattern="[0-9]*" class="anzahl-eingabe">
        </span>
      </div>
      <p id="sk-anzahl-max" class="hinweis-text"></p>
    </div>
    <p id="sk-setup-fehler" class="fehler-text"></p>
    <p><button id="sk-starten" class="btn-primaer" hidden>Spiel starten</button></p>
    <p id="sk-setup-warten" hidden><em>Warte, bis der Spielleiter das Spiel startet …</em></p>
    <div id="sk-bereit-bereich" class="bereit-bereich" hidden></div>
  </div>

  <div id="sk-vorbereitung-screen" class="bildschirm-karte pg-mitte" hidden>
    <p class="kategorie">Schnellschuss</p>
    <p class="pg-vorb-text">Gleich geht's los: <strong>Tippen bei Gutem - Finger weg bei Schlechtem!</strong></p>
    <p class="zg-countdown-ziffer" id="sk-countdown-ziffer"></p>
  </div>

  <div id="sk-spiel-screen" class="bildschirm-karte sk-spiel" hidden>
    <div class="sk-haupt">
      <div class="sk-buehne" id="sk-buehne">
        <div class="sk-emoji" id="sk-emoji" aria-hidden="true"></div>
        <div class="sk-rueck" id="sk-rueck"></div>
      </div>
      <button type="button" id="sk-knopf" class="sk-knopf">TIPPEN</button>
    </div>
    <div class="sk-liste" id="sk-liste"></div>
  </div>

  <div id="sk-endstand-screen" class="bildschirm-karte" hidden>
    <h1>Endstand</h1>
    <ul id="sk-endstand-liste"></ul>
    <p id="sk-endstand-warten" hidden><em>Der Spielleiter wählt gleich das nächste Spiel …</em></p>
    <p><button id="sk-gesamtwertung-btn" class="btn-primaer" type="button" hidden>Gesamtwertung</button></p>
  </div>
`;

let api = null;
let el = {};
let spielerListe = [];
let tippDocs = [];
let tippUnsub = null;
let tickId = null;
let rafId = 0;

let status = null;
let anzahlBilder = 0;
let entwurfAnzahl = STANDARD_BILDER;
let anzahlEntwurfTimer = null;
let folgeJson = "";
let folge = [];
let plan = [];
let gesamtMs = 0;
let startSeit = 0;
let aktuelleKey = "";
let abschlussLaeuft = false;
let bereitSystem = null;
let olympiadeAutoStart = false;

// lokaler Zustand des laufenden Spiels
let angezeigt = -1;           // Index des gerade sichtbaren Bildes (-1 = keins)
let erschienenAm = 0;         // performance.now() beim Erscheinen
let meinTipp = {};            // k -> true (schon getippt)
let rueckTimer = null;
let letzteListeKey = "";
let letzterFortschritt = "";

const $ = (id) => el.wurzel.querySelector("#" + id);
function escapeHtml(t) {
  return String(t ?? "").replace(/[&<>"']/g, (m) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[m]));
}

export async function starten(uebergebeneApi) {
  api = uebergebeneApi;
  el.wurzel = api.wurzel;
  el.wurzel.innerHTML = VORLAGE;
  bereitSystem = initBereitSystem(api, "sk");
  olympiadeAutoStart = false;

  verdrahteBedienelemente();
  tippUnsub = onSnapshot(collection(api.db, "raeume", api.code, "skTipp"), (snap) => {
    const neu = [];
    snap.forEach((d) => neu.push(d.data()));
    tippDocs = neu;
    letzteListeKey = "";
    if (status === "laeuft") zeichneListe();
    if (status === "beendet") zeigeEndstand();
  });

  if (api.istLeiter && !api.raum?.skStatus) {
    await updateDoc(api.raumRef(), {
      skStatus: "setup", skAnzahl: 0, skAnzahlEntwurf: STANDARD_BILDER, skFolge: "", skStartSeit: 0
    });
  }
  tickId = setInterval(tick, 150);
}

function verdrahteBedienelemente() {
  $("sk-anzahl").addEventListener("input", () => {
    const feld = $("sk-anzahl");
    const bereinigt = feld.value.replace(/[^0-9]/g, "");
    if (bereinigt !== feld.value) feld.value = bereinigt;
    schreibeEntwurfLive();
  });
  $("sk-anzahl").addEventListener("change", () => {
    const feld = $("sk-anzahl");
    let wert = parseInt(feld.value, 10);
    if (!Number.isFinite(wert) || wert < 3) wert = 3;
    if (wert > MAX_BILDER) wert = MAX_BILDER;
    feld.value = String(wert);
  });
  $("sk-anzahl").addEventListener("focus", () => { $("sk-anzahl").select(); });
  $("sk-starten").addEventListener("click", spielStarten);
  // pointerdown reagiert schneller als click
  $("sk-knopf").addEventListener("pointerdown", (e) => { e.preventDefault(); tippe(); });
  window.addEventListener("keydown", beiTaste);
}

function beiTaste(e) {
  if (status !== "laeuft" || !el.wurzel || $("sk-spiel-screen").hidden) return;
  if (e.code === "Space" || e.code === "Enter") { e.preventDefault(); if (!e.repeat) tippe(); }
}

function schreibeEntwurfLive() {
  if (!api.istLeiter) return;
  clearTimeout(anzahlEntwurfTimer);
  anzahlEntwurfTimer = setTimeout(() => {
    const wert = parseInt($("sk-anzahl").value, 10);
    if (Number.isFinite(wert) && wert > 0) {
      updateDoc(api.raumRef(), { skAnzahlEntwurf: wert }).catch(() => {});
    }
  }, 300);
}

export function beenden() {
  bereitSystem = null;
  if (tippUnsub) { tippUnsub(); tippUnsub = null; }
  if (tickId) { clearInterval(tickId); tickId = null; }
  cancelAnimationFrame(rafId);
  clearTimeout(rueckTimer);
  clearTimeout(anzahlEntwurfTimer);
  window.removeEventListener("keydown", beiTaste);
  el = {};
  spielerListe = [];
  tippDocs = [];
  status = null;
  anzahlBilder = 0;
  folgeJson = "";
  folge = [];
  plan = [];
  startSeit = 0;
  aktuelleKey = "";
  abschlussLaeuft = false;
  angezeigt = -1;
  meinTipp = {};
  letzteListeKey = "";
  letzterFortschritt = "";
}

export function spieler(liste) {
  spielerListe = liste;
  if (!el.wurzel) return;
  letzteListeKey = "";
  if (status === "setup" || !status) zeigeSetup();
  if (status === "laeuft") zeichneListe();
  if (status === "beendet") zeigeEndstand();
}

export function raumDaten(daten) {
  if (!daten || !el.wurzel) return;
  status = daten.skStatus ?? null;
  anzahlBilder = daten.skAnzahl ?? 0;
  entwurfAnzahl = daten.skAnzahlEntwurf ?? STANDARD_BILDER;

  const json = daten.skFolge ?? "";
  if (json !== folgeJson) {
    folgeJson = json;
    try { folge = json ? JSON.parse(json) : []; } catch { folge = []; }
    const z = zeitplan(folge);
    plan = z.plan;
    gesamtMs = z.gesamt;
  }

  if (status === "laeuft") {
    const neuerStart = daten.skStartSeit ?? 0;
    const key = String(neuerStart);
    if (key !== aktuelleKey) {
      aktuelleKey = key;
      startSeit = neuerStart;
      abschlussLaeuft = false;
      angezeigt = -1;
      meinTipp = {};
      letzterFortschritt = "";
      letzteListeKey = "";
    }
  }

  api.fortschritt(status === "laeuft" ? letzterFortschritt : "");

  alleVerstecken();
  if (status === "setup" || !status) {
    zeigeSetup();
    $("sk-setup").hidden = false;
  } else if (status === "laeuft") {
    tick();
  } else if (status === "beendet") {
    zeigeEndstand();
    $("sk-endstand-screen").hidden = false;
  }
}

function alleVerstecken() {
  ["sk-setup", "sk-vorbereitung-screen", "sk-spiel-screen", "sk-endstand-screen"]
    .forEach((id) => { $(id).hidden = true; });
}

function zeigeSetup() {
  const anzahlFeld = $("sk-anzahl");
  if (api.olympiadeAnzahl) {
    const festgelegt = Math.min(Math.max(3, api.olympiadeAnzahl * 5), MAX_BILDER);
    anzahlFeld.value = String(festgelegt);
    $("sk-anzahl-max").textContent = `In der Olympiade festgelegt: ${festgelegt} Bilder.`;
    anzahlFeld.disabled = true;
  } else if (api.istLeiter) {
    if (!anzahlFeld.value) anzahlFeld.value = String(STANDARD_BILDER);
    $("sk-anzahl-max").textContent = `Zwischen 3 und ${MAX_BILDER} Bildern, etwa ein Drittel davon schlecht.`;
    anzahlFeld.disabled = false;
  } else {
    anzahlFeld.value = String(entwurfAnzahl);
    $("sk-anzahl-max").textContent = `Zwischen 3 und ${MAX_BILDER} Bildern.`;
    anzahlFeld.disabled = true;
  }
  $("sk-einstellungen").hidden = false;
  $("sk-starten").hidden = !api.istLeiter;
  $("sk-setup-warten").hidden = api.istLeiter;
  bereitSystem?.render();

  if (api.istLeiter && api.olympiadeAnzahl && !olympiadeAutoStart && bereitSystem?.alleBereit()) {
    olympiadeAutoStart = true;
    spielStarten();
  }
}

async function spielStarten() {
  $("sk-setup-fehler").textContent = "";
  if (spielerListe.length < 2) {
    $("sk-setup-fehler").textContent = "Für Schnellschuss braucht ihr mindestens 2 Spieler.";
    return;
  }
  if (spielerListe.length > 10) {
    $("sk-setup-fehler").textContent = "Schnellschuss geht mit höchstens 10 Spielern.";
    return;
  }
  let anzahl = parseInt($("sk-anzahl").value, 10);
  if (!Number.isFinite(anzahl) || anzahl < 3) anzahl = 3;
  if (anzahl > MAX_BILDER) anzahl = MAX_BILDER;

  $("sk-starten").disabled = true;
  try {
    await raeumeSpieldatenAuf();
    await updateDoc(api.raumRef(), {
      skStatus: "laeuft",
      skAnzahl: anzahl,
      skFolge: JSON.stringify(erzeugeFolge(anzahl)),
      skStartSeit: Date.now()
    });
  } catch (e) {
    zeigeDebug("Fehler beim Start: " + e.message);
  }
  $("sk-starten").disabled = false;
}

async function raeumeSpieldatenAuf() {
  const snap = await getDocs(collection(api.db, "raeume", api.code, "skTipp"));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  tippDocs = [];
  await Promise.all(spielerListe.map((s) => updateDoc(api.spielerRef(s.id), { punkte: 0 })));
}

export async function vorZurueck() {
  try {
    await raeumeSpieldatenAuf();
    await updateDoc(api.raumRef(), { skStatus: null, skAnzahl: 0, skFolge: "", skStartSeit: 0 });
    await api.zurueckZurAuswahl();
  } catch (e) {
    zeigeDebug("Fehler beim Zurückkehren: " + e.message);
  }
}

// ------------------------------------------------------------------ Wertung
// Punkte je Bild: gut -> Rang nach Reaktionszeit (N, N-1, ... 1); schlecht -> -1 je Tipp.
function punkteBerechnen(nurAbgerechnete, jetztRel) {
  const ids = spielerListe.map((s) => s.id);
  const n = ids.length;
  const summe = Object.fromEntries(ids.map((id) => [id, 0]));
  const nachBild = new Map();
  tippDocs.forEach((t) => {
    if (!summe.hasOwnProperty(t.spielerId)) return;
    if (!nachBild.has(t.k)) nachBild.set(t.k, []);
    nachBild.get(t.k).push(t);
  });
  nachBild.forEach((tipps, k) => {
    const b = folge[k];
    if (!b) return;
    if (nurAbgerechnete && !(plan[k] && jetztRel >= plan[k].bis + ABRECHNUNG_MS)) return;
    if (b.gut) {
      [...tipps].sort((a, c) => a.ms - c.ms || (a.spielerId < c.spielerId ? -1 : 1))
        .forEach((t, i) => { summe[t.spielerId] += Math.max(1, n - i); });
    } else {
      tipps.forEach((t) => { summe[t.spielerId] -= 1; });
    }
  });
  return summe;
}

// ---------------------------------------------------------------- Ablauf
function relZeit() { return Date.now() - startSeit - COUNTDOWN_MS - START_PAUSE_MS; }

function tick() {
  if (!el.wurzel || status !== "laeuft") return;
  const elapsed = Date.now() - startSeit;
  if (elapsed < COUNTDOWN_MS) {
    $("sk-spiel-screen").hidden = true;
    $("sk-vorbereitung-screen").hidden = false;
    const schritt = Math.min(2, Math.floor(elapsed / (COUNTDOWN_MS / 3)));
    $("sk-countdown-ziffer").textContent = ["3", "2", "1"][schritt];
    return;
  }
  $("sk-vorbereitung-screen").hidden = true;
  if ($("sk-spiel-screen").hidden) {
    $("sk-spiel-screen").hidden = false;
    cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(schleife);
  }
  if (api.istLeiter) leiterTick(relZeit());
}

async function leiterTick(t) {
  if (!api.istLeiter || status !== "laeuft" || abschlussLaeuft || !plan.length) return;
  if (t < gesamtMs + NACHLAUF_MS) return;
  abschlussLaeuft = true;
  try {
    const punkte = punkteBerechnen(false, 0);
    const batch = writeBatch(api.db);
    Object.entries(punkte).forEach(([id, wert]) => { batch.update(api.spielerRef(id), { punkte: wert }); });
    batch.update(api.raumRef(), { skStatus: "beendet" });
    await batch.commit();
    speichereWertungNachPlatz(api, "schnellschuss", punkte);
  } catch (e) {
    zeigeDebug("Fehler bei der Auswertung: " + e.message);
    abschlussLaeuft = false;
  }
}

// ---------------------------------------------------------------- Anzeige
function schleife() {
  rafId = requestAnimationFrame(schleife);
  if (!el.wurzel || status !== "laeuft") return;
  const t = relZeit();
  let k = -1;
  if (t >= 0) {
    for (let i = 0; i < plan.length; i++) {
      if (t >= plan[i].von && t < plan[i].bis) { k = i; break; }
      if (t < plan[i].von) break;
    }
  }
  if (k !== angezeigt) {
    angezeigt = k;
    const emoji = $("sk-emoji");
    if (k >= 0) {
      emoji.textContent = folge[k].e;
      emoji.classList.remove("an");
      void emoji.offsetWidth;                // Animation neu starten
      emoji.classList.add("an");
      erschienenAm = performance.now();
      clearTimeout(rueckTimer);
      $("sk-rueck").textContent = "";
    } else {
      emoji.textContent = "";
      emoji.classList.remove("an");
    }
    // Fortschritt = zuletzt gezeigtes Bild
    if (k >= 0) {
      const f = `${k + 1}/${folge.length}`;
      if (f !== letzterFortschritt) { letzterFortschritt = f; api.fortschritt(f); }
    }
  }
  if (!letzteListeKey) zeichneListe();
}

async function tippe() {
  if (!el.wurzel || status !== "laeuft" || angezeigt < 0) return;
  const k = angezeigt;
  if (meinTipp[k]) return;
  meinTipp[k] = true;
  const ms = Math.max(1, Math.round(performance.now() - erschienenAm));
  const b = folge[k];
  const rueck = $("sk-rueck");
  rueck.className = "sk-rueck " + (b.gut ? "gut" : "schlecht");
  rueck.textContent = b.gut ? `${(ms / 1000).toFixed(2).replace(".", ",")} s` : "−1";
  $("sk-knopf").classList.add("gedrueckt");
  setTimeout(() => { const kn = $("sk-knopf"); kn?.classList.remove("gedrueckt"); kn?.blur(); }, 140);
  if (navigator.vibrate) navigator.vibrate(b.gut ? 15 : [40, 30, 40]);
  try {
    await setDoc(doc(api.db, "raeume", api.code, "skTipp", `${k}_${api.spielerId}`),
      { k, spielerId: api.spielerId, ms });
  } catch (e) {
    zeigeDebug("Fehler beim Tippen: " + e.message);
  }
}

function zeichneListe() {
  if (!el.wurzel) return;
  const punkte = punkteBerechnen(true, relZeit());
  const reihe = [...spielerListe].sort((a, b) =>
    (punkte[b.id] ?? 0) - (punkte[a.id] ?? 0) || a.name.localeCompare(b.name));
  const key = reihe.map((s) => s.id + ":" + punkte[s.id]).join("|");
  if (key === letzteListeKey) return;
  letzteListeKey = key;
  $("sk-liste").innerHTML = reihe.map((s, i) => `
    <div class="sk-zeile${s.id === api.spielerId ? " ich" : ""}" style="--chip:${s.farbe || "#7c3aed"}">
      <span class="sk-platz">${i + 1}</span>
      <span class="sk-name">${escapeHtml(s.name)}</span>
      <span class="sk-pkt">${punkte[s.id] ?? 0}</span>
    </div>`).join("");
}

function zeigeEndstand() {
  if (!el.wurzel) return;
  const sortiert = [...spielerListe].sort((a, b) => (b.punkte ?? 0) - (a.punkte ?? 0));
  const liste = $("sk-endstand-liste");
  liste.innerHTML = "";
  sortiert.forEach((s, i) => {
    const li = document.createElement("li");
    li.innerHTML = spielerKarte(s.name, s.farbe, s.icon, s.punkte ?? 0, { rang: i + 1 });
    liste.appendChild(li);
  });
  $("sk-endstand-warten").hidden = api.istLeiter;
  const btn = $("sk-gesamtwertung-btn");
  if (btn) {
    btn.hidden = !(api.istLeiter && Boolean(api.olympiadeAnzahl));
    btn.onclick = () => api.zeigeGesamtwertung();
  }
}
