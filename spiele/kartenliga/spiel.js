// ============================================================================
//  Kartenliga
// ----------------------------------------------------------------------------
//  Strategisches Fußball-Kartenspiel (Mischung aus YRO und Castle Combo).
//  Jeder baut ein Team im 3x3-Raster (Sturm / Mittelfeld / Abwehr), 8 Runden mit
//  Draft und Transfers, nach Runde 2, 4, 6 und 8 ist Spieltag: jeder gegen jeden,
//  abwechselnd Reihen- und Flügel-Duelle. Dazu eine Arena mit zwei Ausbaupfaden
//  (Tribüne = Einnahmen, Hexenkessel = Heimstärke). Mit Bots auch alleine spielbar.
//
//  Raumfelder: klStatus (setup | laeuft | ende), klOpt ({ bots, zeitlimit }),
//  kl (kompletter Spielzustand, siehe ablauf.js). Eingaben der Spieler liegen in
//  der Subcollection "klAktionen" (ein Dokument je Spieler, Runde und Schritt).
//  Nur das Spielleiter-Gerät rechnet: es sammelt die Eingaben, lässt die Bots
//  entscheiden und schreibt den neuen Zustand.
// ============================================================================
import {
  doc, setDoc, updateDoc, deleteDoc, collection, getDocs, onSnapshot, writeBatch, increment
} from "../../kern/firebase.js";
import { spielerKarte, zeigeDebug, initBereitSystem, escapeHtml } from "../../kern/ui.js";
import { speichereWertung, punkteFuerRang } from "../../kern/wertung.js";
import {
  CFG, setzeKarten, karte, feldWerte, LINIEN, LINIEN_NAME, REIHEN_POS, POS_NAME, BONUS_NAME, BONUS_TEXT,
  planRechnen, ausbauKosten, tabelle, mischen, botTransferPlan, tauschErlaubt
} from "./logik.js";
import { istBot, spielAnlegen, draftAnwenden, draftBotPicks, transferAnwenden, arenaAnwenden, nachSpieltag } from "./ablauf.js";
import {
  STIL, karteHtml, teamWappen, arenaSvg, farbIndex, FARBEN_LISTE, bonusSymbol, wuerfelIcon, wuerfelFlaeche, VEREIN_NAME
} from "./design.js";

const DRAFT_MS = 30000;
const ARENA_MS = 30000;
const TRANSFER_MS = 90000;
const PUFFER_MS = 4000;
const MAX_TEAMS = 5;
const BOT_NAMEN = ["Niklas", "Luca", "Nader", "Sinan", "Kevin", "Benni", "Paul"];
const POS_FARBE = { ST: "var(--kl-st)", MF: "var(--kl-mf)", ABW: "var(--kl-abw)" };

const VORLAGE = `
  <div class="kl">
    <div id="kl-setup" class="bildschirm-karte" hidden>
      <h2>Kartenliga</h2>
      <p class="hinweis-text">Baue im 3x3-Raster dein Team aus Sturm, Mittelfeld und Abwehr. In 8 Runden draftest
        du Spieler, kaufst sie mit Münzen und baust deine Arena aus. Nach jeder zweiten Runde ist Spieltag: Jeder spielt
        gegen jeden, abwechselnd Reihen-Duelle (Sturm gegen Abwehr) und Flügel-Duelle. Wer am Ende die meisten
        Ligapunkte hat, ist Meister.</p>
      <div class="gv-modus-zeile"><span>Bots</span><span class="kl-setup-bots" id="kl-bots"></span></div>
      <div class="gv-modus-zeile"><span>Zeitlimit</span><span class="kl-setup-bots" id="kl-zeit"></span></div>
      <p class="hinweis-text" id="kl-setup-info"></p>
      <p id="kl-setup-fehler" class="fehler-text"></p>
      <p><button id="kl-starten" class="btn-primaer" hidden>Spiel starten</button></p>
      <p id="kl-setup-warten" hidden><em>Warte, bis der Spielleiter das Spiel startet …</em></p>
      <div id="kl-bereit-bereich" class="bereit-bereich" hidden></div>
    </div>
    <div id="kl-spiel" hidden></div>
    <div id="kl-ende" class="bildschirm-karte" hidden></div>
  </div>
`;

let api = null;
let el = {};
let spielerListe = [];
let status = null;
let z = null;            // Spielzustand
let opt = { bots: 3, zeitlimit: false };
let aktionen = {};       // Schlüssel -> Daten
let aktUnsub = null;
let tickId = null;
let bereitSystem = null;
let karten = [];
let leiterBusy = false;
let letzterSchritt = "";
let olympiadeAutoStart = false;

// lokaler Zustand der Oberfläche
let schrittKey = "";
let draftAuswahl = null;
let plan = { kaeufe: [], verkauf: [], ausbau: null };
let handAuswahl = null;
let tab = "team";
let ligaSicht = null;
let hinweis = "";
let animiert = new Set();
let sendet = false;
let arenaWahl = null;
let letztesHtml = "";
let tauschModus = false, tauschErste = null, verkaufModus = false;
// Spieltag-Animation: alle sehen gleichzeitig Spielrunde k; der Spielleiter schaltet weiter
// Grundtempo = x2; x1 ist doppelt so langsam, x3 anderthalbmal so schnell
const ANIM_X2 = { intro: 1600, duell: 3900, ende: 3000, karteAb: 300, karteSchritt: 450, wurfAb: 250, wurfDauer: 850, summeAb: 2300, toreAb: 2600 };
const tempo = () => ([1, 2, 3].includes(opt.tempo) ? opt.tempo : 1);
const animT = () => Object.fromEntries(Object.entries(ANIM_X2).map(([k, v]) => [k, Math.round(v * 2 / tempo())]));
const spielMs = () => { const T = animT(); return T.intro + 3 * T.duell + T.ende; };
let animLokal = { key: "", start: 0 };
let animGesendet = "";
const phasenDauer = (p) => (p === "draft" ? DRAFT_MS : p === "transfer" ? TRANSFER_MS : ARENA_MS);
const mitZeit = (p) => p === "draft" || p === "transfer" || p === "arena";

const $ = (id) => el.wurzel.querySelector("#" + id);
const klon = (x) => JSON.parse(JSON.stringify(x));
const ich = () => api.spielerId;
const istDabei = () => Boolean(z?.teams?.[ich()]);

// ---- Lebenszyklus -----------------------------------------------------------------------
export async function starten(uebergebeneApi) {
  api = uebergebeneApi;
  el.wurzel = api.wurzel;
  if (!document.getElementById("kl-stil")) {
    const s = document.createElement("style");
    s.id = "kl-stil";
    s.textContent = STIL;
    document.head.appendChild(s);
  }
  el.wurzel.innerHTML = VORLAGE;
  try {
    const antwort = await fetch(new URL("./karten.json", import.meta.url));
    karten = await antwort.json();
    setzeKarten(karten);
  } catch (e) {
    zeigeDebug("Karten konnten nicht geladen werden: " + e.message);
  }
  bereitSystem = initBereitSystem(api, "kl");
  olympiadeAutoStart = false;
  $("kl-starten").addEventListener("click", spielStarten);
  el.wurzel.addEventListener("click", klick);
  aktUnsub = onSnapshot(collection(api.db, "raeume", api.code, "klAktionen"), (snap) => {
    aktionen = {};
    snap.forEach((d) => { aktionen[d.id] = d.data(); });
    zeichne();
    leiterPruefen();
  });
  if (api.istLeiter && !api.raum?.klStatus) {
    const menschen = (api.spieler || []).length || 1;
    await updateDoc(api.raumRef(), {
      klStatus: "setup",
      klOpt: { bots: menschen >= 4 ? 0 : 4 - menschen, zeitlimit: menschen > 1 }
    });
  }
  tickId = setInterval(tick, 500);
}

export function beenden() {
  if (aktUnsub) { aktUnsub(); aktUnsub = null; }
  if (tickId) { clearInterval(tickId); tickId = null; }
  document.querySelector(".kl-overlay")?.remove();
  el = {}; spielerListe = []; status = null; z = null; aktionen = {}; bereitSystem = null;
  leiterBusy = false; letzterSchritt = ""; schrittKey = ""; draftAuswahl = null; plan = { kaeufe: [], verkauf: [], ausbau: null };
  handAuswahl = null; tab = "team"; ligaSicht = null; hinweis = ""; animiert = new Set(); sendet = false; letztesHtml = "";
  document.body.style.overflow = "";
}

export function spieler(liste) {
  spielerListe = liste;
  if (!el.wurzel) return;
  zeichne();
}

export function raumDaten(daten) {
  if (!daten || !el.wurzel) return;
  status = daten.klStatus ?? null;
  z = daten.kl ?? null;
  opt = daten.klOpt ?? opt;
  const key = z ? `${z.runde}_${z.phase}_${z.pick}` : "";
  if (key !== schrittKey) {
    schrittKey = key;
    draftAuswahl = null; handAuswahl = null; plan = { kaeufe: [], verkauf: [], ausbau: null }; tauschModus = false; tauschErste = null; verkaufModus = false; hinweis = ""; sendet = false; arenaWahl = null;
  }
  if (status === "laeuft" && z) {
    const phasen = { draft: "Draft", transfer: "Transfers", arena: "Arena", spieltag: "Spieltag" };
    api.fortschritt(`Runde ${z.runde}/${CFG.runden}${phasen[z.phase] ? " · " + phasen[z.phase] : ""}`);
  } else api.fortschritt("");
  zeichne();
  leiterPruefen();
}

export async function vorZurueck() {
  try {
    await raeumeAktionenAuf();
    await updateDoc(api.raumRef(), { klStatus: null, kl: null });
    await api.zurueckZurAuswahl();
  } catch (e) {
    zeigeDebug("Fehler beim Zurückkehren: " + e.message);
  }
}

async function raeumeAktionenAuf() {
  const snap = await getDocs(collection(api.db, "raeume", api.code, "klAktionen"));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  aktionen = {};
}

// ---- Teams -------------------------------------------------------------------------------
function teamInfo(id) {
  if (istBot(id)) {
    const b = z?.bots?.[id] || {};
    return { name: b.name || "Bot", farbe: FARBEN_LISTE[z?.farben?.[id] ?? 0]?.hex, bot: true };
  }
  const s = spielerListe.find((x) => x.id === id);
  return { name: s?.name || "Spieler", farbe: FARBEN_LISTE[z?.farben?.[id] ?? 0]?.hex, icon: s?.icon };
}
function teamName(id, mitWappen = true) {
  const t = teamInfo(id);
  const w = mitWappen && z?.farben ? teamWappen(z.farben[id]) : "";
  return `<span class="kl-team-name">${w}${escapeHtml(t.name)}${t.bot ? " 🤖" : ""}</span>`;
}

// ---- Setup --------------------------------------------------------------------------------
function zeichneSetup() {
  const menschen = spielerListe.length || 1;
  const maxBots = Math.max(0, MAX_TEAMS - menschen);
  const bots = Math.min(opt.bots ?? 0, maxBots);
  $("kl-bots").innerHTML = Array.from({ length: maxBots + 1 }, (_, n) =>
    `<button type="button" data-a="bots" data-v="${n}" class="${n === bots ? "an" : ""}" ${api.istLeiter ? "" : "disabled"}>${n}</button>`).join("");
  $("kl-zeit").innerHTML = [[true, "An"], [false, "Aus"]].map(([v, t]) =>
    `<button type="button" data-a="zeit" data-v="${v}" class="${Boolean(opt.zeitlimit) === v ? "an" : ""}" ${api.istLeiter ? "" : "disabled"}>${t}</button>`).join("");
  const gesamt = menschen + bots;
  $("kl-setup-info").textContent = gesamt < 2
    ? "Es braucht mindestens 2 Teams. Wähle mindestens einen Bot."
    : `${gesamt} Teams in der Liga (${menschen} ${menschen === 1 ? "Mensch" : "Menschen"}, ${bots} ${bots === 1 ? "Bot" : "Bots"}). `
      + (opt.zeitlimit ? "Draft 30 s pro Wahl, Transfers 90 s." : "Ohne Zeitlimit.");
  $("kl-starten").hidden = !api.istLeiter;
  $("kl-setup-warten").hidden = api.istLeiter;
  bereitSystem?.render();
  if (api.istLeiter && api.olympiadeAnzahl && !olympiadeAutoStart && bereitSystem?.alleBereit()) {
    olympiadeAutoStart = true;
    spielStarten();
  }
}

async function spielStarten() {
  $("kl-setup-fehler").textContent = "";
  const menschen = spielerListe.map((s) => s.id);
  const bots = Math.min(opt.bots ?? 0, Math.max(0, MAX_TEAMS - menschen.length));
  if (menschen.length + bots < 2) { $("kl-setup-fehler").textContent = "Mindestens 2 Teams nötig. Wähle einen Bot dazu."; return; }
  if (!karten.length) { $("kl-setup-fehler").textContent = "Die Karten sind noch nicht geladen."; return; }
  $("kl-starten").disabled = true;
  try {
    await raeumeAktionenAuf();
    const namenMenschen = spielerListe.map((s) => String(s.name || "").trim().toLowerCase().split(/\s+/)[0]);
    const namen = mischen(BOT_NAMEN.filter((n) => !namenMenschen.includes(n.toLowerCase())));
    const botIds = Array.from({ length: bots }, (_, i) => `bot${i + 1}`);
    const botDaten = {};
    botIds.forEach((id, i) => { botDaten[id] = { name: namen[i] || `Bot ${i + 1}` }; });
    const reihenfolge = mischen([...menschen, ...botIds]);
    const neu = spielAnlegen(reihenfolge, botDaten, { zeitlimit: opt.zeitlimit });
    // Teamfarben: Menschen behalten ihre App-Farbe, Bots bekommen freie Farben
    const farben = {};
    const belegt = [];
    menschen.forEach((id) => {
      const s = spielerListe.find((x) => x.id === id);
      let f = farbIndex(s?.farbe, belegt);
      if (belegt.includes(f)) f = farbIndex(null, belegt);
      farben[id] = f; belegt.push(f);
    });
    botIds.forEach((id) => { const f = farbIndex(null, belegt); farben[id] = f; belegt.push(f); });
    neu.farben = farben;
    await Promise.all(spielerListe.map((s) => updateDoc(api.spielerRef(s.id), { punkte: 0 })));
    await updateDoc(api.raumRef(), { klStatus: "laeuft", kl: neu });
  } catch (e) {
    zeigeDebug("Fehler beim Start: " + e.message);
  }
  $("kl-starten").disabled = false;
}

// ---- Eingaben senden ----------------------------------------------------------------------
const aktionsKey = (id, phase) => `${id}_${z.runde}_${phase}_${phase === "draft" ? z.pick : 0}`;
const meineAktion = () => (z && istDabei() ? aktionen[aktionsKey(ich(), z.phase)] : null);

async function sende(daten) {
  if (sendet || !z) return;
  sendet = true;
  zeichne();
  try {
    await setDoc(doc(api.db, "raeume", api.code, "klAktionen", aktionsKey(ich(), z.phase)), {
      spielerId: ich(), runde: z.runde, phase: z.phase, pick: z.pick, ...daten
    });
  } catch (e) {
    sendet = false;
    zeigeDebug("Fehler beim Senden: " + e.message);
  }
  zeichne();
}

// ---- Spielleiter: Schritte ausführen --------------------------------------------------------
function tick() {
  if (!el.wurzel || status !== "laeuft" || !z) return;
  const balken = $("kl-zeitfuell");
  if (balken && z.zeitlimit && mitZeit(z.phase)) {
    const dauer = phasenDauer(z.phase);
    balken.style.width = Math.max(0, 1 - (Date.now() - z.phaseStart) / dauer) * 100 + "%";
  }
  leiterPruefen();
  animWeiter();
}

// Laufende Spielrunde der Spieltag-Animation (null = alle Spiele gezeigt)
function animStand() {
  const sp = z?.phase === "spieltag" ? z.spieltag : null;
  if (!sp?.anim || !sp.runden || sp.anim.k >= sp.runden) return null;
  const key = `${sp.nr}_${sp.anim.k}_${tempo()}`;
  if (animLokal.key !== key) animLokal = { key, start: Date.now() };
  return { k: sp.anim.k, n: sp.runden, key, t: Date.now() - animLokal.start };
}
function animSetzen(k) {
  if (!api?.istLeiter || !z?.spieltag) return;
  updateDoc(api.raumRef(), { "kl.spieltag.anim": { k } }).catch((e) => zeigeDebug("Fehler bei der Animation: " + e.message));
}
function animWeiter() {
  if (!api?.istLeiter || status !== "laeuft") return;
  const st = animStand();
  if (!st || st.t < spielMs() || animGesendet === st.key) return;
  animGesendet = st.key;
  animSetzen(st.k + 1);
}

async function leiterPruefen() {
  if (!api?.istLeiter || status !== "laeuft" || !z || leiterBusy) return;
  if (!mitZeit(z.phase)) return;
  const schritt = `${z.runde}_${z.phase}_${z.pick}`;
  if (letzterSchritt === schritt) return;
  const anwesend = new Set(spielerListe.map((s) => s.id));
  const menschen = z.reihenfolge.filter((id) => !istBot(id) && anwesend.has(id));
  const fertig = menschen.filter((id) => aktionen[aktionsKey(id, z.phase)]);
  const dauer = phasenDauer(z.phase);
  const abgelaufen = z.zeitlimit && Date.now() - z.phaseStart > dauer + PUFFER_MS;
  if (fertig.length < menschen.length && !abgelaufen) return;

  leiterBusy = true;
  letzterSchritt = schritt;
  try {
    let neu = klon(z);
    if (z.phase === "draft") {
      const picks = draftBotPicks(neu);
      z.reihenfolge.filter((id) => !istBot(id)).forEach((id) => {
        const a = aktionen[aktionsKey(id, "draft")];
        if (a?.karte) picks[id] = a.karte;
      });
      neu = draftAnwenden(neu, picks);
    } else if (z.phase === "arena") {
      const wahlen = {};
      z.reihenfolge.filter((id) => !istBot(id)).forEach((id) => { wahlen[id] = aktionen[aktionsKey(id, "arena")]?.ausbau ?? null; });
      neu = arenaAnwenden(neu, wahlen);
    } else {
      const plaene = {};
      z.reihenfolge.filter((id) => !istBot(id)).forEach((id) => {
        const a = aktionen[aktionsKey(id, "transfer")];
        // Wer nichts geschickt hat (Zeit abgelaufen oder Raum verlassen), bekommt die Automatik
        plaene[id] = a?.plan || botTransferPlan(neu.teams[id], neu.teams[id].hand, neu.runde, { k: 0.5, lust: 0 });
      });
      neu = transferAnwenden(neu, plaene);
    }
    await updateDoc(api.raumRef(), { kl: neu });
  } catch (e) {
    letzterSchritt = "";
    zeigeDebug("Fehler beim Weiterschalten: " + e.message);
  }
  leiterBusy = false;
}

async function weiterNachSpieltag() {
  if (!api.istLeiter || !z || z.phase !== "spieltag" || leiterBusy) return;
  leiterBusy = true;
  try {
    const neu = nachSpieltag(klon(z));
    if (neu.phase === "ende") {
      const tab = neu.endTabelle;
      const n = tab.length;
      const gewinne = {};
      tab.forEach((e) => { if (!istBot(e.id)) gewinne[e.id] = punkteFuerRang(e.rang, n); });
      const batch = writeBatch(api.db);
      Object.entries(gewinne).forEach(([id, wert]) => {
        if (spielerListe.some((s) => s.id === id)) batch.update(api.spielerRef(id), { punkte: increment(wert) });
      });
      batch.update(api.raumRef(), { kl: neu, klStatus: "ende" });
      await batch.commit();
      speichereWertung(api, "kartenliga", gewinne);
    } else {
      await updateDoc(api.raumRef(), { kl: neu });
    }
  } catch (e) {
    zeigeDebug("Fehler beim Weiterschalten: " + e.message);
  }
  leiterBusy = false;
}

// ---- Klicks ---------------------------------------------------------------------------------
function klick(ev) {
  const t = ev.target.closest("[data-a]");
  if (!t || !el.wurzel.contains(t)) return;
  const a = t.dataset.a, v = t.dataset.v;
  if (a === "bots" && api.istLeiter) { updateDoc(api.raumRef(), { "klOpt.bots": Number(v) }); return; }
  if (a === "tempo" && api.istLeiter) { updateDoc(api.raumRef(), { "klOpt.tempo": Number(v) }); return; }
  if (a === "zeit" && api.istLeiter) { updateDoc(api.raumRef(), { "klOpt.zeitlimit": v === "true" }); return; }
  if (a === "tab") { tab = v; ligaSicht = null; zeichne(); return; }
  if (a === "liga-team") { ligaSicht = ligaSicht === v ? null : v; zeichne(); return; }
  if (a === "zoom") { zeigeKarte(v, Number(t.dataset.w || 0)); return; }
  if (a === "weiter") { weiterNachSpieltag(); return; }
  if (a === "gesamt") { api.zeigeGesamtwertung(); return; }
  if (a === "spiel") { zeigeSpiel(Number(v)); return; }
  if (a === "anim-weiter" || a === "anim-alle") {
    const st = animStand();
    if (st && api.istLeiter && animGesendet !== st.key + a) { animGesendet = st.key + a; animSetzen(a === "anim-alle" ? st.n : st.k + 1); }
    return;
  }
  if (!z || !istDabei() || meineAktion() || sendet) return;
  if (a === "draft-wahl" && z.phase === "draft") { draftAuswahl = v; zeichne(); return; }
  if (a === "draft-ok" && z.phase === "draft" && draftAuswahl) { sende({ karte: draftAuswahl }); return; }
  if (z.phase === "arena") {
    const team = z.teams[ich()];
    if (a === "ausbau") {
      const kosten = ausbauKosten(team, v);
      if (arenaWahl === v) arenaWahl = null;
      else if (kosten != null && kosten <= team.geld) arenaWahl = v;
      zeichne(); return;
    }
    if (a === "arena-ok") { sende({ ausbau: arenaWahl }); return; }
    return;
  }
  if (z.phase !== "transfer") return;
  const team = z.teams[ich()];
  if (a === "tausch-modus") {
    tauschModus = !tauschModus; tauschErste = null; handAuswahl = null; hinweis = "";
    zeichne(); return;
  }
  if (a === "tausch-weg") { plan.tausch = null; tauschModus = false; tauschErste = null; hinweis = ""; zeichne(); return; }
  if (a === "feld" && tauschModus) {
    const feld = Number(v);
    const g = planVon(team, { ...plan, tausch: null }).grid;
    if (!g[feld]) { hinweis = "Tauschen geht nur zwischen zwei Spielern."; zeichne(); return; }
    if (tauschErste == null) { tauschErste = feld; hinweis = ""; zeichne(); return; }
    if (tauschErste === feld) { tauschErste = null; zeichne(); return; }
    plan.tausch = [tauschErste, feld];
    if (planVon(team, plan).fehler.length) { plan.tausch = null; hinweis = `Für den Tausch brauchst du ${CFG.tauschKosten} Münzen.`; }
    else hinweis = "";
    tauschModus = false; tauschErste = null;
    zeichne(); return;
  }
  // Käufe ändern sich -> geplanter Tausch passt evtl. nicht mehr
  const kaufAenderung = () => { if (plan.tausch) { plan.tausch = null; hinweis = "Der Tausch wurde zurückgesetzt, weil du deine Käufe geändert hast."; } };
  const verkauf = plan.verkauf || (plan.verkauf = []);
  if (a === "verkaufen" && handAuswahl) {
    if (!verkauf.includes(handAuswahl)) verkauf.push(handAuswahl);
    handAuswahl = null; hinweis = ""; zeichne(); return;
  }
  if (a === "hand") {
    const geplant = plan.kaeufe.findIndex((k) => k.id === v);
    if (verkauf.includes(v)) {
      // Verkauf zurücknehmen - aber nur, wenn das Geld für die Käufe dann noch reicht
      plan.verkauf = verkauf.filter((x) => x !== v);
      if (planVon(team, plan).fehler.length) { plan.verkauf.push(v); hinweis = "Ohne diesen Verkauf reicht dein Geld nicht für deine Käufe."; }
      else hinweis = "";
      zeichne(); return;
    }
    if (verkaufModus && geplant < 0) {
      verkauf.push(v);
      const rest = planVon(team, plan).zuViel;
      hinweis = rest ? `Noch ${rest} Karte${rest === 1 ? "" : "n"} verkaufen.` : "";
      if (!rest) verkaufModus = false;
      zeichne(); return;
    }
    if (geplant >= 0) { kaufAenderung(); plan.kaeufe.splice(geplant, 1); handAuswahl = v; }
    else handAuswahl = handAuswahl === v ? null : v;
    zeichne(); return;
  }
  if (a === "feld") {
    const feld = Number(v);
    if (!handAuswahl) {
      const k = plan.kaeufe.find((x) => x.feld === feld);
      if (k) { kaufAenderung(); plan.kaeufe = plan.kaeufe.filter((x) => x !== k); zeichne(); return; }
      const z0 = planVon(team, plan).grid[feld];
      if (z0) zeigeKarte(z0.id, z0.w);
      return;
    }
    kaufAenderung();
    plan.kaeufe = plan.kaeufe.filter((x) => x.feld !== feld && x.id !== handAuswahl);
    if (plan.kaeufe.length >= CFG.maxKauf) { hinweis = `Du kannst höchstens ${CFG.maxKauf} Karten pro Runde kaufen.`; zeichne(); return; }
    plan.kaeufe.push({ id: handAuswahl, feld });
    const r = planVon(team, plan);
    if (r.fehler.length) { plan.kaeufe.pop(); hinweis = "Dafür reicht dein Geld nicht. Verkaufe vorher Handkarten, um mehr Münzen zu haben."; }
    handAuswahl = null;
    zeichne(); return;
  }
  if (a === "plan-reset") { plan = { kaeufe: [], verkauf: [], ausbau: null }; handAuswahl = null; tauschModus = false; tauschErste = null; verkaufModus = false; hinweis = ""; zeichne(); return; }
  if (a === "transfer-ok") {
    tauschModus = false;
    const zuViel = planVon(team, plan).zuViel;
    if (zuViel) {
      verkaufModus = true; handAuswahl = null;
      hinweis = `Du darfst höchstens ${CFG.maxBehalten} Karten behalten. Tippe noch ${zuViel} Karte${zuViel === 1 ? "" : "n"} an, um sie zu verkaufen.`;
      zeichne(); return;
    }
    sende({ plan: { kaeufe: plan.kaeufe, verkauf: plan.verkauf || [], tausch: plan.tausch || null } }); return;
  }
}

function zeigeSpiel(i) {
  const sp = z?.spieltag;
  if (!sp?.spiele?.[i]) return;
  const s = heimZuerst(sp.spiele[i]);
  document.querySelector(".kl-overlay")?.remove();
  const ov = document.createElement("div");
  ov.className = "kl kl-overlay kl-overlay-scroll";
  ov.innerHTML = `<div class="kl-sp-panel">
    <div class="kl-spiel-kopf"><div>${teamName(s.a)}</div><div class="kl-ergebnis">${s.ta} : ${s.tb}</div><div class="r">${teamName(s.b)}</div></div>
    <div class="kl-bd kl-statisch">${buehneHtml(sp, s, true)}</div>
    <button type="button" class="btn-primaer" style="margin-top:10px">Schließen</button></div>`;
  const zu = () => { ov.remove(); document.body.style.overflow = ""; };
  ov.addEventListener("click", (e) => { if (e.target === ov || e.target.closest("button.btn-primaer")) zu(); });
  document.body.style.overflow = "hidden";
  document.body.appendChild(ov);
}

function zeigeKarte(id, wert) {
  document.querySelector(".kl-overlay")?.remove();
  const k = karte(id);
  if (!k) return;
  const ov = document.createElement("div");
  ov.className = "kl kl-overlay";
  const extra = k.start ? "Startspieler: ohne Position, Nation und Verein."
    : `${escapeHtml(k.nation)} · ${escapeHtml(VEREIN_NAME[k.verein] || "")} · ${POS_NAME[k.pos]}${wert && wert !== k.staerke ? ` · aktuell Stärke ${wert}` : ""}`;
  ov.innerHTML = `<div>${karteHtml(id, { wert: wert || undefined })}<p class="kl-ov-info">${extra}<br><small>Tippen zum Schließen</small></p></div>`;
  ov.addEventListener("click", () => ov.remove());
  document.body.appendChild(ov);
}

// ---- Zeichnen -------------------------------------------------------------------------------
function zeichne() {
  if (!el.wurzel || !$("kl-setup")) return;
  $("kl-setup").hidden = !(status === "setup" || !status);
  $("kl-spiel").hidden = status !== "laeuft";
  $("kl-ende").hidden = status !== "ende";
  if (status === "setup" || !status) { zeichneSetup(); return; }
  if (!z) return;
  if (status === "ende") { zeichneEnde(); return; }
  const html = kopfHtml() + phaseHtml() + tabsHtml();
  if (html === letztesHtml) return;
  letztesHtml = html;
  const scrollY = window.scrollY;
  const hand = $("kl-hand-scroll")?.scrollLeft || 0;
  $("kl-spiel").innerHTML = html;
  const h2 = $("kl-hand-scroll"); if (h2) h2.scrollLeft = hand;
  if (Math.abs(window.scrollY - scrollY) > 2) window.scrollTo(0, scrollY);
}

function naechsterSpieltag() {
  const ab = z.phase === "spieltag" ? z.runde + 1 : z.runde;
  return Object.keys(CFG.spieltage).map(Number).find((r) => r >= ab) ?? null;
}

function kopfHtml() {
  const team = z.teams[ich()];
  const phasen = {
    draft: [`Draft · Wahl ${z.pick + 1} von ${CFG.picks}`, "Nimm eine Karte, der Rest geht weiter"],
    transfer: ["Transfers", `Bis zu ${CFG.maxKauf} Spieler kaufen, höchstens ${CFG.maxBehalten} Karten behalten`],
    arena: ["Arena-Ausbau", "Tribüne oder Hexenkessel ausbauen oder sparen"],
    spieltag: [`${z.spieltag?.nr}. Spieltag`, z.spieltag?.art === "reihe" ? "Reihen-Duelle" : "Flügel-Duelle"]
  };
  const [titel, unter] = phasen[z.phase] || ["", ""];
  const zeit = z.zeitlimit && mitZeit(z.phase);
  return `<div class="kl-kopf"><div class="kl-phase"><b>Runde ${z.runde} · ${titel}</b><span>${unter}</span></div>
    ${team ? `<span class="kl-geld"><span class="kl-muenze">€</span>${geldAnzeige(team)}</span>` : ""}</div>
    ${zeit ? `<div class="kl-zeit"><i id="kl-zeitfuell"></i></div>` : ""}`;
}

// Münz-Symbol mit Zahl (wie auf den Karten)
const muenze = (n, gross = "") => `<span class="kl-muenze-zahl ${gross}">${n}</span>`;

// Aktuellen Transferplan (Käufe + Tausch) für ein Team durchrechnen
const planVon = (team, p) => planRechnen(team, team.hand, { kaeufe: p?.kaeufe || [], verkauf: p?.verkauf || [], tausch: p?.tausch || null, ausbau: null }, z.runde);

// Geld oben rechts: zieht geplante Käufe bzw. den gewählten Ausbau sofort ab
function geldAnzeige(team) {
  const gesendet = meineAktion();
  if (z.phase === "transfer") return planVon(team, gesendet?.plan || plan).geld;
  if (z.phase === "arena") {
    const wahl = gesendet ? gesendet.ausbau : arenaWahl;
    const kosten = wahl ? ausbauKosten(team, wahl) : 0;
    return team.geld - (kosten || 0);
  }
  return team.geld;
}

function werIstFertig() {
  const anwesend = new Set(spielerListe.map((s) => s.id));
  const menschen = z.reihenfolge.filter((id) => !istBot(id) && anwesend.has(id));
  return `<div class="kl-wer">${menschen.map((id) => `<span class="${aktionen[aktionsKey(id, z.phase)] ? "ok" : ""}">${aktionen[aktionsKey(id, z.phase)] ? "✓ " : ""}${escapeHtml(teamInfo(id).name)}</span>`).join("")}</div>`;
}

function phaseHtml() {
  if (z.phase === "draft") return draftHtml();
  if (z.phase === "transfer") return transferHtml();
  if (z.phase === "arena") return arenaHtml();
  if (z.phase === "spieltag") return spieltagHtml();
  return "";
}

// ---- Draft ----------------------------------------------------------------------------------
function draftHtml() {
  if (!istDabei()) return `<div class="kl-box"><p class="kl-muted">Die Teams draften gerade …</p>${werIstFertig()}</div>`;
  const hand = z.draftHaende[ich()] || [];
  const meine = z.teams[ich()].hand || [];
  const gesendet = meineAktion();
  const ein = z.pick === 0 ? z.einnahmen?.[ich()] : null;
  const karten = hand.map((id) => {
    const gew = (gesendet?.karte || draftAuswahl) === id;
    return `<button type="button" data-a="draft-wahl" data-v="${id}" class="${gew ? "gewaehlt" : ""}">${karteHtml(id)}</button>`;
  }).join("");
  return `<div class="kl-box">
    ${ein ? `<p class="kl-muted" style="margin:0 0 8px">Einnahmen dieser Runde: +${ein.summe} (${ein.posten.map((p) => `${escapeHtml(p.n)} ${p.w}`).join(", ")})</p>` : ""}
    <h3>Wähle eine Karte</h3>
    <div class="kl-hand" id="kl-hand-scroll">${karten}</div>
    ${gesendet ? `<p class="kl-muted">Gewählt. Warte auf die anderen …</p>${werIstFertig()}`
      : `<button type="button" class="btn-primaer" data-a="draft-ok" ${draftAuswahl ? "" : "disabled"}>${draftAuswahl ? `${escapeHtml(karte(draftAuswahl).name)} nehmen` : "Tippe eine Karte an"}</button>`}
    ${meine.length ? `<div class="kl-schon"><span class="kl-muted">Schon auf der Hand:</span><div class="kl-schon-karten">${meine.map((id) => `<button type="button" data-a="zoom" data-v="${id}">${karteHtml(id, { mini: true })}</button>`).join("")}</div></div>` : ""}
  </div>`;
}

// ---- Transfers ------------------------------------------------------------------------------
function transferHtml() {
  if (!istDabei()) return `<div class="kl-box"><p class="kl-muted">Die Teams machen ihre Transfers …</p>${werIstFertig()}</div>`;
  const team = z.teams[ich()];
  const gesendet = meineAktion();
  const aktPlan = gesendet?.plan || plan;
  const r = planVon(team, aktPlan);
  const darfTauschen = tauschErlaubt(z.runde);
  const tw = r.tausch;
  const zielFeld = (f) => (tw ? (f === tw.a ? tw.b : f === tw.b ? tw.a : f) : f);
  const verkauftIds = r.handVerkauf || [];
  const handKarten = team.hand.map((id) => {
    const geplant = aktPlan.kaeufe.find((k) => k.id === id);
    const weg = verkauftIds.includes(id);
    const teuer = !weg && karte(id).kosten > r.geld + (geplant ? karte(id).kosten : 0);
    const kl = [handAuswahl === id ? "gewaehlt" : "", geplant ? "platziert" : "", weg ? "verkauft" : "", !geplant && teuer ? "teuer" : "",
      verkaufModus && !geplant && !weg ? "waehlbar" : ""].join(" ");
    return `<button type="button" data-a="hand" data-v="${id}" class="${kl}">${karteHtml(id, weg ? { verkauf: CFG.verkaufHand } : {})}</button>`;
  }).join("");
  const verkaufZeilen = r.verkauft.map((v) => `<span>${escapeHtml(karte(v.id).name)} verkauft</span><span>+${v.erloes}</span>`).join("");
  const kaufZeilen = r.gekauft.map((g) => `<span>${escapeHtml(karte(g.id).name)} gekauft</span><span>−${g.kosten}</span>`).join("")
    + (tw ? `<span>Tausch ${escapeHtml(karte(r.grid[tw.b].id).name.split(" ").pop())} ⇄ ${escapeHtml(karte(r.grid[tw.a].id).name.split(" ").pop())}</span><span>−${tw.kosten}</span>` : "");
  const anleitung = gesendet ? "Abgeschickt. Warte auf die anderen …"
    : tauschModus ? (tauschErste == null ? "Tausch: Tippe auf den ersten Spieler." : "Tausch: Tippe jetzt auf den zweiten Spieler.")
    : verkaufModus ? "Tippe die Karten an, die du verkaufen willst."
    : handAuswahl ? "Tippe auf ein Feld im Raster, um den Spieler zu kaufen (ein belegtes Feld wird überbaut) – oder verkaufe die Karte."
    : `Tippe auf eine Handkarte: kaufen und aufs Feld legen oder für ${CFG.verkaufHand} Münze verkaufen. Bis zu ${CFG.maxBehalten} Karten darfst du für die nächste Runde behalten.`;
  return `<div class="kl-box">
    <h3>Deine Handkarten</h3>
    <div class="kl-hand" id="kl-hand-scroll">${handKarten}</div>
    <p class="kl-hand-info">${anleitung}</p>
    ${!gesendet && handAuswahl && !verkauftIds.includes(handAuswahl) ? `<div class="kl-zeile" style="margin:0 0 10px">
      <button type="button" class="kl-btn sek" style="flex:1" data-a="verkaufen">${escapeHtml(karte(handAuswahl).name)} verkaufen (+${CFG.verkaufHand} ${muenze(CFG.verkaufHand)})</button></div>` : ""}
    ${rasterHtml(r.grid, { ziel: !gesendet && (Boolean(handAuswahl) || tauschModus), neu: r.gekauft.map((g) => zielFeld(g.feld)), klickbar: !gesendet,
      markiert: tauschModus && tauschErste != null ? [tauschErste] : tw ? [tw.a, tw.b] : [] })}
    ${darfTauschen ? `<div class="kl-tausch">
      ${muenze(CFG.tauschKosten, "gross")}<div><b>Kartentausch vor dem Spieltag</b><span>Zwei beliebige Spieler im Raster tauschen die Plätze.</span></div>
      ${gesendet ? "" : tw ? `<button type="button" class="kl-btn sek" data-a="tausch-weg">Aufheben</button>`
        : `<button type="button" class="kl-btn ${tauschModus ? "" : "sek"}" data-a="tausch-modus">${tauschModus ? "Abbrechen" : "Tauschen"}</button>`}
    </div>` : ""}
    <div class="kl-box" style="margin:12px 0 0;background:var(--kl-flaeche2)">
      <div class="kl-rechnung">
        <span>Geld jetzt</span><span>${team.geld}</span>
        ${verkauftIds.length ? `<span>${verkauftIds.length} Handkarte${verkauftIds.length === 1 ? "" : "n"} verkauft</span><span>+${r.handErloes}</span>` : ""}
        ${kaufZeilen}${verkaufZeilen}
        <span class="sum">Danach</span><span class="sum">${r.geld}</span>
        <span>Behältst du für die nächste Runde</span><span style="${r.zuViel ? "color:#ff6b6b;font-weight:800" : ""}">${r.rest.length} / ${CFG.maxBehalten} Karten</span>
      </div>
    </div>
    <p class="kl-muted" style="margin:8px 0 0">Wenn alle fertig sind, kommt der Arena-Ausbau.</p>
    ${hinweis ? `<p class="fehler-text">${escapeHtml(hinweis)}</p>` : ""}
    ${gesendet ? werIstFertig() : `<div class="kl-zeile" style="margin-top:12px">
      <button type="button" class="kl-btn sek" data-a="plan-reset">Zurücksetzen</button>
      <button type="button" class="btn-primaer" style="flex:1;margin:0" data-a="transfer-ok">Fertig</button></div>`}
  </div>`;
}

// ---- Arena-Ausbau ---------------------------------------------------------------------------
function arenaHtml() {
  if (!istDabei()) return `<div class="kl-box"><p class="kl-muted">Die Teams bauen ihre Arenen aus …</p>${werIstFertig()}</div>`;
  const team = z.teams[ich()];
  const gesendet = meineAktion();
  const wahl = gesendet ? gesendet.ausbau : arenaWahl;
  const tr = z.transfers?.[ich()];
  const zusammen = tr ? [
    ...tr.gekauft.map((g) => `${escapeHtml(karte(g.id).name)} gekauft (−${g.kosten})`),
    ...tr.verkauft.map((v) => `${escapeHtml(karte(v.id).name)} verkauft (+${v.erloes})`),
    tr.tausch ? `Tausch (−${tr.tausch.kosten})` : "",
    tr.handErloes ? `${tr.handVerkauf?.length || 0} Handkarte${tr.handVerkauf?.length === 1 ? "" : "n"} verkauft (+${tr.handErloes})` : "",
    tr.behalten?.length ? `${tr.behalten.length} behalten` : ""
  ].filter(Boolean).join(" · ") : "";
  const kosten = wahl ? ausbauKosten(team, wahl) : 0;
  const knopf = wahl ? `${wahl === "T" ? "Tribüne" : "Hexenkessel"} ausbauen (−${kosten})` : "Ohne Ausbau weiter";
  return `<div class="kl-box">
    ${zusammen ? `<p class="kl-muted" style="margin:0 0 8px">Deine Transfers: ${zusammen}</p>` : ""}
    ${arenaPanel(team, { auswahl: !gesendet, plan: { ausbau: wahl }, r: { geld: team.geld, ausbau: wahl ? { pfad: wahl } : null } })}
    ${gesendet ? `<p class="kl-muted">${wahl ? "Ausbau gewählt." : "Kein Ausbau."} Warte auf die anderen …</p>${werIstFertig()}`
      : `<button type="button" class="btn-primaer" style="margin-top:12px" data-a="arena-ok">${knopf}</button>`}
  </div>`;
}

function arenaPanel(team, { auswahl = false, plan: p = null, r = null } = {}) {
  const fi = z.farben?.[ich()] ?? 0;
  const pfad = (key, titel, stufe, texte) => {
    const max = key === "T" ? CFG.trib.kosten.length : CFG.hex.kosten.length;
    const kosten = ausbauKosten(team, key);
    const gewaehlt = p?.ausbau === key;
    const leistbar = kosten != null && (gewaehlt || (r && kosten <= r.geld));
    const stufen = Array.from({ length: max }, (_, i) => `<i class="${i < stufe + (gewaehlt ? 1 : 0) ? "an" : ""}"></i>`).join("");
    const naechste = stufe < max ? texte[stufe] : "Voll ausgebaut";
    const inhalt = `<b>${titel}</b><span class="stufen">${stufen}</span><span class="kl-muted">${stufe < max ? `Stufe ${stufe + 1}: ${naechste} · ${kosten} €` : naechste}</span>`;
    if (!auswahl) return `<div class="kl-pfad">${inhalt}</div>`;
    return `<button type="button" class="kl-pfad ${gewaehlt ? "gewaehlt" : ""}" data-a="ausbau" data-v="${key}" ${leistbar ? "" : "disabled"}>${inhalt}</button>`;
  };
  const t = team.trib + (p?.ausbau === "T" && r?.ausbau ? 1 : 0);
  const h = team.hex + (p?.ausbau === "H" && r?.ausbau ? 1 : 0);
  return `<div style="margin-top:12px"><h3>Arena</h3><div class="kl-arena">${arenaSvg(fi, t, h)}</div>
    <div class="kl-pfade">
      ${pfad("T", "Tribüne", team.trib, ["+1 Münze pro Runde", "+3 Münzen pro Runde"])}
      ${pfad("H", "Hexenkessel", team.hex, ["+1 in allen Heimduellen", "+2 in allen Heimduellen"])}
    </div>${auswahl ? `<p class="kl-muted" style="margin:6px 0 0">Tippe einen Pfad an. Höchstens ein Ausbau pro Runde.</p>` : ""}</div>`;
}

// ---- Raster ---------------------------------------------------------------------------------
function rasterHtml(grid, { ziel = false, neu = [], klickbar = false, markiert = [] } = {}) {
  const { werte, details } = feldWerte(grid);
  // Boni/Abzüge pro Karte (Verein, Nation, Kapitän, Position) direkt auf der Karte zeigen
  const boni = (i) => (details[i] || []).length ? `<div class="kl-boni">${details[i].map(([n, w]) =>
    `<span class="${w > 0 ? "plus" : "minus"}">${escapeHtml(n)} ${w > 0 ? "+" : "−"}${Math.abs(w)}</span>`).join("")}</div>` : "";
  const art = CFG.spieltage[naechsterSpieltag()] || "reihe";
  const reihen = LINIEN.reihe.map((L) => L.reduce((s, i) => s + werte[i], 0));
  const spalten = LINIEN.spalte.map((L) => L.reduce((s, i) => s + werte[i], 0));
  const wuerfel = (L) => ["kleiner_wuerfel", "grosser_wuerfel"].filter((b) => L.some((i) => grid[i] && karte(grid[i].id)?.bonus === b));
  const zellen = grid.map((zz, i) => {
    const inhalt = zz ? karteHtml(zz.id, { mini: true, wert: zz.w, neu: neu.includes(i) }) + boni(i) : "";
    const kl = ["kl-zelle", ziel ? "ziel" : "", zz ? "belegt" : "", markiert.includes(i) ? "markiert" : ""].join(" ");
    const aktion = klickbar ? `data-a="feld" data-v="${i}"` : (zz ? `data-a="zoom" data-v="${zz.id}" data-w="${zz.w}"` : "");
    return `<button type="button" class="${kl}" ${aktion}>${inhalt}</button>`;
  }).join("");
  const summe = (w, label, aktiv, wf) => `<div class="kl-summe ${aktiv ? "aktiv" : ""}"><div>${w}${wf.length ? `<small class="kl-summe-wf">+${wf.map((b) => wuerfelIcon(b)).join("")}</small>` : ""}<small>${label}</small></div></div>`;
  return `<div class="kl-raster-wrap">
    <div class="kl-reihen-label">${REIHEN_POS.map((p) => `<span style="background:${POS_FARBE[p]}">${p}</span>`).join("")}</div>
    <div class="kl-raster">${zellen}</div>
    <div class="kl-summe-r">${reihen.map((w, i) => summe(w, LINIEN_NAME.reihe[i].slice(0, 3), art === "reihe", wuerfel(LINIEN.reihe[i]))).join("")}</div>
    <div></div>
    <div class="kl-summe-s">${spalten.map((w, i) => summe(w, LINIEN_NAME.spalte[i], art === "spalte", wuerfel(LINIEN.spalte[i]))).join("")}</div>
    <div></div>
  </div>
  <div class="kl-raster-info"><span>${naechsterSpieltag() ? `Nächster Spieltag nach Runde ${naechsterSpieltag()}: ${art === "reihe" ? "Reihen-Duelle" : "Flügel-Duelle"}` : "Alle Spieltage gespielt"}</span></div>`;
}

// ---- Spieltag -------------------------------------------------------------------------------
// Spiel so drehen, dass die Heimmannschaft links steht (Duelle dann wieder Sturm/Links zuerst)
function heimZuerst(s) {
  if (s.heim === s.a) return s;
  return {
    a: s.b, b: s.a, heim: s.heim, ta: s.tb, tb: s.ta, heimBonus: s.heimBonus, wuerfeA: s.wuerfeB, wuerfeB: s.wuerfeA,
    duelle: s.duelle.map((d) => ({ la: d.lb, lb: d.la, sa: d.sb, sb: d.sa, ta: d.tb, tb: d.ta })).sort((x, y) => x.la - y.la)
  };
}
// Duell-Bühne: Karten jeder Linie mit Wappen, Würfeln und Summen.
// statisch = ohne Animation (für die Spielansicht nach dem Spieltag)
function buehneHtml(sp, s, statisch = false) {
  const art = sp.art;
  const T = animT(), D = T.duell;
  const ms = (x) => `--d:${x}ms;animation-delay:${x}ms`;
  const daten = (id, wuerfe) => {
    const grid = sp.raster?.[id] || z.teams[id].grid;
    const { werte } = feldWerte(grid);
    const wurf = {}, typ = {};
    (wuerfe || []).forEach((w) => { wurf[w.feld] = w.wurf; typ[w.feld] = karte(grid[w.feld]?.id)?.bonus; });
    return { grid, werte, wurf, typ };
  };
  const A = daten(s.a, s.wuerfeA), B = daten(s.b, s.wuerfeB);
  // Würfel rollt (wechselnde Augen) und bleibt mit der echten Zahl liegen
  const wurfHtml = (typ, w, start) => {
    const [lo, hi] = typ === "grosser_wuerfel" ? [2, 4] : [1, 3];
    const schritt = Math.round((T.wurfDauer - 250) / 5);
    const flacker = [0, 1, 2, 3, 4].map((j) => wuerfelFlaeche(typ, lo + ((w + j) % (hi - lo + 1)), "zw", `--z:${start + 100 + j * schritt}ms;--zd:${schritt}ms`)).join("");
    return `<div class="kl-wurf" style="--d:${start}ms;--wd:${T.wurfDauer}ms"><div class="kl-wurf-roll">${flacker}${wuerfelFlaeche(typ, w, "fin", `--f:${start + T.wurfDauer - 180}ms`)}</div>
      <b style="${ms(start + T.wurfDauer)}">+${w}</b></div>`;
  };
  // Karten erscheinen paarweise (Karte 1 bei beiden Teams, dann 2, dann 3), Würfel rollen, dann die Summe
  const karteAb = (t0, k) => t0 + T.karteAb + k * T.karteSchritt;
  const kartenListe = (S, L, t0) => LINIEN[art][L].map((f, k) => {
    const c = S.grid[f], ab = karteAb(t0, k);
    const inhalt = c ? `${karteHtml(c.id, { mini: true, wert: c.w })}${S.wurf[f] ? wurfHtml(S.typ[f], S.wurf[f], ab + T.wurfAb) : ""}<div class="kl-bd-wert">${S.werte[f]}</div>`
      : `<div class="kl-sp-leer">leer</div><div class="kl-bd-wert">0</div>`;
    return `<div class="kl-bd-karte" style="${ms(ab)}">${inhalt}</div>`;
  }).join("");
  const summeHtml = (S, L, heim, gesamt, t0, seiteKl) => {
    const felder = LINIEN[art][L];
    const basis = felder.reduce((x, f) => x + S.werte[f], 0);
    const wuerfe = felder.reduce((x, f) => x + (S.wurf[f] || 0), 0);
    const extra = [wuerfe ? `🎲+${wuerfe}` : "", heim ? `🏟️+${heim}` : ""].filter(Boolean).join(" ");
    const ab = t0 + T.summeAb;
    return `<div class="kl-bd-summe ${seiteKl}"><b class="basis kl-live-auf" style="${ms(karteAb(t0, 2) + 200)};--e:${ab}ms">${basis}</b><b class="end" style="${ms(ab)}">${gesamt}</b>${extra ? `<small class="kl-live-auf" style="${ms(ab)}">${extra}</small>` : ""}</div>`;
  };
  const wappenKlein = (id) => `<div class="kl-bd-wappen">${teamWappen(z.farben?.[id] ?? 0, 40)}</div>`;
  const toreHtml = (d, t0) => `<div class="kl-bd-tore kl-live-auf" style="${ms(t0 + T.toreAb)}">${"⚽".repeat(d.ta) || "–"}<span>:</span>${"⚽".repeat(d.tb) || "–"}</div>`;
  const buehne = s.duelle.map((d, i) => {
    const t0 = T.intro + i * D;
    const ha = s.heim === s.a && s.heimBonus ? s.heimBonus : 0, hb = s.heim === s.b && s.heimBonus ? s.heimBonus : 0;
    const raus = i < 2 ? `--e:${t0 + D}ms` : "--e:999s";
    const sieg = d.sa > d.sb ? "sieg-a" : d.sb > d.sa ? "sieg-b" : "";
    const titel = `<div class="kl-sp-titel">${LINIEN_NAME[art][d.la]} gegen ${LINIEN_NAME[art][d.lb]}</div>`;
    if (art === "reihe") {
      // Reihen-Spieltag: Wappen vor der Kartenreihe, beide Reihen untereinander
      return `<div class="kl-bd-duell ${sieg}" style="--d:${t0}ms;${raus}">${titel}
        <div class="kl-bd-reihe a">${wappenKlein(s.a)}<div class="kl-bd-karten">${kartenListe(A, d.la, t0)}</div>${summeHtml(A, d.la, ha, d.sa, t0, "a")}</div>
        ${toreHtml(d, t0)}
        <div class="kl-bd-reihe b">${wappenKlein(s.b)}<div class="kl-bd-karten">${kartenListe(B, d.lb, t0)}</div>${summeHtml(B, d.lb, hb, d.sb, t0, "b")}</div>
      </div>`;
    }
    // Flügel-Spieltag: Spalten senkrecht wie auf dem Feld (Sturm oben, Abwehr unten), Heimteam links
    return `<div class="kl-bd-duell ${sieg}" style="--d:${t0}ms;${raus}">${titel}
      <div class="kl-bd-spalten">
        <div class="kl-bd-spalte a">${wappenKlein(s.a)}${kartenListe(A, d.la, t0)}${summeHtml(A, d.la, ha, d.sa, t0, "a")}</div>
        <div class="kl-bd-mitte"><span class="kl-bd-gegen">gegen</span>${toreHtml(d, t0)}</div>
        <div class="kl-bd-spalte b">${wappenKlein(s.b)}${kartenListe(B, d.lb, t0)}${summeHtml(B, d.lb, hb, d.sb, t0, "b")}</div>
      </div>
    </div>`;
  }).join("");
  return buehne;
}

function liveHtml(sp, st) {
  const art = sp.art;
  const runde = sp.spiele.filter((x) => x.sr === st.k);
  const mein = runde.find((x) => x.a === ich() || x.b === ich());
  const haupt = mein || runde[0];
  const s = heimZuerst(haupt);
  const T = animT(), D = T.duell;
  const ergebnisAb = T.intro + 3 * D;
  const ms = (x) => `--d:${x}ms;animation-delay:${x}ms`;
  const seite = (id) => `<div class="kl-live-team">${teamWappen(z.farben?.[id] ?? 0, 84)}<b>${escapeHtml(teamInfo(id).name)}${istBot(id) ? " 🤖" : ""}</b></div>`;
  const buehne = buehneHtml(sp, s);
  const kurz = s.duelle.map((d, i) => `<div class="kl-live-duell ${d.sa > d.sb ? "sieg-a" : d.sb > d.sa ? "sieg-b" : ""}" style="${ms(T.intro + i * D + T.toreAb + 300)}">
      <div class="l"><span>${LINIEN_NAME[art][d.la]}</span><b>${d.sa}</b></div>
      <div class="mitte">${"⚽".repeat(d.ta) || "–"}<span>:</span>${"⚽".repeat(d.tb) || "–"}</div>
      <div class="r"><span>${LINIEN_NAME[art][d.lb]}</span><b>${d.sb}</b></div>
    </div>`).join("");
  const neben = runde.filter((x) => x !== haupt).map((o) => { const n = heimZuerst(o); return `<div class="kl-live-neben">${teamName(n.a)}<b class="kl-live-auf" style="${ms(ergebnisAb)}">${n.ta} : ${n.tb}</b>${teamName(n.b)}</div>`; }).join("");
  const spielfrei = istDabei() && !mein ? `<p class="kl-live-frei">Du hast in dieser Runde spielfrei und schaust zu.</p>` : "";
  const fazit = mein ? (() => { const ichA = s.a === ich(); const eig = ichA ? s.ta : s.tb, geg = ichA ? s.tb : s.ta;
    return eig > geg ? "Sieg! +3 Punkte" : eig === geg ? "Unentschieden · +1 Punkt" : "Niederlage"; })() : "";
  return `<div class="kl-box kl-live" data-k="${st.key}">
    <div class="kl-live-kopf"><span>${sp.nr}. Spieltag · ${art === "reihe" ? "Reihen-Duelle" : "Flügel-Duelle"}</span><b>Spiel ${st.k + 1} von ${st.n}</b></div>
    ${spielfrei}
    <div class="kl-live-paar">
      ${seite(s.a)}
      <div class="kl-live-mitte"><div class="kl-live-vs" style="--d:${ergebnisAb}ms">VS</div><div class="kl-live-ergebnis" style="${ms(ergebnisAb)}">${s.ta} : ${s.tb}</div></div>
      ${seite(s.b)}
    </div>
    ${fazit ? `<div class="kl-live-fazit kl-live-auf" style="${ms(ergebnisAb + 300)}">${fazit}</div>` : ""}
    <div class="kl-bd">${buehne}</div>
    <div class="kl-live-duelle">${kurz}</div>
    ${neben ? `<div class="kl-live-nebenbox"><span class="kl-muted">Gleichzeitig</span>${neben}</div>` : ""}
    <div class="kl-live-balken"><i style="animation-duration:${spielMs()}ms"></i></div>
    <div class="kl-tempo"><span>Tempo</span>${[1, 2, 3].map((x) => `<button type="button" class="${x === tempo() ? "an" : ""}" ${api.istLeiter ? `data-a="tempo" data-v="${x}"` : "disabled"}>x${x}</button>`).join("")}</div>
    ${api.istLeiter ? `<div class="kl-zeile" style="margin-top:12px">
      <button type="button" class="kl-btn sek" style="flex:1" data-a="anim-weiter">${st.k + 1 < st.n ? "Nächstes Spiel" : "Zu den Ergebnissen"}</button>
      ${st.k + 1 < st.n ? `<button type="button" class="kl-btn sek" style="flex:1" data-a="anim-alle">Alle überspringen</button>` : ""}</div>`
      : `<p class="kl-muted" style="margin:10px 0 0;text-align:center">Der Spielleiter kann die Spiele überspringen.</p>`}
  </div>`;
}

function spieltagHtml() {
  const sp = z.spieltag;
  if (!sp) return "";
  const st = animStand();
  if (st) return liveHtml(sp, st);
  if (sp.anim) animiert.add(sp.nr);
  const art = sp.art;
  const meine = sp.spiele.filter((s) => s.a === ich() || s.b === ich());
  const andere = sp.spiele.filter((s) => !(s.a === ich() || s.b === ich()));
  const erstes = !animiert.has(sp.nr);
  if (erstes) setTimeout(() => animiert.add(sp.nr), 50);
  let delay = 0;
  const wuerfelSumme = (liste, L) => (liste || []).filter((w) => LINIEN[art][L].includes(w.feld)).reduce((s, w) => s + w.wurf, 0);
  const spielBox = (orig) => {
    const idx = sp.spiele.indexOf(orig);
    const s = heimZuerst(orig);
    const duelle = s.duelle.map((d) => {
      const wa = wuerfelSumme(s.wuerfeA, d.la), wb = wuerfelSumme(s.wuerfeB, d.lb);
      const style = erstes ? `style="animation-delay:${(delay += 0.35).toFixed(2)}s"` : `style="animation:none"`;
      const ha = s.heim === s.a && s.heimBonus ? s.heimBonus : 0, hb = s.heim === s.b && s.heimBonus ? s.heimBonus : 0;
      return `<div class="kl-duell ${d.sa > d.sb ? "sieg-a" : d.sb > d.sa ? "sieg-b" : ""}" ${style}>
        <div class="l"><b>${LINIEN_NAME[art][d.la]} ${d.sa}</b><div class="w">${wa ? `🎲+${wa} ` : ""}${ha ? `🏟️+${ha}` : ""}</div></div>
        <div class="mitte"><span class="tore">${"⚽".repeat(d.ta) || "–"} : ${"⚽".repeat(d.tb) || "–"}</span></div>
        <div class="r"><b>${d.sb} ${LINIEN_NAME[art][d.lb]}</b><div class="w">${wb ? `🎲+${wb} ` : ""}${hb ? `🏟️+${hb}` : ""}</div></div>
      </div>`;
    }).join("");
    return `<div class="kl-spiel" data-a="spiel" data-v="${idx}" role="button">${orig.sr != null && sp.runden > 1 ? `<div class="kl-spiel-nr">Spiel ${orig.sr + 1}</div>` : ""}<div class="kl-spiel-kopf">
      <div>${teamName(s.a)}</div>
      <div class="kl-ergebnis">${s.ta} : ${s.tb}</div>
      <div class="r">${teamName(s.b)}</div></div>${duelle}</div>`;
  };
  const entw = (sp.entwicklung || []).map((e) => {
    const k = karte(e.karte);
    const txt = { durchbruch: `Durchbruch! ${e.alt} → ${e.neu}`, talent: `${e.alt} → ${e.neu}`, veteran: `${e.alt} → ${e.neu}`, erfahrung: `hält Stärke ${e.alt}` }[e.art];
    return `<div class="kl-entw">${bonusSymbol(k.bonus)}<span><b>${escapeHtml(k.name)}</b> (${escapeHtml(teamInfo(e.team).name)}): ${txt}</span></div>`;
  }).join("");
  const gewinn = {};
  sp.spiele.forEach((s) => {
    gewinn[s.a] = (gewinn[s.a] || 0) + (s.ta > s.tb ? 3 : s.ta === s.tb ? 1 : 0);
    gewinn[s.b] = (gewinn[s.b] || 0) + (s.tb > s.ta ? 3 : s.ta === s.tb ? 1 : 0);
  });
  const naechste = z.runde >= CFG.runden ? "Zum Endstand" : `Weiter zu Runde ${z.runde + 1}`;
  return `<div class="kl-box">
    <h3>${sp.nr}. Spieltag · ${art === "reihe" ? "Reihen-Duelle" : "Flügel-Duelle"}</h3>
    <p class="kl-muted" style="margin:0 0 10px">Die Heimmannschaft steht jeweils links. Tippe auf ein Spiel, um die Spielerkarten der Duelle zu sehen. ${art === "reihe" ? "Sturm gegen Abwehr, Mittelfeld gegen Mittelfeld." : "Links gegen Rechts, Mitte gegen Mitte."} Differenz 1–3 = 1 Tor, 4–6 = 2 Tore, ab 7 = 3 Tore.</p>
    ${(meine.length ? meine : sp.spiele).map(spielBox).join("")}
    ${meine.length && andere.length ? `<h3 style="margin-top:12px">Weitere Spiele</h3>${andere.map((o) => { const s = heimZuerst(o); return `<div class="kl-zeile kl-weitere" data-a="spiel" data-v="${sp.spiele.indexOf(o)}" style="justify-content:space-between;padding:4px 0">${teamName(s.a)}<b>${s.ta} : ${s.tb}</b>${teamName(s.b)}</div>`; }).join("")}` : ""}
    <h3 style="margin-top:14px">Tabelle</h3>${tabelleHtml(sp.tabelle, gewinn)}
    ${entw ? `<h3 style="margin-top:14px">Entwicklung</h3>${entw}` : ""}
    <div style="margin-top:14px">${api.istLeiter ? `<button type="button" class="btn-primaer" data-a="weiter">${naechste}</button>` : `<p class="kl-muted">Der Spielleiter geht gleich weiter …</p>`}</div>
  </div>`;
}

function tabelleHtml(tab, gewinn = null, klickbar = false) {
  return `<table class="kl-tab"><thead><tr><th>#</th><th>Team</th><th class="z">S-U-N</th><th class="z">Tore</th><th class="z">Pkt</th></tr></thead><tbody>
    ${tab.map((e) => `<tr class="${e.id === ich() ? "ich" : ""} ${klickbar ? "klickbar" : ""}" ${klickbar ? `data-a="liga-team" data-v="${e.id}"` : ""}>
      <td>${e.rang}.</td><td>${teamName(e.id)}</td><td class="z">${e.s}-${e.u}-${e.n}</td><td class="z">${e.tore}:${e.gegentore}</td>
      <td class="z"><b>${e.punkte}</b>${gewinn && gewinn[e.id] ? `<span class="kl-plus">+${gewinn[e.id]}</span>` : ""}</td></tr>`).join("")}
  </tbody></table>`;
}

// ---- Tabs: Mein Team / Liga / Regeln ---------------------------------------------------------
function tabsHtml() {
  const tabs = [["team", "Mein Team"], ["liga", "Liga"], ["regeln", "Regeln"]].filter(([k]) => k !== "team" || istDabei());
  if (!tabs.some(([k]) => k === tab)) tab = tabs[0][0];
  let inhalt = "";
  if (tab === "team") {
    const team = z.teams[ich()];
    const zeigeRaster = z.phase !== "transfer";
    const behalten = z.phase !== "transfer" && z.phase !== "draft" && team.hand?.length
      ? `<div class="kl-schon" style="margin-top:12px"><span class="kl-muted">Behaltene Handkarten für die nächste Runde:</span><div class="kl-schon-karten">${team.hand.map((id) => `<button type="button" data-a="zoom" data-v="${id}">${karteHtml(id, { mini: true })}</button>`).join("")}</div></div>` : "";
    inhalt = `<div class="kl-box">${zeigeRaster ? `<h3>Dein Team</h3>${rasterHtml(team.grid)}${behalten}` : `<p class="kl-muted" style="margin:0 0 6px">Dein Raster siehst du oben bei den Transfers.</p>`}
      ${z.phase !== "arena" ? arenaPanel(team) : ""}</div>`;
  } else if (tab === "liga") {
    const tab0 = animStand() && z.spieltag?.tabelleVorher ? z.spieltag.tabelleVorher : tabelle(z.teams, z.reihenfolge);
    let detail = "";
    if (ligaSicht && z.teams[ligaSicht]) {
      const t = z.teams[ligaSicht];
      detail = `<div style="margin-top:12px"><h3>${teamName(ligaSicht)}</h3>
        <p class="kl-muted" style="margin:0 0 8px">Geld ${t.geld} · Tribüne ${t.trib} · Hexenkessel ${t.hex}</p>
        ${rasterHtml(t.grid)}<div class="kl-arena" style="margin-top:10px">${arenaSvg(z.farben?.[ligaSicht] ?? 0, t.trib, t.hex)}</div></div>`;
    }
    inhalt = `<div class="kl-box"><h3>Tabelle</h3><p class="kl-muted" style="margin:0 0 6px">Tippe auf ein Team, um sein Raster und seine Arena zu sehen.</p>
      ${tabelleHtml(tab0, null, true)}${detail}</div>`;
  } else {
    inhalt = `<div class="kl-box">${regelnHtml()}</div>`;
  }
  return `<div class="kl-tabs">${tabs.map(([k, t]) => `<button type="button" data-a="tab" data-v="${k}" class="${tab === k ? "an" : ""}">${t}</button>`).join("")}</div>${inhalt}`;
}

function regelnHtml() {
  const liste = (punkte, nummeriert = false) => `<${nummeriert ? "ol" : "ul"} class="kl-regeln">${punkte.map(([t, x]) => `<li><b>${t}</b><span>${x}</span></li>`).join("")}</${nummeriert ? "ol" : "ul"}>`;
  return `<h3>So läuft eine Runde</h3>
  ${liste([
    ["Einnahmen", `${CFG.einkommen} Münzen, dazu Tribüne, Fanlieblinge und die Aufholhilfe für den Tabellenletzten (+${CFG.aufhol} pro Runde bis zum nächsten Spieltag).`],
    ["Draft", `Jeder bekommt ${CFG.handGroesse} Karten, nimmt eine und gibt den Rest weiter, bis jeder ${CFG.picks} Karten hat.`],
    ["Transfers", `Bis zu ${CFG.maxKauf} Spieler kaufen und ins Raster legen. Ein belegtes Feld wird überbaut, der alte Spieler bringt die halben Kosten.`],
    ["Handkarten", `Jede Handkarte kannst du für ${CFG.verkaufHand} Münze verkaufen – das Geld kannst du sofort für Käufe nutzen. Bis zu ${CFG.maxBehalten} Karten darfst du für die nächste Runde behalten (also höchstens ${CFG.maxBehalten + CFG.picks} Karten auf der Hand). Wer mehr behalten will, muss vor dem Abschließen verkaufen; läuft die Zeit ab, werden die billigsten automatisch verkauft.`],
    ["Kartentausch", `Nur in den Runden direkt vor einem Spieltag (2, 4, 6, 8): Für ${CFG.tauschKosten} Münzen dürfen zwei beliebige Spieler im Raster die Plätze tauschen, einmal pro Runde.`],
    ["Arena-Ausbau", "Wenn alle ihre Transfers gemacht haben, darf jeder Tribüne oder Hexenkessel um eine Stufe ausbauen oder das Geld sparen."],
    ["Spieltag", "Nach Runde 2, 4, 6 und 8 spielt jeder gegen jeden."],
    ["Deckwechsel", `Ab Runde ${CFG.deckWechselRunde} kommen nur noch die starken Spieler aus Deck 2.`]
  ], true)}
  <h3>Spieltag</h3>
  ${liste([
    ["Gegner", "Jeder spielt gegen jeden, abwechselnd Heim und Auswärts."],
    ["Spieltag 1 und 3", "Sturm gegen Abwehr, Mittelfeld gegen Mittelfeld, Abwehr gegen Sturm."],
    ["Spieltag 2 und 4", "Links gegen Rechts, Mitte gegen Mitte, Rechts gegen Links."],
    ["Tore", "Differenz 1–3 gibt 1 Tor, 4–6 gibt 2 Tore, ab 7 gibt es 3 Tore."],
    ["Punkte", "Sieg 3, Unentschieden 1, Niederlage 0."]
  ])}
  <h3>Stärke</h3>
  ${liste([
    ["Falsche Position", `Ein Spieler außerhalb seiner Reihe bekommt −${CFG.posMalus}.`],
    ["Nation", "Drei Spieler gleicher Nation in einer Reihe oder Spalte: je +1."],
    ["Verein", "+1 für jeden Vereinskollegen direkt daneben (links, rechts, oben, unten)."],
    ["Startspieler", "Haben keine Position und zählen überall voll."]
  ])}
  <h3>Fähigkeiten</h3>
  ${Object.keys(BONUS_NAME).map((b) => `<div class="kl-entw">${bonusSymbol(b)}<span><b>${BONUS_NAME[b]}:</b> ${BONUS_TEXT[b]}${b === "talent"
    ? ". <b>Durchbruch</b> heißt: Die Linie, in der das Talent steht, hat an diesem Spieltag mehr als die Hälfte ihrer Duelle gewonnen. Bei Reihen-Spieltagen zählt seine Reihe, bei Flügel-Spieltagen seine Spalte."
    : b === "veteran" ? ". Gemeint sind die Spiele an diesem Spieltag." : ""}</span></div>`).join("")}
  <h3 style="margin-top:10px">Arena</h3>
  ${liste([
    ["Tribüne", `Stufe 1 für ${CFG.trib.kosten[0]} Münzen: +${CFG.trib.einnahmen[0]} pro Runde. Stufe 2 für ${CFG.trib.kosten[1]}: +${CFG.trib.einnahmen[1]} pro Runde.`],
    ["Hexenkessel", `Stufe 1 für ${CFG.hex.kosten[0]} Münzen: +${CFG.hex.heim[0]} in allen Heimduellen. Stufe 2 für ${CFG.hex.kosten[1]}: +${CFG.hex.heim[1]}.`]
  ])}`;
}

// ---- Ende ------------------------------------------------------------------------------------
function zeichneEnde() {
  const tab = z.endTabelle || tabelle(z.teams, z.reihenfolge);
  const meister = tab.filter((e) => e.rang === 1);
  const n = tab.length;
  $("kl-ende").innerHTML = `<h2>Saison beendet</h2>
    <p class="hinweis-text">🏆 Meister: ${meister.map((e) => teamName(e.id)).join(" und ")}</p>
    ${tabelleHtml(tab)}
    <div class="kl-arena" style="margin-top:12px">${arenaSvg(z.farben?.[meister[0].id] ?? 0, z.teams[meister[0].id].trib, z.teams[meister[0].id].hex)}</div>
    <h3 style="margin-top:14px">Punkte für die Gesamtwertung</h3>
    <ul>${tab.filter((e) => !istBot(e.id)).map((e) => {
      const s = spielerListe.find((x) => x.id === e.id);
      return `<li>${spielerKarte(s?.name || teamInfo(e.id).name, s?.farbe, s?.icon, `+${punkteFuerRang(e.rang, n)}`, { extra: `${e.rang}. Platz · ${e.punkte} Punkte` })}</li>`;
    }).join("")}</ul>
    ${api.istLeiter ? "" : `<p><em>Der Spielleiter wählt gleich das nächste Spiel …</em></p>`}
    ${api.istLeiter && api.olympiadeAnzahl ? `<p><button class="btn-primaer" type="button" data-a="gesamt">Gesamtwertung</button></p>` : ""}`;
}
