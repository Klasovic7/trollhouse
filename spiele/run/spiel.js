// ============================================================================
//  Run
// ----------------------------------------------------------------------------
//  Alle rennen gleichzeitig auf derselben Strecke (gleicher Zufalls-Seed, jedes
//  Handy simuliert seinen eigenen Lauf). Drei Spuren: links/rechts wischen =
//  Spur wechseln, hoch = springen, runter = rutschen. Niedrige Hindernisse
//  überspringt man, hohe Tore unterrutscht man, Blöcke umläuft man.
//  Die Strecke ist endlos und wird mit der Zeit schneller. Eine Runde endet, wenn
//  alle gestürzt sind. Wertung je Runde: wer am weitesten kommt 
//  bekommt die meisten Punkte, der Nächste einen weniger usw. (gleiche
//  Platzierung teilt sich den Wert).
//  Raumfelder beginnen mit "run"; der Lauf-Stand jedes Spielers liegt in der
//  Subcollection "runStand" (Dokument {spielerId}_{runde}), wird beim Laufen
//  etwa einmal pro Sekunde aktualisiert und am Ende endgültig geschrieben.
// ============================================================================
import {
  doc, setDoc, updateDoc, deleteDoc, collection, getDocs, onSnapshot,
  serverTimestamp, increment, writeBatch
} from "../../kern/firebase.js";
import { spielerKarte, zeigeDebug, initBereitSystem, renderWarteAvatare, avatarBild, avatarHtml, escapeHtml } from "../../kern/ui.js";
import { speichereWertung, punkteFuerRang } from "../../kern/wertung.js";

const COUNTDOWN_MS = 3000;
const MAX_RUNDEN = 10;
const STANDARD_RUNDEN = 3;
const LEBEN_OPTIONEN = [1, 3];
const STANDARD_LEBEN = 3;
const MAX_RUNDE_MS = 15 * 60 * 1000;   // Sicherheitsgrenze, falls jemand ewig durchhält oder verschwindet
const SCHREIB_MS = 1000;

// Spielphysik (Meter / Sekunden)
const SPUR_BREITE = 1.6;
const BASIS_TEMPO = 12;
const SPRUNG_V = 6.6;
const SCHWERKRAFT = 19;
const RUTSCH_S = 0.65;
const UNVERWUNDBAR_S = 1.5;
const KAMERA_ABSTAND = 3.4;     // Kamera hinter der Figur
const SICHT_WEITE = 62;
const TIEFE = { 1: 0.5, 2: 0.35, 3: 1.6 };   // Tiefe der Hindernisse (1 niedrig, 2 Tor, 3 Block)

const VORLAGE = `
  <div id="run-setup" class="bildschirm-karte" hidden>
    <p class="hinweis-text">Alle laufen gleichzeitig auf derselben Strecke. Wischen: links/rechts = Spur wechseln,
      hoch = springen, runter = rutschen. Niedrige Hürden überspringt man, hohe Tore unterrutscht man,
      Blöcke umläuft man. Die Strecke ist endlos und wird immer schneller - wer am weitesten kommt, bekommt die meisten Punkte.</p>

    <div id="run-einstellungen" hidden>
      <div class="setup-anzahl-zeile">
        <span>Anzahl Runden</span>
        <span class="anzahl-picker">
          <input id="run-anzahl" type="text" inputmode="numeric" pattern="[0-9]*" class="anzahl-eingabe">
        </span>
      </div>
      <p id="run-anzahl-max" class="hinweis-text"></p>

      <div class="pg-opt-block">
        <span class="pg-opt-titel">Leben</span>
        <div id="run-leben-opt" class="pg-opt"></div>
      </div>
    </div>

    <p id="run-setup-fehler" class="fehler-text"></p>
    <p><button id="run-starten" class="btn-primaer" hidden>Spiel starten</button></p>
    <p id="run-setup-warten" hidden><em>Warte, bis der Spielleiter das Spiel startet …</em></p>
    <div id="run-bereit-bereich" class="bereit-bereich" hidden></div>
  </div>

  <div id="run-vorbereitung-screen" class="bildschirm-karte pg-mitte" hidden>
    <p class="kategorie">Run</p>
    <p class="pg-vorb-text">Gleich geht's los - macht euch bereit!</p>
    <p class="zg-countdown-ziffer" id="run-countdown-ziffer"></p>
  </div>

  <div id="run-spiel-screen" class="run-spiel" hidden>
    <div class="run-hud">
      <span id="run-hud-dist" class="run-hud-wert">0 m</span>
      <span id="run-hud-leben" class="run-hud-leben"></span>
    </div>
    <div id="run-canvas-wrap" class="run-canvas-wrap">
      <canvas id="run-canvas"></canvas>
      <div id="run-overlay" class="run-overlay" hidden></div>
    </div>
    <div id="run-spuren" class="run-spuren"></div>
    <p id="run-hinweis" class="hinweis-text run-hinweis"></p>
    <div id="run-status" class="warten-block"></div>
  </div>

  <div id="run-ergebnis-screen" class="bildschirm-karte" hidden>
    <p class="kategorie">Run</p>
    <h2 id="run-erg-titel"></h2>
    <ul id="run-erg-liste"></ul>
    <p><button id="run-weiter" hidden>Weiter</button></p>
  </div>

  <div id="run-endstand-screen" class="bildschirm-karte" hidden>
    <h1>Endstand</h1>
    <ul id="run-endstand-liste"></ul>
    <p id="run-endstand-warten" hidden><em>Der Spielleiter wählt gleich das nächste Spiel …</em></p>
    <p><button id="run-gesamtwertung-btn" class="btn-primaer" type="button" hidden>Gesamtwertung</button></p>
  </div>
`;

let api = null;
let el = {};
let spielerListe = [];
let staende = [];              // alle runStand-Dokumente
let standUnsub = null;
let tickId = null;
let status = null;
let rundenIndex = -1;
let anzahlRunden = 0;
let entwurf = { runden: STANDARD_RUNDEN, leben: STANDARD_LEBEN };
let anzahlEntwurfTimer = null;
let einstellungen = { leben: STANDARD_LEBEN };
let seed = 0;
let vorbereitungSeit = 0;
let auswertungLaeuft = false;
let aktuelleRundeKey = "";
let lauf = null;               // lokaler Zustand der laufenden Runde
let bereitSystem = null;
let olympiadeAutoStart = false;

const $ = (id) => el.wurzel.querySelector("#" + id);

// ---------------------------------------------------------------- Zufall / Strecke
function zufallsgenerator(s) {
  let a = s >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Streckenzeilen: { d (Meter), t: [typ links, mitte, rechts] } mit typ 0 frei, 1 niedrig, 2 Tor, 3 Block.
// Jede Zeile ist lösbar: es gibt immer eine freie Spur - oder alle drei Spuren sind
// dasselbe überwindbare Hindernis (niedrig: springen, Tor: rutschen).
function tempoBei(dist) {
  return BASIS_TEMPO + dist * 0.0048;   // wird stetig schneller, ohne Obergrenze
}

function baueStrecke(startwert) {
  const rnd = zufallsgenerator(startwert);
  const zeilen = [];
  const muenzen = [];
  let d = 32;
  const strecke = {
    zeilen, muenzen,
    // erzeugt weitere Zeilen, bis die Strecke mindestens bis "bis" Meter reicht
    erweitere(bis) {
      while (d < bis) {
        // Abstand in Metern wächst mit dem Tempo, damit die Reaktionszeit nicht unter ~0,62 s fällt
        const abstand = Math.max(9, tempoBei(d) * Math.max(0.62, 1.35 - d / 1500));
        let t;
        const r = rnd();
        if (r < 0.14) t = [1, 1, 1];
        else if (r < 0.24) t = [2, 2, 2];
        else {
          const gewichte = [0.2, 0.25, 0.2, 0.35];
          t = [0, 0, 0].map(() => {
            let x = rnd(), k = 0;
            while (k < 3 && x > gewichte[k]) { x -= gewichte[k]; k++; }
            return k;
          });
          if (t.every((v) => v !== 0)) {
            const uneinheitlich = t.includes(3) || new Set(t).size > 1;
            if (uneinheitlich) t[Math.floor(rnd() * 3)] = 0;
          }
          if (t.every((v) => v === 0)) t[Math.floor(rnd() * 3)] = rnd() < 0.5 ? 3 : 1;
        }
        zeilen.push({ d, t, getroffen: [false, false, false] });
        d += abstand;
      }
    }
  };
  strecke.erweitere(SICHT_WEITE + 60);
  return strecke;
}

// ---------------------------------------------------------------- Lebenszyklus
export async function starten(uebergebeneApi) {
  api = uebergebeneApi;
  el.wurzel = api.wurzel;
  el.wurzel.innerHTML = VORLAGE;
  bereitSystem = initBereitSystem(api, "run");
  olympiadeAutoStart = false;

  verdrahteBedienelemente();
  starteListener();

  if (api.istLeiter && !api.raum?.runStatus) {
    await updateDoc(api.raumRef(), {
      runStatus: "setup", runRundenIndex: 0, runAnzahlRunden: 0, runAnzahlEntwurf: STANDARD_RUNDEN,
      runLebenEntwurf: STANDARD_LEBEN, runLeben: STANDARD_LEBEN, runSeed: 0, runVorbereitungSeit: 0
    });
  }
  tickId = setInterval(rundenTick, 150);
}

function verdrahteBedienelemente() {
  $("run-anzahl").addEventListener("input", () => {
    const feld = $("run-anzahl");
    const bereinigt = feld.value.replace(/[^0-9]/g, "");
    if (bereinigt !== feld.value) feld.value = bereinigt;
    schreibeEntwurfLive();
  });
  $("run-anzahl").addEventListener("change", () => {
    const feld = $("run-anzahl");
    let wert = parseInt(feld.value, 10);
    if (!Number.isFinite(wert) || wert < 1) wert = 1;
    if (wert > MAX_RUNDEN) wert = MAX_RUNDEN;
    feld.value = String(wert);
  });
  $("run-anzahl").addEventListener("focus", () => { $("run-anzahl").select(); });
  $("run-starten").addEventListener("click", spielStarten);
  $("run-weiter").addEventListener("click", weiter);

  const baueOpt = (id, werte, label, feldName) => {
    const box = $(id);
    box.innerHTML = "";
    werte.forEach((w) => {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.wert = String(w.wert ?? w);
      b.textContent = label(w);
      b.addEventListener("click", () => {
        if (!api.istLeiter) return;
        entwurf[feldName] = w.wert ?? w;
        zeichneOptionen();
        updateDoc(api.raumRef(), {
          runLebenEntwurf: entwurf.leben
        }).catch(() => {});
      });
      box.appendChild(b);
    });
  };
  baueOpt("run-leben-opt", LEBEN_OPTIONEN, (w) => (w === 1 ? "1 Leben" : `${w} Leben`), "leben");
}

function zeichneOptionen() {
  [["run-leben-opt", entwurf.leben]].forEach(([id, wert]) => {
    $(id).querySelectorAll("button").forEach((b) => {
      b.classList.toggle("aktiv", Number(b.dataset.wert) === wert);
      b.disabled = !api.istLeiter;
    });
  });
}

function schreibeEntwurfLive() {
  if (!api.istLeiter) return;
  clearTimeout(anzahlEntwurfTimer);
  anzahlEntwurfTimer = setTimeout(() => {
    const wert = parseInt($("run-anzahl").value, 10);
    if (Number.isFinite(wert) && wert > 0) {
      updateDoc(api.raumRef(), { runAnzahlEntwurf: wert }).catch(() => {});
    }
  }, 300);
}

function starteListener() {
  standUnsub = onSnapshot(collection(api.db, "raeume", api.code, "runStand"), (snap) => {
    staende = [];
    snap.forEach((d) => staende.push(d.data()));
    if (status === "runde_aktiv") aktualisiereStatus();
    if (status === "ausgewertet") zeigeErgebnisListe(rundenIndex);
  });
}

export function beenden() {
  bereitSystem = null;
  if (standUnsub) { standUnsub(); standUnsub = null; }
  if (tickId) { clearInterval(tickId); tickId = null; }
  if (lauf) { lauf.abbauen(); lauf = null; }
  clearTimeout(anzahlEntwurfTimer);
  el = {};
  spielerListe = [];
  staende = [];
  status = null;
  rundenIndex = -1;
  anzahlRunden = 0;
  seed = 0;
  vorbereitungSeit = 0;
  auswertungLaeuft = false;
  aktuelleRundeKey = "";
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
  status = daten.runStatus ?? null;
  anzahlRunden = daten.runAnzahlRunden ?? 0;
  entwurf = {
    runden: daten.runAnzahlEntwurf ?? STANDARD_RUNDEN,
    leben: daten.runLebenEntwurf ?? STANDARD_LEBEN
  };
  einstellungen = { leben: daten.runLeben ?? STANDARD_LEBEN };
  seed = daten.runSeed ?? 0;

  const neuerIndex = daten.runRundenIndex ?? 0;
  const neuerStart = daten.runVorbereitungSeit ?? 0;
  if (status === "runde_aktiv") {
    const key = neuerIndex + ":" + neuerStart;
    if (key !== aktuelleRundeKey) {
      aktuelleRundeKey = key;
      rundenIndex = neuerIndex;
      vorbereitungSeit = neuerStart;
      auswertungLaeuft = false;
      if (lauf) { lauf.abbauen(); lauf = null; }
      $("run-overlay").hidden = true;
    }
  } else if (status === "ausgewertet") {
    rundenIndex = neuerIndex;
  }

  api.fortschritt(
    status === "runde_aktiv" || status === "ausgewertet" ? `${rundenIndex + 1}/${anzahlRunden}` : ""
  );

  alleVerstecken();
  if (status === "setup" || !status) {
    zeigeSetup();
    $("run-setup").hidden = false;
  } else if (status === "runde_aktiv") {
    rundenTick();
  } else if (status === "ausgewertet") {
    zeigeErgebnis(rundenIndex);
    $("run-ergebnis-screen").hidden = false;
  } else if (status === "beendet") {
    zeigeEndstand();
    $("run-endstand-screen").hidden = false;
  }
}

function alleVerstecken() {
  ["run-setup", "run-vorbereitung-screen", "run-spiel-screen", "run-ergebnis-screen", "run-endstand-screen"]
    .forEach((id) => { $(id).hidden = true; });
}

function zeigeSetup() {
  const anzahlFeld = $("run-anzahl");
  const inOlympiade = Boolean(api.olympiadeAnzahl);
  if (inOlympiade) {
    const festgelegt = Math.min(Math.max(1, api.olympiadeAnzahl), MAX_RUNDEN);
    anzahlFeld.value = String(festgelegt);
    $("run-anzahl-max").textContent =
      `In der Olympiade festgelegt: ${festgelegt} ${festgelegt === 1 ? "Runde" : "Runden"}.`;
    anzahlFeld.disabled = true;
  } else if (api.istLeiter) {
    if (!anzahlFeld.value) anzahlFeld.value = String(STANDARD_RUNDEN);
    $("run-anzahl-max").textContent = `Bis zu ${MAX_RUNDEN} Runden.`;
    anzahlFeld.disabled = false;
  } else {
    anzahlFeld.value = String(entwurf.runden);
    $("run-anzahl-max").textContent = `Bis zu ${MAX_RUNDEN} Runden.`;
    anzahlFeld.disabled = true;
  }
  zeichneOptionen();
  $("run-einstellungen").hidden = false;
  $("run-starten").hidden = !api.istLeiter;
  $("run-setup-warten").hidden = api.istLeiter;
  bereitSystem?.render();

  if (api.istLeiter && api.olympiadeAnzahl && !olympiadeAutoStart && bereitSystem?.alleBereit()) {
    olympiadeAutoStart = true;
    spielStarten();
  }
}

async function spielStarten() {
  $("run-setup-fehler").textContent = "";
  if (spielerListe.length < 1) {
    $("run-setup-fehler").textContent = "Für Run braucht ihr mindestens einen Spieler.";
    return;
  }
  let anzahl = parseInt($("run-anzahl").value, 10);
  if (!Number.isFinite(anzahl) || anzahl < 1) anzahl = 1;
  if (anzahl > MAX_RUNDEN) anzahl = MAX_RUNDEN;

  $("run-starten").disabled = true;
  try {
    await raeumeSpieldatenAuf();
    await updateDoc(api.raumRef(), {
      runStatus: "runde_aktiv",
      runRundenIndex: 0,
      runAnzahlRunden: anzahl,
      runLeben: entwurf.leben,
      runSeed: Math.floor(Math.random() * 2147483647),
      runVorbereitungSeit: Date.now()
    });
  } catch (e) {
    zeigeDebug("Fehler beim Start: " + e.message);
  }
  $("run-starten").disabled = false;
}

async function raeumeSpieldatenAuf() {
  const snap = await getDocs(collection(api.db, "raeume", api.code, "runStand"));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  staende = [];
  await Promise.all(spielerListe.map((s) => updateDoc(api.spielerRef(s.id), { punkte: 0 })));
}

export async function vorZurueck() {
  try {
    await raeumeSpieldatenAuf();
    await updateDoc(api.raumRef(), {
      runStatus: null, runRundenIndex: 0, runAnzahlRunden: 0, runSeed: 0, runVorbereitungSeit: 0
    });
    await api.zurueckZurAuswahl();
  } catch (e) {
    zeigeDebug("Fehler beim Zurückkehren: " + e.message);
  }
}

// ---------------------------------------------------------------- Rundenablauf
function staendeDieserRunde(pos) {
  const aktiveIds = new Set(spielerListe.map((s) => s.id));
  return staende.filter((a) => a.rundenIndex === pos && aktiveIds.has(a.spielerId));
}

// Eigenen lokalen Stand (aktueller als Firestore) in die Liste einmischen
function staendeMitLokal(pos) {
  const liste = staendeDieserRunde(pos).filter((a) => a.spielerId !== api.spielerId);
  if (lauf && pos === rundenIndex) liste.push(lauf.stand());
  else {
    const ich = staende.find((a) => a.spielerId === api.spielerId && a.rundenIndex === pos);
    if (ich) liste.push(ich);
  }
  return liste;
}

function rundenTick() {
  if (!el.wurzel || status !== "runde_aktiv") return;
  const elapsedGesamt = Date.now() - vorbereitungSeit;

  if (elapsedGesamt < COUNTDOWN_MS) {
    $("run-spiel-screen").hidden = true;
    $("run-vorbereitung-screen").hidden = false;
    const schritt = Math.min(2, Math.floor(elapsedGesamt / (COUNTDOWN_MS / 3)));
    $("run-countdown-ziffer").textContent = ["3", "2", "1"][schritt];
  } else {
    $("run-vorbereitung-screen").hidden = true;
    $("run-spiel-screen").hidden = false;
    if (!lauf) starteLauf();
    aktualisiereStatus();
  }
  if (api.istLeiter) pruefeAuswertung(elapsedGesamt);
}

function eigenFertig() {
  if (lauf) return lauf.fertig();
  return staende.some((a) => a.spielerId === api.spielerId && a.rundenIndex === rundenIndex && a.fertig);
}

function aktualisiereStatus() {
  if (!el.wurzel || !el.wurzel.isConnected) return;
  zeichneSpuren();
  const fertigIds = new Set(staendeMitLokal(rundenIndex).filter((a) => a.fertig).map((a) => a.spielerId));
  const o = $("run-overlay");
  if (lauf && lauf.fertig()) {
    const s = lauf.stand();
    o.hidden = false;
    o.classList.add("run-overlay-schlecht");
    o.textContent = `💥 Gestürzt bei ${s.dist} m`;
    $("run-hinweis").textContent = "Warte auf die anderen …";
  } else {
    o.hidden = true;
  }
  renderWarteAvatare($("run-status"),
    lauf && lauf.fertig() ? spielerListe.filter((sp) => !fertigIds.has(sp.id) && sp.id !== api.spielerId) : []);
}

// Nur die Köpfe (Profilbilder) der anderen; wer gestürzt ist, wird blass und rot durchgestrichen.
function zeichneSpuren() {
  const box = $("run-spuren");
  const andere = spielerListe.filter((sp) => sp.id !== api.spielerId);
  const key = andere.map((sp) => sp.id + (sp.icon || "")).join("|");
  if (box.dataset.key !== key) {
    box.dataset.key = key;
    box.innerHTML = andere.map((sp) =>
      `<span class="run-gegner" data-id="${escapeHtml(sp.id)}" title="${escapeHtml(sp.name || "")}" ` +
      `style="--spieler-farbe:${escapeHtml(sp.farbe || "#94a3b8")}">${avatarHtml(sp.icon, "run-gegner-bild")}</span>`
    ).join("");
  }
  box.hidden = andere.length === 0;
  const stand = staendeMitLokal(rundenIndex);
  box.querySelectorAll(".run-gegner").forEach((n) => {
    const a = stand.find((x) => x.spielerId === n.dataset.id);
    n.classList.toggle("run-gegner-aus", Boolean(a && a.fertig));
  });
}

// Schreibt den Stand des eigenen Laufs (live oder endgültig)
async function schreibeStand(endgueltig) {
  if (!lauf || status !== "runde_aktiv") return;
  const s = lauf.stand();
  const key = `${api.spielerId}_${rundenIndex}`;
  // lokal sofort, damit die Anzeige nicht auf Firestore wartet
  staende = staende.filter((a) => !(a.spielerId === api.spielerId && a.rundenIndex === rundenIndex));
  staende.push(s);
  try {
    await setDoc(doc(api.db, "raeume", api.code, "runStand", key), { ...s, zeitpunkt: serverTimestamp() });
  } catch (e) {
    if (endgueltig) zeigeDebug("Fehler beim Melden: " + e.message);
  }
}

function vergleiche(a, b) {
  if (b.dist !== a.dist) return b.dist - a.dist;
  return 0;
}

// Rangpunkte: bester Lauf bekommt n (Anzahl Spieler), danach je einen weniger;
// gleiche Ergebnisse teilen sich den Wert.
function berechnePunkte(standListe, spielerIds) {
  // Wer gar kein Ergebnis gemeldet hat (nicht gelaufen), bekommt 0 Punkte.
  const proSpieler = spielerIds.map((id) => standListe.find((a) => a.spielerId === id)).filter(Boolean);
  const sortiert = [...proSpieler].sort(vergleiche);
  const n = spielerIds.length;
  const ergebnis = {};
  spielerIds.forEach((id) => { ergebnis[id] = 0; });
  let vorher = null, vorherPunkte = null;
  sortiert.forEach((a, i) => {
    const punkte = (vorher && vergleiche(a, vorher) === 0) ? vorherPunkte : punkteFuerRang(i + 1, n);
    ergebnis[a.spielerId] = punkte;
    vorher = a; vorherPunkte = punkte;
  });
  return ergebnis;
}

async function pruefeAuswertung(elapsedGesamt) {
  if (!api.istLeiter || status !== "runde_aktiv" || auswertungLaeuft) return;
  if (elapsedGesamt < COUNTDOWN_MS || spielerListe.length === 0) return;
  const stand = staendeMitLokal(rundenIndex);
  const alleDa = spielerListe.every((sp) => stand.some((f) => f.spielerId === sp.id && f.fertig));
  const zeitUm = elapsedGesamt - COUNTDOWN_MS >= MAX_RUNDE_MS;
  if (!alleDa && !zeitUm) return;

  auswertungLaeuft = true;
  try {
    const punkte = berechnePunkte(stand, spielerListe.map((s) => s.id));
    const batch = writeBatch(api.db);
    Object.entries(punkte).forEach(([id, wert]) => {
      batch.update(api.spielerRef(id), { punkte: increment(wert) });
    });
    batch.update(api.raumRef(), { runStatus: "ausgewertet" });
    await batch.commit();
  } catch (e) {
    zeigeDebug("Fehler bei der Auswertung: " + e.message);
  }
  auswertungLaeuft = false;
}

function formatZeit(ms) {
  return `${(ms / 1000).toFixed(1).replace(".", ",")} s`;
}

function zeigeErgebnisListe(pos) {
  if (!el.wurzel) return;
  const stand = staendeDieserRunde(pos);
  const ids = spielerListe.map((s) => s.id);
  const punkte = berechnePunkte(stand, ids);
  const zeilen = spielerListe.map((s) => ({
    s, a: stand.find((x) => x.spielerId === s.id) ?? null, p: punkte[s.id] ?? 0
  })).sort((x, y) => vergleiche(x.a ?? { dist: 0, muenzen: 0 }, y.a ?? { dist: 0, muenzen: 0 }));
  const liste = $("run-erg-liste");
  liste.innerHTML = "";
  zeilen.forEach(({ s, a, p }) => {
    const li = document.createElement("li");
    const extra = !a ? "Kein Ergebnis"
      : `${a.dist} m`;
    li.innerHTML = spielerKarte(s.name, s.farbe, s.icon, p > 0 ? `+${p}` : "0", {
      extra, punkteRechts: s.punkte ?? 0
    });
    liste.appendChild(li);
  });
}

function zeigeErgebnis(pos) {
  $("run-erg-titel").textContent = `Runde ${pos + 1} von ${anzahlRunden}`;
  zeigeErgebnisListe(pos);
  $("run-weiter").hidden = !api.istLeiter;
  $("run-weiter").textContent = pos + 1 >= anzahlRunden ? "Endstand anzeigen" : "Nächste Runde";
}

async function weiter() {
  $("run-weiter").disabled = true;
  try {
    const naechster = rundenIndex + 1;
    if (naechster >= anzahlRunden) {
      await updateDoc(api.raumRef(), { runStatus: "beendet" });
      speichereWertung(api, "run", Object.fromEntries(spielerListe.map((s) => [s.id, s.punkte ?? 0])));
    } else {
      await updateDoc(api.raumRef(), {
        runStatus: "runde_aktiv",
        runRundenIndex: naechster,
        runVorbereitungSeit: Date.now()
      });
    }
  } catch (e) {
    zeigeDebug("Fehler beim Weiterschalten: " + e.message);
  }
  $("run-weiter").disabled = false;
}

function zeigeEndstand() {
  if (!el.wurzel) return;
  const sortiert = [...spielerListe].sort((a, b) => (b.punkte ?? 0) - (a.punkte ?? 0));
  const liste = $("run-endstand-liste");
  liste.innerHTML = "";
  sortiert.forEach((s, i) => {
    const li = document.createElement("li");
    li.innerHTML = spielerKarte(s.name, s.farbe, s.icon, s.punkte ?? 0, { rang: i + 1 });
    liste.appendChild(li);
  });
  $("run-endstand-warten").hidden = api.istLeiter;
  const btn = $("run-gesamtwertung-btn");
  if (btn) {
    btn.hidden = !(api.istLeiter && Boolean(api.olympiadeAnzahl));
    btn.onclick = () => api.zeigeGesamtwertung();
  }
}

// ---------------------------------------------------------------- Der Lauf
function starteLauf() {
  const eigener = spielerListe.find((s) => s.id === api.spielerId);
  $("run-hinweis").textContent = "Wischen: ◀ ▶ Spur wechseln · ▲ springen · ▼ rutschen";
  const strecke = baueStrecke(seed + rundenIndex * 10007);
  lauf = baueLauf($("run-canvas"), $("run-canvas-wrap"), strecke, {
    leben: einstellungen.leben,
    farbe: eigener?.farbe || "#ff5b36",
    bild: avatarBild(eigener?.icon),
    initial: (eigener?.name || "?").slice(0, 1).toUpperCase(),
    beiEnde: () => { schreibeStand(true).then(aktualisiereStatus); },
    beiLive: () => schreibeStand(false),
    spielId: () => api.spielerId,
    runde: () => rundenIndex,
    hudDist: $("run-hud-dist"), hudLeben: $("run-hud-leben")
  });
}

const bildCache = new Map();
function holeBild(url) {
  if (!url) return null;
  let e = bildCache.get(url);
  if (!e) {
    const img = new Image();
    e = { img, ok: false };
    img.onload = () => { e.ok = true; };
    img.src = url;
    bildCache.set(url, e);
  }
  return e.ok && e.img.naturalWidth ? e.img : null;
}

function schatten(hex, f) {
  const n = parseInt(hex.slice(1), 16);
  const k = (v) => Math.max(0, Math.min(255, Math.round(v * f)));
  return `rgb(${k(n >> 16)},${k((n >> 8) & 255)},${k(n & 255)})`;
}

function baueLauf(canvas, wrap, strecke, opt) {
  const ctx = canvas.getContext("2d");
  document.body.classList.add("run-laeuft");
  const zustand = {
    dist: 0, spur: 0, ziel: 0,           // spur: Anzeige (float), ziel: gewünschte Spur (-1,0,1)
    y: 0, vy: 0, rutsch: 0, rutschWartet: false,
    leben: opt.leben, muenzen: 0, unverwundbar: 0, bremse: 1, blitz: 0,
    ms: 0, tot: false, imZiel: false, gestartet: false, letzteSchrift: 0, schuettel: 0
  };
  let w = 300, h = 400, dpr = 1;
  let F = 200, camH = 3, hy = 100, cx = 150, camX = 0;
  let himmel = null;
  let rafId = 0, letzteZeit = 0;
  let abgebaut = false;
  const rnd0 = (i) => ((Math.imul(i + 1, 2654435761) >>> 0) % 1000) / 1000;

  function layout() {
    dpr = Math.min(2, window.devicePixelRatio || 1);
    w = Math.min(wrap.clientWidth || 320, 520);
    h = Math.round(Math.min(w * 1.75, Math.max(340, (window.innerHeight || 700) * 0.72)));
    canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr);
    canvas.style.height = h + "px";
    cx = w / 2; hy = h * 0.3;
    F = w * 0.72;
    camH = ((0.84 * h) - hy) * KAMERA_ABSTAND / F;
    baueHimmel();
  }

  function baueHimmel() {
    himmel = document.createElement("canvas");
    himmel.width = Math.round(w * dpr); himmel.height = Math.round(hy * dpr + 2);
    const c = himmel.getContext("2d");
    c.scale(dpr, dpr);
    const g = c.createLinearGradient(0, 0, 0, hy);
    g.addColorStop(0, "#150f2e"); g.addColorStop(0.55, "#46206b"); g.addColorStop(1, "#ff7a45");
    c.fillStyle = g; c.fillRect(0, 0, w, hy + 1);
    // Sonne
    const sg = c.createRadialGradient(w * 0.5, hy - 6, 2, w * 0.5, hy - 6, w * 0.2);
    sg.addColorStop(0, "#fff1b8"); sg.addColorStop(0.35, "#ffc15c"); sg.addColorStop(1, "rgba(255,122,69,0)");
    c.fillStyle = sg; c.beginPath(); c.arc(w * 0.5, hy - 6, w * 0.2, 0, Math.PI * 2); c.fill();
    // Hügel
    const huegel = (basis, amp, farbe, phase) => {
      c.fillStyle = farbe; c.beginPath(); c.moveTo(0, hy + 1);
      for (let x = 0; x <= w; x += 6) {
        const yy = hy - basis - amp * (0.5 + 0.5 * Math.sin(x * 0.018 + phase)) - amp * 0.4 * Math.sin(x * 0.05 + phase * 2);
        c.lineTo(x, yy);
      }
      c.lineTo(w, hy + 1); c.closePath(); c.fill();
    };
    huegel(2, 22, "#35195a", 0.5);
    huegel(0, 12, "#241240", 2.2);
  }

  const tiefeVon = (d) => d - zustand.dist + KAMERA_ABSTAND;
  const px = (xw, depth) => cx + (xw - camX) * F / depth;
  const py = (yw, depth) => hy + (camH - yw) * F / depth;

  function viereck(pts, fill) {
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.closePath(); ctx.fillStyle = fill; ctx.fill();
  }

  // Quader: x-Bereich, Höhe ya-yb, Tiefe za (nah) bis zb (fern)
  function quader(xa, xb, ya, yb, za, zb, farbe, streifen) {
    if (zb < 0.4) return;
    za = Math.max(za, 0.4);
    const P = (x, y, z) => [px(x, z), py(y, z)];
    viereck([P(xa, yb, za), P(xb, yb, za), P(xb, yb, zb), P(xa, yb, zb)], schatten(farbe, 1.25));
    if (xb < camX) viereck([P(xb, ya, za), P(xb, ya, zb), P(xb, yb, zb), P(xb, yb, za)], schatten(farbe, 0.65));
    else if (xa > camX) viereck([P(xa, ya, za), P(xa, ya, zb), P(xa, yb, zb), P(xa, yb, za)], schatten(farbe, 0.65));
    viereck([P(xa, ya, za), P(xb, ya, za), P(xb, yb, za), P(xa, yb, za)], farbe);
    if (streifen) {
      const m = (ya + yb) / 2, hh = (yb - ya) * 0.16;
      viereck([P(xa, m - hh, za), P(xb, m - hh, za), P(xb, m + hh, za), P(xa, m + hh, za)], streifen);
    }
  }

  function zeichneBoden() {
    const nah = 0.4, fern = SICHT_WEITE;
    // Seitenflächen
    const bg = ctx.createLinearGradient(0, hy, 0, h);
    bg.addColorStop(0, "#1c2d52"); bg.addColorStop(1, "#0d1a33");
    ctx.fillStyle = bg; ctx.fillRect(0, hy, w, h - hy);
    // Straße in Bändern
    const band = 6;
    const start = Math.floor((zustand.dist - KAMERA_ABSTAND) / band) * band;
    for (let s = start; s < zustand.dist + fern; s += band) {
      const za = Math.max(nah, s - zustand.dist + KAMERA_ABSTAND), zb = s + band - zustand.dist + KAMERA_ABSTAND;
      if (zb < nah) continue;
      const hell = (Math.floor(s / band) & 1) === 0;
      const P = (x, z) => [px(x, z), py(0, z)];
      viereck([P(-2.5, za), P(2.5, za), P(2.5, zb), P(-2.5, zb)], hell ? "#34304f" : "#2b2845");
    }
    // Randlinien
    for (const sx of [-2.5, 2.5]) {
      const P = (x, z) => [px(x, z), py(0, z)];
      viereck([P(sx - 0.07, nah), P(sx + 0.07, nah), P(sx + 0.07, fern), P(sx - 0.07, fern)], "#ff5b36");
    }
    // Spurtrenner (gestrichelt)
    const strich = 4;
    const s0 = Math.floor((zustand.dist - KAMERA_ABSTAND) / strich) * strich;
    for (let s = s0; s < zustand.dist + fern; s += strich) {
      const za = Math.max(nah, s - zustand.dist + KAMERA_ABSTAND), zb = s + strich / 2 - zustand.dist + KAMERA_ABSTAND;
      if (zb < nah) continue;
      for (const sx of [-0.8, 0.8]) {
        const P = (x, z) => [px(x, z), py(0, z)];
        viereck([P(sx - 0.04, za), P(sx + 0.04, za), P(sx + 0.04, zb), P(sx - 0.04, zb)], "rgba(233,230,255,0.55)");
      }
    }
    // Dunst am Horizont
    const dunst = ctx.createLinearGradient(0, hy, 0, hy + h * 0.12);
    dunst.addColorStop(0, "rgba(255,122,69,0.55)"); dunst.addColorStop(1, "rgba(255,122,69,0)");
    ctx.fillStyle = dunst; ctx.fillRect(0, hy, w, h * 0.12);
  }

  function zeichneKulisse() {
    // Laternen und Häuser am Straßenrand
    const raster = 10;
    const i0 = Math.floor((zustand.dist - KAMERA_ABSTAND) / raster);
    const imax = Math.floor((zustand.dist + SICHT_WEITE) / raster);
    for (let i = imax; i >= i0; i--) {
      const d = i * raster;
      const z = d - zustand.dist + KAMERA_ABSTAND;
      for (const seite of [-1, 1]) {
        const r = rnd0(i * 2 + (seite > 0 ? 1 : 0));
        if (r < 0.65) { // Haus
          const hoehe = 3 + r * 7, breite = 2.4 + r * 2;
          const xa = seite < 0 ? -4.4 - breite : 4.4, xb = seite < 0 ? -4.4 : 4.4 + breite;
          const farbe = ["#3a2b66", "#2d3a6e", "#4a2a5e", "#26345c"][Math.floor(r * 40) % 4];
          quader(xa, xb, 0, hoehe, z, z + 4, farbe);
          // beleuchtete Fenster
          if (z > 2) {
            const fx = seite < 0 ? xb - 0.0 : xa;
            for (let fy = 1; fy < hoehe - 0.5; fy += 1.3) {
              if (rnd0(i * 31 + Math.floor(fy * 7) + (seite > 0 ? 5 : 0)) < 0.55) {
                const nahX = seite < 0 ? xb : xa;
                const P = (x, y, zz) => [px(x, zz), py(y, zz)];
                viereck([P(nahX, fy, z), P(nahX, fy + 0.6, z), P(nahX, fy + 0.6, z + 0.9), P(nahX, fy, z + 0.9)], "rgba(255,214,120,0.85)");
              }
            }
            void fx;
          }
        }
      }
      // Laterne
      for (const seite of [-1, 1]) {
        const x = seite * 3.3;
        quader(x - 0.07, x + 0.07, 0, 2.6, z, z + 0.14, "#9aa3c4");
        quader(x - 0.25, x + 0.25, 2.6, 2.75, z, z + 0.3, "#ffe08a");
      }
    }
  }

  function zeichneHindernis(zeile) {
    const z = tiefeVon(zeile.d);
    for (let l = 0; l < 3; l++) {
      const t = zeile.t[l];
      if (!t) continue;
      const x = (l - 1) * SPUR_BREITE;
      const tiefe = TIEFE[t];
      if (t === 1) quader(x - 0.65, x + 0.65, 0, 0.5, z, z + tiefe, "#ff8a3d", "#ffffff");
      else if (t === 2) {
        quader(x - 0.72, x - 0.6, 0, 1.65, z, z + tiefe, "#9aa3c4");
        quader(x + 0.6, x + 0.72, 0, 1.65, z, z + tiefe, "#9aa3c4");
        quader(x - 0.72, x + 0.72, 0.85, 1.65, z, z + tiefe, "#ef4444", "#fde047");
      } else quader(x - 0.68, x + 0.68, 0, 1.7, z, z + tiefe, "#5b5bd6", "#a5b4fc");
    }
  }

  function zeichneMuenze(m) {
    const z = tiefeVon(m.d);
    if (z < 1.2 || z > SICHT_WEITE) return;
    const x = px(m.spur * SPUR_BREITE, z), y = py(0.75, z);
    const r = 0.26 * F / z;
    const dreh = Math.abs(Math.cos(zustand.dist * 0.7 + m.d));
    ctx.beginPath(); ctx.ellipse(x, y, Math.max(1, r * (0.35 + 0.65 * dreh)), r, 0, 0, Math.PI * 2);
    ctx.fillStyle = "#fbbf24"; ctx.fill();
    ctx.lineWidth = Math.max(1, r * 0.18); ctx.strokeStyle = "#b45309"; ctx.stroke();
  }

  function zeichneFigur() {
    const depth = KAMERA_ABSTAND;
    const u = F / depth;
    const xs = px(zustand.spur * SPUR_BREITE, depth);
    const fuss = py(zustand.y, depth);
    const boden = py(0, depth);
    // Schatten
    const sk = Math.max(0.35, 1 - zustand.y * 0.5);
    const rl = zustand.rutsch > 0 ? 1.25 : 1;
    ctx.beginPath(); ctx.ellipse(xs, zustand.rutsch > 0 ? boden - u * 0.3 : boden, u * 0.38 * sk * rl, u * (zustand.rutsch > 0 ? 0.42 : 0.1) * sk, 0, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(0,0,0,0.35)"; ctx.fill();

    if (zustand.unverwundbar > 0 && Math.floor(zustand.unverwundbar * 12) % 2 === 0) ctx.globalAlpha = 0.4;
    const lauf = zustand.dist * 2.3;
    const rutscht = zustand.rutsch > 0;
    ctx.save();
    ctx.translate(xs, fuss);
    const zeichneKopf = (ky, kr) => {
      ctx.beginPath(); ctx.arc(0, ky, kr, 0, Math.PI * 2);
      ctx.fillStyle = "#f4c9a0"; ctx.fill();
      const bild = holeBild(opt.bild);
      if (bild) {
        ctx.save(); ctx.beginPath(); ctx.arc(0, ky, kr, 0, Math.PI * 2); ctx.clip();
        const q = Math.min(bild.naturalWidth, bild.naturalHeight);
        ctx.drawImage(bild, (bild.naturalWidth - q) / 2, (bild.naturalHeight - q) * 0.25, q, q, -kr, ky - kr, kr * 2, kr * 2);
        ctx.restore();
      } else {
        ctx.fillStyle = "#1f2937"; ctx.font = `800 ${Math.round(kr * 1.2)}px -apple-system, Helvetica, Arial, sans-serif`;
        ctx.textAlign = "center"; ctx.textBaseline = "middle"; ctx.fillText(opt.initial, 0, ky + 1);
      }
      ctx.lineWidth = Math.max(1.5, u * 0.04); ctx.strokeStyle = "#fff"; ctx.beginPath(); ctx.arc(0, ky, kr, 0, Math.PI * 2); ctx.stroke();
    };
    if (rutscht) {
      // Grätsche nach vorn: von hinten gesehen liegt die Figur flach, Kopf zur Kamera, Beine voraus (oben im Bild)
      const gl = Math.min(1, (RUTSCH_S - zustand.rutsch) / 0.12);   // kurzes Hineingleiten
      // Staub hinten
      ctx.fillStyle = "rgba(220,210,255,0.22)";
      ctx.beginPath(); ctx.ellipse(-u * 0.25, u * 0.02, u * 0.18, u * 0.07, 0, 0, Math.PI * 2); ctx.fill();
      ctx.beginPath(); ctx.ellipse(u * 0.28, u * 0.0, u * 0.14, u * 0.05, 0, 0, Math.PI * 2); ctx.fill();
      // Beine (am weitesten vorn, kleiner wegen Perspektive)
      for (const sx of [-1, 1]) {
        const x0 = sx * u * 0.1, spitze = -u * (0.62 + 0.38 * gl);
        ctx.fillStyle = "#1f2937";
        ctx.beginPath(); ctx.roundRect(x0 - u * 0.07, spitze, u * 0.14, u * 0.4, u * 0.06); ctx.fill();
        ctx.fillStyle = "#e5e7eb";
        ctx.beginPath(); ctx.roundRect(x0 - u * 0.08, spitze - u * 0.03, u * 0.16, u * 0.1, u * 0.05); ctx.fill();
      }
      // Rumpf
      ctx.fillStyle = opt.farbe;
      ctx.beginPath(); ctx.roundRect(-u * 0.24, -u * 0.62, u * 0.48, u * 0.46, u * 0.14); ctx.fill();
      ctx.fillStyle = "rgba(255,255,255,0.22)";
      ctx.fillRect(-u * 0.2, -u * 0.46, u * 0.4, u * 0.05);
      // Arme zur Seite abgestützt
      ctx.lineCap = "round"; ctx.strokeStyle = schatten(opt.farbe, 0.8); ctx.lineWidth = u * 0.1;
      for (const sx of [-1, 1]) {
        ctx.beginPath(); ctx.moveTo(sx * u * 0.22, -u * 0.5); ctx.lineTo(sx * u * 0.38, -u * 0.26); ctx.stroke();
      }
      zeichneKopf(-u * 0.1, u * 0.22);
      ctx.restore();
      ctx.globalAlpha = 1;
      return;
    }
    const luft = zustand.y > 0.05;
    const schwung = luft ? 0.5 : Math.sin(lauf);
    // Beine
    ctx.lineCap = "round"; ctx.strokeStyle = "#1f2937"; ctx.lineWidth = u * 0.14;
    for (const s of [-1, 1]) {
      const sw = (luft ? s * 0.5 : schwung * s) * u * 0.22;
      ctx.beginPath(); ctx.moveTo(s * u * 0.09, -u * 0.42); ctx.lineTo(s * u * 0.09 + sw, -u * 0.02 - (luft && s > 0 ? u * 0.12 : 0)); ctx.stroke();
    }
    // Rumpf
    const rh = u * 0.5, rb = u * 0.46;
    ctx.fillStyle = opt.farbe;
    ctx.beginPath(); ctx.roundRect(-rb / 2, -u * 0.42 - rh, rb, rh, u * 0.12); ctx.fill();
    ctx.fillStyle = "rgba(255,255,255,0.22)";
    ctx.fillRect(-rb / 2 + u * 0.04, -u * 0.42 - rh * 0.62, rb - u * 0.08, u * 0.06);
    // Arme
    ctx.strokeStyle = schatten(opt.farbe, 0.8); ctx.lineWidth = u * 0.11;
    for (const s of [-1, 1]) {
      const sw = (luft ? -s * 0.9 : -schwung * s) * u * 0.2;
      ctx.beginPath(); ctx.moveTo(s * rb / 2, -u * 0.42 - rh * 0.85); ctx.lineTo(s * (rb / 2 + u * 0.05) + sw * 0.4, -u * 0.42 - rh * 0.35 + (luft ? -u * 0.3 : sw)); ctx.stroke();
    }
    // Kopf
    const kr = u * 0.23;
    zeichneKopf(-u * 0.42 - rh - kr * 0.85, kr);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  function zeichne() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);
    const sch = zustand.schuettel > 0 ? (Math.random() - 0.5) * 7 * zustand.schuettel : 0;
    ctx.translate(sch, sch * 0.6);
    camX = zustand.spur * SPUR_BREITE * 0.55;
    ctx.drawImage(himmel, 0, 0, w, hy + 1);
    zeichneBoden();
    zeichneKulisse();
    const zeilen = strecke.zeilen;
    // hinter der Figur (weiter weg) zuerst, dann Figur, dann was schon vorbei ist
    for (let i = zeilen.length - 1; i >= 0; i--) {
      const z = tiefeVon(zeilen[i].d);
      if (z > SICHT_WEITE) continue;
      if (z >= KAMERA_ABSTAND - 0.2) zeichneHindernis(zeilen[i]);
    }
    for (let i = strecke.muenzen.length - 1; i >= 0; i--) {
      const m = strecke.muenzen[i];
      if (!m.genommen && m.d > zustand.dist - 1) zeichneMuenze(m);
    }
    zeichneFigur();
    for (let i = zeilen.length - 1; i >= 0; i--) {
      const z = tiefeVon(zeilen[i].d);
      if (z < KAMERA_ABSTAND - 0.2 && z > 0.6) zeichneHindernis(zeilen[i]);
    }
    // Treffer-Blitz
    if (zustand.blitz > 0) {
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.fillStyle = `rgba(239,68,68,${Math.min(0.5, zustand.blitz)})`; ctx.fillRect(0, 0, w, h);
    }
  }

  function tempo() {
    return tempoBei(zustand.dist) * zustand.bremse;
  }

  function schritt(dt) {
    if (zustand.tot || zustand.imZiel) {
      zustand.blitz = Math.max(0, zustand.blitz - dt); zustand.schuettel = Math.max(0, zustand.schuettel - dt * 3);
      return;
    }
    zustand.ms += dt * 1000;
    strecke.erweitere(zustand.dist + SICHT_WEITE + 60);
    zustand.bremse = Math.min(1, zustand.bremse + dt * 0.6);
    zustand.dist += tempo() * dt;
    // Spurwechsel
    const dl = zustand.ziel - zustand.spur;
    zustand.spur += Math.sign(dl) * Math.min(Math.abs(dl), 9 * dt);
    // Sprung
    if (zustand.y > 0 || zustand.vy > 0) {
      zustand.vy -= SCHWERKRAFT * dt;
      zustand.y += zustand.vy * dt;
      if (zustand.y <= 0) {
        zustand.y = 0; zustand.vy = 0;
        if (zustand.rutschWartet) { zustand.rutsch = RUTSCH_S; zustand.rutschWartet = false; }
      }
    }
    if (zustand.rutsch > 0) zustand.rutsch -= dt;
    zustand.unverwundbar = Math.max(0, zustand.unverwundbar - dt);
    zustand.blitz = Math.max(0, zustand.blitz - dt);
    zustand.schuettel = Math.max(0, zustand.schuettel - dt * 3);

    // Münzen
    for (const m of strecke.muenzen) {
      if (m.genommen) continue;
      if (Math.abs(m.d - zustand.dist) < 0.8 && Math.abs(zustand.spur - m.spur) < 0.6) {
        m.genommen = true; zustand.muenzen++;
      }
    }
    // Hindernisse
    for (const zeile of strecke.zeilen) {
      if (zeile.d > zustand.dist + 3) break;
      if (zeile.d + 2 < zustand.dist) continue;
      for (let l = 0; l < 3; l++) {
        const t = zeile.t[l];
        if (!t || zeile.getroffen[l]) continue;
        const tiefe = TIEFE[t];
        if (zustand.dist + 0.3 < zeile.d || zustand.dist - 0.3 > zeile.d + tiefe) continue;
        if (Math.abs(zustand.spur - (l - 1)) >= 0.6) continue;
        let treffer = false;
        if (t === 1) treffer = zustand.y < 0.42;
        else if (t === 2) treffer = zustand.rutsch <= 0;
        else treffer = true;
        if (!treffer) continue;
        if (zustand.unverwundbar > 0) continue;
        zeile.getroffen[l] = true;
        zustand.leben--;
        zustand.unverwundbar = UNVERWUNDBAR_S; zustand.bremse = 0.5; zustand.blitz = 0.45; zustand.schuettel = 1;
        if (zustand.leben <= 0) { zustand.tot = true; opt.beiEnde(); }
      }
    }
    // Live-Stand ab und zu schreiben
    const jetzt = performance.now();
    if (!zustand.tot && !zustand.imZiel && jetzt - zustand.letzteSchrift > SCHREIB_MS) {
      zustand.letzteSchrift = jetzt; opt.beiLive();
    }
  }

  function hud() {
    opt.hudDist.textContent = `${Math.floor(zustand.dist)} m`;
    opt.hudLeben.textContent = "\u2764\uFE0F".repeat(Math.max(0, zustand.leben)) + "\uD83D\uDDA4".repeat(Math.max(0, opt.leben - zustand.leben));
  }

  function rahmen(jetzt) {
    if (abgebaut) return;
    rafId = requestAnimationFrame(rahmen);
    const dt = Math.min(0.05, (jetzt - (letzteZeit || jetzt)) / 1000);
    letzteZeit = jetzt;
    schritt(dt);
    zeichne();
    hud();
  }

  // ---- Eingabe
  const aktion = (a) => {
    if (zustand.tot || zustand.imZiel) return;
    if (a === "links") zustand.ziel = Math.max(-1, zustand.ziel - 1);
    else if (a === "rechts") zustand.ziel = Math.min(1, zustand.ziel + 1);
    else if (a === "hoch") {
      if (zustand.y <= 0) { zustand.vy = SPRUNG_V; zustand.y = 0.001; zustand.rutsch = 0; }
    } else if (a === "runter") {
      if (zustand.y > 0) { zustand.vy = -16; zustand.rutschWartet = true; }
      else zustand.rutsch = RUTSCH_S;
    }
  };
  // Ein Wisch löst genau eine Aktion aus (auch bei langem Ziehen) - für die nächste Aktion neu ansetzen.
  let start = null;
  const SCHWELLE = 22;
  const runter = (e) => { start = { x: e.clientX, y: e.clientY }; canvas.setPointerCapture?.(e.pointerId); e.preventDefault(); };
  const bewegt = (e) => {
    if (!start) return;
    const dx = e.clientX - start.x, dy = e.clientY - start.y;
    if (Math.max(Math.abs(dx), Math.abs(dy)) < SCHWELLE) return;
    if (Math.abs(dx) > Math.abs(dy)) aktion(dx < 0 ? "links" : "rechts");
    else aktion(dy < 0 ? "hoch" : "runter");
    start = null;
  };
  const hoch = () => { start = null; };
  const taste = (e) => {
    const m = { ArrowLeft: "links", a: "links", A: "links", ArrowRight: "rechts", d: "rechts", D: "rechts",
      ArrowUp: "hoch", w: "hoch", W: "hoch", " ": "hoch", ArrowDown: "runter", s: "runter", S: "runter" }[e.key];
    if (m) { aktion(m); e.preventDefault(); }
  };
  canvas.addEventListener("pointerdown", runter);
  canvas.addEventListener("pointermove", bewegt);
  canvas.addEventListener("pointerup", hoch);
  canvas.addEventListener("pointercancel", hoch);
  window.addEventListener("keydown", taste);
  window.addEventListener("resize", layout);

  layout();
  rafId = requestAnimationFrame(rahmen);

  return {
    stand() {
      return {
        spielerId: opt.spielId(), rundenIndex: opt.runde(), dist: Math.floor(zustand.dist),
        muenzen: zustand.muenzen, leben: zustand.leben, fertig: zustand.tot || zustand.imZiel,
        ziel: zustand.imZiel, ms: Math.round(zustand.ms)
      };
    },
    fertig() { return zustand.tot || zustand.imZiel; },
    layout,
    aktion,
    _z: zustand,
    _s: strecke,
    abbauen() {
      abgebaut = true;
      document.body.classList.remove("run-laeuft");
      cancelAnimationFrame(rafId);
      canvas.removeEventListener("pointerdown", runter);
      canvas.removeEventListener("pointermove", bewegt);
      canvas.removeEventListener("pointerup", hoch);
      canvas.removeEventListener("pointercancel", hoch);
      window.removeEventListener("keydown", taste);
      window.removeEventListener("resize", layout);
    }
  };
}

export { baueStrecke, berechnePunkte };
