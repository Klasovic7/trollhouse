// ============================================================================
//  Kartenliga - Spielablauf (reine Zustandsübergänge, vom Spielleiter-Gerät benutzt)
// ----------------------------------------------------------------------------
//  Der komplette Spielzustand ist ein Objekt (im Raum-Dokument unter "kl"). Jede
//  Funktion bekommt den Zustand, verändert ihn und gibt ihn zurück. So lässt sich
//  der Ablauf ohne Datenbank testen.
// ============================================================================
import {
  CFG, neuesSpiel, ziehen, zurueckLegen, einnahmen, planRechnen, botDraftWahl, botTransferPlan, botAusbauWahl,
  ausbauKosten, spieltagBerechnen, spieltagAnwenden, tabelle
} from "./logik.js";

export const istBot = (id) => typeof id === "string" && id.startsWith("bot");

export function spielAnlegen(reihenfolge, bots, optionen, zufall = Math.random) {
  const basis = neuesSpiel(reihenfolge, zufall);
  const z = {
    ...basis,
    reihenfolge,
    bots,
    zeitlimit: Boolean(optionen.zeitlimit),
    runde: 0,
    phase: "start",
    pick: 0,
    phaseStart: 0,
    draftHaende: {},
    transfers: {},
    einnahmen: {},
    spieltag: null,
    historie: [],
    botStrat: {}
  };
  reihenfolge.filter(istBot).forEach((id) => { z.botStrat[id] = { k: 0.4 + zufall() * 0.25, lust: 0.8 + zufall() * 0.6 }; });
  return rundeStarten(z, zufall);
}

export function rundeStarten(z, zufall = Math.random) {
  z.runde += 1;
  if (z.runde === CFG.deckWechselRunde) { z.deck[1] = []; z.ablage[1] = []; }
  const nr = z.runde >= CFG.deckWechselRunde ? 2 : 1;
  z.einnahmen = {};
  z.reihenfolge.forEach((id) => {
    const t = z.teams[id];
    const e = einnahmen(t);
    t.geld += e.summe;
    z.einnahmen[id] = e;
    t.hand = [];
  });
  z.draftHaende = {};
  z.reihenfolge.forEach((id) => { z.draftHaende[id] = ziehen(z, nr, CFG.handGroesse, zufall); });
  z.pick = 0;
  z.phase = "draft";
  z.phaseStart = Date.now();
  z.transfers = {};
  return z;
}

// picks: { spielerId: kartenId } - fehlende (Bots, abgelaufene Zeit) werden automatisch gewählt
export function draftAnwenden(z, picks) {
  z.reihenfolge.forEach((id) => {
    const hand = z.draftHaende[id] || [];
    if (!hand.length) return;
    let wahl = picks[id];
    if (!hand.includes(wahl)) wahl = botDraftWahl(z.teams[id], hand, z.runde, z.botStrat[id]?.k ?? 0.5);
    z.teams[id].hand.push(wahl);
    z.draftHaende[id] = hand.filter((x) => x !== wahl);
  });
  if (z.pick + 1 < CFG.picks) {
    // Restliche Karten an den nächsten Spieler weitergeben
    const ids = z.reihenfolge;
    const alt = ids.map((id) => z.draftHaende[id]);
    ids.forEach((id, i) => { z.draftHaende[id] = alt[(i - 1 + ids.length) % ids.length]; });
    z.pick += 1;
    z.phaseStart = Date.now();
  } else {
    z.reihenfolge.forEach((id) => { (z.draftHaende[id] || []).forEach((k) => zurueckLegen(z, k, z.runde)); });
    z.draftHaende = {};
    z.phase = "transfer";
    z.phaseStart = Date.now();
  }
  return z;
}

export const draftBotPicks = (z) => {
  const picks = {};
  z.reihenfolge.filter(istBot).forEach((id) => {
    const hand = z.draftHaende[id] || [];
    if (hand.length) picks[id] = botDraftWahl(z.teams[id], hand, z.runde, z.botStrat[id]?.k ?? 0.5);
  });
  return picks;
};

// plaene: { spielerId: { kaeufe } } - fehlende Menschen kaufen nichts, Bots planen selbst.
// Danach folgt für alle gemeinsam der Arena-Ausbau.
export function transferAnwenden(z, plaene) {
  z.transfers = {};
  z.reihenfolge.forEach((id) => {
    const t = z.teams[id];
    const roh = istBot(id) ? botTransferPlan(t, t.hand, z.runde, { ...(z.botStrat[id] || {}), lust: 0 }) : (plaene[id] || { kaeufe: [] });
    const r = planRechnen(t, t.hand, { kaeufe: roh.kaeufe || [], ausbau: null });
    t.grid = r.grid;
    t.geld = r.geldNachVerkauf;
    r.verkauft.forEach((v) => zurueckLegen(z, v.id, z.runde));
    r.rest.forEach((k) => zurueckLegen(z, k, z.runde));
    z.transfers[id] = { gekauft: r.gekauft, verkauft: r.verkauft, handErloes: r.handErloes, rest: r.rest };
    t.hand = [];
  });
  z.phase = "arena";
  z.phaseStart = Date.now();
  return z;
}

// wahlen: { spielerId: "T" | "H" | null } - Bots entscheiden selbst
export function arenaAnwenden(z, wahlen, zufall = Math.random) {
  z.ausbauten = {};
  z.reihenfolge.forEach((id) => {
    const t = z.teams[id];
    const wahl = istBot(id) ? botAusbauWahl(t, z.runde, z.botStrat[id]) : wahlen[id];
    if (wahl !== "T" && wahl !== "H") return;
    const kosten = ausbauKosten(t, wahl);
    if (kosten == null || kosten > t.geld) return;
    t.geld -= kosten;
    if (wahl === "T") t.trib += 1; else t.hex += 1;
    z.ausbauten[id] = { pfad: wahl, kosten, stufe: wahl === "T" ? t.trib : t.hex };
  });
  if (CFG.spieltage[z.runde]) {
    const raster = {};
    z.reihenfolge.forEach((id) => { raster[id] = z.teams[id].grid.map((c) => (c ? { ...c } : null)); });
    const hex = {};
    z.reihenfolge.forEach((id) => { hex[id] = z.teams[id].hex; });
    const erg = spieltagBerechnen(z.teams, z.reihenfolge, z.runde, zufall);
    const entwicklung = spieltagAnwenden(z.teams, z.reihenfolge, erg);
    delete erg.linieStat;
    z.spieltag = { ...erg, entwicklung, raster, tabelle: tabelle(z.teams, z.reihenfolge) };
    z.historie.push({ nr: erg.nr, art: erg.art, spiele: erg.spiele.map((s) => ({ a: s.a, b: s.b, ta: s.ta, tb: s.tb, heim: s.heim })) });
    z.phase = "spieltag";
    z.phaseStart = Date.now();
    return z;
  }
  return rundeStarten(z, zufall);
}

// Nach dem Spieltag: weiter zur nächsten Runde oder Spielende
export function nachSpieltag(z, zufall = Math.random) {
  if (z.runde >= CFG.runden) { z.phase = "ende"; z.endTabelle = tabelle(z.teams, z.reihenfolge); return z; }
  return rundeStarten(z, zufall);
}
