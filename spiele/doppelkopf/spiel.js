// ============================================================================
//  Doppelkopf
// ----------------------------------------------------------------------------
//  4 Spieler (bei 5 Spielern setzt der Geber jeweils eine Partie aus). Mit weniger
//  als vier Mitspielern werden Bots dazugesetzt (gesteuert vom Spielleiter-Gerät).
//  Regeln: siehe regeln.js (Turnierregeln: Re/Kontra, Hochzeit, Solos, Fuchs,
//  Karlchen, Doppelkopf, Ansagen). Gespielt wird eine feste Anzahl Partien, die
//  Spielpunkte werden addiert; die Platzierung geht als Rangpunkte in die App-
//  Wertung.
//
//  Raumfelder beginnen mit "dk": dkStatus (setup | vorbehalt | spielen |
//  ergebnis | beendet), dkAnzahl, dkPartie, dkGeber, dkAlle, dkSpieler,
//  dkVorbehalt, dkPhaseStart, dkSpielart, dkArt, dkSolist, dkRe, dkReBekannt,
//  dkKlaerung, dkStich, dkStichZeit, dkStiche, dkAmZug, dkZugStart,
//  dkAnsagen, dkErgebnis, dkPunkte, dkRang, dkOpt (Regeloptionen), dkSau, dkSuper.
//  Die Hände liegen getrennt in der Subcollection "dkHaende" (ein Dokument je
//  Spieler). Hinweis: Wer die Datenbank mit Entwicklerwerkzeugen öffnet, kann
//  fremde Hände und Teams sehen - die Oberfläche zeigt sie nicht an.
// ============================================================================
import {
  doc, updateDoc, setDoc, deleteDoc, collection, getDocs, onSnapshot, writeBatch
} from "../../kern/firebase.js";
import { spielerKarte, zeigeDebug, initBereitSystem, escapeHtml, avatarHtml } from "../../kern/ui.js";
import { speichereWertung } from "../../kern/wertung.js";
import * as R from "./regeln.js";
import { kartenSvg } from "./karten.js";

const VORBEHALT_ZEIT_MS = 45000;
const ZUG_ZEIT_MS = 90000;
const STICH_PAUSE_MS = 1700;
const BOT_ZEIT_MS = 800;
const BOT_INFO = {
  bot1: { name: "Bot Karl", farbe: "#94a3b8", icon: "🤖" },
  bot2: { name: "Bot Frieda", farbe: "#f472b6", icon: "🤖" },
  bot3: { name: "Bot Otto", farbe: "#fb923c", icon: "🤖" }
};
const BOT_IDS = Object.keys(BOT_INFO);
const isBot = (id) => typeof id === "string" && id.startsWith("bot");
const OPT_DEF = { dulle: false, sau: 0, solo: true, fuchs: true, karlchen: true, doppelkopf: true };
const OPT_ZEILEN = [
  { k: "dulle", titel: "Zweite Dulle sticht die erste", werte: [[false, "Nein"], [true, "Ja"]] },
  { k: "sau", titel: "Schweinchen", werte: [[0, "Aus"], [1, "Sau"], [2, "Sau + Super-Sau"]] },
  { k: "solo", titel: "Solos erlaubt", werte: [[true, "Ja"], [false, "Nein"]] },
  { k: "fuchs", titel: "Fuchs fangen zählt", werte: [[true, "Ja"], [false, "Nein"]] },
  { k: "karlchen", titel: "Karlchen zählt", werte: [[true, "Ja"], [false, "Nein"]] },
  { k: "doppelkopf", titel: "Doppelkopf (40+ Augen) zählt", werte: [[true, "Ja"], [false, "Nein"]] }
];

const VORLAGE = `
  <div id="dk-setup" class="bildschirm-karte" hidden>
    <h1>Doppelkopf</h1>
    <p class="hinweis-text">Klassisches Doppelkopf nach Turnierregeln mit Re/Kontra, Hochzeit, Solos, Fuchs,
      Karlchen, Doppelkopf und Ansagen. Gespielt wird zu viert; sind fünf Leute dabei, setzt der Geber
      jeweils eine Partie aus; fehlen Mitspieler, spielen Bots mit. Nach der festgelegten Anzahl Partien gewinnt, wer die meisten Spielpunkte hat.</p>
    <div class="gv-modus-zeile">
      <span>Anzahl Partien</span>
      <span class="gv-modus-gruppe" id="dk-opt-anzahl"></span>
    </div>
    <div id="dk-opts"></div>
    <p class="hinweis-text" id="dk-opt-regeln"></p>
    <p class="hinweis-text" id="dk-opt-hinweis"></p>
    <p class="hinweis-text dk-bot-hinweis" id="dk-bot-hinweis"></p>
    <p id="dk-setup-fehler" class="fehler-text"></p>
    <p><button id="dk-starten" class="btn-primaer" hidden>Spiel starten</button></p>
    <p id="dk-setup-warten" hidden><em>Warte, bis der Spielleiter das Spiel startet …</em></p>
    <div id="dk-bereit-bereich" class="bereit-bereich" hidden></div>
  </div>

  <div id="dk-vorbehalt-screen" class="bildschirm-karte dk-bildschirm" hidden>
    <p class="dk-label" id="dk-vb-label"></p>
    <h2 id="dk-vb-titel">Was spielst du?</h2>
    <div id="dk-timer-vb" class="gv-timer" aria-hidden="true"><i></i></div>
    <div id="dk-vb-hand" class="dk-hand dk-hand-vb"></div>
    <div id="dk-vb-wahl" class="dk-vb-wahl"></div>
    <p id="dk-vb-info" class="hinweis-text"></p>
    <div id="dk-vb-status" class="warten-block"></div>
  </div>

  <div id="dk-spiel-screen" class="bildschirm-karte dk-bildschirm" hidden>
    <div class="dk-kopf"><span id="dk-kopf-links"></span><span id="dk-kopf-team"></span></div>
    <div id="dk-ansagen" class="dk-ansagen"></div>
    <div id="dk-tisch" class="dk-tisch"></div>
    <div id="dk-timer-zug" class="gv-timer" aria-hidden="true"><i></i></div>
    <p id="dk-zeile" class="dk-zeile"></p>
    <div id="dk-letzter" class="dk-letzter" hidden></div>
    <div class="dk-aktionen">
      <button type="button" id="dk-btn-ansage" class="btn-sekundaer" hidden></button>
      <button type="button" id="dk-btn-letzter" class="btn-sekundaer">Letzter Stich</button>
      <button type="button" id="dk-btn-spielen" class="btn-primaer" disabled>Karte spielen</button>
    </div>
    <div id="dk-hand" class="dk-hand"></div>
  </div>

  <div id="dk-ergebnis-screen" class="bildschirm-karte" hidden>
    <p class="dk-label" id="dk-erg-label"></p>
    <h2 id="dk-erg-titel"></h2>
    <p id="dk-erg-augen" class="dk-erg-augen"></p>
    <ul id="dk-erg-details" class="dk-erg-details"></ul>
    <h3>Punkte dieser Partie</h3>
    <ul id="dk-erg-liste"></ul>
    <p id="dk-erg-warten" class="hinweis-text" hidden><em>Der Spielleiter geht gleich weiter …</em></p>
    <p><button id="dk-weiter" class="btn-primaer" hidden>Weiter</button></p>
  </div>

  <div id="dk-endstand-screen" class="bildschirm-karte" hidden>
    <h1>Endstand</h1>
    <p id="dk-sieger" class="kn-verlierer"></p>
    <ul id="dk-endstand-liste"></ul>
    <p id="dk-endstand-warten" hidden><em>Der Spielleiter wählt gleich das nächste Spiel …</em></p>
    <p><button id="dk-gesamtwertung-btn" class="btn-primaer" type="button" hidden>Gesamtwertung</button></p>
  </div>
`;

let api = null;
let el = {};
let spielerListe = [];
let haende = [];
let haendeUnsub = null;
let tickId = null;

let status = null;
let anzahl = 8;
let partie = 0;
let geber = null;
let alle = [];
let sp = [];                 // die vier Mitspielenden in Zugreihenfolge ab Vorhand
let vorbehalt = {};
let phaseStart = 0;
let spielart = "normal";
let art = "normal";
let solist = null;
let re = [];
let reBekannt = false;
let klaerung = 0;
let stich = [];
let stichZeit = 0;
let stiche = [];
let amZug = null;
let zugStart = 0;
let ansagen = { re: 0, kontra: 0 };
let ergebnis = null;
let punkteSumme = {};
let rang = null;
let opt = { ...OPT_DEF };
let sau = null;               // Id des Schweinchen-Halters (beide Karo-Asse) oder null
let superSau = null;          // Id des Halters beider Karo-Könige oder null

let gewaehlt = null;          // lokal angetippte Karte
let zeigeLetzten = false;
let leiterBusy = false;
let schreibt = false;
let bereitSystem = null;
let olympiadeAutoStart = false;

const $ = (id) => el.wurzel.querySelector("#" + id);
const spielerVon = (id) => (isBot(id) ? BOT_INFO[id] : spielerListe.find((s) => s.id === id));
const name = (id) => spielerVon(id)?.name ?? "?";
const echte = (ids) => ids.filter((id) => !isBot(id));
const istSpieler = () => sp.includes(api.spielerId);
const handRef = (id) => doc(api.db, "raeume", api.code, "dkHaende", id);

function anzahlOptionen() {
  return spielerListe.length === 5 ? [5, 10, 15, 20] : [4, 8, 12, 16];
}
function gueltigeAnzahl() {
  const o = anzahlOptionen();
  return o.includes(anzahl) ? anzahl : o[1];
}

function handVon(id) {
  const h = haende.find((x) => x.spielerId === id && x.partie === partie);
  return h ? h.karten : null;
}
const meineKarten = () => handVon(api.spielerId) ?? [];
const aktuelleRegeln = () => R.regelnFuer(spielart || "normal", { sau: Boolean(sau), super: Boolean(superSau), zweiteDulle: opt.dulle });

// Sitz-Reihenfolge einer Partie: ab dem Spieler nach dem Geber; bei 5 setzt der Geber aus
export function sitzordnung(alleIds, geberIdx) {
  const n = alleIds.length;
  const l = [];
  for (let i = 1; i <= n; i++) l.push(alleIds[(geberIdx + i) % n]);
  return n === 5 ? l.slice(0, 4) : l;
}

// ---- Lebenszyklus ----------------------------------------------------------
export async function starten(uebergebeneApi) {
  api = uebergebeneApi;
  el.wurzel = api.wurzel;
  el.wurzel.innerHTML = VORLAGE;
  bereitSystem = initBereitSystem(api, "dk");
  olympiadeAutoStart = false;

  $("dk-starten").addEventListener("click", spielStarten);
  $("dk-weiter").addEventListener("click", weiter);
  $("dk-btn-spielen").addEventListener("click", () => { if (gewaehlt) karteSpielen(gewaehlt); });
  $("dk-btn-ansage").addEventListener("click", ansageMachen);
  $("dk-btn-letzter").addEventListener("click", () => { zeigeLetzten = !zeigeLetzten; zeigeLetztenStich(); });

  haendeUnsub = onSnapshot(collection(api.db, "raeume", api.code, "dkHaende"), (snap) => {
    haende = [];
    snap.forEach((d) => haende.push(d.data()));
    if (status === "spielen" || status === "vorbehalt") zeichne();
  });

  if (api.istLeiter && !api.raum?.dkStatus) {
    await updateDoc(api.raumRef(), {
      dkStatus: "setup", dkAnzahl: 8, dkPartie: 0, dkGeber: null, dkAlle: [], dkSpieler: [], dkVorbehalt: {},
      dkPhaseStart: 0, dkSpielart: "normal", dkArt: "normal", dkSolist: null, dkRe: [], dkReBekannt: false,
      dkKlaerung: 0, dkStich: [], dkStichZeit: 0, dkStiche: [], dkAmZug: null, dkZugStart: 0,
      dkAnsagen: { re: 0, kontra: 0 }, dkErgebnis: null, dkPunkte: {}, dkRang: null,
      dkOpt: { ...OPT_DEF }, dkSau: null, dkSuper: null
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
  status = null; anzahl = 8; partie = 0; geber = null; alle = []; sp = []; vorbehalt = {}; phaseStart = 0;
  spielart = "normal"; art = "normal"; solist = null; re = []; reBekannt = false; klaerung = 0;
  stich = []; stichZeit = 0; stiche = []; amZug = null; zugStart = 0; ansagen = { re: 0, kontra: 0 };
  ergebnis = null; punkteSumme = {}; rang = null; opt = { ...OPT_DEF }; sau = null; superSau = null;
  gewaehlt = null; zeigeLetzten = false; leiterBusy = false; schreibt = false;
}

export function spieler(liste) {
  spielerListe = liste;
  if (!el.wurzel) return;
  zeichne();
}

export function raumDaten(daten) {
  if (!daten || !el.wurzel) return;
  const altePartie = partie, alterStatus = status, alteStiche = stiche.length;
  status = daten.dkStatus ?? null;
  anzahl = daten.dkAnzahl ?? 8;
  partie = daten.dkPartie ?? 0;
  geber = daten.dkGeber ?? null;
  alle = daten.dkAlle ?? [];
  sp = daten.dkSpieler ?? [];
  vorbehalt = daten.dkVorbehalt ?? {};
  phaseStart = daten.dkPhaseStart ?? 0;
  spielart = daten.dkSpielart ?? "normal";
  art = daten.dkArt ?? "normal";
  solist = daten.dkSolist ?? null;
  re = daten.dkRe ?? [];
  reBekannt = Boolean(daten.dkReBekannt);
  klaerung = daten.dkKlaerung ?? 0;
  stich = daten.dkStich ?? [];
  stichZeit = daten.dkStichZeit ?? 0;
  stiche = daten.dkStiche ?? [];
  amZug = daten.dkAmZug ?? null;
  zugStart = daten.dkZugStart ?? 0;
  ansagen = daten.dkAnsagen ?? { re: 0, kontra: 0 };
  ergebnis = daten.dkErgebnis ?? null;
  punkteSumme = daten.dkPunkte ?? {};
  rang = daten.dkRang ?? null;
  opt = { ...OPT_DEF, ...(daten.dkOpt ?? {}) };
  sau = daten.dkSau ?? null;
  superSau = daten.dkSuper ?? null;
  if (partie !== altePartie || status !== alterStatus) { gewaehlt = null; zeigeLetzten = false; }
  if (stiche.length !== alteStiche) zeigeLetzten = false;
  schreibt = false;
  api.fortschritt(status === "vorbehalt" || status === "spielen" || status === "ergebnis" ? `Partie ${partie + 1}/${anzahl}` : "");
  zeichne();
}

function alleVerstecken() {
  ["dk-setup", "dk-vorbehalt-screen", "dk-spiel-screen", "dk-ergebnis-screen", "dk-endstand-screen"]
    .forEach((id) => { $(id).hidden = true; });
}

function zeichne() {
  if (!el.wurzel) return;
  alleVerstecken();
  if (status === "setup" || !status) {
    $("dk-setup").hidden = false;
    zeigeSetup();
  } else if (status === "vorbehalt") {
    $("dk-vorbehalt-screen").hidden = false;
    zeigeVorbehalt();
  } else if (status === "spielen") {
    $("dk-spiel-screen").hidden = false;
    zeigeSpiel();
  } else if (status === "ergebnis") {
    $("dk-ergebnis-screen").hidden = false;
    zeigeErgebnis();
  } else if (status === "beendet") {
    $("dk-endstand-screen").hidden = false;
    zeigeEndstand();
  }
}

// ---- Setup -----------------------------------------------------------------
function zeigeSetup() {
  const echteAnz = spielerListe.length;
  const opts = anzahlOptionen();
  const gruppe = $("dk-opt-anzahl");
  const aktiv = gueltigeAnzahl();
  gruppe.innerHTML = opts.map((n) => `<button type="button" class="gv-modus-btn${n === aktiv ? " aktiv" : ""}" data-n="${n}"${api.istLeiter ? "" : " disabled"}>${n}</button>`).join("");
  gruppe.querySelectorAll("[data-n]").forEach((b) => b.addEventListener("click", () => {
    if (!api.istLeiter) return;
    updateDoc(api.raumRef(), { dkAnzahl: Number(b.dataset.n) }).catch(() => {});
  }));
  const box = $("dk-opts");
  box.innerHTML = OPT_ZEILEN.map((z) => `<div class="gv-modus-zeile"><span>${z.titel}</span><span class="gv-modus-gruppe">` +
    z.werte.map(([v, t]) => `<button type="button" class="gv-modus-btn${opt[z.k] === v ? " aktiv" : ""}" data-ok="${z.k}" data-ov="${v}"${api.istLeiter ? "" : " disabled"}>${t}</button>`).join("") +
    `</span></div>`).join("");
  box.querySelectorAll("[data-ok]").forEach((b) => b.addEventListener("click", () => {
    if (!api.istLeiter) return;
    const z = OPT_ZEILEN.find((x) => x.k === b.dataset.ok);
    const wert = z.werte.find(([v]) => String(v) === b.dataset.ov)[0];
    updateDoc(api.raumRef(), { ["dkOpt." + z.k]: wert }).catch(() => {});
  }));
  const regeln = [];
  if (opt.sau >= 1) regeln.push("Schweinchen: Wer beide Karo-Asse hält, hat die Sau - sie sind dann die höchsten Trümpfe (noch über der Dulle). Gilt nur im Normalspiel; Füchse zählen dann nicht.");
  if (opt.sau >= 2) regeln.push("Super-Sau: Wer beide Karo-Könige hält, dessen Könige stechen sogar die Sau.");
  if (opt.dulle) regeln.push("Die zweite Herz-Zehn sticht die erste.");
  $("dk-opt-regeln").textContent = regeln.join(" ");
  const n = echteAnz;
  $("dk-opt-hinweis").textContent = n === 5
    ? "Fünf Spieler: Der Geber setzt jede Partie aus. Bei 5, 10, 15 oder 20 Partien setzt jeder gleich oft aus."
    : n === 4 ? "Vier Spieler: Alle spielen jede Partie, der Geber wechselt reihum."
      : n >= 1 ? "" : "Doppelkopf braucht mindestens einen Spieler.";
  const bots = n >= 1 && n < 4 ? 4 - n : 0;
  $("dk-bot-hinweis").textContent = bots
    ? `Ihr seid ${n === 1 ? "allein" : "zu " + n + "t"} im Raum: ${bots} Bot${bots > 1 ? "s" : ""} (${BOT_IDS.slice(0, bots).map((b) => BOT_INFO[b].name).join(", ")}) ${bots > 1 ? "spielen" : "spielt"} mit.`
    : "";
  $("dk-starten").hidden = !api.istLeiter;
  $("dk-setup-warten").hidden = api.istLeiter;
  bereitSystem?.render();
  if (api.istLeiter && api.olympiadeAnzahl && !olympiadeAutoStart && bereitSystem?.alleBereit() && n >= 1 && n <= 5) {
    olympiadeAutoStart = true;
    spielStarten();
  }
}

async function spielStarten() {
  $("dk-setup-fehler").textContent = "";
  const n = spielerListe.length;
  if (n < 1 || n > 5) {
    $("dk-setup-fehler").textContent = "Doppelkopf geht mit einem bis fünf Spielern (fehlende Plätze füllen Bots auf).";
    return;
  }
  $("dk-starten").disabled = true;
  try {
    const snap = await getDocs(collection(api.db, "raeume", api.code, "dkHaende"));
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
    haende = [];
    await Promise.all(spielerListe.map((s) => updateDoc(api.spielerRef(s.id), { punkte: 0 })));
    const ids = [...spielerListe.map((s) => s.id), ...BOT_IDS.slice(0, n < 4 ? 4 - n : 0)];
    const punkte = Object.fromEntries(ids.map((id) => [id, 0]));
    await partieAusteilen(0, ids, { dkAlle: ids, dkAnzahl: gueltigeAnzahl(), dkPunkte: punkte, dkRang: null });
  } catch (e) {
    zeigeDebug("Fehler beim Start: " + e.message);
  }
  $("dk-starten").disabled = false;
}

// Leiter: neue Partie geben und in die Vorbehalts-Phase wechseln
async function partieAusteilen(index, alleIds, extra = {}) {
  const geberIdx = index % alleIds.length;
  const reihe = sitzordnung(alleIds, geberIdx);
  const karten = R.mischen(R.kartenDeck());
  const batch = writeBatch(api.db);
  reihe.forEach((id, i) => {
    const k = karten.slice(i * 12, i * 12 + 12);
    batch.set(handRef(id), { spielerId: id, partie: index, karten: k, start: k });
  });
  batch.update(api.raumRef(), {
    ...extra,
    dkStatus: "vorbehalt", dkPartie: index, dkGeber: alleIds[geberIdx], dkSpieler: reihe, dkVorbehalt: {},
    dkPhaseStart: Date.now(), dkSpielart: "normal", dkArt: "normal", dkSolist: null, dkRe: [], dkReBekannt: false,
    dkKlaerung: 0, dkStich: [], dkStichZeit: 0, dkStiche: [], dkAmZug: null, dkZugStart: 0,
    dkAnsagen: { re: 0, kontra: 0 }, dkErgebnis: null, dkSau: null, dkSuper: null
  });
  await batch.commit();
}

export async function vorZurueck() {
  try {
    const snap = await getDocs(collection(api.db, "raeume", api.code, "dkHaende"));
    await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
    await updateDoc(api.raumRef(), {
      dkStatus: null, dkPartie: 0, dkGeber: null, dkAlle: [], dkSpieler: [], dkVorbehalt: {}, dkStich: [], dkStiche: [],
      dkAmZug: null, dkErgebnis: null, dkPunkte: {}, dkRang: null
    });
  } catch (e) { /* egal */ }
  await api.zurueckZurAuswahl();
}

// ---- Vorbehalt -------------------------------------------------------------
const SOLO_WAHL = [
  ["solo-C", "♣ Kreuz-Solo"], ["solo-S", "♠ Pik-Solo"], ["solo-H", "♥ Herz-Solo"], ["solo-D", "♦ Karo-Solo"],
  ["damen", "Damen-Solo"], ["buben", "Buben-Solo"], ["fleischlos", "Fleischlos"]
];

function zeigeVorbehalt() {
  $("dk-vb-label").textContent = `Partie ${partie + 1} von ${anzahl}`;
  const hand = meineKarten();
  const spielt = istSpieler();
  const mein = vorbehalt[api.spielerId];
  const handBox = $("dk-vb-hand");
  const wahl = $("dk-vb-wahl");
  if (!spielt) {
    $("dk-vb-titel").textContent = "Du setzt diese Partie aus";
    handBox.innerHTML = "";
    wahl.innerHTML = "";
    $("dk-vb-info").textContent = `${name(geber)} gibt und setzt aus. Die anderen entscheiden gerade, ob sie ein Solo spielen.`;
  } else {
    $("dk-vb-titel").textContent = "Was spielst du?";
    zeichneHand(handBox, R.sortiereHand(hand, R.regelnFuer("normal")), { nurAnzeige: true, reihen: 2 });
    const beide = R.hatBeideKreuzDamen(hand);
    if (mein) {
      wahl.innerHTML = "";
      $("dk-vb-info").textContent = "Deine Wahl ist abgegeben. Warte auf die anderen …";
    } else {
      let h = "";
      h += beide
        ? `<button type="button" class="btn-primaer" data-w="hochzeit">Hochzeit ansagen</button>`
        : `<button type="button" class="btn-primaer" data-w="gesund">Gesund (normal spielen)</button>`;
      if (opt.solo) h += `<div class="dk-solo-grid">` + SOLO_WAHL.map(([k, t]) => `<button type="button" class="btn-sekundaer" data-w="${k}">${t}</button>`).join("") + `</div>`;
      wahl.innerHTML = h;
      wahl.querySelectorAll("[data-w]").forEach((b) => b.addEventListener("click", () => {
        updateDoc(api.raumRef(), { ["dkVorbehalt." + api.spielerId]: b.dataset.w }).catch((e) => zeigeDebug(e.message));
      }));
      $("dk-vb-info").textContent = beide
        ? "Du hältst beide Kreuz-Damen: Sag eine Hochzeit an oder spiel ein Solo."
        : "Spielst du ein Solo, gelten deine Karten allein gegen die drei anderen (dreifache Punkte). Sonst: Gesund.";
    }
  }
  const offen = sp.filter((id) => !vorbehalt[id] && !isBot(id));
  const st = $("dk-vb-status");
  st.innerHTML = offen.length
    ? `<p class="hinweis-text">Noch offen: ${offen.map((id) => escapeHtml(name(id))).join(", ")}</p>`
    : "";
  const t = $("dk-timer-vb");
  t.hidden = false;
}

// Leiter: Vorbehalte auswerten
async function vorbehaltAufloesen() {
  const karten = {};
  for (const id of sp) { const h = handVon(id); if (!h) return; karten[id] = h; }
  const v = {};
  sp.forEach((id) => {
    let w = vorbehalt[id];
    const beide = R.hatBeideKreuzDamen(karten[id]);
    if (!w || (w === "gesund" && beide)) w = beide ? "hochzeit" : "gesund";
    if (w === "hochzeit" && !beide) w = "gesund";
    if (!opt.solo && w !== "gesund" && w !== "hochzeit") w = beide ? "hochzeit" : "gesund";
    v[id] = w;
  });
  const soloId = sp.find((id) => v[id] !== "gesund" && v[id] !== "hochzeit");
  const hochzeitId = sp.find((id) => v[id] === "hochzeit");
  let upd;
  if (soloId) {
    upd = { dkSpielart: v[soloId], dkArt: "solo", dkSolist: soloId, dkRe: [soloId], dkReBekannt: true };
  } else if (hochzeitId) {
    upd = { dkSpielart: "normal", dkArt: "hochzeit", dkSolist: hochzeitId, dkRe: [hochzeitId], dkReBekannt: false };
  } else {
    upd = {
      dkSpielart: "normal", dkArt: "normal", dkSolist: null,
      dkRe: sp.filter((id) => karten[id].some((k) => R.basis(k) === "CQ")), dkReBekannt: true
    };
  }
  const normal = upd.dkSpielart === "normal";
  const hatPaar = (id, code) => karten[id].filter((k) => R.basis(k) === code).length === 2;
  const sauId = normal && opt.sau >= 1 ? sp.find((id) => hatPaar(id, "DA")) ?? null : null;
  const superId = normal && opt.sau >= 2 ? sp.find((id) => hatPaar(id, "DK")) ?? null : null;
  await updateDoc(api.raumRef(), {
    ...upd, dkSau: sauId, dkSuper: superId, dkVorbehalt: v, dkStatus: "spielen", dkAmZug: sp[0], dkZugStart: Date.now(), dkStich: [], dkStichZeit: 0,
    dkStiche: [], dkKlaerung: 0, dkAnsagen: { re: 0, kontra: 0 }
  });
}

// ---- Spielansicht ----------------------------------------------------------
function teamVon(id) {
  if (!sp.includes(id)) return null;
  if (reBekannt) return re.includes(id) ? "re" : "kontra";
  if (art === "hochzeit" && re[0] === id) return "re";
  return null;
}
const meinTeam = () => teamVon(api.spielerId);

function legaleKarten() {
  const hand = meineKarten();
  return R.erlaubteKarten(hand, stich, aktuelleRegeln());
}

function zeichneHand(box, karten, opt = {}) {
  const reihen = opt.reihen === 2 ? [karten.slice(0, Math.ceil(karten.length / 2)), karten.slice(Math.ceil(karten.length / 2))] : [karten];
  const n = Math.max(...reihen.map((r) => r.length));
  const verf = Math.max(box.clientWidth || el.wurzel.clientWidth || 340, 200);
  const kw = Math.max(34, Math.min(96, verf / (1 + Math.max(0, n - 1) * 0.44)));
  box.style.setProperty("--kw", kw + "px");
  const legal = opt.nurAnzeige ? null : new Set(legaleKarten());
  const meinZug = !opt.nurAnzeige && status === "spielen" && amZug === api.spielerId && stich.length < 4;
  box.innerHTML = "";
  reihen.forEach((reihe) => {
    const zeile = opt.reihen === 2 ? document.createElement("div") : box;
    if (zeile !== box) { zeile.className = "dk-hand-reihe"; box.appendChild(zeile); }
    reihe.forEach((k) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "dk-hk";
      b.dataset.k = k;
      b.innerHTML = kartenSvg(k);
      if (opt.nurAnzeige) b.disabled = true;
      else {
        if (k === gewaehlt) b.classList.add("gewaehlt");
        if (meinZug && !legal.has(k)) b.classList.add("gesperrt");
        if (!meinZug) b.classList.add("wartet");
        b.addEventListener("click", () => klickKarte(k));
      }
      zeile.appendChild(b);
    });
  });
}

function klickKarte(k) {
  if (status !== "spielen" || amZug !== api.spielerId || stich.length >= 4) { gewaehlt = null; zeichne(); return; }
  if (!legaleKarten().includes(k)) { gewaehlt = null; zeichne(); return; }
  if (gewaehlt === k) { karteSpielen(k); return; }
  gewaehlt = k;
  zeichne();
}

function platzierung(id) {
  // relative Position zu mir: 0 unten, 1 links, 2 oben, 3 rechts
  const meinIdx = sp.indexOf(api.spielerId);
  const basisIdx = meinIdx >= 0 ? meinIdx : 0;
  return (sp.indexOf(id) - basisIdx + 4) % 4;
}

function ansageText(team) {
  const s = ansagen[team];
  if (!s) return "";
  if (s === 1) return team === "re" ? "Re" : "Kontra";
  return (team === "re" ? "Re: " : "Kontra: ") + R.ANSAGE_NAMEN[s];
}

function zeigeSpiel() {
  const spielt = istSpieler();
  $("dk-kopf-links").textContent = `Partie ${partie + 1}/${anzahl} · ${spielName()}`;
  const team = meinTeam();
  $("dk-kopf-team").innerHTML = !spielt ? "Du schaust zu"
    : team === "re" ? `<b class="dk-team-re">Du bist Re</b>`
      : team === "kontra" ? `<b class="dk-team-kontra">Du bist Kontra</b>`
        : `<b class="dk-team-kontra">Team noch unklar</b>`;
  // Ansagen
  const chips = [];
  if (ansagen.re) chips.push(`<span class="dk-chip dk-chip-re">${escapeHtml(ansageText("re"))}</span>`);
  if (ansagen.kontra) chips.push(`<span class="dk-chip dk-chip-ko">${escapeHtml(ansageText("kontra"))}</span>`);
  const gespielt = [...stiche.flatMap((x) => x.karten), ...stich];
  const zeigt = (code) => gespielt.find((x) => R.basis(x.karte) === code);
  if (sau && zeigt("DA")) chips.push(`<span class="dk-chip">Schweinchen: ${escapeHtml(name(zeigt("DA").spielerId))}</span>`);
  if (superSau && zeigt("DK")) chips.push(`<span class="dk-chip">Super-Sau: ${escapeHtml(name(zeigt("DK").spielerId))}</span>`);
  if (art === "hochzeit" && !reBekannt) chips.push(`<span class="dk-chip">Hochzeit von ${escapeHtml(name(solist))}</span>`);
  $("dk-ansagen").innerHTML = chips.join("");

  // Tisch
  const tisch = $("dk-tisch");
  let h = "";
  sp.forEach((id) => {
    const pos = platzierung(id);
    const s = spielerVon(id);
    const rest = handVon(id)?.length ?? 0;
    const aktiv = amZug === id && stich.length < 4;
    const ich = id === api.spielerId;
    h += `<div class="dk-sitz dk-s${pos}${aktiv ? " aktiv" : ""}" style="--spieler-farbe:${s?.farbe ?? "#888"}">` +
      `${avatarHtml(s?.icon, "dk-av")}<span class="dk-sitz-name">${escapeHtml(ich ? "Du" : name(id))}</span>` +
      `<span class="dk-sitz-info">${rest} Karten</span></div>`;
    const k = stich.find((x) => x.spielerId === id);
    if (k) {
      const gewinner = stich.length === 4 ? stichGewinner() : null;
      h += `<div class="dk-ablage dk-a${pos}${gewinner === id ? " gewinner" : ""}">${kartenSvg(k.karte)}</div>`;
    }
  });
  if (geber && alle.length === 5) {
    h += `<div class="dk-aussetzer">${escapeHtml(geber === api.spielerId ? "Du setzt" : name(geber) + " setzt")} aus</div>`;
  }
  tisch.innerHTML = h;

  // Hand
  const handBox = $("dk-hand");
  if (spielt) {
    handBox.hidden = false;
    zeichneHand(handBox, R.sortiereHand(meineKarten(), aktuelleRegeln()));
  } else {
    handBox.hidden = true;
    handBox.innerHTML = "";
  }

  // Zeile
  const meinZug = spielt && amZug === api.spielerId && stich.length < 4;
  let z = "";
  if (stich.length === 4) z = `${escapeHtml(name(stichGewinner()))} bekommt den Stich.`;
  else if (meinZug) z = gewaehlt ? "Tippe die Karte noch einmal oder auf „Karte spielen“." : "Du bist dran - tippe eine Karte an.";
  else if (amZug) z = `${escapeHtml(name(amZug))} ist dran …`;
  $("dk-zeile").innerHTML = z;
  const btn = $("dk-btn-spielen");
  btn.disabled = !(meinZug && gewaehlt && legaleKarten().includes(gewaehlt));
  btn.hidden = !spielt;

  // Ansage-Button
  const a = moeglicheAnsage();
  const ab = $("dk-btn-ansage");
  ab.hidden = !a;
  if (a) ab.textContent = a.text;
  $("dk-btn-letzter").hidden = stiche.length === 0;
  zeigeLetztenStich();
}

function spielName() {
  if (art === "hochzeit") return reBekannt ? "Hochzeit" : "Hochzeit (Partner offen)";
  if (art === "stilleHochzeit") return "Stille Hochzeit";
  return R.SPIELARTEN[spielart] ?? "Normalspiel";
}

function stichGewinner() {
  if (stich.length < 4) return null;
  return stich[R.stichGewinnerIndex(stich, aktuelleRegeln())].spielerId;
}

function zeigeLetztenStich() {
  const box = $("dk-letzter");
  if (!box) return;
  const letzter = stiche[stiche.length - 1];
  if (!zeigeLetzten || !letzter) { box.hidden = true; box.innerHTML = ""; return; }
  box.hidden = false;
  box.innerHTML = `<p class="hinweis-text">Letzter Stich (ging an ${escapeHtml(name(letzter.gewinner))}):</p><div class="dk-letzter-reihe">` +
    letzter.karten.map((k) => `<div class="dk-mini"><span class="dk-mini-name">${escapeHtml(k.spielerId === api.spielerId ? "Du" : name(k.spielerId))}</span>${kartenSvg(k.karte)}</div>`).join("") + `</div>`;
}

// ---- Ansagen ---------------------------------------------------------------
function moeglicheAnsage(id = api.spielerId) {
  if (status !== "spielen" || !sp.includes(id)) return null;
  const team = teamVon(id);
  if (!team) return null;
  const hand = handVon(id) ?? [];
  if (!hand.length) return null;
  const naechste = (ansagen[team] ?? 0) + 1;
  if (naechste > 5) return null;
  const gespielt = 12 - hand.length - klaerung;
  if (gespielt > naechste) return null;
  const text = naechste === 1 ? (team === "re" ? "Re ansagen" : "Kontra ansagen")
    : `${R.ANSAGE_NAMEN[naechste]} ansagen`;
  return { team, stufe: naechste, text };
}

async function ansageMachen() {
  const a = moeglicheAnsage();
  if (!a) return;
  try {
    await updateDoc(api.raumRef(), { ["dkAnsagen." + a.team]: a.stufe });
  } catch (e) { zeigeDebug(e.message); }
}

// ---- Karte spielen ---------------------------------------------------------
async function karteSpielen(karte) {
  if (status !== "spielen" || amZug !== api.spielerId || stich.length >= 4 || schreibt) return;
  const hand = meineKarten();
  if (!R.erlaubteKarten(hand, stich, aktuelleRegeln()).includes(karte)) return;
  schreibt = true;
  gewaehlt = null;
  try {
    await zugSchreiben(api.spielerId, karte, hand);
  } catch (e) {
    schreibt = false;
    zeigeDebug("Fehler beim Spielen: " + e.message);
  }
}

async function zugSchreiben(id, karte, handKarten, extra = {}) {
  const neu = [...stich, { spielerId: id, karte }];
  const naechster = sp[(sp.indexOf(id) + 1) % 4];
  const batch = writeBatch(api.db);
  batch.update(handRef(id), { karten: handKarten.filter((k) => k !== karte) });
  const upd = { dkStich: neu, dkAmZug: naechster, dkZugStart: Date.now() };
  if (neu.length === 4) { upd.dkAmZug = null; upd.dkStichZeit = Date.now(); }
  batch.update(api.raumRef(), { ...upd, ...extra });
  await batch.commit();
}

// ---- Leiter-Takt -----------------------------------------------------------
function tick() {
  if (!el.wurzel) return;
  aktualisiereTimer();
  if (api.istLeiter) leiterTick();
}

function aktualisiereTimer() {
  if (status === "vorbehalt") {
    const rest = Math.max(0, 1 - (Date.now() - phaseStart) / VORBEHALT_ZEIT_MS);
    setTimer($("dk-timer-vb"), rest);
  } else if (status === "spielen") {
    const t = $("dk-timer-zug");
    if (stich.length < 4 && amZug) setTimer(t, Math.max(0, 1 - (Date.now() - zugStart) / ZUG_ZEIT_MS));
    else setTimer(t, 1);
  }
}
function setTimer(t, anteil) {
  if (!t) return;
  const i = t.firstElementChild;
  if (i) i.style.width = (anteil * 100) + "%";
  t.classList.toggle("gv-timer-knapp", anteil < 0.2);
}

async function leiterTick() {
  if (leiterBusy) return;
  leiterBusy = true;
  try {
    if (status === "vorbehalt") {
      const botUpd = {};
      sp.filter((id) => isBot(id) && !vorbehalt[id]).forEach((id) => {
        const h = handVon(id);
        if (h) botUpd["dkVorbehalt." + id] = R.hatBeideKreuzDamen(h) ? "hochzeit" : "gesund";
      });
      if (Object.keys(botUpd).length) { await updateDoc(api.raumRef(), botUpd); return; }
      const alleDa = sp.length && sp.every((id) => vorbehalt[id]);
      if (sp.length && (alleDa || Date.now() - phaseStart > VORBEHALT_ZEIT_MS)) await vorbehaltAufloesen();
    } else if (status === "spielen") {
      if (stich.length === 4 && stichZeit && Date.now() - stichZeit > STICH_PAUSE_MS) await stichAbschliessen();
      else if (stich.length < 4 && amZug && isBot(amZug) && Date.now() - zugStart > BOT_ZEIT_MS) await botZug();
      else if (stich.length < 4 && amZug && Date.now() - zugStart > ZUG_ZEIT_MS) await autoZug();
    }
  } catch (e) {
    zeigeDebug("Fehler: " + e.message);
  } finally {
    leiterBusy = false;
  }
}

// ---- Bots ------------------------------------------------------------------
// Einfache, aber vernünftige Strategie: Partner schmieren, Gegner mit der
// kleinstmöglichen Karte stechen, sonst die billigste Karte abwerfen.
function bekannteRe() {
  const gespielt = [...stiche.flatMap((x) => x.karten), ...stich];
  const rev = new Set(gespielt.filter((x) => R.basis(x.karte) === "CQ").map((x) => x.spielerId));
  if (art === "solo") return [new Set([solist]), true];
  if ((art === "hochzeit" || art === "stilleHochzeit") && reBekannt) return [new Set(re), true];
  if (art === "hochzeit") rev.add(solist);
  return [rev, art === "normal" && rev.size >= 2];
}

function beziehung(id, pid, team) {
  if (!team || pid === id) return "unbekannt";
  const [rev, komplett] = bekannteRe();
  const pidRe = rev.has(pid);
  if (team === "re") {
    if (pidRe) return art === "solo" || art === "stilleHochzeit" ? "unbekannt" : "partner";
    return komplett ? "gegner" : "unbekannt";
  }
  if (pidRe) return "gegner";
  return komplett ? "partner" : "unbekannt";
}

function botStaerke(id) {
  const r = aktuelleRegeln();
  return (handVon(id) ?? []).reduce((sum, k) => {
    if (!r.istTrumpf(k)) return sum;
    return sum + (["HT", "CQ", "SQ", "HQ", "DQ"].includes(R.basis(k)) ? 2 : 1);
  }, 0);
}

function botWaehle(id) {
  const hand = handVon(id);
  const r = aktuelleRegeln();
  const legal = R.erlaubteKarten(hand, stich, r);
  if (legal.length === 1) return legal[0];
  const augen = (k) => R.augenVon(k);
  const billig = (a, b) => augen(a) - augen(b) || r.staerke(a) - r.staerke(b);
  const team = teamVon(id);
  if (!stich.length) {
    const ass = legal.filter((k) => !r.istTrumpf(k) && R.rangVon(k) === "A");
    if (ass.length) return ass[0];
    return [...legal].sort(billig)[0];
  }
  const gIdx = R.stichGewinnerIndex(stich, r);
  const rel = beziehung(id, stich[gIdx].spielerId, team);
  if (rel === "partner") {
    if (stich.length === 3) return [...legal].sort((a, b) => augen(b) - augen(a) || r.staerke(a) - r.staerke(b))[0];
    return [...legal].sort(billig)[0];
  }
  const gewinnend = legal.filter((k) => R.stichGewinnerIndex([...stich, { spielerId: id, karte: k }], r) === stich.length);
  if (gewinnend.length) return gewinnend.sort((a, b) => r.staerke(a) - r.staerke(b))[0];
  return [...legal].sort(billig)[0];
}

async function botZug() {
  const id = amZug;
  const hand = handVon(id);
  if (!hand || !hand.length) return;
  const extra = {};
  const a = moeglicheAnsage(id);
  if (a && a.stufe === 1 && botStaerke(id) >= (a.team === "re" ? 12 : 11)) extra["dkAnsagen." + a.team] = 1;
  await zugSchreiben(id, botWaehle(id), hand, extra);
}

async function autoZug() {
  const hand = handVon(amZug);
  if (!hand || !hand.length) return;
  const r = aktuelleRegeln();
  const legal = R.erlaubteKarten(hand, stich, r);
  legal.sort((a, b) => R.augenVon(a) - R.augenVon(b) || r.staerke(a) - r.staerke(b));
  await zugSchreiben(amZug, legal[0], hand);
}

async function stichAbschliessen() {
  const r = aktuelleRegeln();
  const gewinner = stich[R.stichGewinnerIndex(stich, r)].spielerId;
  const neueStiche = [...stiche, { gewinner, karten: stich }];
  const upd = { dkStiche: neueStiche, dkStich: [], dkStichZeit: 0, dkAmZug: gewinner, dkZugStart: Date.now() };
  let neueArt = art, neueRe = re;
  if (art === "hochzeit" && !reBekannt) {
    const hz = solist;
    if (gewinner !== hz) {
      neueRe = [hz, gewinner];
      upd.dkRe = neueRe; upd.dkReBekannt = true; upd.dkKlaerung = neueStiche.length;
    } else if (neueStiche.length >= 3) {
      neueArt = "stilleHochzeit";
      neueRe = [hz];
      upd.dkArt = neueArt; upd.dkRe = neueRe; upd.dkReBekannt = true; upd.dkKlaerung = neueStiche.length;
    }
  }
  if (neueStiche.length < 12) {
    await updateDoc(api.raumRef(), upd);
    return;
  }
  // Partie vorbei -> auswerten
  const res = R.bewerte({ typ: spielart, art: neueArt, re: neueRe, spielerIds: sp, stiche: neueStiche, ansagen, opt, sau: Boolean(sau) });
  const neu = { ...punkteSumme };
  alle.forEach((id) => { neu[id] = (neu[id] ?? 0) + (res.punkte[id] ?? 0); });
  const batch = writeBatch(api.db);
  echte(alle).forEach((id) => batch.update(api.spielerRef(id), { punkte: neu[id] ?? 0 }));
  batch.update(api.raumRef(), {
    ...upd, dkStatus: "ergebnis", dkAmZug: null,
    dkErgebnis: { ...res, typ: spielart, art: neueArt, re: neueRe }, dkPunkte: neu
  });
  await batch.commit();
}

// ---- Ergebnis --------------------------------------------------------------
function zeigeErgebnis() {
  const e = ergebnis;
  if (!e) return;
  $("dk-erg-label").textContent = `Partie ${partie + 1} von ${anzahl} · ${R.SPIELARTEN[e.typ] ?? ""}${e.art === "hochzeit" ? " (Hochzeit)" : e.art === "stilleHochzeit" ? " (Stille Hochzeit)" : ""}`;
  const reNamen = e.re.map((id) => escapeHtml(name(id))).join(" & ");
  const koNamen = sp.filter((id) => !e.re.includes(id)).map((id) => escapeHtml(name(id))).join(" & ");
  $("dk-erg-titel").innerHTML = e.reGewinnt ? `Re gewinnt: ${reNamen}` : `Kontra gewinnt: ${koNamen}`;
  $("dk-erg-augen").innerHTML = `Re <b>${e.reAugen}</b> Augen (${e.reStiche} Stiche) · Kontra <b>${e.koAugen}</b> Augen (${e.koStiche} Stiche)`;
  const det = [];
  e.details.forEach((d) => det.push(`<li><span>${escapeHtml(d.text)}</span><b>${d.punkte > 0 ? "+" : ""}${d.punkte}</b></li>`));
  const sonder = (liste, team) => liste.forEach((d) => det.push(`<li><span>${team}: ${escapeHtml(d.text)}</span><b>${team === "Re" ? "+" : "−"}1</b></li>`));
  sonder(e.sonderRe, "Re"); sonder(e.sonderKontra, "Kontra");
  $("dk-erg-details").innerHTML = det.join("");
  const liste = $("dk-erg-liste");
  liste.innerHTML = "";
  const sortiert = [...alle].sort((a, b) => (punkteSumme[b] ?? 0) - (punkteSumme[a] ?? 0));
  sortiert.forEach((id) => {
    const s = spielerVon(id);
    const dazu = sp.includes(id) ? (e.punkte[id] ?? 0) : null;
    const li = document.createElement("li");
    li.className = "dk-erg-zeile";
    li.style.setProperty("--spieler-farbe", s?.farbe ?? "#888");
    li.innerHTML = `<span>${escapeHtml(s?.name ?? "?")}${e.re.includes(id) ? ' <small class="dk-team-re">Re</small>' : sp.includes(id) ? ' <small class="dk-team-kontra">Kontra</small>' : ' <small>pausiert</small>'}</span>` +
      `<span>${dazu === null ? "–" : (dazu > 0 ? "+" : "") + dazu} &nbsp;→&nbsp; <b>${punkteSumme[id] ?? 0}</b></span>`;
    liste.appendChild(li);
  });
  const letzte = partie + 1 >= anzahl;
  const b = $("dk-weiter");
  b.hidden = !api.istLeiter;
  b.textContent = letzte ? "Endstand anzeigen" : "Nächste Partie";
  $("dk-erg-warten").hidden = api.istLeiter;
}

async function weiter() {
  if (!api.istLeiter || status !== "ergebnis") return;
  $("dk-weiter").disabled = true;
  try {
    if (partie + 1 < anzahl) {
      await partieAusteilen(partie + 1, alle);
    } else {
      const rp = R.rangPunkte(Object.fromEntries(alle.map((id) => [id, punkteSumme[id] ?? 0])));
      const batch = writeBatch(api.db);
      echte(alle).forEach((id) => batch.update(api.spielerRef(id), { punkte: rp[id] ?? 0 }));
      batch.update(api.raumRef(), { dkStatus: "beendet", dkRang: rp });
      await batch.commit();
      speichereWertung(api, "doppelkopf", Object.fromEntries(echte(alle).map((id) => [id, rp[id] ?? 0])));
    }
  } catch (e) {
    zeigeDebug("Fehler beim Weiterschalten: " + e.message);
  } finally {
    $("dk-weiter").disabled = false;
  }
}

// ---- Endstand --------------------------------------------------------------
function zeigeEndstand() {
  const sortiert = [...alle].sort((a, b) => (punkteSumme[b] ?? 0) - (punkteSumme[a] ?? 0));
  const besterWert = punkteSumme[sortiert[0]] ?? 0;
  const sieger = sortiert.filter((id) => (punkteSumme[id] ?? 0) === besterWert);
  $("dk-sieger").innerHTML = `Gewonnen hat <strong>${sieger.map((id) => escapeHtml(name(id))).join(" &amp; ")}</strong> mit ${besterWert} Spielpunkten.`;
  const liste = $("dk-endstand-liste");
  liste.innerHTML = "";
  sortiert.forEach((id, i) => {
    const s = spielerVon(id);
    const li = document.createElement("li");
    li.innerHTML = spielerKarte(s?.name ?? "?", s?.farbe, s?.icon, `${punkteSumme[id] ?? 0} (${rang?.[id] ?? 0} Rangp.)`, { rang: i + 1 });
    liste.appendChild(li);
  });
  $("dk-endstand-warten").hidden = api.istLeiter;
  const btn = $("dk-gesamtwertung-btn");
  btn.hidden = !(api.istLeiter && Boolean(api.olympiadeAnzahl));
  btn.onclick = () => api.zeigeGesamtwertung();
}
