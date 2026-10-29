// ============================================================================
//  Memory (von oben)
// ----------------------------------------------------------------------------
//  Kein normales Memory: Man schaut von oben aufs Spielfeld und steuert eine
//  Figur mit vier Pfeiltasten (am Handy ein Steuerkreuz) frei über die Karten.
//  Jede*r hat sein/ihr eigenes Feld - die Karten liegen aber bei allen an
//  derselben Stelle (der Spielleiter erzeugt die Anordnung pro Runde).
//  Aufdecken geht nur, wenn die Figur auf einer Karte steht; dann leuchtet der
//  Aufdecken-Knopf. Höchstens 2 Karten sind gleichzeitig offen. Ist es kein
//  Paar, drehen sich beide nach kurzer Zeit automatisch wieder um. Gefundene Paare bleiben liegen.
//  Wer zuerst alle Paare hat, bekommt die meisten Punkte, dann der zweitschnellste
//  usw. Es gibt kein Zeitlimit - die Runde endet, wenn alle fertig sind.
//
//  Teammodus: beide Teams spielen je auf EINEM gemeinsamen Feld. Jede*r deckt
//  nur eine Karte auf (das Paar entsteht aus den Karten zweier Teammitglieder)
//  und kann sich nicht bewegen, solange die eigene Karte offen ist. Das
//  Team-Feld liegt als Dokument in der Subcollection "mmTeam", die Positionen
//  der Figuren in "mmPos". Im Einzelspiel liegen die Fertig-Zeiten in "mmFertig".
//  Raumfelder beginnen mit "mm".
// ============================================================================
import {
  doc, setDoc, updateDoc, deleteDoc, collection, getDocs, onSnapshot,
  serverTimestamp, increment, writeBatch, runTransaction
} from "../../kern/firebase.js";
import {
  spielerKarte, zeigeDebug, initBereitSystem, renderWarteAvatare, teamEndstandHtml, teamGruppeHtml,
  avatarBild
} from "../../kern/ui.js";
import { speichereWertung, punkteFuerRang } from "../../kern/wertung.js";
import { erstelleTeams, ergaenzeFehlendeTeams } from "../../kern/teams.js";

const COUNTDOWN_MS = 3000;
const MAX_RUNDEN = 15;
const STANDARD_RUNDEN = 3;
const PAARE_OPTIONEN = [6, 8, 10, 12];
const STANDARD_PAARE = 8;
const FLIP_MS = 1500;         // so lange bleibt ein Fehlpaar sichtbar
const SPALTEN = 4;
const DRILLING_OPTIONEN = [5, 6, 7];
const STANDARD_DRILLINGE = 6;
// Spalten je nach Kartenzahl: 4 bei Paaren, bei Drillingen 5/6/6 (15/18/21 Karten)
function spaltenFuer(anzahl) { return anzahl === 15 ? 5 : anzahl === 18 || anzahl === 21 ? 6 : SPALTEN; }
const MOTIVE = 22;            // bilder/memory/f01.webp ... f22.webp
const BILD_VERSION = "391";
const TEMPO = 2.7;            // Zellen pro Sekunde
const KARTE = 0.8;            // Kartenkantenlänge in Zellen
const FIGUR_R = 0.3;          // Figurenradius in Zellen
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
// Anordnung einer Runde: Liste der Motiv-Nummern, jedes Motiv genau zweimal.
function erzeugeAnordnung(gruppen, g = 2) {
  const auswahl = mische([...Array(MOTIVE).keys()]).slice(0, gruppen);
  const karten = [];
  auswahl.forEach((m) => { for (let k = 0; k < g; k++) karten.push(m); });
  return mische(karten);
}

const VORLAGE = `
  <div id="mm-setup" class="bildschirm-karte" hidden>
    <p class="hinweis-text">Memory von oben: Lauft mit eurer Figur über die Karten und deckt auf, wenn ihr auf einer
      Karte steht. Alle haben dieselbe Anordnung. Wer zuerst alle Paare hat, bekommt die meisten Punkte.</p>

    <div id="mm-einstellungen" hidden>
      <div class="setup-anzahl-zeile">
        <span>Anzahl Runden</span>
        <span class="anzahl-picker">
          <input id="mm-anzahl" type="text" inputmode="numeric" pattern="[0-9]*" class="anzahl-eingabe">
        </span>
      </div>
      <p id="mm-anzahl-max" class="hinweis-text"></p>

      <div class="pg-opt-block" id="mm-paare-block">
        <span class="pg-opt-titel">Paare pro Feld</span>
        <div id="mm-paare-opt" class="pg-opt"></div>
      </div>
      <div class="pg-opt-block" id="mm-dr-block" hidden>
        <span class="pg-opt-titel">Drillinge pro Feld</span>
        <div id="mm-dr-opt" class="pg-opt"></div>
      </div>
    </div>

    <div id="mm-teammodus-zeile" class="setup-modusblock" hidden>
      <div class="setup-moduszeile">
        <span class="modus-text-zeile">
          <span class="schalter-text">Teammodus</span>
          <details class="modus-info">
            <summary aria-label="Erklärung zum Teammodus">i</summary>
            <div>Jedes Team spielt auf einem gemeinsamen Feld. Jede*r deckt nur eine Karte auf und kann sich dabei nicht bewegen - das Paar entsteht aus den Karten von zwei Teammitgliedern. Geht nur bei gerader Spielerzahl, jedes Team braucht mindestens 2 Personen.</div>
          </details>
        </span>
        <label class="schalter-zeile">
          <span class="schalter">
            <input type="checkbox" id="mm-teammodus">
            <span class="schalter-regler"></span>
          </span>
        </label>
      </div>
    </div>

    <p id="mm-teammodus-hinweis" class="hinweis-text" hidden>Der Teammodus geht nur bei einer geraden Spielerzahl.</p>

    <div id="mm-dr-zeile" class="setup-modusblock" hidden>
      <div class="setup-moduszeile">
        <span class="modus-text-zeile">
          <span class="schalter-text">Dreierteams</span>
          <details class="modus-info">
            <summary aria-label="Erklärung zu Dreierteams">i</summary>
            <div>Zwei Teams mit je 3 Personen - das geht nur bei genau 6 Spielern. Statt Paaren gibt es Drillinge: drei gleiche Karten. Jede*r im Team deckt eine davon auf.</div>
          </details>
        </span>
        <label class="schalter-zeile">
          <span class="schalter">
            <input type="checkbox" id="mm-dr">
            <span class="schalter-regler"></span>
          </span>
        </label>
      </div>
    </div>
    <p id="mm-dr-hinweis" class="hinweis-text" hidden>Dreierteams gehen nur bei genau 6 Spielern.</p>

    <div id="mm-teams" hidden>
      <div class="zt-team-grid">
        <button type="button" id="mm-team-wahl-blau" class="zt-team zt-team-blau zt-team-waehlbar">
          <h3>🔵 Team Blau</h3>
          <ul id="mm-team-blau"></ul>
        </button>
        <button type="button" id="mm-team-wahl-rot" class="zt-team zt-team-rot zt-team-waehlbar">
          <h3>🔴 Team Rot</h3>
          <ul id="mm-team-rot"></ul>
        </button>
      </div>
      <p><button id="mm-teams-zufall" class="btn-flach" hidden>Zufällige Teams</button></p>
    </div>

    <p id="mm-setup-fehler" class="fehler-text"></p>
    <p><button id="mm-starten" class="btn-primaer" hidden>Spiel starten</button></p>
    <p id="mm-setup-warten" hidden><em>Warte, bis der Spielleiter das Spiel startet …</em></p>
    <div id="mm-bereit-bereich" class="bereit-bereich" hidden></div>
  </div>

  <div id="mm-vorbereitung-screen" class="bildschirm-karte pg-mitte" hidden>
    <p class="kategorie">Memory</p>
    <p class="pg-vorb-text">Gleich geht's los: <strong id="mm-vorb-paare"></strong></p>
    <p class="zg-countdown-ziffer" id="mm-countdown-ziffer"></p>
  </div>

  <div id="mm-spiel-screen" class="bildschirm-karte" hidden>
    <div class="pg-kopf">
      <span id="mm-zeit-text" class="pg-zeit-text">⏱ 0 s</span>
      <span id="mm-paare-text" class="mm-paare-text"></span>
    </div>
    <div id="mm-canvas-wrap" class="pg-canvas-wrap">
      <canvas id="mm-canvas"></canvas>
      <div id="mm-fertig-overlay" class="pg-fertig-overlay" hidden></div>
    </div>
    <div class="mm-steuerung">
      <div class="mm-joy" id="mm-kreuz" aria-label="Joystick">
        <div class="mm-joy-knopf" id="mm-joy-knopf"></div>
      </div>
      <button type="button" id="mm-aktion" class="mm-aktion" disabled>Aufdecken</button>
    </div>
    <p id="mm-hinweis" class="hinweis-text pg-hinweis"></p>
    <div id="mm-status" class="warten-block"></div>
  </div>

  <div id="mm-ergebnis-screen" class="bildschirm-karte" hidden>
    <p class="kategorie">Memory</p>
    <h2 id="mm-erg-titel"></h2>
    <ul id="mm-erg-liste"></ul>
    <p><button id="mm-weiter" hidden>Weiter</button></p>
  </div>

  <div id="mm-endstand-screen" class="bildschirm-karte" hidden>
    <h1>Endstand</h1>
    <div id="mm-endstand-teams" hidden></div>
    <ul id="mm-endstand-liste"></ul>
    <p id="mm-endstand-warten" hidden><em>Der Spielleiter wählt gleich das nächste Spiel …</em></p>
    <p><button id="mm-gesamtwertung-btn" class="btn-primaer" type="button" hidden>Gesamtwertung</button></p>
  </div>
`;

let api = null;
let el = {};
let spielerListe = [];
let alleFertig = [];       // Einzelspiel: Fertig-Dokumente
let teamDocs = {};         // Teammodus: Team-Felder ("blau_0" -> Daten)
let posDocs = {};          // Teammodus: Positionen der Figuren
let fertigUnsub = null, teamUnsub = null, posUnsub = null;
let tickId = null;

let status = null;
let rundenIndex = -1;
let anzahlRunden = 0;
let entwurf = { runden: STANDARD_RUNDEN, paare: STANDARD_PAARE, drillinge: STANDARD_DRILLINGE };
let drillingModus = false;   // Dreierteams: Drillinge statt Paare
let anzahlEntwurfTimer = null;
let einstellungen = { paare: STANDARD_PAARE, gruppe: 2 };
let layoutJson = "";
let layoutListe = [];
let vorbereitungSeit = 0;
let auswertungLaeuft = false;
let aktuelleRundeKey = "";
let spielfeld = null;
let teammodus = false;
let teams = {};

let bereitSystem = null;
let olympiadeAutoStart = false;

const $ = (id) => el.wurzel.querySelector("#" + id);

export async function starten(uebergebeneApi) {
  api = uebergebeneApi;
  el.wurzel = api.wurzel;
  el.wurzel.innerHTML = VORLAGE;
  bereitSystem = initBereitSystem(api, "mm");
  olympiadeAutoStart = false;

  verdrahteBedienelemente();
  starteListener();

  if (api.istLeiter && !api.raum?.mmStatus) {
    await updateDoc(api.raumRef(), {
      mmStatus: "setup", mmRundenIndex: 0, mmAnzahlRunden: 0, mmAnzahlEntwurf: STANDARD_RUNDEN,
      mmPaareEntwurf: STANDARD_PAARE, mmDrillingeEntwurf: STANDARD_DRILLINGE, mmDrillinge: false, mmGruppe: 2,
      mmPaare: STANDARD_PAARE, mmLayouts: "", mmVorbereitungSeit: 0,
      mmTeammodus: false, mmTeams: {}
    });
  }
  tickId = setInterval(rundenTick, 150);
  window.addEventListener("resize", beiGroessenaenderung);
}

function verdrahteBedienelemente() {
  $("mm-anzahl").addEventListener("input", () => {
    const feld = $("mm-anzahl");
    const bereinigt = feld.value.replace(/[^0-9]/g, "");
    if (bereinigt !== feld.value) feld.value = bereinigt;
    schreibeEntwurfLive();
  });
  $("mm-anzahl").addEventListener("change", () => {
    const feld = $("mm-anzahl");
    let wert = parseInt(feld.value, 10);
    if (!Number.isFinite(wert) || wert < 1) wert = 1;
    if (wert > MAX_RUNDEN) wert = MAX_RUNDEN;
    feld.value = String(wert);
  });
  $("mm-anzahl").addEventListener("focus", () => { $("mm-anzahl").select(); });
  $("mm-starten").addEventListener("click", spielStarten);
  $("mm-weiter").addEventListener("click", weiter);
  $("mm-teammodus").addEventListener("change", teammodusUmschalten);
  $("mm-team-wahl-blau").addEventListener("click", () => waehleEigenesTeam("blau"));
  $("mm-team-wahl-rot").addEventListener("click", () => waehleEigenesTeam("rot"));
  $("mm-teams-zufall").addEventListener("click", zufaelligeTeams);

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
          mmPaareEntwurf: entwurf.paare, mmDrillingeEntwurf: entwurf.drillinge
        }).catch(() => {});
      });
      box.appendChild(b);
    });
  };
  baueOpt("mm-paare-opt", PAARE_OPTIONEN, (w) => `${w} Paare`, "paare");
  baueOpt("mm-dr-opt", DRILLING_OPTIONEN, (w) => `${w} Drillinge`, "drillinge");
  $("mm-dr").addEventListener("change", drillingUmschalten);
}

function zeichneOptionen() {
  [["mm-paare-opt", entwurf.paare], ["mm-dr-opt", entwurf.drillinge]].forEach(([id, wert]) => {
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
    const wert = parseInt($("mm-anzahl").value, 10);
    if (Number.isFinite(wert) && wert > 0) {
      updateDoc(api.raumRef(), { mmAnzahlEntwurf: wert }).catch(() => {});
    }
  }, 300);
}

function starteListener() {
  const basis = ["raeume", api.code];
  fertigUnsub = onSnapshot(collection(api.db, ...basis, "mmFertig"), (snap) => {
    alleFertig = [];
    snap.forEach((d) => alleFertig.push(d.data()));
    nachFertigAenderung();
  });
  teamUnsub = onSnapshot(collection(api.db, ...basis, "mmTeam"), (snap) => {
    const neu = {};
    snap.forEach((d) => { neu[d.id] = d.data(); });
    teamDocs = neu;
    nachFertigAenderung();
    spielfeld?.teamZustandGeaendert();
  });
  posUnsub = onSnapshot(collection(api.db, ...basis, "mmPos"), (snap) => {
    const neu = {};
    snap.forEach((d) => { neu[d.id] = d.data(); });
    posDocs = neu;
  });
}

function nachFertigAenderung() {
  if (status === "runde_aktiv") aktualisiereStatus();
  if (status === "ausgewertet") zeigeErgebnisListe(rundenIndex);
}

export function beenden() {
  bereitSystem = null;
  [fertigUnsub, teamUnsub, posUnsub].forEach((u) => { if (u) u(); });
  fertigUnsub = teamUnsub = posUnsub = null;
  if (tickId) { clearInterval(tickId); tickId = null; }
  window.removeEventListener("resize", beiGroessenaenderung);
  if (spielfeld) { spielfeld.abbauen(); spielfeld = null; }
  clearTimeout(anzahlEntwurfTimer);
  el = {};
  spielerListe = [];
  alleFertig = [];
  teamDocs = {};
  posDocs = {};
  status = null;
  rundenIndex = -1;
  anzahlRunden = 0;
  layoutJson = "";
  layoutListe = [];
  vorbereitungSeit = 0;
  auswertungLaeuft = false;
  aktuelleRundeKey = "";
  teammodus = false;
  teams = {};
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
  status = daten.mmStatus ?? null;
  anzahlRunden = daten.mmAnzahlRunden ?? 0;
  teammodus = !!daten.mmTeammodus && !api.olympiadeAnzahl;
  teams = daten.mmTeams ?? {};
  entwurf = {
    runden: daten.mmAnzahlEntwurf ?? STANDARD_RUNDEN,
    paare: daten.mmPaareEntwurf ?? STANDARD_PAARE,
    drillinge: daten.mmDrillingeEntwurf ?? STANDARD_DRILLINGE
  };
  einstellungen = { paare: daten.mmPaare ?? STANDARD_PAARE, gruppe: daten.mmGruppe ?? 2 };
  drillingModus = teammodus && !!daten.mmDrillinge && einstellungen.gruppe !== undefined;
  if ($("mm-dr").checked !== (teammodus && !!daten.mmDrillinge)) $("mm-dr").checked = teammodus && !!daten.mmDrillinge;
  if ($("mm-teammodus").checked !== teammodus) $("mm-teammodus").checked = teammodus;

  const json = daten.mmLayouts ?? "";
  if (json !== layoutJson) {
    layoutJson = json;
    try { layoutListe = json ? JSON.parse(json) : []; } catch { layoutListe = []; }
  }

  const neuerIndex = daten.mmRundenIndex ?? 0;
  const neuerStart = daten.mmVorbereitungSeit ?? 0;
  if (status === "runde_aktiv") {
    const key = neuerIndex + ":" + neuerStart;
    if (key !== aktuelleRundeKey) {
      aktuelleRundeKey = key;
      rundenIndex = neuerIndex;
      vorbereitungSeit = neuerStart;
      auswertungLaeuft = false;
      if (spielfeld) { spielfeld.abbauen(); spielfeld = null; }
      $("mm-fertig-overlay").hidden = true;
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
    $("mm-setup").hidden = false;
  } else if (status === "runde_aktiv") {
    rundenTick();
  } else if (status === "ausgewertet") {
    zeigeErgebnis(rundenIndex);
    $("mm-ergebnis-screen").hidden = false;
  } else if (status === "beendet") {
    zeigeEndstand();
    $("mm-endstand-screen").hidden = false;
  }
}

function alleVerstecken() {
  ["mm-setup", "mm-vorbereitung-screen", "mm-spiel-screen", "mm-ergebnis-screen", "mm-endstand-screen"]
    .forEach((id) => { $(id).hidden = true; });
}

function zeigeSetup() {
  const anzahlFeld = $("mm-anzahl");
  const inOlympiade = Boolean(api.olympiadeAnzahl);
  if (inOlympiade) {
    const festgelegt = Math.min(Math.max(1, api.olympiadeAnzahl), MAX_RUNDEN);
    anzahlFeld.value = String(festgelegt);
    $("mm-anzahl-max").textContent =
      `In der Olympiade festgelegt: ${festgelegt} ${festgelegt === 1 ? "Runde" : "Runden"}.`;
    anzahlFeld.disabled = true;
  } else if (api.istLeiter) {
    if (!anzahlFeld.value) anzahlFeld.value = String(STANDARD_RUNDEN);
    $("mm-anzahl-max").textContent = `Bis zu ${MAX_RUNDEN} Runden.`;
    anzahlFeld.disabled = false;
  } else {
    anzahlFeld.value = String(entwurf.runden);
    $("mm-anzahl-max").textContent = `Bis zu ${MAX_RUNDEN} Runden.`;
    anzahlFeld.disabled = true;
  }
  zeichneOptionen();
  $("mm-einstellungen").hidden = false;

  // In der Olympiade gibt es keinen Teammodus - alle spielen für sich.
  $("mm-teammodus-zeile").hidden = inOlympiade;
  const schalter = $("mm-teammodus");
  const ungerade = spielerListe.length % 2 === 1;
  schalter.checked = teammodus;
  schalter.disabled = !api.istLeiter || (ungerade && !teammodus);
  if (api.istLeiter && teammodus && ungerade) {
    // Spielerzahl ist ungerade geworden: Teammodus wieder ausschalten
    updateDoc(api.raumRef(), { mmTeammodus: false, mmTeams: {} }).catch(() => {});
  }
  $("mm-teammodus-hinweis").hidden = !ungerade || inOlympiade;
  // Dreierteams: nur im Teammodus und nur bei genau 6 Spielern
  const sechs = spielerListe.length === 6;
  $("mm-dr-zeile").hidden = !teammodus || inOlympiade;
  $("mm-dr").disabled = !api.istLeiter || (!sechs && !drillingModus);
  $("mm-dr-hinweis").hidden = !teammodus || inOlympiade || sechs;
  if (api.istLeiter && drillingModus && !sechs) {
    updateDoc(api.raumRef(), { mmDrillinge: false }).catch(() => {});
  }
  $("mm-paare-block").hidden = drillingModus;
  $("mm-dr-block").hidden = !drillingModus;
  $("mm-teams").hidden = !teammodus;
  $("mm-teams-zufall").hidden = !api.istLeiter;
  if (teammodus) {
    rendereTeamListe("blau");
    rendereTeamListe("rot");
  }

  $("mm-starten").hidden = !api.istLeiter;
  $("mm-setup-warten").hidden = api.istLeiter;
  bereitSystem?.render();

  if (api.istLeiter && api.olympiadeAnzahl && !olympiadeAutoStart && bereitSystem?.alleBereit()) {
    olympiadeAutoStart = true;
    spielStarten();
  }
}

async function drillingUmschalten() {
  if (!api.istLeiter) return;
  const aktiviert = $("mm-dr").checked;
  try {
    await updateDoc(api.raumRef(), { mmDrillinge: aktiviert });
  } catch (e) {
    $("mm-dr").checked = drillingModus;
    zeigeDebug("Dreierteams konnten nicht geändert werden: " + e.message);
  }
}

async function teammodusUmschalten() {
  if (!api.istLeiter) return;
  const aktiviert = $("mm-teammodus").checked;
  try {
    await updateDoc(api.raumRef(), { mmTeammodus: aktiviert, mmTeams: aktiviert ? teams : {}, ...(aktiviert ? {} : { mmDrillinge: false }) });
  } catch (e) {
    $("mm-teammodus").checked = teammodus;
    zeigeDebug("Teammodus konnte nicht geändert werden: " + e.message);
  }
}

async function waehleEigenesTeam(team) {
  if (!teammodus) return;
  try {
    await updateDoc(api.raumRef(), { mmTeams: { ...teams, [api.spielerId]: team } });
  } catch (e) {
    zeigeDebug("Team konnte nicht gewählt werden: " + e.message);
  }
}

async function zufaelligeTeams() {
  if (!api.istLeiter || !teammodus) return;
  $("mm-teams-zufall").disabled = true;
  try {
    await updateDoc(api.raumRef(), { mmTeams: erstelleTeams(spielerListe.map((s) => s.id)) });
  } catch (e) {
    zeigeDebug("Teams konnten nicht neu gemischt werden: " + e.message);
  }
  $("mm-teams-zufall").disabled = false;
}

function rendereTeamListe(team) {
  const liste = $("mm-team-" + team);
  liste.innerHTML = "";
  spielerListe.filter((s) => teams[s.id] === team).forEach((s) => {
    const li = document.createElement("li");
    li.textContent = s.name + (s.id === api.spielerId ? " (du)" : "");
    liste.appendChild(li);
  });
  if (!liste.children.length) {
    const li = document.createElement("li");
    li.textContent = "Noch niemand";
    liste.appendChild(li);
  }
  $("mm-team-wahl-" + team).classList.toggle("zt-team-eigenes", teams[api.spielerId] === team);
}

async function spielStarten() {
  $("mm-setup-fehler").textContent = "";
  if (spielerListe.length < 1) {
    $("mm-setup-fehler").textContent = "Für Memory braucht ihr mindestens einen Spieler.";
    return;
  }
  let anzahl = parseInt($("mm-anzahl").value, 10);
  if (!Number.isFinite(anzahl) || anzahl < 1) anzahl = 1;
  if (anzahl > MAX_RUNDEN) anzahl = MAX_RUNDEN;

  const teamAktiv = teammodus && !api.olympiadeAnzahl;
  let endgueltigeTeams = {};
  if (teamAktiv && spielerListe.length % 2 === 1) {
    $("mm-setup-fehler").textContent = "Der Teammodus geht nur bei einer geraden Spielerzahl.";
    return;
  }
  if (teamAktiv) {
    endgueltigeTeams = ergaenzeFehlendeTeams(teams, spielerListe.map((s) => s.id));
    const anzahlTeam = { blau: 0, rot: 0 };
    spielerListe.forEach((s) => { anzahlTeam[endgueltigeTeams[s.id]] += 1; });
    if (drillingModus && (spielerListe.length !== 6 || anzahlTeam.blau !== 3 || anzahlTeam.rot !== 3)) {
      $("mm-setup-fehler").textContent =
        "Bei Dreierteams braucht jedes Team genau 3 Personen (6 Spieler insgesamt).";
      return;
    }
    if (anzahlTeam.blau < 2 || anzahlTeam.rot < 2) {
      $("mm-setup-fehler").textContent =
        "Im Teammodus braucht jedes Team mindestens 2 Personen - sonst kann niemand ein Paar bilden.";
      return;
    }
  }

  const layouts = [];
  const gruppeStart = teamAktiv && drillingModus ? 3 : 2;
  const gruppenAnzahl = gruppeStart === 3 ? entwurf.drillinge : entwurf.paare;
  for (let i = 0; i < anzahl; i++) layouts.push(erzeugeAnordnung(gruppenAnzahl, gruppeStart));

  $("mm-starten").disabled = true;
  try {
    await raeumeSpieldatenAuf();
    await updateDoc(api.raumRef(), {
      mmStatus: "runde_aktiv",
      mmRundenIndex: 0,
      mmAnzahlRunden: anzahl,
      mmPaare: gruppenAnzahl,
      mmGruppe: gruppeStart,
      mmDrillinge: gruppeStart === 3,
      mmLayouts: JSON.stringify(layouts),
      mmTeammodus: teamAktiv,
      mmTeams: endgueltigeTeams,
      mmVorbereitungSeit: Date.now()
    });
  } catch (e) {
    zeigeDebug("Fehler beim Start: " + e.message);
  }
  $("mm-starten").disabled = false;
}

async function raeumeSpieldatenAuf() {
  for (const name of ["mmFertig", "mmTeam", "mmPos"]) {
    const snap = await getDocs(collection(api.db, "raeume", api.code, name));
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  }
  alleFertig = [];
  teamDocs = {};
  posDocs = {};
  await Promise.all(spielerListe.map((s) => updateDoc(api.spielerRef(s.id), { punkte: 0 })));
}

export async function vorZurueck() {
  try {
    await raeumeSpieldatenAuf();
    await updateDoc(api.raumRef(), {
      mmStatus: null, mmRundenIndex: 0, mmAnzahlRunden: 0, mmLayouts: "", mmVorbereitungSeit: 0,
      mmTeammodus: false, mmTeams: {}
    });
    await api.zurueckZurAuswahl();
  } catch (e) {
    zeigeDebug("Fehler beim Zurückkehren: " + e.message);
  }
}

// -------------------------------------------------------------- Rundenablauf
// Wer in dieser Runde fertig ist (mit Zeit). Im Teammodus kommt die Zeit vom
// Teamfeld und gilt für alle Mitglieder des Teams.
function fertigeDieserRunde(pos) {
  const aktiveIds = new Set(spielerListe.map((s) => s.id));
  if (teammodus) {
    const ergebnis = [];
    ["blau", "rot"].forEach((t) => {
      const d = teamDocs[`${t}_${pos}`];
      if (!d || d.ms == null) return;
      spielerListe.filter((s) => teams[s.id] === t).forEach((s) => {
        ergebnis.push({ spielerId: s.id, rundenIndex: pos, ms: d.ms });
      });
    });
    return ergebnis;
  }
  return alleFertig.filter((a) => a.rundenIndex === pos && aktiveIds.has(a.spielerId));
}

function rundenTick() {
  if (!el.wurzel || status !== "runde_aktiv") return;
  const elapsedGesamt = Date.now() - vorbereitungSeit;
  if (elapsedGesamt < COUNTDOWN_MS) {
    $("mm-spiel-screen").hidden = true;
    $("mm-vorbereitung-screen").hidden = false;
    $("mm-vorb-paare").textContent = `${einstellungen.paare} ${einstellungen.gruppe === 3 ? "Drillinge" : "Paare"}`;
    const schritt = Math.min(2, Math.floor(elapsedGesamt / (COUNTDOWN_MS / 3)));
    $("mm-countdown-ziffer").textContent = ["3", "2", "1"][schritt];
  } else {
    $("mm-vorbereitung-screen").hidden = true;
    $("mm-spiel-screen").hidden = false;
    if (!spielfeld) starteSpielfeld();
    const fertigIch = fertigeDieserRunde(rundenIndex).find((f) => f.spielerId === api.spielerId);
    const spielMs = fertigIch ? fertigIch.ms : elapsedGesamt - COUNTDOWN_MS;
    $("mm-zeit-text").textContent = `⏱ ${Math.floor(Math.max(0, spielMs) / 1000)} s`;
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
    $("mm-fertig-overlay").hidden = false;
    $("mm-fertig-overlay").textContent = `✅ Geschafft in ${formatZeit(ich.ms)}`;
    $("mm-hinweis").textContent = "Warte auf die anderen …";
  } else {
    $("mm-fertig-overlay").hidden = true;
  }
  renderWarteAvatare($("mm-status"), spielerListe.filter((sp) => !fertigIds.has(sp.id) && sp.id !== api.spielerId));
}

// Einzelspiel: eigene Fertig-Zeit melden.
async function meldeFertig() {
  if (status !== "runde_aktiv" || eigenFertig()) return;
  const ms = Math.max(0, Date.now() - vorbereitungSeit - COUNTDOWN_MS);
  alleFertig.push({ spielerId: api.spielerId, spielerName: api.spielerName, rundenIndex, ms });
  aktualisiereStatus();
  try {
    await setDoc(doc(api.db, "raeume", api.code, "mmFertig", `${api.spielerId}_${rundenIndex}`), {
      spielerId: api.spielerId, spielerName: api.spielerName, rundenIndex, ms, zeitpunkt: serverTimestamp()
    });
  } catch (e) {
    alleFertig = alleFertig.filter((a) => !(a.spielerId === api.spielerId && a.rundenIndex === rundenIndex));
    zeigeDebug("Fehler beim Melden: " + e.message);
    setTimeout(meldeFertig, 2000);
  }
}

// Teammodus: Karte aufdecken ("auf") oder wieder umdrehen ("zu") - als
// Transaktion, damit zwei Teammitglieder nicht gleichzeitig Unterschiedliches
// schreiben. Wirft "ueberholt", wenn der Zustand inzwischen ein anderer ist.
async function teamAktion(art, idx, anordnung) {
  const gruppeGroesse = einstellungen.gruppe;
  const team = teams[api.spielerId];
  if (!team) return;
  const pos = rundenIndex;
  const ref = doc(api.db, "raeume", api.code, "mmTeam", `${team}_${pos}`);
  const ich = api.spielerId;
  await runTransaction(api.db, async (tx) => {
    const snap = await tx.get(ref);
    const d = snap.exists() ? snap.data() : {};
    if (d.ms != null) throw new Error("ueberholt");
    const offen = { ...(d.offen || {}) };
    const gefunden = [...(d.gefunden || [])];
    let ms = null;
    if (art === "auf") {
      if (gefunden.includes(idx) || Object.values(offen).includes(idx) ||
          offen[ich] !== undefined || Object.keys(offen).length >= gruppeGroesse) throw new Error("ueberholt");
      offen[ich] = idx;
      const ids = Object.keys(offen);
      if (ids.length === gruppeGroesse && ids.every((k) => anordnung[offen[k]] === anordnung[offen[ids[0]]])) {
        ids.forEach((k) => { gefunden.push(offen[k]); delete offen[k]; });
        if (gefunden.length >= anordnung.length) {
          ms = Math.max(0, Date.now() - vorbereitungSeit - COUNTDOWN_MS);
        }
      }
    } else if (art === "zu-alle") {
      if (Object.keys(offen).length < gruppeGroesse) throw new Error("ueberholt");
      Object.keys(offen).forEach((k) => delete offen[k]);
    } else {
      if (offen[ich] !== idx) throw new Error("ueberholt");
      delete offen[ich];
    }
    tx.set(ref, { team, rundenIndex: pos, offen, gefunden, ms });
  });
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
  if (!alleDa) return;
  auswertungLaeuft = true;
  try {
    const punkte = berechnePunkte(fertig, spielerListe.map((s) => s.id));
    const batch = writeBatch(api.db);
    Object.entries(punkte).forEach(([id, wert]) => {
      batch.update(api.spielerRef(id), { punkte: increment(wert) });
    });
    batch.update(api.raumRef(), { mmStatus: "ausgewertet" });
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
  const karte = (s) => {
    const f = fertig.find((x) => x.spielerId === s.id) ?? null;
    const p = punkte[s.id] ?? 0;
    return spielerKarte(s.name, s.farbe, s.icon, p > 0 ? `+${p}` : "0", {
      extra: f ? `Zeit: ${formatZeit(f.ms)}` : "Nicht fertig",
      punkteRechts: s.punkte ?? 0
    });
  };
  const liste = $("mm-erg-liste");
  if (teammodus) {
    liste.innerHTML = `<li>${teamGruppeHtml(spielerListe, teams, karte)}</li>`;
    return;
  }
  const zeilen = [...spielerListe].sort((a, b) => {
    const fa = fertig.find((x) => x.spielerId === a.id), fb = fertig.find((x) => x.spielerId === b.id);
    if (fa && fb) return fa.ms - fb.ms;
    if (fa) return -1;
    if (fb) return 1;
    return (a.name || "").localeCompare(b.name || "", "de");
  });
  liste.innerHTML = "";
  zeilen.forEach((s) => {
    const li = document.createElement("li");
    li.innerHTML = karte(s);
    liste.appendChild(li);
  });
}

function zeigeErgebnis(pos) {
  $("mm-erg-titel").textContent = `Runde ${pos + 1} von ${anzahlRunden}`;
  zeigeErgebnisListe(pos);
  $("mm-weiter").hidden = !api.istLeiter;
  $("mm-weiter").textContent = pos + 1 >= anzahlRunden ? "Endstand anzeigen" : "Nächste Runde";
}

async function weiter() {
  $("mm-weiter").disabled = true;
  try {
    const naechster = rundenIndex + 1;
    if (naechster >= anzahlRunden) {
      await updateDoc(api.raumRef(), { mmStatus: "beendet" });
      speichereWertung(api, "memory", Object.fromEntries(spielerListe.map((s) => [s.id, s.punkte ?? 0])));
    } else {
      await updateDoc(api.raumRef(), {
        mmStatus: "runde_aktiv",
        mmRundenIndex: naechster,
        mmVorbereitungSeit: Date.now()
      });
    }
  } catch (e) {
    zeigeDebug("Fehler beim Weiterschalten: " + e.message);
  }
  $("mm-weiter").disabled = false;
}

function zeigeEndstand() {
  if (!el.wurzel) return;
  const sortiert = [...spielerListe].sort((a, b) => (b.punkte ?? 0) - (a.punkte ?? 0));
  const liste = $("mm-endstand-liste");
  liste.innerHTML = "";
  sortiert.forEach((s, i) => {
    const li = document.createElement("li");
    li.innerHTML = spielerKarte(s.name, s.farbe, s.icon, s.punkte ?? 0, { rang: i + 1 });
    liste.appendChild(li);
  });
  const teamsEl = $("mm-endstand-teams");
  teamsEl.hidden = !teammodus;
  if (teammodus) teamsEl.innerHTML = teamEndstandHtml(spielerListe, teams);
  $("mm-endstand-warten").hidden = api.istLeiter;
  const btn = $("mm-gesamtwertung-btn");
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
  const anordnung = layoutListe[rundenIndex];
  if (!anordnung) return;
  spielfeld = baueSpielfeld(anordnung);
  aktualisiereStatus();
}

// Spielfeld-Logik: Canvas von oben, Figur, Steuerung, Aufdecken.
function baueSpielfeld(anordnung) {
  const canvas = $("mm-canvas");
  const wrap = $("mm-canvas-wrap");
  const knopf = $("mm-aktion");
  const hinweis = $("mm-hinweis");
  const kreuz = $("mm-kreuz");
  let ctx = canvas.getContext("2d");
  const hauptCtx = ctx;
  let rueckSprite = null;       // einmal vorgezeichnete Kartenrückseite (schneller als jedes Bild neu zu malen)
  const SPR_RAND = 6;
  const ac = new AbortController();
  const sig = { signal: ac.signal };

  const anzahl = anordnung.length;
  const SPALTEN = spaltenFuer(anzahl);   // lokal: Spalten dieses Felds
  const G = teammodus ? einstellungen.gruppe : 2;   // so viele gleiche Karten gehören zusammen
  const zeilen = Math.ceil(anzahl / SPALTEN);
  const ich = spielerListe.find((s) => s.id === api.spielerId) || { id: api.spielerId, farbe: "#7c3aed", icon: "" };
  const meinTeam = teammodus ? teams[api.spielerId] : null;
  const zuschauer = teammodus && !meinTeam;
  const farbeVon = (id) => spielerListe.find((s) => s.id === id)?.farbe || "#7c3aed";
  const iconVon = (id) => spielerListe.find((s) => s.id === id)?.icon || "";

  let lokOffen = new Set();       // Einzelspiel: eigene offene Karten
  let lokGefunden = new Set();    // Einzelspiel: gefundene Karten
  let x = SPALTEN / 2, y = zeilen / 2 + 0.0;  // Figurposition in Zellen
  const halten = { l: false, r: false, u: false, d: false };
  let ausstehend = false;         // Teammodus: Transaktion läuft
  let gesperrt = zuschauer;
  let schliessTimer = null;       // Einzelspiel: Fehlpaar wieder umdrehen
  let zweiOffenSeit = 0;          // Teammodus: seit wann sind 2 Karten offen
  let schliessend = false;
  const joy = { x: 0, y: 0 };
  let gezeichnetKey = "";
  let rafId = 0, letzteZeit = performance.now();
  let c = 60, W = 300, H = 400, ox = 0, oy = 0;
  let letztePosSendung = 0, letztePosKey = "", posTimer = null;
  const mitspielerAnzeige = new Map(); // id -> { x, y } geglättet
  let letzterKnopfKey = "";

  function layout() {
    const breite = Math.floor(wrap.clientWidth || 300);
    W = breite;
    const maxH = Math.max(220, (window.innerHeight || 700) - 400);
    c = Math.max(34, Math.min(W / (SPALTEN + 0.6), maxH / (zeilen + 0.6), 96));
    ox = Math.round((W - SPALTEN * c) / 2);
    oy = Math.round(0.3 * c);
    H = Math.ceil(zeilen * c + 0.6 * c);
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    baueRueckSprite();
    gezeichnetKey = "";
  }

  // ---- Zustand (Einzelspiel lokal, Teammodus aus dem Teamfeld)
  function teamDoc() { return meinTeam ? teamDocs[`${meinTeam}_${rundenIndex}`] ?? {} : {}; }
  function zustand() {
    if (!teammodus) {
      const offen = new Map();
      lokOffen.forEach((i) => offen.set(i, api.spielerId));
      return { offen, gefunden: lokGefunden };
    }
    const d = teamDoc();
    const offen = new Map();
    Object.entries(d.offen || {}).forEach(([id, idx]) => offen.set(idx, id));
    return { offen, gefunden: new Set(d.gefunden || []) };
  }
  function meineOffeneKarte(z) {
    for (const [idx, id] of z.offen) if (id === api.spielerId) return idx;
    return null;
  }
  function blockiert(z) {
    if (!teammodus) return false;
    return ausstehend || meineOffeneKarte(z ?? zustand()) !== null;
  }
  function karteUnterFigur() {
    const sp = Math.floor(x), ze = Math.floor(y);
    if (sp < 0 || sp >= SPALTEN || ze < 0) return null;
    const idx = ze * SPALTEN + sp;
    if (idx >= anzahl) return null;
    const dx = x - (sp + 0.5), dy = y - (ze + 0.5);
    return Math.abs(dx) <= KARTE / 2 + 0.02 && Math.abs(dy) <= KARTE / 2 + 0.02 ? idx : null;
  }
  // Was würde der Knopf jetzt tun? { modus: "auf"|"zu"|null, idx, grund }
  function aktionsLage(z) {
    z = z ?? zustand();
    if (gesperrt) return { modus: null, idx: null, grund: "" };
    const idx = karteUnterFigur();
    const eigene = meineOffeneKarte(z);
    if (idx === null) {
      return { modus: null, idx, grund: eigene !== null && teammodus ? "halten" : "suche" };
    }
    if (z.gefunden.has(idx)) return { modus: null, idx, grund: "gefunden" };
    if (z.offen.has(idx)) {
      if (z.offen.size >= G) return { modus: null, idx, grund: "voll" };
      return z.offen.get(idx) === api.spielerId
        ? { modus: "zu", idx, grund: "" }
        : { modus: null, idx, grund: "fremd" };
    }
    if (teammodus) {
      if (eigene !== null) return { modus: null, idx, grund: "halten" };
      if (z.offen.size >= G) return { modus: null, idx, grund: "voll" };
      return { modus: "auf", idx, grund: "" };
    }
    if (z.offen.size >= G) return { modus: null, idx, grund: "voll" };
    return { modus: "auf", idx, grund: "" };
  }

  function aktion() {
    if (gesperrt) return;
    const z = zustand();
    const lage = aktionsLage(z);
    if (!lage.modus) return;
    const idx = lage.idx;
    if (!teammodus) {
      if (lage.modus === "auf") {
        lokOffen.add(idx);
        if (lokOffen.size === 2) {
          const [a, b] = [...lokOffen];
          if (anordnung[a] === anordnung[b]) {
            lokGefunden.add(a); lokGefunden.add(b);
            lokOffen = new Set();
            if (lokGefunden.size >= anzahl) {
              gesperrt = true;
              meldeFertig();
            }
          } else {
            clearTimeout(schliessTimer);
            schliessTimer = setTimeout(() => { lokOffen = new Set(); gezeichnetKey = ""; letzterKnopfKey = ""; }, FLIP_MS);
          }
        }
      } else {
        lokOffen.delete(idx);
      }
      gezeichnetKey = "";
      return;
    }
    if (ausstehend) return;
    ausstehend = true;
    stoppeHalten();
    gezeichnetKey = "";
    teamAktion(lage.modus, idx, anordnung)
      .catch((e) => { if (e.message !== "ueberholt") zeigeDebug("Aktion fehlgeschlagen: " + e.message); })
      .finally(() => { ausstehend = false; gezeichnetKey = ""; });
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
    if (r) { e.preventDefault(); if (!blockiert()) halten[r] = true; return; }
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
  // Joystick: Ziehen aus der Mitte; je weiter, desto schneller.
  const joyKnopf = $("mm-joy-knopf");
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
    if (blockiert() || gesperrt || joyId !== null) return;
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

  // ---- Positions-Sync (nur Teammodus)
  function sendePosition(erzwingen) {
    if (!teammodus || !meinTeam) return;
    const key = x.toFixed(2) + "," + y.toFixed(2);
    if (key === letztePosKey) return;
    const jetzt = performance.now();
    if (!erzwingen && jetzt - letztePosSendung < POS_INTERVALL_MS) {
      if (!posTimer) posTimer = setTimeout(() => { posTimer = null; sendePosition(true); }, POS_INTERVALL_MS);
      return;
    }
    letztePosSendung = jetzt;
    letztePosKey = key;
    setDoc(doc(api.db, "raeume", api.code, "mmPos", api.spielerId), {
      x: Math.round(x * 100) / 100, y: Math.round(y * 100) / 100, r: rundenIndex, team: meinTeam
    }).catch(() => {});
  }

  // ---- Zeichnen
  function rundRechteck(px, py, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(px + r, py);
    ctx.arcTo(px + w, py, px + w, py + h, r);
    ctx.arcTo(px + w, py + h, px, py + h, r);
    ctx.arcTo(px, py + h, px, py, r);
    ctx.arcTo(px, py, px + w, py, r);
    ctx.closePath();
  }
  function zeichneRueckseite(px, py, s, r) {
    ctx.fillStyle = "rgba(0,0,0,0.28)";
    rundRechteck(px + 2, py + 3, s, s, r);
    ctx.fill();
    const g = ctx.createLinearGradient(px, py, px + s, py + s);
    g.addColorStop(0, "#4f46e5");
    g.addColorStop(1, "#7c3aed");
    ctx.fillStyle = g;
    rundRechteck(px, py, s, s, r);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.55)";
    ctx.lineWidth = Math.max(1.5, s * 0.03);
    rundRechteck(px + s * 0.07, py + s * 0.07, s * 0.86, s * 0.86, r * 0.7);
    ctx.stroke();
    ctx.fillStyle = "rgba(255,255,255,0.9)";
    ctx.font = `${Math.round(s * 0.42)}px system-ui, "Apple Color Emoji", "Segoe UI Emoji", sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("⚽", px + s / 2, py + s / 2 + s * 0.02);
  }
  function baueRueckSprite() {
    const dpr = window.devicePixelRatio || 1;
    const sz = KARTE * c;
    const sc = document.createElement("canvas");
    sc.width = Math.ceil((sz + 2 * SPR_RAND) * dpr);
    sc.height = sc.width;
    const sctx = sc.getContext("2d");
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx = sctx;
    zeichneRueckseite(SPR_RAND, SPR_RAND, sz, sz * 0.13);
    ctx = hauptCtx;
    rueckSprite = sc;
  }
  function zeichneKarte(idx, z, lage) {
    const sp = idx % SPALTEN, ze = Math.floor(idx / SPALTEN);
    const s = KARTE * c;
    const px = ox + (sp + 0.5) * c - s / 2, py = oy + (ze + 0.5) * c - s / 2;
    const r = s * 0.13;
    const gefunden = z.gefunden.has(idx);
    const besitzer = z.offen.get(idx);
    const offen = gefunden || besitzer !== undefined;
    ctx.save();
    if (!offen) {
      if (rueckSprite) ctx.drawImage(rueckSprite, px - SPR_RAND, py - SPR_RAND, s + 2 * SPR_RAND, s + 2 * SPR_RAND);
      else zeichneRueckseite(px, py, s, r);
    } else {
      ctx.fillStyle = "rgba(0,0,0,0.28)";
      rundRechteck(px + 2, py + 3, s, s, r);
      ctx.fill();
      if (gefunden) ctx.globalAlpha = 0.62;
      ctx.fillStyle = "#fffdf5";
      rundRechteck(px, py, s, s, r);
      ctx.fill();
      const inn = s * 0.08;
      const bild = motivBild(anordnung[idx], () => { gezeichnetKey = ""; });
      ctx.save();
      rundRechteck(px + inn, py + inn, s - 2 * inn, s - 2 * inn, r * 0.7);
      ctx.clip();
      if (bild.__fertig) ctx.drawImage(bild, px + inn, py + inn, s - 2 * inn, s - 2 * inn);
      else { ctx.fillStyle = "#e5e7eb"; ctx.fillRect(px, py, s, s); }
      ctx.restore();
      ctx.lineWidth = Math.max(2.5, s * 0.055);
      ctx.strokeStyle = gefunden ? "#16a34a" : farbeVon(besitzer);
      rundRechteck(px, py, s, s, r);
      ctx.stroke();
      ctx.globalAlpha = 1;
      if (gefunden) {
        ctx.fillStyle = "#16a34a";
        ctx.beginPath();
        ctx.arc(px + s * 0.84, py + s * 0.16, s * 0.15, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#fff";
        ctx.font = `bold ${Math.round(s * 0.2)}px system-ui, sans-serif`;
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        ctx.fillText("✓", px + s * 0.84, py + s * 0.17);
      }
    }
    // Markierung der Karte, auf der die Figur steht
    if (lage.idx === idx && !gefunden) {
      ctx.lineWidth = Math.max(3, s * 0.07);
      ctx.strokeStyle = lage.modus ? "#fde047" : "rgba(255,255,255,0.65)";
      if (lage.modus) { ctx.shadowColor = "rgba(253,224,71,0.95)"; ctx.shadowBlur = s * 0.28; }
      rundRechteck(px - 2, py - 2, s + 4, s + 4, r + 2);
      ctx.stroke();
    }
    ctx.restore();
  }
  function zeichneFigur(fx, fy, id, eigene) {
    const px = ox + fx * c, py = oy + fy * c, r = FIGUR_R * c;
    ctx.save();
    ctx.fillStyle = "rgba(0,0,0,0.3)";
    ctx.beginPath();
    ctx.ellipse(px + 2, py + r * 0.95, r * 0.95, r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();
    const farbe = farbeVon(id);
    ctx.beginPath();
    ctx.arc(px, py, r + (eigene ? 4 : 3), 0, Math.PI * 2);
    ctx.fillStyle = eigene ? "#ffffff" : "rgba(255,255,255,0.85)";
    ctx.fill();
    ctx.beginPath();
    ctx.arc(px, py, r + 1, 0, Math.PI * 2);
    ctx.fillStyle = farbe;
    ctx.fill();
    ctx.save();
    ctx.beginPath();
    ctx.arc(px, py, r - 1, 0, Math.PI * 2);
    ctx.clip();
    const bild = avatarImg(iconVon(id), () => { gezeichnetKey = ""; });
    if (bild && bild.__fertig) ctx.drawImage(bild, px - r, py - r, r * 2, r * 2);
    ctx.restore();
    if (eigene) {
      ctx.fillStyle = "#111827";
      ctx.font = `bold ${Math.max(9, Math.round(c * 0.17))}px system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "alphabetic";
      const tx = "DU", tw = ctx.measureText(tx).width + 8, th = Math.max(13, c * 0.24);
      ctx.fillStyle = "#ffffff";
      rundRechteck(px - tw / 2, py - r - th - 6, tw, th, 5);
      ctx.fill();
      ctx.fillStyle = "#111827";
      ctx.fillText(tx, px, py - r - 8);
    }
    ctx.restore();
  }
  function zeichne() {
    ctx.clearRect(0, 0, W, H);
    // Tisch
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, "#14532d");
    g.addColorStop(1, "#166534");
    ctx.fillStyle = g;
    rundRechteck(0, 0, W, H, 12);
    ctx.fill();
    ctx.strokeStyle = "rgba(255,255,255,0.07)";
    ctx.lineWidth = 1;
    for (let i = 0; i <= SPALTEN; i++) { ctx.beginPath(); ctx.moveTo(ox + i * c, oy); ctx.lineTo(ox + i * c, oy + zeilen * c); ctx.stroke(); }
    for (let j = 0; j <= zeilen; j++) { ctx.beginPath(); ctx.moveTo(ox, oy + j * c); ctx.lineTo(ox + SPALTEN * c, oy + j * c); ctx.stroke(); }

    const z = zustand();
    const lage = aktionsLage(z);
    for (let i = 0; i < anzahl; i++) zeichneKarte(i, z, lage);

    // Teammitglieder (geglättet)
    if (teammodus && meinTeam) {
      Object.entries(posDocs).forEach(([id, p]) => {
        if (id === api.spielerId || p.team !== meinTeam || p.r !== rundenIndex) return;
        if (!spielerListe.some((s) => s.id === id)) return;
        let a = mitspielerAnzeige.get(id);
        if (!a) { a = { x: p.x, y: p.y }; mitspielerAnzeige.set(id, a); }
        a.x += (p.x - a.x) * 0.35;
        a.y += (p.y - a.y) * 0.35;
        zeichneFigur(a.x, a.y, id, false);
      });
    }
    if (!zuschauer) zeichneFigur(x, y, api.spielerId, true);
    aktualisiereKnopf(z, lage);
  }

  function aktualisiereKnopf(z, lage) {
    const geblockt = !teammodus ? false : blockiert(z);
    const key = [lage.modus, lage.grund, geblockt, gesperrt, z.offen.size, z.gefunden.size].join("|");
    if (key === letzterKnopfKey) return;
    letzterKnopfKey = key;
    knopf.disabled = !lage.modus;
    knopf.classList.toggle("bereit", Boolean(lage.modus));
    knopf.classList.toggle("zu", lage.modus === "zu");
    knopf.textContent = lage.modus === "zu" ? "Umdrehen" : "Aufdecken";
    kreuz.classList.toggle("gesperrt", geblockt || gesperrt);
    if (geblockt) stoppeHalten();
    const paare = z.gefunden.size / 2;
    $("mm-paare-text").textContent = `🃏 ${z.gefunden.size / G} / ${anzahl / G} ${G === 3 ? "Drillinge" : "Paare"}`;
    if (gesperrt) return;
    let text = "Lauf auf eine Karte und deck sie auf.";
    if (zuschauer) text = "Du bist in keinem Team - du schaust zu.";
    else if (lage.grund === "halten" || geblockt) {
      text = z.offen.size >= G && teammodus
        ? `Kein ${G === 3 ? "Drilling" : "Paar"}! Die Karten drehen sich gleich wieder um.`
        : "Du hältst eine Karte und kannst dich nicht bewegen. Dein Team deckt die zweite auf - oder dreh sie mit „Umdrehen“ zurück.";
    } else if (lage.modus === "auf") text = "Tipp auf „Aufdecken“.";
    else if (lage.modus === "zu") text = "Du stehst auf deiner offenen Karte - „Umdrehen“ dreht sie wieder um.";
    else if (lage.grund === "voll") text = `Kein ${G === 3 ? "Drilling" : "Paar"}! Die Karten drehen sich gleich wieder um.`;
    else if (lage.grund === "gefunden") text = `Diese${G === 3 ? "n Drilling" : "s Paar"} habt ihr schon.`;
    else if (lage.grund === "fremd") text = "Diese Karte hält gerade jemand aus deinem Team.";
    else if (z.offen.size >= G) text = `Kein ${G === 3 ? "Drilling" : "Paar"}! Die Karten drehen sich gleich wieder um.`;
    hinweis.textContent = text;
  }

  // ---- Hauptschleife
  function schleife(jetzt) {
    rafId = requestAnimationFrame(schleife);
    const dt = Math.min(0.05, (jetzt - letzteZeit) / 1000);
    letzteZeit = jetzt;
    if (!gesperrt && !zuschauer && !blockiert()) {
      let dx = (halten.r ? 1 : 0) - (halten.l ? 1 : 0) + joy.x;
      let dy = (halten.d ? 1 : 0) - (halten.u ? 1 : 0) + joy.y;
      const len = Math.hypot(dx, dy);
      if (len > 0.08) {
        // schnell auf volles Tempo: schon ab ca. 40 % Auslenkung
        const tempo = TEMPO * Math.min(1, 0.35 + len * 1.6);
        x += (dx / len) * tempo * dt;
        y += (dy / len) * tempo * dt;
        x = Math.max(0.2, Math.min(SPALTEN - 0.2, x));
        y = Math.max(0.2, Math.min(zeilen - 0.2, y));
      }
      sendePosition(false);
    }
    // Teammodus: ein Fehlpaar drehen alle im Team nach kurzer Zeit wieder um
    // (die Transaktion ist idempotent - es schadet nicht, wenn mehrere es auslösen).
    if (teammodus && !gesperrt) {
      if (teamDoc().offen && Object.keys(teamDoc().offen).length >= G) {
        if (!zweiOffenSeit) zweiOffenSeit = jetzt;
        else if (jetzt - zweiOffenSeit > FLIP_MS && !schliessend) {
          schliessend = true;
          teamAktion("zu-alle", null, anordnung)
            .catch((e) => { if (e.message !== "ueberholt") zeigeDebug("Aktion fehlgeschlagen: " + e.message); })
            .finally(() => { schliessend = false; zweiOffenSeit = 0; });
        }
      } else zweiOffenSeit = 0;
    }
    zeichne();
  }

  layout();
  rafId = requestAnimationFrame(schleife);

  return {
    layout,
    sperren() { gesperrt = true; stoppeHalten(); letzterKnopfKey = ""; },
    teamZustandGeaendert() { letzterKnopfKey = ""; },
    abbauen() {
      cancelAnimationFrame(rafId);
      clearTimeout(posTimer);
      clearTimeout(schliessTimer);
      ac.abort();
      if (teammodus && meinTeam) deleteDoc(doc(api.db, "raeume", api.code, "mmPos", api.spielerId)).catch(() => {});
    }
  };
}
