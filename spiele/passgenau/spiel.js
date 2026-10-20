// ============================================================================
//  Passgenau
// ----------------------------------------------------------------------------
//  Alle bekommen dasselbe Feld und dieselben Teile (je nach Einstellung 3-5).
//  Die Teile müssen so aufs Feld gelegt werden, dass sie es genau ausfüllen -
//  alle Teile liegen innerhalb, keines überlappt. Teile lassen sich drehen
//  (Tipp aufs Teil oder Button). Wer zuerst fertig ist, bekommt
//  die meisten Punkte, dann der zweitschnellste usw.; wer es im Zeitlimit
//  nicht schafft, bekommt 0. Raumfelder beginnen mit "pg"; die Fertig-Zeiten
//  liegen in der Subcollection "pgFertig".
//  Die Rätsel erzeugt der Spielleiter beim Start: das Feld entsteht, indem
//  die Teile Stück für Stück aneinandergelegt werden - es ist also immer
//  lösbar. Gespeichert werden nur Feld und (zufällig gedrehte) Teile als
//  JSON-Text (Firestore erlaubt keine verschachtelten Arrays).
// ============================================================================
import {
  doc, setDoc, updateDoc, deleteDoc, collection, getDocs, onSnapshot,
  serverTimestamp, increment, writeBatch
} from "../../kern/firebase.js";
import { spielerKarte, zeigeDebug, initBereitSystem, renderWarteAvatare } from "../../kern/ui.js";
import { speichereWertung, punkteFuerRang } from "../../kern/wertung.js";

const COUNTDOWN_MS = 3000;
const MAX_RUNDEN = 15;
const STANDARD_RUNDEN = 5;
const TEILE_OPTIONEN = [3, 4, 5];
const STANDARD_TEILE = 4;
const ZEIT_OPTIONEN = [60, 90, 120, 180];
const STANDARD_ZEIT = 90;
const AUSWERTUNG_PUFFER_MS = 6000; // so lange bleibt die Lösung sichtbar

const FARBEN = ["#ef4444", "#f59e0b", "#22c55e", "#06b6d4", "#6366f1", "#ec4899"];

// Teile-Bibliothek (Tri-, Tetra- und Pentominos). Beim Aufbau des Feldes darf
// jede Form auch gespiegelt liegen; die Teile werden den Spielern aber nur
// gedreht angezeigt (Spiegeln gibt es nicht) - so bleibt jedes Rätsel lösbar.
const FORMEN = [
  [[0, 0], [1, 0], [2, 0]],
  [[0, 0], [0, 1], [1, 1]],
  [[0, 0], [1, 0], [2, 0], [3, 0]],
  [[0, 0], [1, 0], [0, 1], [1, 1]],
  [[0, 0], [1, 0], [2, 0], [1, 1]],
  [[1, 0], [2, 0], [0, 1], [1, 1]],
  [[0, 0], [0, 1], [0, 2], [1, 2]],
  [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]],
  [[0, 0], [2, 0], [0, 1], [1, 1], [2, 1]],
  [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]],
  [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2]],
  [[0, 0], [1, 0], [1, 1], [1, 2], [2, 2]],
  [[0, 0], [1, 0], [2, 0], [1, 1], [1, 2]]
];

// ---------------------------------------------------------------- Geometrie
function normiere(zellen) {
  const mx = Math.min(...zellen.map((z) => z[0]));
  const my = Math.min(...zellen.map((z) => z[1]));
  return zellen.map(([x, y]) => [x - mx, y - my]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
}
function dreheZellen(zellen) { return normiere(zellen.map(([x, y]) => [-y, x])); }
function spiegleZellen(zellen) { return normiere(zellen.map(([x, y]) => [-x, y])); }
function groesse(zellen) {
  return [Math.max(...zellen.map((z) => z[0])) + 1, Math.max(...zellen.map((z) => z[1])) + 1];
}
function alleLagen(zellen) {
  const gesehen = new Map();
  let z = normiere(zellen);
  for (let f = 0; f < 2; f++) {
    for (let r = 0; r < 4; r++) {
      gesehen.set(JSON.stringify(z), z);
      z = dreheZellen(z);
    }
    z = spiegleZellen(z);
  }
  return [...gesehen.values()];
}
const schluessel = (x, y) => x + "," + y;

function zufall(n) { return Math.floor(Math.random() * n); }
function mische(liste) {
  const a = [...liste];
  for (let i = a.length - 1; i > 0; i--) {
    const j = zufall(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function hatLoch(menge) {
  const xs = [...menge].map((k) => k.split(",").map(Number));
  const minX = Math.min(...xs.map((p) => p[0])) - 1, maxX = Math.max(...xs.map((p) => p[0])) + 1;
  const minY = Math.min(...xs.map((p) => p[1])) - 1, maxY = Math.max(...xs.map((p) => p[1])) + 1;
  const besucht = new Set([schluessel(minX, minY)]);
  const stapel = [[minX, minY]];
  while (stapel.length) {
    const [x, y] = stapel.pop();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < minX || nx > maxX || ny < minY || ny > maxY) continue;
      const k = schluessel(nx, ny);
      if (besucht.has(k) || menge.has(k)) continue;
      besucht.add(k);
      stapel.push([nx, ny]);
    }
  }
  const leereGesamt = (maxX - minX + 1) * (maxY - minY + 1) - menge.size;
  return besucht.size !== leereGesamt;
}

// Erzeugt ein lösbares Rätsel: Teile werden nacheinander möglichst kompakt
// aneinandergelegt. Ergebnis: { z: Feldzellen, t: Teile (zufällig gedreht) }.
function erzeugeRaetsel(anzahlTeile) {
  for (let versuch = 0; versuch < 400; versuch++) {
    const formen = mische(FORMEN).slice(0, anzahlTeile);
    const feld = new Set();
    const lagen = [];
    let ok = true;
    for (let i = 0; i < formen.length && ok; i++) {
      const varianten = alleLagen(formen[i]);
      if (i === 0) {
        const v = varianten[zufall(varianten.length)];
        v.forEach(([x, y]) => feld.add(schluessel(x, y)));
        lagen.push(v);
        continue;
      }
      let beste = null, besterWert = -1;
      for (const v of varianten) {
        for (let ox = -5; ox <= 8; ox++) {
          for (let oy = -5; oy <= 8; oy++) {
            let kontakt = 0, kollision = false;
            for (const [x, y] of v) {
              const gx = x + ox, gy = y + oy;
              if (feld.has(schluessel(gx, gy))) { kollision = true; break; }
              for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
                if (feld.has(schluessel(gx + dx, gy + dy))) kontakt++;
              }
            }
            if (kollision || kontakt === 0) continue;
            const wert = kontakt + Math.random() * 1.6;
            if (wert > besterWert) { besterWert = wert; beste = v.map(([x, y]) => [x + ox, y + oy]); }
          }
        }
      }
      if (!beste) { ok = false; break; }
      beste.forEach(([x, y]) => feld.add(schluessel(x, y)));
      lagen.push(beste);
    }
    if (!ok || hatLoch(feld)) continue;
    const alle = [...feld].map((k) => k.split(",").map(Number));
    const [bw, bh] = groesse(normiere(alle));
    if (bw > 7 || bh > 7) continue;
    const brett = normiere(alle);
    const teile = mische(lagen.map((l) => {
      let z = normiere(l);
      const drehungen = zufall(4);
      for (let r = 0; r < drehungen; r++) z = dreheZellen(z);
      return z;
    }));
    return { z: brett, t: teile };
  }
  return null;
}

const VORLAGE = `
  <div id="pg-setup" class="bildschirm-karte" hidden>
    <p class="hinweis-text">Alle bekommen dasselbe Feld und dieselben Teile. Zieht die Teile aufs Feld,
      bis es komplett gefüllt ist - kein Teil darf überstehen oder überlappen. Ein Tipp aufs Teil dreht es.
      Wer zuerst fertig ist, bekommt die meisten Punkte.</p>

    <div id="pg-einstellungen" hidden>
      <div class="setup-anzahl-zeile">
        <span>Anzahl Runden</span>
        <span class="anzahl-picker">
          <input id="pg-anzahl" type="text" inputmode="numeric" pattern="[0-9]*" class="anzahl-eingabe">
        </span>
      </div>
      <p id="pg-anzahl-max" class="hinweis-text"></p>

      <div class="pg-opt-block">
        <span class="pg-opt-titel">Teile pro Feld</span>
        <div id="pg-teile-opt" class="pg-opt"></div>
      </div>
      <div class="pg-opt-block">
        <span class="pg-opt-titel">Zeitlimit pro Runde</span>
        <div id="pg-zeit-opt" class="pg-opt"></div>
      </div>
    </div>

    <p id="pg-setup-fehler" class="fehler-text"></p>
    <p><button id="pg-starten" class="btn-primaer" hidden>Spiel starten</button></p>
    <p id="pg-setup-warten" hidden><em>Warte, bis der Spielleiter das Spiel startet …</em></p>
    <div id="pg-bereit-bereich" class="bereit-bereich" hidden></div>
  </div>

  <div id="pg-vorbereitung-screen" class="bildschirm-karte pg-mitte" hidden>
    <p class="kategorie">Passgenau</p>
    <p class="pg-vorb-text">Gleich geht's los: <strong id="pg-vorb-teile"></strong> Teile</p>
    <p class="zg-countdown-ziffer" id="pg-countdown-ziffer"></p>
  </div>

  <div id="pg-spiel-screen" class="bildschirm-karte" hidden>
    <div class="pg-kopf">
      <span id="pg-zeit-text" class="pg-zeit-text"></span>
      <span class="pg-kopf-btns">
        <button id="pg-drehen" type="button" class="pg-mini">↻ Drehen</button>
      </span>
    </div>
    <div class="pg-zeitbalken"><div id="pg-zeitbalken-fuell"></div></div>
    <div id="pg-canvas-wrap" class="pg-canvas-wrap">
      <canvas id="pg-canvas"></canvas>
      <div id="pg-fertig-overlay" class="pg-fertig-overlay" hidden></div>
    </div>
    <p id="pg-hinweis" class="hinweis-text pg-hinweis"></p>
    <div id="pg-status" class="warten-block"></div>
  </div>

  <div id="pg-ergebnis-screen" class="bildschirm-karte" hidden>
    <p class="kategorie">Passgenau</p>
    <h2 id="pg-erg-titel"></h2>
    <ul id="pg-erg-liste"></ul>
    <p><button id="pg-weiter" hidden>Weiter</button></p>
  </div>

  <div id="pg-endstand-screen" class="bildschirm-karte" hidden>
    <h1>Endstand</h1>
    <ul id="pg-endstand-liste"></ul>
    <p id="pg-endstand-warten" hidden><em>Der Spielleiter wählt gleich das nächste Spiel …</em></p>
    <p><button id="pg-gesamtwertung-btn" class="btn-primaer" type="button" hidden>Gesamtwertung</button></p>
  </div>
`;

let api = null;
let el = {};
let spielerListe = [];
let alleFertig = [];
let fertigUnsub = null;
let tickId = null;

let status = null;
let rundenIndex = -1;
let anzahlRunden = 0;
let entwurf = { runden: STANDARD_RUNDEN, teile: STANDARD_TEILE, zeit: STANDARD_ZEIT };
let anzahlEntwurfTimer = null;
let einstellungen = { teile: STANDARD_TEILE, zeit: STANDARD_ZEIT };
let raetselJson = "";
let raetselListe = [];
let vorbereitungSeit = 0;
let auswertungLaeuft = false;
let aktuelleRundeKey = "";
let spielfeld = null; // lokaler Zustand der laufenden Runde (siehe baueSpielfeld)

let bereitSystem = null;
let olympiadeAutoStart = false;

const $ = (id) => el.wurzel.querySelector("#" + id);

export async function starten(uebergebeneApi) {
  api = uebergebeneApi;
  el.wurzel = api.wurzel;
  el.wurzel.innerHTML = VORLAGE;
  bereitSystem = initBereitSystem(api, "pg");
  olympiadeAutoStart = false;

  verdrahteBedienelemente();
  starteListener();

  if (api.istLeiter && !api.raum?.pgStatus) {
    await updateDoc(api.raumRef(), {
      pgStatus: "setup", pgRundenIndex: 0, pgAnzahlRunden: 0, pgAnzahlEntwurf: STANDARD_RUNDEN,
      pgTeileEntwurf: STANDARD_TEILE, pgZeitEntwurf: STANDARD_ZEIT,
      pgTeile: STANDARD_TEILE, pgZeit: STANDARD_ZEIT, pgRaetsel: "", pgVorbereitungSeit: 0
    });
  }
  tickId = setInterval(rundenTick, 150);
  window.addEventListener("resize", beiGroessenaenderung);
}

function verdrahteBedienelemente() {
  $("pg-anzahl").addEventListener("input", () => {
    const feld = $("pg-anzahl");
    const bereinigt = feld.value.replace(/[^0-9]/g, "");
    if (bereinigt !== feld.value) feld.value = bereinigt;
    schreibeEntwurfLive();
  });
  $("pg-anzahl").addEventListener("change", () => {
    const feld = $("pg-anzahl");
    let wert = parseInt(feld.value, 10);
    if (!Number.isFinite(wert) || wert < 1) wert = 1;
    if (wert > MAX_RUNDEN) wert = MAX_RUNDEN;
    feld.value = String(wert);
  });
  $("pg-anzahl").addEventListener("focus", () => { $("pg-anzahl").select(); });
  $("pg-starten").addEventListener("click", spielStarten);
  $("pg-weiter").addEventListener("click", weiter);
  $("pg-drehen").addEventListener("click", () => spielfeld?.drehe());

  const baueOpt = (id, werte, label, feldName) => {
    const box = $(id);
    box.innerHTML = "";
    werte.forEach((w) => {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.wert = String(w);
      b.textContent = label(w);
      b.addEventListener("click", () => {
        if (!api.istLeiter) return;
        entwurf[feldName] = w;
        zeichneOptionen();
        updateDoc(api.raumRef(), {
          pgTeileEntwurf: entwurf.teile, pgZeitEntwurf: entwurf.zeit
        }).catch(() => {});
      });
      box.appendChild(b);
    });
  };
  baueOpt("pg-teile-opt", TEILE_OPTIONEN, (w) => `${w} Teile`, "teile");
  baueOpt("pg-zeit-opt", ZEIT_OPTIONEN, (w) => `${w} s`, "zeit");
}

function zeichneOptionen() {
  [["pg-teile-opt", entwurf.teile], ["pg-zeit-opt", entwurf.zeit]].forEach(([id, wert]) => {
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
    const wert = parseInt($("pg-anzahl").value, 10);
    if (Number.isFinite(wert) && wert > 0) {
      updateDoc(api.raumRef(), { pgAnzahlEntwurf: wert }).catch(() => {});
    }
  }, 300);
}

function starteListener() {
  fertigUnsub = onSnapshot(collection(api.db, "raeume", api.code, "pgFertig"), (snap) => {
    alleFertig = [];
    snap.forEach((d) => alleFertig.push(d.data()));
    if (status === "runde_aktiv") aktualisiereStatus();
    if (status === "ausgewertet") zeigeErgebnisListe(rundenIndex);
  });
}

export function beenden() {
  bereitSystem = null;
  if (fertigUnsub) { fertigUnsub(); fertigUnsub = null; }
  if (tickId) { clearInterval(tickId); tickId = null; }
  window.removeEventListener("resize", beiGroessenaenderung);
  if (spielfeld) { spielfeld.abbauen(); spielfeld = null; }
  clearTimeout(anzahlEntwurfTimer);
  el = {};
  spielerListe = [];
  alleFertig = [];
  status = null;
  rundenIndex = -1;
  anzahlRunden = 0;
  raetselJson = "";
  raetselListe = [];
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
  status = daten.pgStatus ?? null;
  anzahlRunden = daten.pgAnzahlRunden ?? 0;
  entwurf = {
    runden: daten.pgAnzahlEntwurf ?? STANDARD_RUNDEN,
    teile: daten.pgTeileEntwurf ?? STANDARD_TEILE,
    zeit: daten.pgZeitEntwurf ?? STANDARD_ZEIT
  };
  einstellungen = { teile: daten.pgTeile ?? STANDARD_TEILE, zeit: daten.pgZeit ?? STANDARD_ZEIT };

  const json = daten.pgRaetsel ?? "";
  if (json !== raetselJson) {
    raetselJson = json;
    try { raetselListe = json ? JSON.parse(json) : []; } catch { raetselListe = []; }
  }

  const neuerIndex = daten.pgRundenIndex ?? 0;
  const neuerStart = daten.pgVorbereitungSeit ?? 0;
  if (status === "runde_aktiv") {
    const key = neuerIndex + ":" + neuerStart;
    if (key !== aktuelleRundeKey) {
      aktuelleRundeKey = key;
      rundenIndex = neuerIndex;
      vorbereitungSeit = neuerStart;
      auswertungLaeuft = false;
      if (spielfeld) { spielfeld.abbauen(); spielfeld = null; }
      $("pg-fertig-overlay").hidden = true;
      $("pg-fertig-overlay").classList.remove("pg-zeit-aus");
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
    $("pg-setup").hidden = false;
  } else if (status === "runde_aktiv") {
    rundenTick();
  } else if (status === "ausgewertet") {
    zeigeErgebnis(rundenIndex);
    $("pg-ergebnis-screen").hidden = false;
  } else if (status === "beendet") {
    zeigeEndstand();
    $("pg-endstand-screen").hidden = false;
  }
}

function alleVerstecken() {
  ["pg-setup", "pg-vorbereitung-screen", "pg-spiel-screen", "pg-ergebnis-screen", "pg-endstand-screen"]
    .forEach((id) => { $(id).hidden = true; });
}

function zeigeSetup() {
  const anzahlFeld = $("pg-anzahl");
  const inOlympiade = Boolean(api.olympiadeAnzahl);
  if (inOlympiade) {
    const festgelegt = Math.min(Math.max(1, api.olympiadeAnzahl), MAX_RUNDEN);
    anzahlFeld.value = String(festgelegt);
    $("pg-anzahl-max").textContent =
      `In der Olympiade festgelegt: ${festgelegt} ${festgelegt === 1 ? "Runde" : "Runden"}.`;
    anzahlFeld.disabled = true;
  } else if (api.istLeiter) {
    if (!anzahlFeld.value) anzahlFeld.value = String(STANDARD_RUNDEN);
    $("pg-anzahl-max").textContent = `Bis zu ${MAX_RUNDEN} Runden.`;
    anzahlFeld.disabled = false;
  } else {
    anzahlFeld.value = String(entwurf.runden);
    $("pg-anzahl-max").textContent = `Bis zu ${MAX_RUNDEN} Runden.`;
    anzahlFeld.disabled = true;
  }
  zeichneOptionen();
  $("pg-einstellungen").hidden = false;
  $("pg-starten").hidden = !api.istLeiter;
  $("pg-setup-warten").hidden = api.istLeiter;
  bereitSystem?.render();

  if (api.istLeiter && api.olympiadeAnzahl && !olympiadeAutoStart && bereitSystem?.alleBereit()) {
    olympiadeAutoStart = true;
    spielStarten();
  }
}

async function spielStarten() {
  $("pg-setup-fehler").textContent = "";
  if (spielerListe.length < 1) {
    $("pg-setup-fehler").textContent = "Für Passgenau braucht ihr mindestens einen Spieler.";
    return;
  }
  let anzahl = parseInt($("pg-anzahl").value, 10);
  if (!Number.isFinite(anzahl) || anzahl < 1) anzahl = 1;
  if (anzahl > MAX_RUNDEN) anzahl = MAX_RUNDEN;

  const raetsel = [];
  for (let i = 0; i < anzahl; i++) {
    const r = erzeugeRaetsel(entwurf.teile);
    if (!r) {
      $("pg-setup-fehler").textContent = "Das Feld konnte nicht erzeugt werden - bitte nochmal versuchen.";
      return;
    }
    raetsel.push(r);
  }

  $("pg-starten").disabled = true;
  try {
    await raeumeSpieldatenAuf();
    await updateDoc(api.raumRef(), {
      pgStatus: "runde_aktiv",
      pgRundenIndex: 0,
      pgAnzahlRunden: anzahl,
      pgTeile: entwurf.teile,
      pgZeit: entwurf.zeit,
      pgRaetsel: JSON.stringify(raetsel),
      pgVorbereitungSeit: Date.now()
    });
  } catch (e) {
    zeigeDebug("Fehler beim Start: " + e.message);
  }
  $("pg-starten").disabled = false;
}

async function raeumeSpieldatenAuf() {
  const snap = await getDocs(collection(api.db, "raeume", api.code, "pgFertig"));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  alleFertig = [];
  await Promise.all(spielerListe.map((s) => updateDoc(api.spielerRef(s.id), { punkte: 0 })));
}

export async function vorZurueck() {
  try {
    await raeumeSpieldatenAuf();
    await updateDoc(api.raumRef(), {
      pgStatus: null, pgRundenIndex: 0, pgAnzahlRunden: 0, pgRaetsel: "", pgVorbereitungSeit: 0
    });
    await api.zurueckZurAuswahl();
  } catch (e) {
    zeigeDebug("Fehler beim Zurückkehren: " + e.message);
  }
}

// -------------------------------------------------------------- Rundenablauf
function fertigeDieserRunde(pos) {
  const aktiveIds = new Set(spielerListe.map((s) => s.id));
  return alleFertig.filter((a) => a.rundenIndex === pos && aktiveIds.has(a.spielerId));
}

function rundenTick() {
  if (!el.wurzel || status !== "runde_aktiv") return;
  const elapsedGesamt = Date.now() - vorbereitungSeit;

  if (elapsedGesamt < COUNTDOWN_MS) {
    $("pg-spiel-screen").hidden = true;
    $("pg-vorbereitung-screen").hidden = false;
    $("pg-vorb-teile").textContent = String(einstellungen.teile);
    const schritt = Math.min(2, Math.floor(elapsedGesamt / (COUNTDOWN_MS / 3)));
    $("pg-countdown-ziffer").textContent = ["3", "2", "1"][schritt];
  } else {
    $("pg-vorbereitung-screen").hidden = true;
    $("pg-spiel-screen").hidden = false;
    if (!spielfeld) starteSpielfeld();
    const spielMs = elapsedGesamt - COUNTDOWN_MS;
    const limit = einstellungen.zeit * 1000;
    const rest = Math.max(0, limit - spielMs);
    $("pg-zeit-text").textContent = `⏱ ${Math.ceil(rest / 1000)} s`;
    $("pg-zeitbalken-fuell").style.width = `${(rest / limit) * 100}%`;
    $("pg-zeitbalken-fuell").classList.toggle("knapp", rest < 15000);
    if (rest <= 0 && spielfeld && !spielfeld.loesungSichtbar && !eigenFertig()) {
      spielfeld.zeigeLoesung();
      const o = $("pg-fertig-overlay");
      o.hidden = false;
      o.classList.add("pg-zeit-aus");
      o.textContent = "⏰ Zeit abgelaufen - so geht's";
      $("pg-hinweis").textContent = "Gleich geht's weiter …";
    }
  }
  if (api.istLeiter) pruefeAuswertung(elapsedGesamt);
}

function eigenFertig() {
  return fertigeDieserRunde(rundenIndex).some((a) => a.spielerId === api.spielerId);
}

function aktualisiereStatus() {
  if (!el.wurzel) return;
  const fertig = fertigeDieserRunde(rundenIndex);
  const fertigIds = new Set(fertig.map((a) => a.spielerId));
  const ich = fertig.find((a) => a.spielerId === api.spielerId);
  if (ich) {
    if (spielfeld) spielfeld.sperren();
    $("pg-fertig-overlay").hidden = false;
    $("pg-fertig-overlay").classList.remove("pg-zeit-aus");
    $("pg-fertig-overlay").textContent = `✅ Geschafft in ${formatZeit(ich.ms)}`;
    $("pg-hinweis").textContent = "Warte auf die anderen …";
  } else if (!(spielfeld && spielfeld.loesungSichtbar)) {
    $("pg-fertig-overlay").hidden = true;
  }
  renderWarteAvatare($("pg-status"), spielerListe.filter((sp) => !fertigIds.has(sp.id) && sp.id !== api.spielerId));
}

async function meldeFertig() {
  if (status !== "runde_aktiv" || eigenFertig()) return;
  const ms = Math.max(0, Date.now() - vorbereitungSeit - COUNTDOWN_MS);
  if (ms > einstellungen.zeit * 1000 + 500) return;
  // lokal sofort merken, damit kein zweites Melden ausgelöst wird
  alleFertig.push({ spielerId: api.spielerId, spielerName: api.spielerName, rundenIndex, ms });
  aktualisiereStatus();
  try {
    await setDoc(doc(api.db, "raeume", api.code, "pgFertig", `${api.spielerId}_${rundenIndex}`), {
      spielerId: api.spielerId, spielerName: api.spielerName, rundenIndex, ms, zeitpunkt: serverTimestamp()
    });
  } catch (e) {
    alleFertig = alleFertig.filter((a) => !(a.spielerId === api.spielerId && a.rundenIndex === rundenIndex));
    if (spielfeld) spielfeld.entsperren();
    zeigeDebug("Fehler beim Melden: " + e.message);
  }
}

// Rangpunkte: Schnellste/r bekommt n (Anzahl Spieler), danach je einen weniger;
// Gleichstand teilt sich den Wert; wer nicht fertig wurde, bekommt 0.
function berechnePunkte(fertigListe, spielerIds) {
  const sortiert = [...fertigListe].sort((a, b) => a.ms - b.ms);
  const n = spielerIds.length;
  const ergebnis = {};
  spielerIds.forEach((id) => { ergebnis[id] = 0; });
  let vorherMs = null, vorherPunkte = null;
  sortiert.forEach((f, i) => {
    const punkte = (vorherMs !== null && f.ms === vorherMs) ? vorherPunkte : punkteFuerRang(i + 1, n);
    ergebnis[f.spielerId] = punkte;
    vorherMs = f.ms; vorherPunkte = punkte;
  });
  return ergebnis;
}

async function pruefeAuswertung(elapsedGesamt) {
  if (!api.istLeiter || status !== "runde_aktiv" || auswertungLaeuft) return;
  if (elapsedGesamt < COUNTDOWN_MS || spielerListe.length === 0) return;
  const fertig = fertigeDieserRunde(rundenIndex);
  const alleDa = spielerListe.every((sp) => fertig.some((f) => f.spielerId === sp.id));
  const zeitUm = elapsedGesamt - COUNTDOWN_MS >= einstellungen.zeit * 1000 + AUSWERTUNG_PUFFER_MS;
  if (!alleDa && !zeitUm) return;

  auswertungLaeuft = true;
  try {
    const punkte = berechnePunkte(fertig, spielerListe.map((s) => s.id));
    const batch = writeBatch(api.db);
    Object.entries(punkte).forEach(([id, wert]) => {
      batch.update(api.spielerRef(id), { punkte: increment(wert) });
    });
    batch.update(api.raumRef(), { pgStatus: "ausgewertet" });
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
  const fertig = fertigeDieserRunde(pos);
  const ids = spielerListe.map((s) => s.id);
  const punkte = berechnePunkte(fertig, ids);
  const zeilen = spielerListe.map((s) => ({
    s, f: fertig.find((x) => x.spielerId === s.id) ?? null, p: punkte[s.id] ?? 0
  })).sort((a, b) => {
    if (a.f && b.f) return a.f.ms - b.f.ms;
    if (a.f) return -1;
    if (b.f) return 1;
    return (a.s.name || "").localeCompare(b.s.name || "", "de");
  });
  const liste = $("pg-erg-liste");
  liste.innerHTML = "";
  zeilen.forEach(({ s, f, p }) => {
    const li = document.createElement("li");
    li.innerHTML = spielerKarte(s.name, s.farbe, s.icon, p > 0 ? `+${p}` : "0", {
      extra: f ? `Zeit: ${formatZeit(f.ms)}` : "Nicht geschafft",
      punkteRechts: s.punkte ?? 0
    });
    liste.appendChild(li);
  });
}

function zeigeErgebnis(pos) {
  $("pg-erg-titel").textContent = `Runde ${pos + 1} von ${anzahlRunden}`;
  zeigeErgebnisListe(pos);
  $("pg-weiter").hidden = !api.istLeiter;
  $("pg-weiter").textContent = pos + 1 >= anzahlRunden ? "Endstand anzeigen" : "Nächste Runde";
}

async function weiter() {
  $("pg-weiter").disabled = true;
  try {
    const naechster = rundenIndex + 1;
    if (naechster >= anzahlRunden) {
      await updateDoc(api.raumRef(), { pgStatus: "beendet" });
      speichereWertung(api, "passgenau", Object.fromEntries(spielerListe.map((s) => [s.id, s.punkte ?? 0])));
    } else {
      await updateDoc(api.raumRef(), {
        pgStatus: "runde_aktiv",
        pgRundenIndex: naechster,
        pgVorbereitungSeit: Date.now()
      });
    }
  } catch (e) {
    zeigeDebug("Fehler beim Weiterschalten: " + e.message);
  }
  $("pg-weiter").disabled = false;
}

function zeigeEndstand() {
  if (!el.wurzel) return;
  const sortiert = [...spielerListe].sort((a, b) => (b.punkte ?? 0) - (a.punkte ?? 0));
  const liste = $("pg-endstand-liste");
  liste.innerHTML = "";
  sortiert.forEach((s, i) => {
    const li = document.createElement("li");
    li.innerHTML = spielerKarte(s.name, s.farbe, s.icon, s.punkte ?? 0, { rang: i + 1 });
    liste.appendChild(li);
  });
  $("pg-endstand-warten").hidden = api.istLeiter;
  const btn = $("pg-gesamtwertung-btn");
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
  const r = raetselListe[rundenIndex];
  if (!r) return;
  $("pg-hinweis").textContent = "Zieh die Teile aufs Feld. Tipp aufs Teil = drehen.";
  spielfeld = baueSpielfeld($("pg-canvas"), $("pg-canvas-wrap"), r, meldeFertig);
  aktualisiereStatus();
}

// Eigenständige Spielfeld-Logik (Canvas, Ziehen, Drehen, Prüfen).
function baueSpielfeld(canvas, wrap, raetsel, beiFertig) {
  const ctx = canvas.getContext("2d");
  const feldSet = new Set(raetsel.z.map(([x, y]) => schluessel(x, y)));
  const [bw, bh] = groesse(raetsel.z);
  const teile = raetsel.t.map((zellen, i) => ({
    id: i, zellen: normiere(zellen), farbe: FARBEN[i % FARBEN.length],
    ort: "ablage", gx: 0, gy: 0, sx: 0, sy: 0 // sx/sy: Mittelpunkt des Ablage-Slots
  }));
  let reihenfolge = teile.map((t) => t.id); // letztes = oben
  let ausgewaehlt = null;
  let gesperrt = false;
  let zieh = null; // { teil, fx, fy, startX, startY, startZeit, bewegt, px, py, lift }
  let c = 40, W = 300, H = 400, bx = 0, by = 0, abl = 0.72;
  let gezeichnet = false;
  let loesungSichtbar = false;
  let rafId = 0;

  function layout() {
    const breite = Math.floor(wrap.clientWidth || 300);
    W = breite;
    c = Math.max(26, Math.min(48, Math.floor((W - 8) / Math.max(bw, 5))));
    bx = Math.round((W - bw * c) / 2);
    by = 6;
    // Ablage: Slots in Reihen (quadratisch, Kantenlänge = größte Teilseite * Ablage-Zelle)
    const ac = c * abl;
    let zeileY = by + bh * c + 14, zeileH = 0, x = 4;
    teile.forEach((t) => {
      const [w, h] = groesse(t.zellen);
      const seite = Math.max(w, h) * ac + 8;
      if (x + seite > W - 4 && x > 4) { x = 4; zeileY += zeileH + 4; zeileH = 0; }
      t.sx = x + seite / 2;
      t.sy = zeileY + seite / 2;
      zeileH = Math.max(zeileH, seite);
      x += seite + 2;
    });
    H = Math.ceil(zeileY + zeileH + 8);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    zeichne();
  }

  function ursprung(t) {
    if (zieh && zieh.bewegt && zieh.teil === t) {
      const [w, h] = groesse(t.zellen);
      return { x: zieh.px - zieh.fx * w * c, y: zieh.py - zieh.fy * h * c - zieh.lift, s: c };
    }
    if (t.ort === "brett") return { x: bx + t.gx * c, y: by + t.gy * c, s: c };
    const [w, h] = groesse(t.zellen);
    const ac = c * abl;
    return { x: t.sx - (w * ac) / 2, y: t.sy - (h * ac) / 2, s: ac };
  }

  function belegung() {
    const zaehler = new Map();
    teile.forEach((t) => {
      if (t.ort !== "brett") return;
      t.zellen.forEach(([x, y]) => {
        const k = schluessel(x + t.gx, y + t.gy);
        zaehler.set(k, (zaehler.get(k) ?? 0) + 1);
      });
    });
    return zaehler;
  }

  function zeichne() {
    gezeichnet = false;
    ctx.clearRect(0, 0, W, H);
    // Feld
    feldSet.forEach((k) => {
      const [x, y] = k.split(",").map(Number);
      ctx.fillStyle = "#f4ead0";
      ctx.fillRect(bx + x * c, by + y * c, c, c);
      ctx.strokeStyle = "rgba(120,100,60,0.35)";
      ctx.lineWidth = 1;
      ctx.strokeRect(bx + x * c + 0.5, by + y * c + 0.5, c - 1, c - 1);
    });
    ctx.strokeStyle = "#7c5a2a";
    ctx.lineWidth = 2.5;
    feldSet.forEach((k) => {
      const [x, y] = k.split(",").map(Number);
      kanten(x, y, (nx, ny) => feldSet.has(schluessel(nx, ny)), bx, by, c);
    });
    // Ablage-Hintergrund
    ctx.fillStyle = "rgba(0,0,0,0.12)";
    const ablageTop = by + bh * c + 8;
    roundRect(2, ablageTop, W - 4, H - ablageTop - 2, 12);
    ctx.fill();

    const belegt = belegung();
    // 1) Teile füllen
    reihenfolge.forEach((id) => {
      const t = teile[id];
      const o = ursprung(t);
      ctx.globalAlpha = zieh && zieh.bewegt && zieh.teil === t ? 0.92 : 1;
      t.zellen.forEach(([x, y]) => {
        const px = o.x + x * o.s, py = o.y + y * o.s;
        ctx.fillStyle = t.farbe;
        ctx.fillRect(px, py, o.s + 0.5, o.s + 0.5);
        ctx.fillStyle = "rgba(255,255,255,0.18)";
        ctx.fillRect(px + 2, py + 2, o.s - 4, Math.max(2, o.s * 0.18));
      });
      ctx.globalAlpha = 1;
    });
    // 2) Überlappungen und Zellen außerhalb schraffieren (Streifen in den Farben der beteiligten Teile)
    const farbenJeZelle = new Map();
    teile.forEach((t) => {
      if (t.ort !== "brett" || (zieh && zieh.bewegt && zieh.teil === t)) return;
      t.zellen.forEach(([x, y]) => {
        const k = schluessel(x + t.gx, y + t.gy);
        if (!farbenJeZelle.has(k)) farbenJeZelle.set(k, []);
        farbenJeZelle.get(k).push(t.farbe);
      });
    });
    farbenJeZelle.forEach((farben, k) => {
      const draussen = !feldSet.has(k);
      if (farben.length < 2 && !draussen) return;
      const [x, y] = k.split(",").map(Number);
      const a = farben[0], b = farben.length > 1 ? farben[1] : "#dc2626";
      hatch(bx + x * c, by + y * c, c, a, b);
    });
    // 3) Umrandungen
    reihenfolge.forEach((id) => {
      const t = teile[id];
      const o = ursprung(t);
      const eigen = new Set(t.zellen.map(([x, y]) => schluessel(x, y)));
      ctx.strokeStyle = ausgewaehlt === t ? "#ffffff" : "rgba(0,0,0,0.45)";
      ctx.lineWidth = ausgewaehlt === t ? 3 : 1.6;
      t.zellen.forEach(([x, y]) => {
        kanten(x, y, (nx, ny) => eigen.has(schluessel(nx, ny)), o.x, o.y, o.s);
      });
    });

    // Einrast-Vorschau beim Ziehen
    if (zieh && zieh.bewegt) {
      const ziel = einrastZiel(zieh.teil);
      if (ziel) {
        ctx.strokeStyle = "rgba(255,255,255,0.9)";
        ctx.setLineDash([5, 4]);
        ctx.lineWidth = 2;
        zieh.teil.zellen.forEach(([x, y]) => {
          ctx.strokeRect(bx + (x + ziel.gx) * c + 2, by + (y + ziel.gy) * c + 2, c - 4, c - 4);
        });
        ctx.setLineDash([]);
      }
    }
  }

  // Diagonale Streifen in zwei Farben innerhalb einer Zelle
  function hatch(x, y, s, farbeA, farbeB) {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, s, s);
    ctx.clip();
    ctx.fillStyle = farbeA;
    ctx.fillRect(x, y, s, s);
    ctx.strokeStyle = farbeB;
    ctx.lineWidth = Math.max(4, s * 0.17);
    ctx.beginPath();
    for (let d = -s; d < s * 2; d += Math.max(9, s * 0.34)) {
      ctx.moveTo(x + d, y + s);
      ctx.lineTo(x + d + s, y);
    }
    ctx.stroke();
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function kanten(x, y, hatNachbar, ox, oy, s) {
    const px = ox + x * s, py = oy + y * s;
    ctx.beginPath();
    if (!hatNachbar(x, y - 1)) { ctx.moveTo(px, py); ctx.lineTo(px + s, py); }
    if (!hatNachbar(x, y + 1)) { ctx.moveTo(px, py + s); ctx.lineTo(px + s, py + s); }
    if (!hatNachbar(x - 1, y)) { ctx.moveTo(px, py); ctx.lineTo(px, py + s); }
    if (!hatNachbar(x + 1, y)) { ctx.moveTo(px + s, py); ctx.lineTo(px + s, py + s); }
    ctx.stroke();
  }

  function anfordern() {
    if (gezeichnet) return;
    gezeichnet = true;
    rafId = requestAnimationFrame(zeichne);
  }

  function einrastZiel(t) {
    const o = ursprung(t);
    const [w, h] = groesse(t.zellen);
    const mx = o.x + (w * c) / 2, my = o.y + (h * c) / 2;
    if (mx < bx - c * 0.8 || mx > bx + bw * c + c * 0.8 || my < by - c * 0.8 || my > by + bh * c + c * 0.8) return null;
    return { gx: Math.round((o.x - bx) / c), gy: Math.round((o.y - by) / c) };
  }

  function treffer(px, py) {
    for (let i = reihenfolge.length - 1; i >= 0; i--) {
      const t = teile[reihenfolge[i]];
      const o = ursprung(t);
      for (const [x, y] of t.zellen) {
        const x0 = o.x + x * o.s, y0 = o.y + y * o.s;
        const rand = t.ort === "ablage" ? 4 : 0;
        if (px >= x0 - rand && px <= x0 + o.s + rand && py >= y0 - rand && py <= y0 + o.s + rand) return t;
      }
    }
    return null;
  }

  function nachOben(t) {
    reihenfolge = reihenfolge.filter((id) => id !== t.id);
    reihenfolge.push(t.id);
  }

  function pruefe() {
    if (gesperrt) return;
    if (!teile.every((t) => t.ort === "brett")) return;
    const belegt = belegung();
    for (const [k, n] of belegt) {
      if (n !== 1 || !feldSet.has(k)) return;
    }
    if (belegt.size !== feldSet.size) return;
    gesperrt = true;
    ausgewaehlt = null;
    zeichne();
    beiFertig();
  }

  function transformiere(t, funktion) {
    if (gesperrt || !t) return;
    if (t.ort === "brett") {
      const [w, h] = groesse(t.zellen);
      const cx = t.gx + w / 2, cy = t.gy + h / 2;
      t.zellen = funktion(t.zellen);
      const [nw, nh] = groesse(t.zellen);
      t.gx = Math.round(cx - nw / 2);
      t.gy = Math.round(cy - nh / 2);
    } else {
      t.zellen = funktion(t.zellen);
    }
    if (t.ort === "ablage") layout(); else zeichne();
    pruefe();
  }

  // Sucht eine Lösung (nur Drehungen) - wird nur gebraucht, wenn die Zeit abläuft.
  function loese() {
    const lagenJeTeil = teile.map((t) => {
      const m = new Map();
      let z = normiere(t.zellen);
      for (let r = 0; r < 4; r++) { m.set(JSON.stringify(z), z); z = dreheZellen(z); }
      return [...m.values()];
    });
    const felder = [...feldSet].map((k) => k.split(",").map(Number)).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    const belegtL = new Set();
    const benutzt = new Array(teile.length).fill(false);
    const ergebnis = new Array(teile.length).fill(null);
    function suche() {
      const z = felder.find(([x, y]) => !belegtL.has(schluessel(x, y)));
      if (!z) return true;
      for (let i = 0; i < teile.length; i++) {
        if (benutzt[i]) continue;
        for (const v of lagenJeTeil[i]) {
          const ox = z[0] - v[0][0], oy = z[1] - v[0][1];
          const ps = v.map(([x, y]) => [x + ox, y + oy]);
          if (!ps.every(([x, y]) => feldSet.has(schluessel(x, y)) && !belegtL.has(schluessel(x, y)))) continue;
          ps.forEach(([x, y]) => belegtL.add(schluessel(x, y)));
          benutzt[i] = true;
          ergebnis[i] = { zellen: v, gx: ox, gy: oy };
          if (suche()) return true;
          ps.forEach(([x, y]) => belegtL.delete(schluessel(x, y)));
          benutzt[i] = false;
        }
      }
      return false;
    }
    return suche() ? ergebnis : null;
  }

  function runter(e) {
    if (gesperrt) return;
    const r = canvas.getBoundingClientRect();
    const px = e.clientX - r.left, py = e.clientY - r.top;
    const t = treffer(px, py);
    if (!t) return;
    e.preventDefault();
    try { canvas.setPointerCapture(e.pointerId); } catch { /* synthetische Pointer */ }
    const o = ursprung(t);
    const [w, h] = groesse(t.zellen);
    zieh = {
      teil: t, pointerId: e.pointerId,
      fx: Math.min(1, Math.max(0, (px - o.x) / (w * o.s))),
      fy: Math.min(1, Math.max(0, (py - o.y) / (h * o.s))),
      startX: px, startY: py, startZeit: Date.now(), bewegt: false, px, py,
      lift: e.pointerType === "mouse" ? 0 : c * 1.1
    };
    ausgewaehlt = t;
    nachOben(t);
    zeichne();
  }

  function bewegt(e) {
    if (!zieh || e.pointerId !== zieh.pointerId) return;
    const r = canvas.getBoundingClientRect();
    zieh.px = e.clientX - r.left;
    zieh.py = e.clientY - r.top;
    if (!zieh.bewegt && Math.hypot(zieh.px - zieh.startX, zieh.py - zieh.startY) > 8) zieh.bewegt = true;
    if (zieh.bewegt) anfordern();
  }

  function hoch(e) {
    if (!zieh || (e && e.pointerId !== zieh.pointerId)) return;
    const z = zieh;
    const t = z.teil;
    const war = t.ort;
    if (!z.bewegt) {
      zieh = null;
      // Tipp: drehen (ohne Verschieben)
      transformiere(t, dreheZellen);
      return;
    }
    const ziel = einrastZiel(t);
    zieh = null;
    if (ziel) {
      t.ort = "brett"; t.gx = ziel.gx; t.gy = ziel.gy;
    } else {
      t.ort = "ablage";
    }
    if (war !== t.ort || t.ort === "ablage") layout(); else zeichne();
    pruefe();
  }

  canvas.style.touchAction = "none";
  canvas.addEventListener("pointerdown", runter);
  canvas.addEventListener("pointermove", bewegt);
  canvas.addEventListener("pointerup", hoch);
  canvas.addEventListener("pointercancel", hoch);

  layout();

  const api2 = {
    get gesperrt() { return gesperrt; },
    layout,
    drehe() { transformiere(ausgewaehlt ?? teile.find((t) => t.ort === "ablage") ?? teile[0], dreheZellen); },
    get loesungSichtbar() { return loesungSichtbar; },
    zeigeLoesung() {
      gesperrt = true; zieh = null; ausgewaehlt = null; loesungSichtbar = true;
      const l = loese();
      if (l) l.forEach((p, i) => { teile[i].zellen = p.zellen; teile[i].ort = "brett"; teile[i].gx = p.gx; teile[i].gy = p.gy; });
      zeichne();
    },
    sperren() { gesperrt = true; zieh = null; zeichne(); },
    entsperren() { gesperrt = false; },
    abbauen() {
      cancelAnimationFrame(rafId);
      canvas.removeEventListener("pointerdown", runter);
      canvas.removeEventListener("pointermove", bewegt);
      canvas.removeEventListener("pointerup", hoch);
      canvas.removeEventListener("pointercancel", hoch);
    }
  };
  return api2;
}

export { erzeugeRaetsel, berechnePunkte };
