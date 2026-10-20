// ============================================================================
//  Tetris-Duell: alle spielen gleichzeitig ihr eigenes Tetris
// ----------------------------------------------------------------------------
//  - Jedes Handy simuliert sein eigenes Spielfeld (Canvas). Alle bekommen dieselbe
//    Steinfolge (gemeinsamer Seed aus dem Raum-Dokument).
//  - Pro Spieler gibt es ein Dokument raeume/{code}/ttSpieler/{id} mit Punkten,
//    Spielfeld-Abbild (fuer die Mini-Boards der anderen), "gesendet" (kumulierte
//    Zahl der verschickten Muellzeilen) und Lebenszeichen.
//  - Muellzeilen: Wer Zeilen loescht, schickt sie an ALLE anderen. Jeder Empfaenger
//    vergleicht "gesendet" mit dem, was er schon gesehen hat (Delta) - so geht auch
//    bei verpassten Updates nichts verloren.
//  - Der Spielleiter beendet die Runde, sobald nur noch einer (oder bei Solo keiner) lebt.
//  Raum-Felder: ttStatus (setup|laeuft|beendet), ttSeed, ttIds, ttMuell, ttNr, ttRang
// ============================================================================
import { doc, updateDoc, setDoc, deleteDoc, collection, getDocs, onSnapshot, writeBatch } from "../../kern/firebase.js";
import { spielerKarte, zeigeDebug, initBereitSystem, escapeHtml, avatarHtml } from "../../kern/ui.js";
import { speichereWertung } from "../../kern/wertung.js";

const BREITE = 10;
const HOEHE = 20;
const FARBEN = ["", "#22d3ee", "#facc15", "#a855f7", "#4ade80", "#ef4444", "#3b82f6", "#fb923c", "#8b93a7"];
const FORMEN = {
  1: [[0, 0, 0, 0], [1, 1, 1, 1], [0, 0, 0, 0], [0, 0, 0, 0]],
  2: [[1, 1], [1, 1]],
  3: [[0, 1, 0], [1, 1, 1], [0, 0, 0]],
  4: [[0, 1, 1], [1, 1, 0], [0, 0, 0]],
  5: [[1, 1, 0], [0, 1, 1], [0, 0, 0]],
  6: [[1, 0, 0], [1, 1, 1], [0, 0, 0]],
  7: [[0, 0, 1], [1, 1, 1], [0, 0, 0]]
};
const MUELL = 8;
const ANGRIFF = [0, 0, 1, 2, 4];           // gleichzeitig geloeschte Zeilen -> Muellzeilen
const PUNKTE = [0, 100, 300, 500, 800];
const SPERRZEIT_MS = 480;
const SCHREIB_MS = 700;
const PULS_MS = 4000;
const TOT_NACH_MS = 25000;
const MAX_MUELL_PRO_STEIN = 8;

const VORLAGE = `
  <div id="tt-setup" class="bildschirm-karte" hidden>
    <p class="hinweis-text">Alle spielen gleichzeitig ihr eigenes Tetris, mit denselben Steinen. Wer Zeilen löscht, schickt
      Müllzeilen an alle anderen (2 Zeilen = 1, 3 Zeilen = 2, 4 Zeilen = 4 Müllzeilen). Wer oben anstößt, scheidet aus.
      Gewonnen hat, wer als Letzter übrig bleibt. Mit der Zeit wird es immer schneller.</p>
    <div class="gv-modus-zeile">
      <span>Müllzeilen an alle anderen</span>
      <span class="gv-modus-gruppe" id="tt-opt-muell"></span>
    </div>
    <div class="gv-modus-zeile">
      <span>Bots</span>
      <span class="gv-modus-gruppe" id="tt-opt-bots"></span>
    </div>
    <div class="gv-modus-zeile" id="tt-zeile-staerke">
      <span>Bot-Stärke</span>
      <span class="gv-modus-gruppe" id="tt-opt-staerke"></span>
    </div>
    <p class="hinweis-text" id="tt-bot-hinweis"></p>
    <p class="hinweis-text">Steuerung: Tasten unten oder auf dem Spielfeld wischen (links/rechts bewegen, tippen = drehen, nach unten wischen = fallen lassen).</p>
    <p id="tt-setup-fehler" class="fehler-text"></p>
    <p><button id="tt-starten" class="btn-primaer" hidden>Spiel starten</button></p>
    <p id="tt-setup-warten" hidden><em>Warte, bis der Spielleiter das Spiel startet …</em></p>
    <div id="tt-bereit-bereich" class="bereit-bereich" hidden></div>
  </div>

  <div id="tt-spiel-screen" class="tt-spiel" hidden>
    <div id="tt-gegner" class="tt-gegner"></div>
    <div class="tt-mitte">
      <div class="tt-brettbox">
        <canvas id="tt-brett"></canvas>
        <div id="tt-overlay" class="tt-overlay" hidden></div>
      </div>
      <div class="tt-seite">
        <canvas id="tt-next"></canvas>
        <div class="tt-werte">
          <div><small>Punkte</small><b id="tt-punkte">0</b></div>
          <div><small>Zeilen</small><b id="tt-zeilen">0</b></div>
          <div><small>Level</small><b id="tt-level">1</b></div>
        </div>
        <div class="tt-muellbalken" title="Eingehende Müllzeilen"><i id="tt-muellfuell"></i></div>
      </div>
    </div>
    <div class="tt-tasten" id="tt-tasten">
      <button type="button" data-a="links" aria-label="Links">◀</button>
      <button type="button" data-a="rechts" aria-label="Rechts">▶</button>
      <button type="button" data-a="runter" aria-label="Schneller">▼</button>
      <button type="button" data-a="ccw" aria-label="Links drehen">⟲</button>
      <button type="button" data-a="cw" aria-label="Rechts drehen">⟳</button>
      <button type="button" data-a="drop" aria-label="Fallen lassen">⤓</button>
    </div>
  </div>

  <div id="tt-ende-screen" class="bildschirm-karte" hidden>
    <h1>Endstand</h1>
    <p id="tt-sieger" class="kn-verlierer"></p>
    <ul id="tt-endstand-liste"></ul>
    <p class="hinweis-text" style="margin-top:12px">Große Zahl = Spielpunkte aus der Runde. „Wertung“ = Punkte für die Gesamtwertung (der Letzte bekommt 1, jeder bessere Platz einen mehr).</p>
    <p id="tt-ende-warten" hidden><em>Der Spielleiter startet gleich die nächste Runde oder wählt ein anderes Spiel …</em></p>
    <p><button id="tt-nochmal" class="btn-primaer" type="button" hidden>Noch eine Runde</button></p>
  </div>
`;

let api = null;
let el = {};
let spielerListe = [];
let status = null;
let seed = 0;
let ids = [];
let muellAn = true;
let nr = 0;
let rang = null;
let bereitSystem = null;
let docsUnsub = null;
let docs = {};                 // spielerId -> Dokument
let zuletzt = {};              // spielerId -> lokale Zeit des letzten Updates (Leiter)
let gestartetNr = -1;          // Rundennummer, fuer die lokal gerade gespielt wird
let G = null;                  // lokaler Spielzustand
let rafId = null;
let leiterTimer = null;
let beendeBusy = false;
let tasten = null;
let botsAnz = 0;               // Anzahl Bots (aus dem Raum-Dokument)
let staerke = "mittel";
let bots = {};                 // nur auf dem Geraet des Spielleiters: botId -> { g, naechster }
let botTimer = null;
const BOT_NAMEN = ["Niklas", "Luca", "Nader", "Sinan", "Kevin"];
const BOT_IDS = ["bot1", "bot2", "bot3"];
const BOT_FARBEN = ["#94a3b8", "#f472b6", "#fb923c"];
const MAX_SPIELER = 6;
const isBot = (id) => typeof id === "string" && id.startsWith("bot");

const $ = (id) => el.wurzel.querySelector("#" + id);
// Bot-Namen: zufaellig aus den Freunden, nie ein Name, den ein Mensch im Raum hat (auf allen Geraeten gleich)
let botNamenCache = { key: "", map: {} };
function botNamen() {
  const menschen = spielerListe.map((x) => String(x.name ?? "").trim().toLowerCase().split(/\s+/)[0]);
  const key = spielerListe.map((x) => x.id + ":" + x.name).sort().join("|");
  if (botNamenCache.key === key) return botNamenCache.map;
  const pool = BOT_NAMEN.filter((n) => !menschen.includes(n.toLowerCase()));
  let h = 2166136261;
  for (const c of key) { h ^= c.charCodeAt(0); h = Math.imul(h, 16777619); }
  const zufall = () => { h = Math.imul(h ^ (h >>> 15), 2246822507) + 1013904223 | 0; return ((h >>> 0) % 100000) / 100000; };
  const mix = pool.slice();
  for (let i = mix.length - 1; i > 0; i--) { const j = Math.floor(zufall() * (i + 1)); [mix[i], mix[j]] = [mix[j], mix[i]]; }
  const map = {};
  BOT_IDS.forEach((b, i) => { map[b] = mix[i] ?? ("Bot " + (i + 1)); });
  botNamenCache = { key, map };
  return map;
}
const spielerVon = (id) => (isBot(id)
  ? { id, name: botNamen()[id] ?? "Bot", farbe: BOT_FARBEN[BOT_IDS.indexOf(id)] ?? "#94a3b8", icon: "🤖" }
  : spielerListe.find((s) => s.id === id));
const name = (id) => spielerVon(id)?.name ?? "?";
const dok = (id) => (docs[id] && docs[id].spiel === nr ? docs[id] : undefined);
const docRef = (id) => doc(api.db, "raeume", api.code, "ttSpieler", id);

// ---- Zufall / Steine ---------------------------------------------------------
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

function neueTasche(rnd) {
  const a = [1, 2, 3, 4, 5, 6, 7];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function drehe(m) {
  const n = m.length;
  return m.map((_, r) => m[0].map((__, c) => m[n - 1 - c][r]));
}

function stein(t) {
  return { t, m: FORMEN[t].map((z) => [...z]), x: Math.floor((BREITE - FORMEN[t].length) / 2), y: t === 1 ? -1 : 0 };
}

// ---- Spiellogik --------------------------------------------------------------
function frei(m, x, y) {
  for (let r = 0; r < m.length; r++) {
    for (let c = 0; c < m[r].length; c++) {
      if (!m[r][c]) continue;
      const bx = x + c, by = y + r;
      if (bx < 0 || bx >= BREITE || by >= HOEHE) return false;
      if (by >= 0 && G.brett[by][bx]) return false;
    }
  }
  return true;
}

function erzeugeG(id, bot) {
  const rnd = zufallsgenerator(seed);
  const holeRnd = zufallsgenerator((seed ^ 0x9E3779B9) + id.length * 7919 + (bot ? id.charCodeAt(id.length - 1) * 131 : 0));
  const g = {
    id, bot,
    brett: Array.from({ length: HOEHE }, () => Array(BREITE).fill(0)),
    rnd, folge: [], holeRnd, folgeIdx: 0,
    cur: null,
    punkte: 0, zeilen: 0, level: 0, combo: -1,
    lebt: true, phase: "countdown", start: performance.now(), spielStart: performance.now(),
    fall: 0, sperre: 0, resets: 0,
    pending: 0, gesendet: 0, gesehen: {},
    letzterSchreib: 0, letzterPuls: 0, schreibtGerade: false, schmutzig: true,
    tod: 0
  };
  const alt = G;
  G = g;
  nachfuellen();
  g.cur = stein(naechster());
  G = alt;
  return g;
}

function neuesSpiel() {
  G = erzeugeG(api.spielerId, false);
  Object.values(docs).forEach((d) => verarbeiteDoc(d));
}

function nachfuellen() {
  while (G.folge.length - G.folgeIdx < 6) G.folge.push(...neueTasche(G.rnd));
}
function naechster() {
  nachfuellen();
  return G.folge[G.folgeIdx++];
}

function fallZeit() {
  const l = G.level;
  return Math.max(45, 800 * Math.pow(0.86, l));
}

function berechneLevel(jetzt) {
  const gespielt = (jetzt - G.spielStart) / 1000;
  return Math.max(Math.floor(G.zeilen / 10), Math.floor(gespielt / 45));
}

function bewege(dx) {
  if (!G.lebt || G.phase !== "spiel") return false;
  if (frei(G.cur.m, G.cur.x + dx, G.cur.y)) { G.cur.x += dx; zuruecksetzenSperre(); return true; }
  return false;
}

function dreheStein(richtung) {
  if (!G.lebt || G.phase !== "spiel" || G.cur.t === 2) return;
  let m = G.cur.m;
  for (let i = 0; i < (richtung > 0 ? 1 : 3); i++) m = drehe(m);
  const kicks = [[0, 0], [-1, 0], [1, 0], [-2, 0], [2, 0], [0, -1], [-1, -1], [1, -1]];
  for (const [kx, ky] of kicks) {
    if (frei(m, G.cur.x + kx, G.cur.y + ky)) {
      G.cur.m = m; G.cur.x += kx; G.cur.y += ky; zuruecksetzenSperre();
      return;
    }
  }
}

function zuruecksetzenSperre() {
  if (!frei(G.cur.m, G.cur.x, G.cur.y + 1)) {
    if (G.resets < 12) { G.sperre = 0; G.resets++; }
  }
}

function runter(weich) {
  if (!G.lebt || G.phase !== "spiel") return false;
  if (frei(G.cur.m, G.cur.x, G.cur.y + 1)) {
    G.cur.y++;
    if (weich) G.punkte += 1;
    G.fall = 0;
    return true;
  }
  return false;
}

function fallenLassen() {
  if (!G.lebt || G.phase !== "spiel") return;
  let n = 0;
  while (frei(G.cur.m, G.cur.x, G.cur.y + 1)) { G.cur.y++; n++; }
  G.punkte += n * 2;
  setzeStein();
}

function geisterY() {
  let y = G.cur.y;
  while (frei(G.cur.m, G.cur.x, y + 1)) y++;
  return y;
}

function setzeStein() {
  const { m, x, y, t } = G.cur;
  let drueber = false;
  for (let r = 0; r < m.length; r++) {
    for (let c = 0; c < m[r].length; c++) {
      if (!m[r][c]) continue;
      const by = y + r, bx = x + c;
      if (by < 0) { drueber = true; continue; }
      G.brett[by][bx] = t;
    }
  }
  if (drueber) { sterbe(); return; }
  // volle Zeilen entfernen
  let n = 0;
  for (let r = HOEHE - 1; r >= 0; r--) {
    if (G.brett[r].every((z) => z)) {
      G.brett.splice(r, 1);
      G.brett.unshift(Array(BREITE).fill(0));
      n++;
      r++;
    }
  }
  if (n > 0) {
    G.combo++;
    G.zeilen += n;
    G.punkte += PUNKTE[n] * (G.level + 1) + (G.combo > 0 ? 50 * G.combo * (G.level + 1) : 0);
    let angriff = ANGRIFF[n] + (G.combo >= 2 ? 1 : 0);
    // Eigene Angriffe heben zuerst eingehenden Muell auf
    const aufheben = Math.min(G.pending, angriff);
    G.pending -= aufheben;
    angriff -= aufheben;
    if (angriff > 0 && muellAn) G.gesendet += angriff;
    if (!G.brett.some((z) => z.some(Boolean))) { G.punkte += 1000 * (G.level + 1); }
  } else {
    G.combo = -1;
    if (G.pending > 0 && muellAn) {
      const k = Math.min(G.pending, MAX_MUELL_PRO_STEIN);
      G.pending -= k;
      if (!muellZeilen(k)) return;
    }
  }
  G.level = berechneLevel(performance.now());
  G.cur = stein(naechster());
  G.fall = 0; G.sperre = 0; G.resets = 0;
  if (!frei(G.cur.m, G.cur.x, G.cur.y)) { sterbe(); return; }
  G.schmutzig = true;
  schreibe(true);
}

function muellZeilen(k) {
  // geht eine belegte Zeile oben raus, ist man tot
  for (let r = 0; r < k; r++) if (G.brett[r].some(Boolean)) { sterbe(); return false; }
  const loch = Math.floor(G.holeRnd() * BREITE);
  G.brett.splice(0, k);
  for (let i = 0; i < k; i++) {
    G.brett.push(Array.from({ length: BREITE }, (_, c) => (c === loch ? 0 : MUELL)));
  }
  return true;
}

function sterbe() {
  if (!G.lebt) return;
  G.lebt = false;
  G.phase = "tot";
  G.tod = Date.now();
  G.schmutzig = true;
  schreibe(true);
  if (!G.bot) zeigeOverlay(`<b>Ausgeschieden</b><span>${G.punkte} Punkte · ${G.zeilen} Zeilen</span><small>Du schaust den anderen zu …</small>`);
}

// ---- Firebase ----------------------------------------------------------------
async function schreibe(sofort = false) {
  const g = G;
  if (!g || !api) return;
  const jetzt = Date.now();
  if (!sofort && jetzt - g.letzterSchreib < SCHREIB_MS) return;
  if (g.schreibtGerade) { g.schmutzig = true; return; }
  if (jetzt - g.letzterSchreib < 250 && !g.tod) { g.schmutzig = true; return; }
  g.letzterSchreib = jetzt;
  g.letzterPuls = jetzt;
  g.schmutzig = false;
  g.schreibtGerade = true;
  try {
    await setDoc(docRef(g.id), {
      spielerId: g.id, spiel: nr, punkte: g.punkte, zeilen: g.zeilen, lebt: g.lebt, tod: g.tod,
      gesendet: g.gesendet, pending: g.pending, feld: g.brett.map((z) => z.join("")).join(""), bot: g.bot
    });
  } catch (e) { zeigeDebug("Tetris: " + e.message); }
  g.schreibtGerade = false;
}

function verarbeiteDoc(d) {
  if (!d || d.spiel !== nr) return;
  const sims = [G, ...Object.values(bots).map((b) => b.g)];
  sims.forEach((g) => {
    if (!g || d.spielerId === g.id) return;
    const gesehen = g.gesehen[d.spielerId] ?? 0;
    const delta = (d.gesendet ?? 0) - gesehen;
    if (delta > 0) {
      g.gesehen[d.spielerId] = d.gesendet;
      if (muellAn && g.lebt) { g.pending += delta; g.schmutzig = true; }
    }
  });
}

function starteDocsListener() {
  docsUnsub = onSnapshot(collection(api.db, "raeume", api.code, "ttSpieler"), (snap) => {
    snap.docChanges().forEach((ch) => {
      const d = ch.doc.data();
      if (ch.type === "removed") { delete docs[ch.doc.id]; return; }
      docs[ch.doc.id] = d;
      zuletzt[ch.doc.id] = Date.now();
      verarbeiteDoc(d);
    });
    if (status === "laeuft") zeichneGegner();
  });
}

// ---- Lebenszyklus ------------------------------------------------------------
let chatStil = null;
export async function starten(uebergebeneApi) {
  document.body.classList.add("tt-aktiv");
  chatStil = document.createElement("style");
  chatStil.textContent = "body.tt-aktiv #btn-chat-oeffnen{display:none!important}";
  document.head.appendChild(chatStil);
  api = uebergebeneApi;
  el.wurzel = api.wurzel;
  el.wurzel.innerHTML = VORLAGE;
  bereitSystem = initBereitSystem(api, "tt");
  $("tt-starten").addEventListener("click", spielStarten);
  $("tt-nochmal").addEventListener("click", zurueckZumSetup);
  baueSteuerung();
  starteDocsListener();
  if (api.istLeiter && !api.raum?.ttStatus) {
    await updateDoc(api.raumRef(), { ttStatus: "setup", ttMuell: true, ttNr: 0, ttIds: [], ttSeed: 0, ttRang: null });
  }
  leiterTimer = setInterval(leiterTick, 1000);
}

function stoppeBots() {
  if (botTimer) { clearInterval(botTimer); botTimer = null; }
  bots = {};
}

export function beenden() {
  document.body.classList.remove("tt-aktiv");
  if (chatStil) { chatStil.remove(); chatStil = null; }
  if (rafId) { cancelAnimationFrame(rafId); rafId = null; }
  if (docsUnsub) { docsUnsub(); docsUnsub = null; }
  if (leiterTimer) { clearInterval(leiterTimer); leiterTimer = null; }
  stoppeBots();
  if (tasten) { tasten(); tasten = null; }
  bereitSystem = null;
  G = null; docs = {}; zuletzt = {}; status = null; gestartetNr = -1; ids = []; rang = null; nr = 0;
  el = {};
  spielerListe = [];
}

export function spieler(liste) {
  spielerListe = liste;
  if (!el.wurzel) return;
  zeichne();
}

export function raumDaten(daten) {
  if (!daten || !el.wurzel) return;
  const alterStatus = status, alteNr = nr;
  status = daten.ttStatus ?? null;
  seed = daten.ttSeed ?? 0;
  ids = daten.ttIds ?? [];
  muellAn = daten.ttMuell !== false;
  botsAnz = daten.ttBots ?? null;
  staerke = daten.ttStaerke ?? "mittel";
  nr = daten.ttNr ?? 0;
  rang = daten.ttRang ?? null;
  if (status === "laeuft" && (gestartetNr !== nr || alterStatus !== "laeuft") && ids.includes(api.spielerId)) {
    gestartetNr = nr;
    neuesSpiel();
    zuletzt = {};
    ids.forEach((id) => { zuletzt[id] = Date.now(); });
    startLoop();
    stoppeBots();
    if (api.istLeiter) starteBots();
  }
  if (status !== "laeuft" && rafId) { cancelAnimationFrame(rafId); rafId = null; }
  if (status !== "laeuft") stoppeBots();
  if (status !== alterStatus || nr !== alteNr) beendeBusy = false;
  zeichne();
}

function alleVerstecken() {
  ["tt-setup", "tt-spiel-screen", "tt-ende-screen"].forEach((id) => { $(id).hidden = true; });
}

function zeichne() {
  if (!el.wurzel) return;
  alleVerstecken();
  if (status === "laeuft") {
    $("tt-spiel-screen").hidden = false;
    $("tt-spiel-screen").classList.toggle("zuschauer", !ids.includes(api.spielerId));
    zeichneGegner();
    api.fortschritt("");
  } else if (status === "beendet") {
    $("tt-ende-screen").hidden = false;
    zeigeEnde();
    api.fortschritt("");
  } else {
    $("tt-setup").hidden = false;
    zeigeSetup();
    api.fortschritt("");
  }
}

// ---- Setup -------------------------------------------------------------------
function zeigeSetup() {
  const gruppe = $("tt-opt-muell");
  gruppe.innerHTML = [[true, "Ja"], [false, "Nein"]].map(([v, t]) =>
    `<button type="button" class="gv-modus-btn${muellAn === v ? " aktiv" : ""}" data-v="${v}"${api.istLeiter ? "" : " disabled"}>${t}</button>`).join("");
  gruppe.querySelectorAll("[data-v]").forEach((b) => b.addEventListener("click", () => {
    if (!api.istLeiter) return;
    updateDoc(api.raumRef(), { ttMuell: b.dataset.v === "true" }).catch(() => {});
  }));
  const nb = botAnzahl();
  const maxBots = Math.min(3, MAX_SPIELER - spielerListe.length);
  const bg = $("tt-opt-bots");
  bg.innerHTML = Array.from({ length: maxBots + 1 }, (_, n) =>
    `<button type="button" class="gv-modus-btn${nb === n ? " aktiv" : ""}" data-b="${n}"${api.istLeiter ? "" : " disabled"}>${n}</button>`).join("");
  bg.querySelectorAll("[data-b]").forEach((b) => b.addEventListener("click", () => {
    if (!api.istLeiter) return;
    updateDoc(api.raumRef(), { ttBots: Number(b.dataset.b) }).catch(() => {});
  }));
  const sg = $("tt-opt-staerke");
  sg.innerHTML = [["leicht", "Leicht"], ["mittel", "Mittel"], ["schwer", "Schwer"]].map(([v, t]) =>
    `<button type="button" class="gv-modus-btn${staerke === v ? " aktiv" : ""}" data-s="${v}"${api.istLeiter ? "" : " disabled"}>${t}</button>`).join("");
  sg.querySelectorAll("[data-s]").forEach((b) => b.addEventListener("click", () => {
    if (!api.istLeiter) return;
    updateDoc(api.raumRef(), { ttStaerke: b.dataset.s }).catch(() => {});
  }));
  $("tt-zeile-staerke").hidden = nb === 0;
  $("tt-bot-hinweis").textContent = nb > 0
    ? `Mit dabei: ${BOT_IDS.slice(0, nb).map((b) => spielerVon(b).name).join(", ")}. Die Bots laufen auf dem Handy des Spielleiters - bleib im Spiel, solange gespielt wird.`
    : "";
  $("tt-starten").hidden = !api.istLeiter;
  $("tt-setup-warten").hidden = api.istLeiter;
  bereitSystem?.render();
}

function botAnzahl() {
  const menschen = spielerListe.length;
  const wunsch = botsAnz ?? (menschen === 1 ? 1 : 0);
  return Math.max(0, Math.min(wunsch, 3, MAX_SPIELER - menschen));
}

async function spielStarten() {
  if (!api.istLeiter) return;
  $("tt-setup-fehler").textContent = "";
  $("tt-starten").disabled = true;
  try {
    const snap = await getDocs(collection(api.db, "raeume", api.code, "ttSpieler"));
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
    const teilnehmer = [...spielerListe.map((s) => s.id), ...BOT_IDS.slice(0, botAnzahl())];
    const batch = writeBatch(api.db);
    teilnehmer.filter((id) => !isBot(id)).forEach((id) => batch.update(api.spielerRef(id), { punkte: 0 }));
    batch.update(api.raumRef(), {
      ttStatus: "laeuft", ttIds: teilnehmer, ttSeed: Math.floor(Math.random() * 4294967296),
      ttNr: nr + 1, ttRang: null
    });
    await batch.commit();
  } catch (e) {
    $("tt-setup-fehler").textContent = "Start fehlgeschlagen: " + e.message;
  } finally {
    $("tt-starten").disabled = false;
  }
}

async function zurueckZumSetup() {
  if (!api.istLeiter) return;
  try {
    await updateDoc(api.raumRef(), { ttStatus: "setup", ttRang: null, bereitSpieler: {} });
  } catch (e) { zeigeDebug("Tetris: " + e.message); }
}

// ---- Leiter: Ende erkennen ------------------------------------------------------
async function leiterTick() {
  if (!api?.istLeiter || status !== "laeuft" || beendeBusy || !ids.length) return;
  const jetzt = Date.now();
  // Spieler ohne Lebenszeichen gelten als ausgeschieden
  for (const id of ids) {
    const d = dok(id);
    const lebt = d ? d.lebt !== false : true;
    const lange = jetzt - (zuletzt[id] ?? jetzt) > TOT_NACH_MS;
    if (lebt && lange) {
      zuletzt[id] = jetzt;
      setDoc(docRef(id), { spielerId: id, spiel: nr, lebt: false, tod: jetzt }, { merge: true }).catch(() => {});
    }
  }
  const lebende = ids.filter((id) => (dok(id) ? dok(id).lebt !== false : true));
  const menschenLeben = lebende.some((id) => !isBot(id));
  const hatMenschen = ids.some((id) => !isBot(id));
  const vorbei = ids.length >= 2 ? (lebende.length <= 1 || (hatMenschen && !menschenLeben)) : lebende.length === 0;
  if (!vorbei) return;
  beendeBusy = true;
  const reihe = ids.map((id) => ({ id, d: dok(id) ?? {} })).sort((a, b) => {
    const al = a.d.lebt !== false ? 1 : 0, bl = b.d.lebt !== false ? 1 : 0;
    if (al !== bl) return bl - al;
    if (!al) return (b.d.tod ?? 0) - (a.d.tod ?? 0) || (b.d.punkte ?? 0) - (a.d.punkte ?? 0);
    return (b.d.punkte ?? 0) - (a.d.punkte ?? 0);
  });
  const ergebnis = reihe.map((x, i) => ({ id: x.id, platz: i + 1, punkte: x.d.punkte ?? 0, zeilen: x.d.zeilen ?? 0 }));
  try {
    const n = ids.length;
    const batch = writeBatch(api.db);
    ergebnis.filter((e) => !isBot(e.id)).forEach((e) => batch.update(api.spielerRef(e.id), { punkte: n - e.platz + 1 }));
    batch.update(api.raumRef(), { ttStatus: "beendet", ttRang: ergebnis });
    await batch.commit();
    if (n >= 2) speichereWertung(api, "tetris", Object.fromEntries(ergebnis.filter((e) => !isBot(e.id)).map((e) => [e.id, n - e.platz + 1])));
  } catch (e) {
    beendeBusy = false;
    zeigeDebug("Tetris: " + e.message);
  }
}

// ---- Endstand ------------------------------------------------------------------
function zeigeEnde() {
  const liste = $("tt-endstand-liste");
  liste.innerHTML = "";
  const r = rang ?? [];
  const sieger = r[0];
  $("tt-sieger").innerHTML = !sieger ? "" : r.length === 1
    ? `<strong>${escapeHtml(name(sieger.id))}</strong>: ${sieger.punkte} Punkte, ${sieger.zeilen} Zeilen`
    : `Gewonnen hat <strong>${escapeHtml(name(sieger.id))}</strong>!`;
  r.forEach((e) => {
    const s = spielerVon(e.id);
    const li = document.createElement("li");
    li.innerHTML = spielerKarte(s?.name ?? "?", s?.farbe, s?.icon, e.punkte, { rang: e.platz, extra: r.length >= 2 ? `+${r.length - e.platz + 1} Wertung` : `${e.zeilen} Zeilen` });
    liste.appendChild(li);
  });
  $("tt-ende-warten").hidden = api.istLeiter;
  $("tt-nochmal").hidden = !api.istLeiter;
}

// ---- Zeichnen ------------------------------------------------------------------
function zelle(ctx, x, y, s, farbe, alpha = 1) {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = farbe;
  ctx.fillRect(x, y, s, s);
  if (s >= 10) {
    ctx.fillStyle = "rgba(255,255,255,.28)";
    ctx.fillRect(x, y, s, Math.max(2, s * 0.12));
    ctx.fillRect(x, y, Math.max(2, s * 0.12), s);
    ctx.fillStyle = "rgba(0,0,0,.28)";
    ctx.fillRect(x, y + s - Math.max(2, s * 0.12), s, Math.max(2, s * 0.12));
    ctx.fillRect(x + s - Math.max(2, s * 0.12), y, Math.max(2, s * 0.12), s);
  }
  ctx.globalAlpha = 1;
}

let zs = 24;
function passeGroesseAn() {
  const brett = $("tt-brett");
  if (!brett) return;
  const w = Math.min(window.innerWidth, 520) - 32;
  const gh = $("tt-gegner")?.offsetHeight ?? 0;
  const h = window.innerHeight - el.wurzel.getBoundingClientRect().top - gh - 56 - 44;
  zs = Math.max(13, Math.min(32, Math.floor(Math.min((w - 96) / BREITE, h / HOEHE))));
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  brett.width = BREITE * zs * dpr; brett.height = HOEHE * zs * dpr;
  brett.style.width = BREITE * zs + "px"; brett.style.height = HOEHE * zs + "px";
  brett.dataset.dpr = dpr;
  const nx = $("tt-next");
  nx.width = 4 * 18 * dpr; nx.height = 11 * 18 * dpr;
  nx.style.width = 4 * 18 + "px"; nx.style.height = 11 * 18 + "px";
  nx.dataset.dpr = dpr;
}

function zeichneBrett() {
  const cv = $("tt-brett");
  if (!cv || !G) return;
  const dpr = Number(cv.dataset.dpr) || 1;
  const ctx = cv.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = "#0e0a1a";
  ctx.fillRect(0, 0, BREITE * zs, HOEHE * zs);
  ctx.strokeStyle = "rgba(255,255,255,.05)";
  ctx.lineWidth = 1;
  for (let x = 1; x < BREITE; x++) { ctx.beginPath(); ctx.moveTo(x * zs + .5, 0); ctx.lineTo(x * zs + .5, HOEHE * zs); ctx.stroke(); }
  for (let y = 1; y < HOEHE; y++) { ctx.beginPath(); ctx.moveTo(0, y * zs + .5); ctx.lineTo(BREITE * zs, y * zs + .5); ctx.stroke(); }
  for (let r = 0; r < HOEHE; r++) for (let c = 0; c < BREITE; c++) {
    const v = G.brett[r][c];
    if (v) zelle(ctx, c * zs, r * zs, zs, FARBEN[v]);
  }
  if (G.lebt && G.phase === "spiel") {
    const gy = geisterY();
    G.cur.m.forEach((zeile, r) => zeile.forEach((v, c) => {
      if (v && gy + r >= 0) zelle(ctx, (G.cur.x + c) * zs, (gy + r) * zs, zs, FARBEN[G.cur.t], 0.22);
    }));
    G.cur.m.forEach((zeile, r) => zeile.forEach((v, c) => {
      if (v && G.cur.y + r >= 0) zelle(ctx, (G.cur.x + c) * zs, (G.cur.y + r) * zs, zs, FARBEN[G.cur.t]);
    }));
  }
  // Muellbalken (eingehende Zeilen) am Rand
  if (G.pending > 0) {
    ctx.fillStyle = "rgba(239,68,68,.85)";
    const h = Math.min(HOEHE, G.pending) * zs;
    ctx.fillRect(0, HOEHE * zs - h, 4, h);
  }
}

function zeichneNext() {
  const cv = $("tt-next");
  if (!cv || !G) return;
  const dpr = Number(cv.dataset.dpr) || 1;
  const ctx = cv.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cv.width, cv.height);
  const s = 18;
  for (let i = 0; i < 3; i++) {
    const t = G.folge[G.folgeIdx + i];
    if (!t) continue;
    const m = FORMEN[t];
    const w = m.length;
    const ox = Math.floor((4 - w) / 2) * s;
    const oy = i * 3.6 * s + (t === 1 ? 0 : s * 0.5);
    m.forEach((zeile, r) => zeile.forEach((v, c) => { if (v) zelle(ctx, ox + c * s, oy + r * s - (t === 1 ? s : 0), s, FARBEN[t]); }));
  }
}

function zeichneWerte() {
  if (!G) return;
  $("tt-punkte").textContent = G.punkte;
  $("tt-zeilen").textContent = G.zeilen;
  $("tt-level").textContent = G.level + 1;
  $("tt-muellfuell").style.height = Math.min(100, G.pending * 12.5) + "%";
}

function zeichneGegner() {
  const box = $("tt-gegner");
  if (!box || !el.wurzel) return;
  const andere = ids.filter((id) => id !== api.spielerId);
  if (box.dataset.ids !== andere.join(",")) {
    box.dataset.ids = andere.join(",");
    box.innerHTML = andere.map((id) => {
      const s = spielerVon(id);
      return `<div class="tt-gegner-karte" data-id="${id}" style="--spieler-farbe:${s?.farbe ?? "#888"}">` +
        `<canvas width="60" height="120"></canvas>` +
        `<span class="tt-gegner-name">${escapeHtml(s?.name ?? "?")}</span><span class="tt-gegner-info"></span></div>`;
    }).join("");
  }
  const cell = Math.max(3, Math.min(4, Math.floor(Math.min(window.innerWidth - 32, 520) / Math.max(1, andere.length) / 10) - 5));
  box.querySelectorAll(".tt-gegner-karte").forEach((k) => {
    const d = dok(k.dataset.id);
    const cv = k.querySelector("canvas");
    cv.width = BREITE * cell; cv.height = HOEHE * cell;
    const ctx = cv.getContext("2d");
    ctx.fillStyle = "#0e0a1a";
    ctx.fillRect(0, 0, cv.width, cv.height);
    const f = d?.feld;
    if (f && f.length === BREITE * HOEHE) {
      for (let i = 0; i < f.length; i++) {
        const v = Number(f[i]);
        if (v) { ctx.fillStyle = FARBEN[v]; ctx.fillRect((i % BREITE) * cell, Math.floor(i / BREITE) * cell, cell - 0.5, cell - 0.5); }
      }
    }
    const tot = d && d.lebt === false;
    k.classList.toggle("tot", Boolean(tot));
    k.querySelector(".tt-gegner-info").textContent = tot ? "✖ raus" : `${d?.punkte ?? 0}`;
  });
}

function zeigeOverlay(html) {
  const o = $("tt-overlay");
  if (!o) return;
  o.innerHTML = html;
  o.hidden = !html;
}

// ---- Hauptschleife ----------------------------------------------------------
function startLoop() {
  if (rafId) cancelAnimationFrame(rafId);
  zeichneGegner();
  passeGroesseAn();
  let letzte = performance.now();
  G.start = letzte;
  const schritt = (jetzt) => {
    if (!G || status !== "laeuft") return;
    if (!G.angepasst && !$("tt-spiel-screen").hidden) { zeichneGegner(); passeGroesseAn(); G.angepasst = true; }
    const dt = Math.min(100, jetzt - letzte);
    letzte = jetzt;
    if (G.phase === "countdown") {
      const rest = 3000 - (jetzt - G.start);
      if (rest <= 0) {
        G.phase = "spiel"; G.spielStart = jetzt; zeigeOverlay("");
      } else {
        zeigeOverlay(`<b class="gross">${Math.ceil(rest / 1000)}</b>`);
      }
    } else if (G.phase === "spiel" && G.lebt) {
      G.level = Math.max(G.level, berechneLevel(jetzt));
      if (frei(G.cur.m, G.cur.x, G.cur.y + 1)) {
        G.fall += dt;
        if (G.fall >= fallZeit()) { G.fall = 0; G.cur.y++; }
        G.sperre = 0;
      } else {
        G.sperre += dt;
        if (G.sperre >= SPERRZEIT_MS) setzeStein();
      }
    }
    if (G && G.phase !== "countdown" && (G.schmutzig || (G.lebt && Date.now() - G.letzterPuls > PULS_MS))) schreibe(!G.lebt || Date.now() - G.letzterPuls > PULS_MS);
    if (G) { zeichneBrett(); zeichneNext(); zeichneWerte(); }
    rafId = requestAnimationFrame(schritt);
  };
  rafId = requestAnimationFrame(schritt);
}

// ---- Bots (laufen auf dem Geraet des Spielleiters) -----------------------------
const BOT_TEMPO = { leicht: 1300, mittel: 850, schwer: 520 };
const BOT_FEHLER = { leicht: 0.3, mittel: 0.1, schwer: 0 };

function mitG(g, fn) {
  const alt = G;
  G = g;
  try { return fn(); } finally { G = alt; }
}

function starteBots() {
  stoppeBots();
  ids.filter(isBot).forEach((id) => {
    const g = erzeugeG(id, true);
    bots[id] = { g, naechster: performance.now() + 3000 + Math.random() * 600 };
  });
  Object.values(docs).forEach((d) => verarbeiteDoc(d));
  if (Object.keys(bots).length) botTimer = setInterval(botSchritt, 100);
}

function botSchritt() {
  if (status !== "laeuft") return;
  const jetzt = performance.now();
  Object.values(bots).forEach((b) => {
    const g = b.g;
    if (!g.lebt) { if (g.schmutzig) mitG(g, () => schreibe(true)); return; }
    if (g.phase === "countdown") {
      if (jetzt - g.start >= 3000) { g.phase = "spiel"; g.spielStart = jetzt; }
      return;
    }
    if (jetzt >= b.naechster) {
      mitG(g, botZug);
      const basis = BOT_TEMPO[staerke] ?? BOT_TEMPO.mittel;
      b.naechster = jetzt + Math.max(220, basis * Math.pow(0.93, g.level)) * (0.8 + Math.random() * 0.4);
    }
    if (g.lebt && (g.schmutzig || Date.now() - g.letzterPuls > PULS_MS)) mitG(g, () => schreibe(Date.now() - g.letzterPuls > PULS_MS));
  });
}

// Bewertung eines Brettes nach dem Ablegen (je hoeher, desto besser)
function botBewerte(brett, zeilen) {
  const hoehen = Array(BREITE).fill(0);
  let loecher = 0;
  for (let c = 0; c < BREITE; c++) {
    let gefunden = false;
    for (let r = 0; r < HOEHE; r++) {
      if (brett[r][c]) { if (!gefunden) { hoehen[c] = HOEHE - r; gefunden = true; } } else if (gefunden) loecher++;
    }
  }
  const summe = hoehen.reduce((a, b) => a + b, 0);
  let rau = 0;
  for (let c = 0; c < BREITE - 1; c++) rau += Math.abs(hoehen[c] - hoehen[c + 1]);
  const max = Math.max(...hoehen);
  return -0.51 * summe + 0.76 * zeilen - 0.36 * loecher * 1.6 - 0.18 * rau - (max > 14 ? (max - 14) * 1.5 : 0);
}

function botZug() {
  if (!G.lebt) return;
  const t = G.cur.t;
  const kandidaten = [];
  let m = FORMEN[t].map((z) => [...z]);
  const drehungen = t === 2 ? 1 : 4;
  for (let rot = 0; rot < drehungen; rot++) {
    for (let x = -2; x < BREITE; x++) {
      if (!frei(m, x, -3)) continue;
      let y = -3;
      while (frei(m, x, y + 1)) y++;
      // Brett-Kopie mit dem Stein
      const b = G.brett.map((z) => [...z]);
      let drueber = false;
      for (let r = 0; r < m.length; r++) for (let c = 0; c < m[r].length; c++) {
        if (!m[r][c]) continue;
        if (y + r < 0) { drueber = true; continue; }
        b[y + r][x + c] = t;
      }
      let zeilen = 0;
      for (let r = HOEHE - 1; r >= 0; r--) {
        if (b[r].every(Boolean)) { b.splice(r, 1); b.unshift(Array(BREITE).fill(0)); zeilen++; r++; }
      }
      kandidaten.push({ m, x, y, wert: botBewerte(b, zeilen) - (drueber ? 100 : 0) });
    }
    m = drehe(m);
  }
  if (!kandidaten.length) { sterbe(); return; }
  kandidaten.sort((a, b) => b.wert - a.wert);
  let wahl = kandidaten[0];
  if (Math.random() < (BOT_FEHLER[staerke] ?? 0.1)) wahl = kandidaten[Math.min(kandidaten.length - 1, 1 + Math.floor(Math.random() * 3))];
  G.cur = { t, m: wahl.m, x: wahl.x, y: wahl.y };
  setzeStein();
}

// ---- Steuerung ----------------------------------------------------------------
function baueSteuerung() {
  const aktionen = {
    links: () => bewege(-1),
    rechts: () => bewege(1),
    runter: () => runter(true),
    ccw: () => dreheStein(-1),
    cw: () => dreheStein(1),
    drop: () => fallenLassen()
  };
  const wiederholt = new Set(["links", "rechts", "runter"]);
  const timer = new Map();
  const stopp = (a) => { const t = timer.get(a); if (t) { clearTimeout(t.start); clearInterval(t.iv); timer.delete(a); } };
  const knoepfe = el.wurzel.querySelectorAll("#tt-tasten button");
  const ab = [];
  knoepfe.forEach((b) => {
    const a = b.dataset.a;
    const down = (e) => {
      e.preventDefault();
      if (!G) return;
      aktionen[a]();
      if (wiederholt.has(a)) {
        stopp(a);
        const t = {};
        t.start = setTimeout(() => { t.iv = setInterval(() => aktionen[a](), a === "runter" ? 45 : 60); }, 170);
        timer.set(a, t);
      }
    };
    const up = () => stopp(a);
    b.addEventListener("pointerdown", down);
    b.addEventListener("pointerup", up);
    b.addEventListener("pointerleave", up);
    b.addEventListener("pointercancel", up);
    b.addEventListener("contextmenu", (e) => e.preventDefault());
  });
  // Wischen / Tippen auf dem Spielfeld
  const brett = $("tt-brett");
  let t0 = null;
  brett.addEventListener("pointerdown", (e) => {
    t0 = { x: e.clientX, y: e.clientY, zeit: performance.now(), schritte: 0, bewegt: false };
    try { brett.setPointerCapture(e.pointerId); } catch (_) { /* egal */ }
  });
  brett.addEventListener("pointermove", (e) => {
    if (!t0 || !G) return;
    const dx = e.clientX - t0.x;
    const soll = Math.trunc(dx / (zs * 0.9));
    while (t0.schritte < soll) { bewege(1); t0.schritte++; t0.bewegt = true; }
    while (t0.schritte > soll) { bewege(-1); t0.schritte--; t0.bewegt = true; }
  });
  const ende = (e) => {
    if (!t0 || !G) { t0 = null; return; }
    const dx = e.clientX - t0.x, dy = e.clientY - t0.y, dt = performance.now() - t0.zeit;
    if (!t0.bewegt && Math.abs(dx) < 12 && Math.abs(dy) < 12 && dt < 350) dreheStein(1);
    else if (dy > 55 && dy > Math.abs(dx) * 1.5 && dt < 450) fallenLassen();
    t0 = null;
  };
  brett.addEventListener("pointerup", ende);
  brett.addEventListener("pointercancel", () => { t0 = null; });
  // Tastatur (Rechner)
  const taste = (e) => {
    if (!G || status !== "laeuft") return;
    const k = e.key;
    const map = { ArrowLeft: "links", ArrowRight: "rechts", ArrowDown: "runter", ArrowUp: "cw", x: "cw", z: "ccw", " ": "drop" };
    if (map[k]) { e.preventDefault(); aktionen[map[k]](); }
  };
  document.addEventListener("keydown", taste);
  const gr = () => { if (G) { zeichneGegner(); passeGroesseAn(); } };
  window.addEventListener("resize", gr);
  tasten = () => {
    document.removeEventListener("keydown", taste);
    window.removeEventListener("resize", gr);
    [...timer.keys()].forEach(stopp);
  };
  ab.length = 0;
}
