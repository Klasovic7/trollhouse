// ============================================================================
//  Knobeln
// ----------------------------------------------------------------------------
//  Das klassische Streichholz-Knobeln: Jede*r nimmt heimlich 0 bis 3 Hölzer in
//  die Faust. Danach tippt reihum jede*r, wie viele Hölzer insgesamt in allen
//  Fäusten stecken - jede Zahl darf pro Runde nur EINMAL getippt werden.
//  Dann wird aufgelöst: Wer die Gesamtzahl richtig getippt hat, ist raus
//  (gerettet). Mit den Übrigen beginnt die nächste Runde (der erste Tipp
//  wandert dabei jede Runde weiter), bis nur noch eine Person übrig bleibt -
//  das ist der Verlierer.
//
//  Punkte: Wer zuerst rausgeht, bekommt die meisten, der Verlierer 0.
//
//  Raumfelder beginnen mit "kn": knStatus (setup | hand | tippen | aufloesung |
//  beendet), knRunde, knAktive, knReihenfolge, knTippIndex, knTipps,
//  knPhaseStart, knAuswertung, knAusgeschieden, knAnzahlStart. Die geheimen
//  Hände liegen getrennt in der Subcollection "knHaende".
// ============================================================================
import {
  doc, setDoc, updateDoc, deleteDoc, collection, getDocs, onSnapshot,
  serverTimestamp, increment, writeBatch
} from "../../kern/firebase.js";
import { spielerKarte, zeigeDebug, initBereitSystem, escapeHtml, avatarHtml } from "../../kern/ui.js";
import { speichereWertung } from "../../kern/wertung.js";

const HAND_ZEIT_MS = 30000;
const TIPP_ZEIT_MS = 25000;
const MAX_HOELZER = 3;

const VORLAGE = `
  <div id="kn-setup" class="bildschirm-karte" hidden>
    <h1>Knobeln</h1>
    <p class="hinweis-text">Jede*r nimmt heimlich 0 bis 3 Streichhölzer in die Faust. Dann tippt ihr
      reihum, wie viele Hölzer insgesamt im Spiel sind - jede Zahl darf nur einmal genannt werden.
      Wer richtig tippt, ist raus und in Sicherheit. Mit den Übrigen geht es weiter, bis nur noch
      eine Person übrig ist: der Verlierer.</p>
    <p id="kn-setup-fehler" class="fehler-text"></p>
    <p><button id="kn-starten" class="btn-primaer" hidden>Spiel starten</button></p>
    <p id="kn-setup-warten" hidden><em>Warte, bis der Spielleiter das Spiel startet …</em></p>
    <div id="kn-bereit-bereich" class="bereit-bereich" hidden></div>
  </div>

  <div id="kn-hand-screen" class="bildschirm-karte" hidden>
    <p class="kategorie" id="kn-runde-label"></p>
    <h2>Wie viele Hölzer nimmst du in die Faust?</h2>
    <div id="kn-timer-hand" class="gv-timer" aria-hidden="true"><i></i></div>
    <div id="kn-hand-wahl" class="kn-hand-wahl"></div>
    <p id="kn-hand-info" class="hinweis-text"></p>
    <div id="kn-hand-status" class="warten-block"></div>
    <div id="kn-aktive-hand" class="kn-aktive"></div>
  </div>

  <div id="kn-tipp-screen" class="bildschirm-karte" hidden>
    <p class="kategorie" id="kn-tipp-label"></p>
    <h2 id="kn-tipp-titel"></h2>
    <div id="kn-timer-tipp" class="gv-timer" aria-hidden="true"><i></i></div>
    <ul id="kn-tipp-liste" class="kn-tipp-liste"></ul>
    <div id="kn-tipp-grid" class="kn-tipp-grid"></div>
    <p id="kn-tipp-info" class="hinweis-text"></p>
  </div>

  <div id="kn-ergebnis-screen" class="bildschirm-karte" hidden>
    <p class="kategorie" id="kn-erg-label"></p>
    <h2 id="kn-erg-titel"></h2>
    <p class="kn-summe">Insgesamt: <strong id="kn-erg-summe"></strong></p>
    <ul id="kn-erg-liste"></ul>
    <p><button id="kn-weiter" hidden>Weiter</button></p>
  </div>

  <div id="kn-endstand-screen" class="bildschirm-karte" hidden>
    <h1>Endstand</h1>
    <p id="kn-verlierer" class="kn-verlierer"></p>
    <ul id="kn-endstand-liste"></ul>
    <p id="kn-endstand-warten" hidden><em>Der Spielleiter wählt gleich das nächste Spiel …</em></p>
    <p><button id="kn-gesamtwertung-btn" class="btn-primaer" type="button" hidden>Gesamtwertung</button></p>
  </div>
`;

let api = null;
let el = {};
let spielerListe = [];
let haende = [];            // alle Hände (Subcollection)
let haendeUnsub = null;
let tickId = null;

let status = null;
let runde = 0;
let aktive = [];            // Ids, die noch im Spiel sind
let reihenfolge = [];       // Tipp-Reihenfolge dieser Runde
let tippIndex = 0;
let tipps = {};
let phaseStart = 0;
let auswertung = null;
let ausgeschieden = [];
let anzahlStart = 0;

let meineHand = null;       // lokal gemerkt: Anzahl, die ich gewählt habe
let meineHandRunde = -1;
let leiterBusy = false;
let bereitSystem = null;
let olympiadeAutoStart = false;

const $ = (id) => el.wurzel.querySelector("#" + id);

// ---- Streichhölzer zeichnen ------------------------------------------------
export function hoelzerSvg(n, breite = 120) {
  if (n <= 0) {
    return `<svg viewBox="0 0 120 80" width="${breite}" class="kn-hoelzer" role="img" aria-label="0 Hölzer">` +
      `<rect x="30" y="18" width="60" height="44" rx="16" fill="none" stroke="currentColor" stroke-width="5" stroke-dasharray="8 7"/></svg>`;
  }
  const abstand = 22;
  const start = 60 - ((n - 1) * abstand) / 2;
  let s = "";
  for (let i = 0; i < n; i++) {
    const x = start + i * abstand;
    const neigung = (i - (n - 1) / 2) * 7;
    s += `<g transform="rotate(${neigung} ${x} 78)">` +
      `<rect x="${x - 4}" y="14" width="8" height="64" rx="3" fill="#d9a86a"/>` +
      `<ellipse cx="${x}" cy="13" rx="7.5" ry="9" fill="#e11d48"/></g>`;
  }
  return `<svg viewBox="0 0 120 84" width="${breite}" class="kn-hoelzer" role="img" aria-label="${n} ${n === 1 ? "Holz" : "Hölzer"}">${s}</svg>`;
}

function name(id) {
  return spielerListe.find((s) => s.id === id)?.name ?? "?";
}
function spielerVon(id) {
  return spielerListe.find((s) => s.id === id);
}
function anwesend(id) {
  return spielerListe.some((s) => s.id === id);
}

// ---- Lebenszyklus ----------------------------------------------------------
export async function starten(uebergebeneApi) {
  api = uebergebeneApi;
  el.wurzel = api.wurzel;
  el.wurzel.innerHTML = VORLAGE;
  bereitSystem = initBereitSystem(api, "kn");
  olympiadeAutoStart = false;

  $("kn-starten").addEventListener("click", spielStarten);
  $("kn-weiter").addEventListener("click", weiter);

  haendeUnsub = onSnapshot(collection(api.db, "raeume", api.code, "knHaende"), (snap) => {
    haende = [];
    snap.forEach((d) => haende.push(d.data()));
    if (status === "hand") zeigeHandStatus();
  });

  if (api.istLeiter && !api.raum?.knStatus) {
    await updateDoc(api.raumRef(), {
      knStatus: "setup", knRunde: 0, knAktive: [], knReihenfolge: [], knTippIndex: 0, knTipps: {},
      knPhaseStart: 0, knAuswertung: null, knAusgeschieden: [], knAnzahlStart: 0
    });
  }
  tickId = setInterval(tick, 200);
}

export function beenden() {
  bereitSystem = null;
  if (haendeUnsub) { haendeUnsub(); haendeUnsub = null; }
  if (tickId) { clearInterval(tickId); tickId = null; }
  el = {};
  spielerListe = []; haende = [];
  status = null; runde = 0; aktive = []; reihenfolge = []; tippIndex = 0; tipps = {};
  phaseStart = 0; auswertung = null; ausgeschieden = []; anzahlStart = 0;
  meineHand = null; meineHandRunde = -1; leiterBusy = false;
}

export function spieler(liste) {
  spielerListe = liste;
  if (!el.wurzel) return;
  zeichne();
}

export function raumDaten(daten) {
  if (!daten || !el.wurzel) return;
  const alteRunde = runde;
  status = daten.knStatus ?? null;
  runde = daten.knRunde ?? 0;
  aktive = daten.knAktive ?? [];
  reihenfolge = daten.knReihenfolge ?? [];
  tippIndex = daten.knTippIndex ?? 0;
  tipps = daten.knTipps ?? {};
  phaseStart = daten.knPhaseStart ?? 0;
  auswertung = daten.knAuswertung ?? null;
  ausgeschieden = daten.knAusgeschieden ?? [];
  anzahlStart = daten.knAnzahlStart ?? 0;
  if (runde !== alteRunde) { meineHand = null; }
  api.fortschritt(status === "hand" || status === "tippen" || status === "aufloesung" ? `Runde ${runde + 1}` : "");
  zeichne();
}

function alleVerstecken() {
  ["kn-setup", "kn-hand-screen", "kn-tipp-screen", "kn-ergebnis-screen", "kn-endstand-screen"]
    .forEach((id) => { $(id).hidden = true; });
}

function zeichne() {
  if (!el.wurzel) return;
  alleVerstecken();
  if (status === "setup" || !status) {
    $("kn-setup").hidden = false;
    $("kn-starten").hidden = !api.istLeiter;
    $("kn-setup-warten").hidden = api.istLeiter;
    bereitSystem?.render();
    if (api.istLeiter && api.olympiadeAnzahl && !olympiadeAutoStart && bereitSystem?.alleBereit()) {
      olympiadeAutoStart = true;
      spielStarten();
    }
  } else if (status === "hand") {
    $("kn-hand-screen").hidden = false;
    zeigeHandScreen();
  } else if (status === "tippen") {
    $("kn-tipp-screen").hidden = false;
    zeigeTippScreen();
  } else if (status === "aufloesung") {
    $("kn-ergebnis-screen").hidden = false;
    zeigeErgebnis();
  } else if (status === "beendet") {
    $("kn-endstand-screen").hidden = false;
    zeigeEndstand();
  }
}

// ---- Start -----------------------------------------------------------------
async function spielStarten() {
  $("kn-setup-fehler").textContent = "";
  if (spielerListe.length < 2) {
    $("kn-setup-fehler").textContent = "Zum Knobeln braucht ihr mindestens zwei Spieler.";
    return;
  }
  $("kn-starten").disabled = true;
  try {
    const snap = await getDocs(collection(api.db, "raeume", api.code, "knHaende"));
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
    haende = [];
    await Promise.all(spielerListe.map((s) => updateDoc(api.spielerRef(s.id), { punkte: 0 })));
    const ids = spielerListe.map((s) => s.id);
    await updateDoc(api.raumRef(), {
      knStatus: "hand", knRunde: 0, knAktive: ids, knReihenfolge: ids, knTippIndex: 0, knTipps: {},
      knPhaseStart: Date.now(), knAuswertung: null, knAusgeschieden: [], knAnzahlStart: ids.length
    });
  } catch (e) {
    zeigeDebug("Fehler beim Start: " + e.message);
  }
  $("kn-starten").disabled = false;
}

export async function vorZurueck() {
  try {
    const snap = await getDocs(collection(api.db, "raeume", api.code, "knHaende"));
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
    await updateDoc(api.raumRef(), {
      knStatus: null, knRunde: 0, knAktive: [], knReihenfolge: [], knTippIndex: 0, knTipps: {},
      knPhaseStart: 0, knAuswertung: null, knAusgeschieden: [], knAnzahlStart: 0
    });
    await api.zurueckZurAuswahl();
  } catch (e) {
    zeigeDebug("Fehler beim Zurückkehren: " + e.message);
  }
}

// ---- Hand wählen -----------------------------------------------------------
function ichBinAktiv() { return aktive.includes(api.spielerId); }

function handDieserRunde(id) {
  return haende.find((h) => h.spielerId === id && h.runde === runde);
}

function zeigeHandScreen() {
  $("kn-runde-label").textContent = `Runde ${runde + 1} · noch ${aktive.length} im Spiel`;
  const wahl = $("kn-hand-wahl");
  const schonGewaehlt = handDieserRunde(api.spielerId) != null || meineHandRunde === runde && meineHand != null;
  if (!ichBinAktiv()) {
    wahl.innerHTML = "";
    $("kn-hand-info").textContent = "Du bist schon raus und in Sicherheit - schau den anderen zu.";
  } else if (schonGewaehlt) {
    const n = handDieserRunde(api.spielerId)?.anzahl ?? meineHand;
    wahl.innerHTML = `<div class="kn-gewaehlt">${hoelzerSvg(n, 140)}<p>Du hast <strong>${n}</strong> ${n === 1 ? "Holz" : "Hölzer"} in der Faust.</p></div>`;
    $("kn-hand-info").textContent = "Gut versteckt! Warte auf die anderen …";
  } else {
    let html = "";
    for (let n = 0; n <= MAX_HOELZER; n++) {
      html += `<button type="button" class="kn-hand-btn" data-n="${n}">${hoelzerSvg(n, 96)}<span>${n}</span></button>`;
    }
    wahl.innerHTML = html;
    wahl.querySelectorAll(".kn-hand-btn").forEach((b) => b.addEventListener("click", () => waehleHand(Number(b.dataset.n))));
    $("kn-hand-info").textContent = "Wähle verdeckt - die anderen sehen nicht, was du nimmst.";
  }
  zeigeHandStatus();
  aktualisiereTimer();
}

function zeigeHandStatus() {
  if (!el.wurzel || status !== "hand") return;
  const fertig = new Set(haende.filter((h) => h.runde === runde).map((h) => h.spielerId));
  const wartende = spielerListe.filter((s) => aktive.includes(s.id) && !fertig.has(s.id));
  const box = $("kn-hand-status");
  if (ichBinAktiv() && fertig.has(api.spielerId)) {
    box.innerHTML = "";
    box.classList.remove("warten-einzeln");
    box.innerHTML = wartende.length
      ? `<p class="hinweis-text">Es fehlen noch ${wartende.length} von ${aktive.length}.</p>`
      : "";
  } else {
    box.innerHTML = "";
  }
  $("kn-aktive-hand").innerHTML = aktiveZeile();
}

function aktiveZeile() {
  return aktive.map((id) => {
    const s = spielerVon(id);
    return s ? `<span class="kn-chip">${avatarHtml(s.icon, "kn-chip-avatar")}</span>` : "";
  }).join("");
}

async function waehleHand(n) {
  if (status !== "hand" || !ichBinAktiv() || handDieserRunde(api.spielerId)) return;
  meineHand = n; meineHandRunde = runde;
  zeigeHandScreen();
  try {
    await setDoc(doc(api.db, "raeume", api.code, "knHaende", `${api.spielerId}_${runde}`), {
      spielerId: api.spielerId, spielerName: api.spielerName, runde, anzahl: n, zeitpunkt: serverTimestamp()
    });
  } catch (e) {
    meineHand = null; meineHandRunde = -1;
    zeigeDebug("Fehler beim Speichern der Hand: " + e.message);
    zeigeHandScreen();
  }
}

// ---- Tippen ----------------------------------------------------------------
function genommeneTipps() {
  return new Set(Object.values(tipps).map(Number));
}

function zeigeTippScreen() {
  const n = aktive.length;
  const max = n * MAX_HOELZER;
  const dran = reihenfolge[tippIndex];
  const ichDran = dran === api.spielerId && ichBinAktiv();
  $("kn-tipp-label").textContent = `Runde ${runde + 1} · Gesamtzahl 0 bis ${max}`;
  $("kn-tipp-titel").textContent = ichDran
    ? "Du bist dran: Wie viele Hölzer sind es insgesamt?"
    : `${name(dran)} tippt gerade …`;

  const liste = $("kn-tipp-liste");
  liste.innerHTML = "";
  reihenfolge.forEach((id, i) => {
    const s = spielerVon(id);
    const hat = tipps[id] != null;
    const li = document.createElement("li");
    li.className = "kn-tipp-zeile" + (i === tippIndex ? " dran" : "");
    li.innerHTML = `<span class="kn-tipp-spieler">${avatarHtml(s?.icon, "kn-chip-avatar")}<span>${escapeHtml(s?.name ?? "?")}</span></span>` +
      `<span class="kn-tipp-wert">${hat ? escapeHtml(String(tipps[id])) : i === tippIndex ? "…" : "–"}</span>`;
    liste.appendChild(li);
  });

  const grid = $("kn-tipp-grid");
  if (ichDran) {
    const vergeben = genommeneTipps();
    // Die eigene Hand verrät, was mindestens im Spiel ist - Tipps darunter sind unsinnig, aber erlaubt.
    let html = "";
    for (let t = 0; t <= max; t++) {
      html += `<button type="button" class="kn-tipp-btn" data-t="${t}" ${vergeben.has(t) ? "disabled" : ""}>${t}</button>`;
    }
    grid.innerHTML = html;
    grid.hidden = false;
    grid.querySelectorAll(".kn-tipp-btn").forEach((b) => b.addEventListener("click", () => tippe(Number(b.dataset.t))));
    $("kn-tipp-info").textContent = "Eine Zahl, die schon jemand getippt hat, ist gesperrt.";
  } else {
    grid.innerHTML = ""; grid.hidden = true;
    $("kn-tipp-info").textContent = meineHandAnzeige();
  }
  aktualisiereTimer();
}

function meineHandAnzeige() {
  const h = handDieserRunde(api.spielerId);
  return h ? `Deine Hand: ${h.anzahl} ${h.anzahl === 1 ? "Holz" : "Hölzer"}.` : "";
}

async function tippe(t) {
  if (status !== "tippen" || reihenfolge[tippIndex] !== api.spielerId) return;
  if (genommeneTipps().has(t)) return;
  const idx = tippIndex;
  $("kn-tipp-grid").hidden = true;
  try {
    await updateDoc(api.raumRef(), { [`knTipps.${api.spielerId}`]: t, knTippIndex: idx + 1, knPhaseStart: Date.now() });
  } catch (e) {
    zeigeDebug("Fehler beim Tippen: " + e.message);
  }
}

// ---- Timer + Spielleiter-Logik ---------------------------------------------
function phaseDauer() { return status === "hand" ? HAND_ZEIT_MS : TIPP_ZEIT_MS; }

function aktualisiereTimer() {
  const id = status === "hand" ? "kn-timer-hand" : status === "tippen" ? "kn-timer-tipp" : null;
  if (!id) return;
  const bar = $(id);
  const rest = Math.max(0, phaseDauer() - (Date.now() - phaseStart));
  bar.firstElementChild.style.width = `${(rest / phaseDauer()) * 100}%`;
  bar.classList.toggle("gv-timer-knapp", rest <= 5000 && rest > 0);
}

function tick() {
  if (!el.wurzel) return;
  if (status === "hand" || status === "tippen") aktualisiereTimer();
  if (api.istLeiter) leiterTick();
}

function zufall(max) { return Math.floor(Math.random() * (max + 1)); }

async function leiterTick() {
  if (leiterBusy || !api.istLeiter) return;
  try {
    if (status === "hand") {
      const fertig = new Set(haende.filter((h) => h.runde === runde).map((h) => h.spielerId));
      const fehlend = aktive.filter((id) => !fertig.has(id));
      const abgelaufen = Date.now() - phaseStart >= HAND_ZEIT_MS;
      const abwesend = fehlend.filter((id) => !anwesend(id));
      const zuErgaenzen = abgelaufen ? fehlend : abwesend;
      if (zuErgaenzen.length > 0) {
        leiterBusy = true;
        await Promise.all(zuErgaenzen.map((id) =>
          setDoc(doc(api.db, "raeume", api.code, "knHaende", `${id}_${runde}`), {
            spielerId: id, spielerName: name(id), runde, anzahl: zufall(MAX_HOELZER), zeitpunkt: serverTimestamp()
          })
        ));
        return;
      }
      if (fehlend.length === 0) {
        leiterBusy = true;
        await updateDoc(api.raumRef(), { knStatus: "tippen", knTippIndex: 0, knTipps: {}, knPhaseStart: Date.now() });
      }
    } else if (status === "tippen") {
      if (tippIndex >= reihenfolge.length) {
        leiterBusy = true;
        await wertAus();
        return;
      }
      const dran = reihenfolge[tippIndex];
      const abgelaufen = Date.now() - phaseStart >= TIPP_ZEIT_MS;
      if (abgelaufen || !anwesend(dran)) {
        leiterBusy = true;
        const frei = [];
        for (let t = 0; t <= aktive.length * MAX_HOELZER; t++) if (!genommeneTipps().has(t)) frei.push(t);
        const t = frei[Math.floor(Math.random() * frei.length)];
        await updateDoc(api.raumRef(), { [`knTipps.${dran}`]: t, knTippIndex: tippIndex + 1, knPhaseStart: Date.now() });
      }
    }
  } catch (e) {
    zeigeDebug("Fehler im Spielablauf: " + e.message);
  } finally {
    // erst nach dem nächsten Snapshot wieder freigeben
    setTimeout(() => { leiterBusy = false; }, 250);
  }
}

async function wertAus() {
  const hand = {};
  let summe = 0;
  aktive.forEach((id) => {
    const h = handDieserRunde(id);
    hand[id] = h ? h.anzahl : 0;
    summe += hand[id];
  });
  const richtig = reihenfolge.filter((id) => Number(tipps[id]) === summe);
  await updateDoc(api.raumRef(), {
    knStatus: "aufloesung",
    knAuswertung: { runde, summe, haende: hand, tipps: { ...tipps }, richtig, reihenfolge: [...reihenfolge] }
  });
}

// ---- Auflösung -------------------------------------------------------------
function zeigeErgebnis() {
  if (!auswertung) return;
  const a = auswertung;
  $("kn-erg-label").textContent = `Runde ${a.runde + 1}`;
  $("kn-erg-summe").textContent = String(a.summe);
  if (a.richtig.length > 0) {
    $("kn-erg-titel").textContent = `${a.richtig.map(name).join(" und ")} ${a.richtig.length > 1 ? "haben" : "hat"} richtig getippt - und ${a.richtig.length > 1 ? "sind" : "ist"} raus!`;
  } else {
    $("kn-erg-titel").textContent = "Niemand lag richtig - es geht in die nächste Runde.";
  }
  const liste = $("kn-erg-liste");
  liste.innerHTML = "";
  a.reihenfolge.forEach((id) => {
    const s = spielerVon(id);
    const richtig = a.richtig.includes(id);
    const li = document.createElement("li");
    li.innerHTML =
      `<div class="kn-erg-zeile${richtig ? " richtig" : ""}" style="--spieler-farbe:${s?.farbe || "#7f8c8d"}">` +
      `<span class="kn-tipp-spieler">${avatarHtml(s?.icon, "kn-chip-avatar")}<span>${escapeHtml(s?.name ?? "?")}</span></span>` +
      `<span class="kn-erg-hand">${hoelzerSvg(a.haende[id] ?? 0, 70)}</span>` +
      `<span class="kn-erg-tipp">Tipp <strong>${escapeHtml(String(a.tipps[id] ?? "–"))}</strong>${richtig ? " ✓" : ""}</span>` +
      `</div>`;
    liste.appendChild(li);
  });
  const neueAktive = aktive.filter((id) => !a.richtig.includes(id));
  $("kn-weiter").hidden = !api.istLeiter;
  $("kn-weiter").textContent = neueAktive.length <= 1 ? "Endstand anzeigen" : "Nächste Runde";
}

async function weiter() {
  if (!auswertung) return;
  $("kn-weiter").disabled = true;
  try {
    const a = auswertung;
    const neueAusgeschieden = [...ausgeschieden, ...a.richtig];
    const neueAktive = aktive.filter((id) => !a.richtig.includes(id));
    if (neueAktive.length <= 1) {
      // Punkte: wer zuerst rausgeht, bekommt die meisten; der Verlierer 0.
      const n = anzahlStart;
      const batch = writeBatch(api.db);
      const punkteMap = {};
      neueAusgeschieden.forEach((id, i) => {
        const p = n - 1 - i;
        punkteMap[id] = p;
        batch.update(api.spielerRef(id), { punkte: increment(p) });
      });
      neueAktive.forEach((id) => { punkteMap[id] = 0; });
      batch.update(api.raumRef(), { knStatus: "beendet", knAusgeschieden: neueAusgeschieden, knAktive: neueAktive });
      await batch.commit();
      speichereWertung(api, "knobeln", punkteMap);
    } else {
      const naechste = a.runde + 1;
      // Der erste Tipp wandert jede Runde weiter.
      const start = naechste % neueAktive.length;
      const neueReihenfolge = [...neueAktive.slice(start), ...neueAktive.slice(0, start)];
      await updateDoc(api.raumRef(), {
        knStatus: "hand", knRunde: naechste, knAktive: neueAktive, knReihenfolge: neueReihenfolge,
        knTippIndex: 0, knTipps: {}, knPhaseStart: Date.now(), knAuswertung: null, knAusgeschieden: neueAusgeschieden
      });
    }
  } catch (e) {
    zeigeDebug("Fehler beim Weiterschalten: " + e.message);
  }
  $("kn-weiter").disabled = false;
}

// ---- Endstand --------------------------------------------------------------
function zeigeEndstand() {
  const verlierer = aktive[0];
  $("kn-verlierer").innerHTML = verlierer
    ? `Verloren hat <strong>${escapeHtml(name(verlierer))}</strong> - als Letzte*r übrig geblieben.`
    : "";
  const sortiert = [...spielerListe].sort((a, b) => (b.punkte ?? 0) - (a.punkte ?? 0));
  const liste = $("kn-endstand-liste");
  liste.innerHTML = "";
  sortiert.forEach((s, i) => {
    const li = document.createElement("li");
    li.innerHTML = spielerKarte(s.name, s.farbe, s.icon, s.punkte ?? 0, { rang: i + 1 });
    liste.appendChild(li);
  });
  $("kn-endstand-warten").hidden = api.istLeiter;
  const btn = $("kn-gesamtwertung-btn");
  btn.hidden = !(api.istLeiter && Boolean(api.olympiadeAnzahl));
  btn.onclick = () => api.zeigeGesamtwertung();
}
