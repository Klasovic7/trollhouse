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
  planRechnen, ausbauKosten, tabelle, mischen, botTransferPlan
} from "./logik.js";
import { istBot, spielAnlegen, draftAnwenden, draftBotPicks, transferAnwenden, nachSpieltag } from "./ablauf.js";
import {
  STIL, karteHtml, teamWappen, arenaSvg, farbIndex, FARBEN_LISTE, bonusSymbol, VEREIN_NAME
} from "./design.js";

const DRAFT_MS = 30000;
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
let plan = { kaeufe: [], ausbau: null };
let handAuswahl = null;
let tab = "team";
let ligaSicht = null;
let hinweis = "";
let animiert = new Set();
let sendet = false;

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
  leiterBusy = false; letzterSchritt = ""; schrittKey = ""; draftAuswahl = null; plan = { kaeufe: [], ausbau: null };
  handAuswahl = null; tab = "team"; ligaSicht = null; hinweis = ""; animiert = new Set(); sendet = false;
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
    draftAuswahl = null; handAuswahl = null; plan = { kaeufe: [], ausbau: null }; hinweis = ""; sendet = false;
  }
  if (status === "laeuft" && z) {
    const phasen = { draft: "Draft", transfer: "Transfers", spieltag: "Spieltag" };
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
  if (balken && z.zeitlimit && (z.phase === "draft" || z.phase === "transfer")) {
    const dauer = z.phase === "draft" ? DRAFT_MS : TRANSFER_MS;
    balken.style.width = Math.max(0, 1 - (Date.now() - z.phaseStart) / dauer) * 100 + "%";
  }
  leiterPruefen();
}

async function leiterPruefen() {
  if (!api?.istLeiter || status !== "laeuft" || !z || leiterBusy) return;
  if (z.phase !== "draft" && z.phase !== "transfer") return;
  const schritt = `${z.runde}_${z.phase}_${z.pick}`;
  if (letzterSchritt === schritt) return;
  const anwesend = new Set(spielerListe.map((s) => s.id));
  const menschen = z.reihenfolge.filter((id) => !istBot(id) && anwesend.has(id));
  const fertig = menschen.filter((id) => aktionen[aktionsKey(id, z.phase)]);
  const dauer = z.phase === "draft" ? DRAFT_MS : TRANSFER_MS;
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
    } else {
      const plaene = {};
      z.reihenfolge.filter((id) => !istBot(id)).forEach((id) => {
        const a = aktionen[aktionsKey(id, "transfer")];
        // Wer nichts geschickt hat (Zeit abgelaufen oder Raum verlassen), bekommt die Automatik
        plaene[id] = a?.plan || botTransferPlan(neu.teams[id], neu.teams[id].hand, neu.runde, { k: 0.5, lust: 0.8 });
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
  if (a === "zeit" && api.istLeiter) { updateDoc(api.raumRef(), { "klOpt.zeitlimit": v === "true" }); return; }
  if (a === "tab") { tab = v; ligaSicht = null; zeichne(); return; }
  if (a === "liga-team") { ligaSicht = ligaSicht === v ? null : v; zeichne(); return; }
  if (a === "zoom") { zeigeKarte(v, Number(t.dataset.w || 0)); return; }
  if (a === "weiter") { weiterNachSpieltag(); return; }
  if (a === "gesamt") { api.zeigeGesamtwertung(); return; }
  if (!z || !istDabei() || meineAktion() || sendet) return;
  if (a === "draft-wahl" && z.phase === "draft") { draftAuswahl = v; zeichne(); return; }
  if (a === "draft-ok" && z.phase === "draft" && draftAuswahl) { sende({ karte: draftAuswahl }); return; }
  if (z.phase !== "transfer") return;
  const team = z.teams[ich()];
  if (a === "hand") {
    const geplant = plan.kaeufe.findIndex((k) => k.id === v);
    if (geplant >= 0) { plan.kaeufe.splice(geplant, 1); handAuswahl = v; hinweis = ""; }
    else handAuswahl = handAuswahl === v ? null : v;
    zeichne(); return;
  }
  if (a === "feld") {
    const feld = Number(v);
    if (!handAuswahl) {
      const k = plan.kaeufe.find((x) => x.feld === feld);
      if (k) { plan.kaeufe = plan.kaeufe.filter((x) => x !== k); hinweis = ""; zeichne(); return; }
      const z0 = team.grid[feld];
      if (z0) zeigeKarte(z0.id, z0.w);
      return;
    }
    plan.kaeufe = plan.kaeufe.filter((x) => x.feld !== feld && x.id !== handAuswahl);
    if (plan.kaeufe.length >= CFG.maxKauf) { hinweis = `Du kannst höchstens ${CFG.maxKauf} Karten pro Runde kaufen.`; zeichne(); return; }
    plan.kaeufe.push({ id: handAuswahl, feld });
    const r = planRechnen(team, team.hand, plan);
    if (r.fehler.length) { plan.kaeufe.pop(); hinweis = "Dafür reicht dein Geld nicht."; }
    else hinweis = "";
    handAuswahl = null;
    zeichne(); return;
  }
  if (a === "ausbau") { plan.ausbau = plan.ausbau === v ? null : v; const r = planRechnen(team, team.hand, plan); if (!r.ausbau && plan.ausbau) { plan.ausbau = null; hinweis = "Dafür reicht dein Geld nicht."; } else hinweis = ""; zeichne(); return; }
  if (a === "plan-reset") { plan = { kaeufe: [], ausbau: null }; handAuswahl = null; hinweis = ""; zeichne(); return; }
  if (a === "transfer-ok") { sende({ plan: { kaeufe: plan.kaeufe, ausbau: plan.ausbau } }); return; }
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
  const scrollY = window.scrollY;
  const hand = $("kl-hand-scroll")?.scrollLeft || 0;
  $("kl-spiel").innerHTML = kopfHtml() + phaseHtml() + tabsHtml();
  const h2 = $("kl-hand-scroll"); if (h2) h2.scrollLeft = hand;
  window.scrollTo(0, scrollY);
}

function naechsterSpieltag() {
  const ab = z.phase === "spieltag" ? z.runde + 1 : z.runde;
  return Object.keys(CFG.spieltage).map(Number).find((r) => r >= ab) ?? null;
}

function kopfHtml() {
  const team = z.teams[ich()];
  const phasen = {
    draft: [`Draft · Wahl ${z.pick + 1} von ${CFG.picks}`, "Nimm eine Karte, der Rest geht weiter"],
    transfer: ["Transfers", `Bis zu ${CFG.maxKauf} Spieler kaufen, Rest wird verkauft`],
    spieltag: [`${z.spieltag?.nr}. Spieltag`, z.spieltag?.art === "reihe" ? "Reihen-Duelle" : "Flügel-Duelle"]
  };
  const [titel, unter] = phasen[z.phase] || ["", ""];
  const zeit = z.zeitlimit && (z.phase === "draft" || z.phase === "transfer");
  return `<div class="kl-kopf"><div class="kl-phase"><b>Runde ${z.runde} · ${titel}</b><span>${unter}</span></div>
    ${team ? `<span class="kl-geld"><span class="kl-muenze">€</span>${team.geld}</span>` : ""}</div>
    ${zeit ? `<div class="kl-zeit"><i id="kl-zeitfuell"></i></div>` : ""}`;
}

function werIstFertig() {
  const anwesend = new Set(spielerListe.map((s) => s.id));
  const menschen = z.reihenfolge.filter((id) => !istBot(id) && anwesend.has(id));
  return `<div class="kl-wer">${menschen.map((id) => `<span class="${aktionen[aktionsKey(id, z.phase)] ? "ok" : ""}">${aktionen[aktionsKey(id, z.phase)] ? "✓ " : ""}${escapeHtml(teamInfo(id).name)}</span>`).join("")}</div>`;
}

function phaseHtml() {
  if (z.phase === "draft") return draftHtml();
  if (z.phase === "transfer") return transferHtml();
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
  const r = planRechnen(team, team.hand, aktPlan);
  const handKarten = team.hand.map((id) => {
    const geplant = aktPlan.kaeufe.find((k) => k.id === id);
    const teuer = karte(id).kosten > r.geld + (geplant ? karte(id).kosten : 0);
    const kl = [handAuswahl === id ? "gewaehlt" : "", geplant ? "platziert" : "", !geplant && teuer ? "teuer" : ""].join(" ");
    return `<button type="button" data-a="hand" data-v="${id}" class="${kl}">${karteHtml(id)}</button>`;
  }).join("");
  const verkaufZeilen = r.verkauft.map((v) => `<span>${escapeHtml(karte(v.id).name)} verkauft</span><span>+${v.erloes}</span>`).join("");
  const kaufZeilen = r.gekauft.map((g) => `<span>${escapeHtml(karte(g.id).name)} gekauft</span><span>−${g.kosten}</span>`).join("");
  const anleitung = gesendet ? "Abgeschickt. Warte auf die anderen …"
    : handAuswahl ? "Tippe jetzt auf ein Feld in deinem Raster. Ein belegtes Feld wird überbaut, der alte Spieler verkauft."
    : "Tippe auf eine Handkarte und dann auf ein Feld. Nochmal antippen nimmt den Kauf zurück.";
  return `<div class="kl-box">
    <h3>Deine Handkarten</h3>
    <div class="kl-hand" id="kl-hand-scroll">${handKarten}</div>
    <p class="kl-hand-info">${anleitung}</p>
    ${rasterHtml(r.grid, { ziel: !gesendet && Boolean(handAuswahl), neu: r.gekauft.map((g) => g.feld), klickbar: !gesendet })}
    <div class="kl-box" style="margin:12px 0 0;background:var(--kl-flaeche2)">
      <div class="kl-rechnung">
        <span>Geld jetzt</span><span>${team.geld}</span>
        ${kaufZeilen}${verkaufZeilen}
        ${r.ausbau ? `<span>Ausbau ${r.ausbau.pfad === "T" ? "Tribüne" : "Hexenkessel"}</span><span>−${r.ausbau.kosten}</span>` : ""}
        <span>${r.rest.length} Handkarte${r.rest.length === 1 ? "" : "n"} verkaufen</span><span>+${r.handErloes}</span>
        <span class="sum">Danach</span><span class="sum">${r.geldNachVerkauf}</span>
      </div>
    </div>
    ${arenaPanel(team, { auswahl: !gesendet, plan: aktPlan, r })}
    ${hinweis ? `<p class="fehler-text">${escapeHtml(hinweis)}</p>` : ""}
    ${gesendet ? werIstFertig() : `<div class="kl-zeile" style="margin-top:12px">
      <button type="button" class="kl-btn sek" data-a="plan-reset">Zurücksetzen</button>
      <button type="button" class="btn-primaer" style="flex:1;margin:0" data-a="transfer-ok">Fertig</button></div>`}
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
    </div>${auswahl ? `<p class="kl-muted" style="margin:6px 0 0">Höchstens ein Ausbau pro Runde.</p>` : ""}</div>`;
}

// ---- Raster ---------------------------------------------------------------------------------
function rasterHtml(grid, { ziel = false, neu = [], klickbar = false } = {}) {
  const { werte } = feldWerte(grid);
  const art = CFG.spieltage[naechsterSpieltag()] || "reihe";
  const reihen = LINIEN.reihe.map((L) => L.reduce((s, i) => s + werte[i], 0));
  const spalten = LINIEN.spalte.map((L) => L.reduce((s, i) => s + werte[i], 0));
  const wuerfel = (L) => L.some((i) => grid[i] && ["kleiner_wuerfel", "grosser_wuerfel"].includes(karte(grid[i].id)?.bonus));
  const zellen = grid.map((zz, i) => {
    const inhalt = zz ? karteHtml(zz.id, { mini: true, wert: zz.w, neu: neu.includes(i) }) : "";
    const kl = ["kl-zelle", ziel ? "ziel" : "", zz ? "belegt" : ""].join(" ");
    const aktion = klickbar ? `data-a="feld" data-v="${i}"` : (zz ? `data-a="zoom" data-v="${zz.id}" data-w="${zz.w}"` : "");
    return `<button type="button" class="${kl}" ${aktion}>${inhalt}</button>`;
  }).join("");
  const summe = (w, label, aktiv, wf) => `<div class="kl-summe ${aktiv ? "aktiv" : ""}"><div>${w}${wf ? "<small>+🎲</small>" : ""}<small>${label}</small></div></div>`;
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
function spieltagHtml() {
  const sp = z.spieltag;
  if (!sp) return "";
  const art = sp.art;
  const meine = sp.spiele.filter((s) => s.a === ich() || s.b === ich());
  const andere = sp.spiele.filter((s) => !(s.a === ich() || s.b === ich()));
  const erstes = !animiert.has(sp.nr);
  if (erstes) setTimeout(() => animiert.add(sp.nr), 50);
  let delay = 0;
  const wuerfelSumme = (liste, L) => (liste || []).filter((w) => LINIEN[art][L].includes(w.feld)).reduce((s, w) => s + w.wurf, 0);
  const spielBox = (s) => {
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
    return `<div class="kl-spiel"><div class="kl-spiel-kopf">
      <div>${teamName(s.a)}${s.heim === s.a ? `<span class="kl-heim">Heimspiel</span>` : ""}</div>
      <div class="kl-ergebnis">${s.ta} : ${s.tb}</div>
      <div class="r">${teamName(s.b)}${s.heim === s.b ? `<span class="kl-heim">Heimspiel</span>` : ""}</div></div>${duelle}</div>`;
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
    <p class="kl-muted" style="margin:0 0 10px">${art === "reihe" ? "Sturm gegen Abwehr, Mittelfeld gegen Mittelfeld." : "Links gegen Rechts, Mitte gegen Mitte."} Differenz 1–3 = 1 Tor, 4–6 = 2 Tore, ab 7 = 3 Tore.</p>
    ${(meine.length ? meine : sp.spiele).map(spielBox).join("")}
    ${meine.length && andere.length ? `<h3 style="margin-top:12px">Weitere Spiele</h3>${andere.map((s) => `<div class="kl-zeile" style="justify-content:space-between;padding:4px 0">${teamName(s.a)}<b>${s.ta} : ${s.tb}</b>${teamName(s.b)}</div>`).join("")}` : ""}
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
    inhalt = `<div class="kl-box">${zeigeRaster ? `<h3>Dein Team</h3>${rasterHtml(team.grid)}` : ""}
      ${z.phase !== "transfer" ? arenaPanel(team) : ""}
      ${z.phase === "transfer" ? `<p class="kl-muted" style="margin:0">Dein Raster und deine Arena siehst du oben bei den Transfers.</p>` : ""}</div>`;
  } else if (tab === "liga") {
    const tab0 = tabelle(z.teams, z.reihenfolge);
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
    ["Transfers", `Bis zu ${CFG.maxKauf} Spieler kaufen und ins Raster legen. Ein belegtes Feld wird überbaut, der alte Spieler bringt die halben Kosten. Nicht gekaufte Handkarten bringen je ${CFG.verkaufHand} Münze.`],
    ["Arena-Ausbau", "Pro Runde darfst du zusätzlich Tribüne oder Hexenkessel um eine Stufe ausbauen."],
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
    ["Verein", "Ein Vereinskollege direkt daneben: +1."],
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
