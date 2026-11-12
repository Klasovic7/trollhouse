// ============================================================================
//  Kartenliga - Spiellogik (ohne Oberfläche, ohne Datenbank)
// ----------------------------------------------------------------------------
//  Alles, was gerechnet wird: Raster-Stärken, Chemie, Spieltage, Talente und
//  Veteranen, Wirtschaft, Arena und die Entscheidungen der Bots. Die Werte sind
//  per Simulation abgestimmt (Regelwerk v0.4 im Trollhouse-Projekt).
// ============================================================================

export const CFG = {
  runden: 8,
  spieltage: { 2: "reihe", 4: "spalte", 6: "reihe", 8: "spalte" },
  startGeld: 6,
  einkommen: 3,
  verkaufHand: 1,
  maxKauf: 2,
  posMalus: 2,
  aufhol: 1,
  handGroesse: 4,
  picks: 3,
  deckWechselRunde: 5,
  trib: { kosten: [3, 5], einnahmen: [1, 3] },
  hex: { kosten: [3, 5], heim: [1, 2] },
  fanEinkommen: 1
};

export const REIHEN_POS = ["ST", "MF", "ABW"];
export const POS_NAME = { ST: "Sturm", MF: "Mittelfeld", ABW: "Abwehr" };
export const LINIEN = {
  reihe: [[0, 1, 2], [3, 4, 5], [6, 7, 8]],
  spalte: [[0, 3, 6], [1, 4, 7], [2, 5, 8]]
};
export const LINIEN_NAME = {
  reihe: ["Sturm", "Mittelfeld", "Abwehr"],
  spalte: ["Links", "Mitte", "Rechts"]
};
// Wer gegen wen: Linie von A gegen Linie von B
export const DUELL_PAARE = [[0, 2], [1, 1], [2, 0]];
export const BONUS_NAME = {
  talent: "Talent", veteran: "Veteran", kleiner_wuerfel: "Kleiner Würfel",
  grosser_wuerfel: "Großer Würfel", kapitaen: "Kapitän", fanliebling: "Fanliebling"
};
export const BONUS_TEXT = {
  talent: "+1 Stärke nach jedem Spieltag, +2 bei Durchbruch",
  veteran: "−1 Stärke nach jedem Spieltag, ±0 wenn sein Team mehr gewinnt als verliert",
  kleiner_wuerfel: "+1 bis +3 Stärke in jedem Spiel",
  grosser_wuerfel: "+2 bis +4 Stärke in jedem Spiel",
  kapitaen: "+1 für alle Spieler in seiner Reihe und Spalte",
  fanliebling: "+1 Münze in jeder Runde"
};
const WUERFEL = { kleiner_wuerfel: [1, 3], grosser_wuerfel: [2, 4] };
const WUERFEL_SCHNITT = { kleiner_wuerfel: 2, grosser_wuerfel: 3 };
const NACHBARN = Array.from({ length: 9 }, (_, i) =>
  Array.from({ length: 9 }, (_, j) => j).filter((j) => Math.abs((i / 3 | 0) - (j / 3 | 0)) + Math.abs(i % 3 - j % 3) === 1));

// ---- Karten ------------------------------------------------------------------------
let KARTEN = {};
export function setzeKarten(liste) {
  KARTEN = {};
  liste.forEach((k) => { KARTEN[k.id] = k; });
}
export function karte(id) {
  if (typeof id === "string" && id.startsWith("start-")) {
    return { id, name: "Startspieler", start: true, pos: null, nation: null, verein: null, bonus: null, kosten: 0, deck: 0 };
  }
  return KARTEN[id] || null;
}
export const alleKarten = () => Object.values(KARTEN);

// ---- Zufall ------------------------------------------------------------------------
export function mischen(arr, zufall = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(zufall() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}

// ---- Raster ------------------------------------------------------------------------
export function startRaster(zufall = Math.random) {
  const werte = mischen([1, 2, 3], zufall);
  const g = Array(9).fill(null);
  [0, 4, 8].forEach((feld, i) => { g[feld] = { id: `start-${werte[i]}`, w: werte[i] }; });
  return g;
}

// Effektiver Wert je Feld ohne Würfel und Heimbonus. Liefert auch die Gründe für die Anzeige.
export function feldWerte(grid) {
  const werte = Array(9).fill(0);
  const details = Array.from({ length: 9 }, () => []);
  grid.forEach((z, i) => {
    if (!z) return;
    const k = karte(z.id);
    werte[i] = z.w;
    if (k && !k.start && k.pos !== REIHEN_POS[i / 3 | 0]) { werte[i] -= CFG.posMalus; details[i].push(["Position", -CFG.posMalus]); }
  });
  // Nationen-Chemie: 3 gleiche Nationen in einer Reihe oder Spalte
  [...LINIEN.reihe, ...LINIEN.spalte].forEach((L) => {
    const ks = L.map((i) => grid[i] && karte(grid[i].id));
    if (ks.every((k) => k && !k.start) && new Set(ks.map((k) => k.nation)).size === 1) {
      L.forEach((i) => { werte[i] += 1; details[i].push(["Nation", 1]); });
    }
  });
  // Vereins-Chemie: Nachbar vom selben Verein
  grid.forEach((z, i) => {
    if (!z) return;
    const k = karte(z.id);
    if (!k || k.start) return;
    if (NACHBARN[i].some((j) => grid[j] && karte(grid[j].id)?.verein === k.verein && !karte(grid[j].id).start)) {
      werte[i] += 1; details[i].push(["Verein", 1]);
    }
  });
  // Kapitän (nur einer pro Team zählt)
  const kap = grid.findIndex((z) => z && karte(z.id)?.bonus === "kapitaen");
  if (kap >= 0) {
    const r = kap / 3 | 0, c = kap % 3;
    grid.forEach((z, j) => {
      if (z && j !== kap && ((j / 3 | 0) === r || j % 3 === c)) { werte[j] += 1; details[j].push(["Kapitän", 1]); }
    });
  }
  return { werte, details };
}

export function linienStaerken(grid, art) {
  const { werte } = feldWerte(grid);
  return LINIEN[art].map((L) => L.reduce((s, i) => s + werte[i], 0));
}
export function wuerfelInLinie(grid, art) {
  return LINIEN[art].map((L) => L.map((i) => grid[i] && karte(grid[i].id)?.bonus).filter((b) => WUERFEL[b]));
}

// ---- Spieltag ----------------------------------------------------------------------
export const toreFuerDifferenz = (d) => (d <= 0 ? 0 : d <= 3 ? 1 : d <= 6 ? 2 : 3);

export function spieltagBerechnen(teams, reihenfolge, runde, zufall = Math.random) {
  const art = CFG.spieltage[runde];
  const md = Object.keys(CFG.spieltage).map(Number).indexOf(runde);
  const basis = {};
  reihenfolge.forEach((id) => { basis[id] = feldWerte(teams[id].grid).werte; });
  const spiele = [];
  const linieStat = {};   // `${id}:${linie}` -> [gewonnen, gespielt]
  const bilanz = {};      // id -> {s,u,n}
  reihenfolge.forEach((id) => { bilanz[id] = { s: 0, u: 0, n: 0 }; [0, 1, 2].forEach((l) => { linieStat[`${id}:${l}`] = [0, 0]; }); });

  for (let ia = 0; ia < reihenfolge.length; ia++) {
    for (let ib = ia + 1; ib < reihenfolge.length; ib++) {
      const a = reihenfolge[ia], b = reihenfolge[ib];
      const heim = (md + ia + ib) % 2 === 0 ? a : b;
      const seite = {};
      [a, b].forEach((p) => {
        const w = [...basis[p]];
        const wuerfe = [];
        teams[p].grid.forEach((z, i) => {
          const bon = z && karte(z.id)?.bonus;
          if (WUERFEL[bon]) {
            const [lo, hi] = WUERFEL[bon];
            const x = lo + Math.floor(zufall() * (hi - lo + 1));
            w[i] += x; wuerfe.push({ feld: i, wurf: x });
          }
        });
        let linien = LINIEN[art].map((L) => L.reduce((s, i) => s + w[i], 0));
        let heimBonus = 0;
        if (p === heim && teams[p].hex) { heimBonus = CFG.hex.heim[teams[p].hex - 1]; linien = linien.map((x) => x + heimBonus); }
        seite[p] = { linien, wuerfe, heimBonus };
      });
      let ta = 0, tb = 0;
      const duelle = DUELL_PAARE.map(([la, lb]) => {
        const sa = seite[a].linien[la], sb = seite[b].linien[lb];
        const d = sa - sb;
        const ga = toreFuerDifferenz(d), gb = toreFuerDifferenz(-d);
        ta += ga; tb += gb;
        linieStat[`${a}:${la}`][1]++; linieStat[`${b}:${lb}`][1]++;
        if (d > 0) linieStat[`${a}:${la}`][0]++;
        if (d < 0) linieStat[`${b}:${lb}`][0]++;
        return { la, lb, sa, sb, ta: ga, tb: gb };
      });
      if (ta > tb) { bilanz[a].s++; bilanz[b].n++; }
      else if (tb > ta) { bilanz[b].s++; bilanz[a].n++; }
      else { bilanz[a].u++; bilanz[b].u++; }
      spiele.push({ a, b, heim, ta, tb, duelle, wuerfeA: seite[a].wuerfe, wuerfeB: seite[b].wuerfe, heimBonus: Math.max(seite[a].heimBonus, seite[b].heimBonus) });
    }
  }
  return { art, nr: md + 1, runde, spiele, linieStat, bilanz };
}

// Ergebnis in die Teams übernehmen: Tabelle, Talente, Veteranen, Aufholhilfe.
export function spieltagAnwenden(teams, reihenfolge, erg) {
  erg.spiele.forEach((s) => {
    const A = teams[s.a], B = teams[s.b];
    A.tore += s.ta; A.gegentore += s.tb; B.tore += s.tb; B.gegentore += s.ta;
    if (s.ta > s.tb) { A.punkte += 3; A.s++; B.n++; }
    else if (s.tb > s.ta) { B.punkte += 3; B.s++; A.n++; }
    else { A.punkte++; B.punkte++; A.u++; B.u++; }
  });
  const entwicklung = [];
  if (erg.runde < CFG.runden) {
    reihenfolge.forEach((id) => {
      const t = teams[id];
      t.grid.forEach((z, i) => {
        const k = z && karte(z.id);
        if (!k || k.start) return;
        if (k.bonus === "talent") {
          const linie = erg.art === "reihe" ? (i / 3 | 0) : i % 3;
          const [g, n] = erg.linieStat[`${id}:${linie}`];
          const plus = g * 2 > n ? 2 : 1;
          entwicklung.push({ team: id, feld: i, karte: z.id, alt: z.w, neu: z.w + plus, art: plus === 2 ? "durchbruch" : "talent" });
          z.w += plus;
        } else if (k.bonus === "veteran") {
          const b = erg.bilanz[id];
          if (b.s > b.n) entwicklung.push({ team: id, feld: i, karte: z.id, alt: z.w, neu: z.w, art: "erfahrung" });
          else { const neu = Math.max(1, z.w - 1); entwicklung.push({ team: id, feld: i, karte: z.id, alt: z.w, neu, art: "veteran" }); z.w = neu; }
        }
      });
    });
  }
  // Aufholhilfe: Tabellenletzte(r) bekommt bis zum nächsten Spieltag +1 pro Runde
  reihenfolge.forEach((id) => { teams[id].aufhol = false; });
  if (erg.runde < CFG.runden) {
    const tab = tabelle(teams, reihenfolge);
    const letzter = tab[tab.length - 1];
    tab.filter((e) => e.punkte === letzter.punkte && e.diff === letzter.diff && e.tore === letzter.tore)
      .forEach((e) => { teams[e.id].aufhol = true; });
  }
  return entwicklung;
}

export function tabelle(teams, reihenfolge) {
  const liste = reihenfolge.map((id) => {
    const t = teams[id];
    return { id, punkte: t.punkte, tore: t.tore, gegentore: t.gegentore, diff: t.tore - t.gegentore, s: t.s, u: t.u, n: t.n };
  });
  liste.sort((x, y) => y.punkte - x.punkte || y.diff - x.diff || y.tore - x.tore);
  let rang = 1;
  liste.forEach((e, i) => {
    if (i > 0) { const v = liste[i - 1]; if (!(v.punkte === e.punkte && v.diff === e.diff && v.tore === e.tore)) rang = i + 1; }
    e.rang = rang;
  });
  return liste;
}

// ---- Wirtschaft ----------------------------------------------------------------------
export function einnahmen(team) {
  let ein = CFG.einkommen;
  const posten = [{ n: "Grundeinkommen", w: CFG.einkommen }];
  if (team.trib) { const x = CFG.trib.einnahmen[team.trib - 1]; ein += x; posten.push({ n: "Tribüne", w: x }); }
  const fans = team.grid.filter((z) => z && karte(z.id)?.bonus === "fanliebling").length;
  if (fans) { ein += fans * CFG.fanEinkommen; posten.push({ n: "Fanlieblinge", w: fans * CFG.fanEinkommen }); }
  if (team.aufhol) { ein += CFG.aufhol; posten.push({ n: "Aufholhilfe", w: CFG.aufhol }); }
  return { summe: ein, posten };
}
export const verkaufswert = (id) => { const k = karte(id); return !k || k.start ? 0 : Math.floor(k.kosten / 2); };
export function ausbauKosten(team, pfad) {
  const P = pfad === "T" ? CFG.trib : CFG.hex;
  const lvl = pfad === "T" ? team.trib : team.hex;
  return lvl < P.kosten.length ? P.kosten[lvl] : null;
}

// Plan durchrechnen (für Vorschau UND Ausführung, damit beides gleich ist).
// plan = { kaeufe: [{ id, feld }], ausbau: "T" | "H" | null }
export function planRechnen(team, hand, plan) {
  const grid = team.grid.map((z) => (z ? { ...z } : null));
  let geld = team.geld;
  const gekauft = [], verkauft = [], fehler = [];
  (plan?.kaeufe || []).slice(0, CFG.maxKauf).forEach(({ id, feld }) => {
    const k = karte(id);
    if (!k || !hand.includes(id) || gekauft.some((g) => g.id === id) || feld < 0 || feld > 8) { fehler.push("ungültig"); return; }
    const alt = grid[feld];
    const erloes = alt ? verkaufswert(alt.id) : 0;
    if (k.kosten > geld + erloes) { fehler.push(`${k.name}: zu wenig Geld`); return; }
    geld += erloes - k.kosten;
    if (alt) verkauft.push({ id: alt.id, feld, erloes });
    grid[feld] = { id, w: k.staerke };
    gekauft.push({ id, feld, kosten: k.kosten });
  });
  let ausbau = null;
  if (plan?.ausbau) {
    const kosten = ausbauKosten(team, plan.ausbau);
    if (kosten != null && kosten <= geld) { geld -= kosten; ausbau = { pfad: plan.ausbau, kosten }; }
    else fehler.push("Ausbau nicht möglich");
  }
  const rest = hand.filter((id) => !gekauft.some((g) => g.id === id));
  const handErloes = rest.length * CFG.verkaufHand;
  return { grid, geld, geldNachVerkauf: geld + handErloes, gekauft, verkauft, ausbau, rest, handErloes, fehler };
}

// ---- Bots --------------------------------------------------------------------------
function restInfo(runde) {
  const rs = Object.keys(CFG.spieltage).map(Number).filter((r) => r >= runde).length;
  const ra = [2, 4, 6].filter((r) => r >= runde).length;
  return { rs, rr: CFG.runden - runde, ra };
}
function zukunftMuenzwert(runde) {
  let s = 0;
  for (let j = runde + 1; j <= CFG.runden; j++) s += Object.keys(CFG.spieltage).map(Number).filter((r) => r >= j).length;
  return s;
}
function bewertung(grid, runde, kGeld) {
  const { rs, ra } = restInfo(runde);
  const { werte } = feldWerte(grid);
  let s = werte.reduce((a, b) => a + b, 0);
  let extra = 0;
  grid.forEach((z) => {
    const b = z && karte(z.id)?.bonus;
    if (!b) return;
    if (WUERFEL_SCHNITT[b]) s += WUERFEL_SCHNITT[b];
    else if (b === "talent") extra += 1.3 * ra * Math.max(0, rs - 1) / 2;
    else if (b === "veteran") extra -= 0.5 * ra * Math.max(0, rs - 1) / 2;
    else if (b === "fanliebling") extra += kGeld * CFG.fanEinkommen * zukunftMuenzwert(runde);
  });
  return s * rs + extra;
}
const muenzFaktor = (k, runde) => k * Math.min(1, (CFG.runden - runde) / 4 + 0.05);

function bestePlatzierung(grid, id, runde, kk) {
  const { rs } = restInfo(runde);
  const basis = bewertung(grid, runde, kk);
  const k = karte(id);
  let best = { feld: -1, gewinn: -1e9, erloes: 0 };
  for (let i = 0; i < 9; i++) {
    const alt = grid[i];
    const erloes = alt ? verkaufswert(alt.id) : 0;
    grid[i] = { id, w: k.staerke };
    const w = bewertung(grid, runde, kk);
    grid[i] = alt;
    const gewinn = w - basis + kk * erloes * rs;
    if (gewinn > best.gewinn) best = { feld: i, gewinn, erloes };
  }
  return best;
}
export function kaufNutzen(grid, id, runde, k = 0.5) {
  const { rs } = restInfo(runde);
  const kk = muenzFaktor(k, runde);
  const p = bestePlatzierung(grid, id, runde, kk);
  return { nutzen: p.gewinn - kk * rs * karte(id).kosten, feld: p.feld };
}
function ausbauNutzen(team, pfad, runde, k) {
  const { rs } = restInfo(runde);
  const kk = muenzFaktor(k, runde);
  const kosten = ausbauKosten(team, pfad);
  if (kosten == null) return -1e9;
  let nutzen;
  if (pfad === "T") {
    const d = CFG.trib.einnahmen[team.trib] - (team.trib ? CFG.trib.einnahmen[team.trib - 1] : 0);
    nutzen = kk * d * zukunftMuenzwert(runde);
  } else {
    const d = CFG.hex.heim[team.hex] - (team.hex ? CFG.hex.heim[team.hex - 1] : 0);
    nutzen = d * 3 * 0.5 * rs;
  }
  return nutzen - kk * rs * kosten;
}

// Arena-Ausbau nach den Transfers: "T", "H" oder null
export function botAusbauWahl(team, runde, strat = { k: 0.5, lust: 1 }) {
  let best = null, bestN = 0;
  ["T", "H"].forEach((p) => {
    const kosten = ausbauKosten(team, p);
    if (kosten == null || kosten > team.geld) return;
    const n = ausbauNutzen(team, p, runde, strat.k) * (strat.lust ?? 1);
    if (n > bestN) { bestN = n; best = p; }
  });
  return best;
}

// Draft: welche Karte nimmt der Bot (bzw. die Automatik bei abgelaufener Zeit)?
export function botDraftWahl(team, hand, runde, k = 0.5) {
  const bewertet = hand.map((id) => {
    const leistbar = karte(id).kosten <= team.geld + 2 ? 1 : 0;
    return { id, leistbar, n: kaufNutzen(team.grid.map((z) => (z ? { ...z } : null)), id, runde, k).nutzen };
  });
  bewertet.sort((x, y) => y.leistbar - x.leistbar || y.n - x.n);
  return bewertet[0]?.id ?? hand[0];
}

// Transfer: Käufe + Ausbau für einen Bot
export function botTransferPlan(team, hand, runde, strat = { k: 0.5, lust: 1 }) {
  const plan = { kaeufe: [], ausbau: null };
  const t = { ...team, grid: team.grid.map((z) => (z ? { ...z } : null)) };
  let geld = team.geld;
  const verfuegbar = [...hand];
  for (let schritt = 0; schritt < CFG.maxKauf + 1; schritt++) {
    const optionen = [];
    if (plan.kaeufe.length < CFG.maxKauf) {
      verfuegbar.forEach((id) => {
        const { nutzen, feld } = kaufNutzen(t.grid, id, runde, strat.k);
        const erloes = t.grid[feld] ? verkaufswert(t.grid[feld].id) : 0;
        if (karte(id).kosten <= geld + erloes) optionen.push({ art: "karte", id, feld, nutzen, erloes });
      });
    }
    if (!plan.ausbau && strat.lust > 0) {
      ["T", "H"].forEach((p) => {
        const kosten = ausbauKosten(t, p);
        if (kosten != null && kosten <= geld) optionen.push({ art: "ausbau", pfad: p, nutzen: ausbauNutzen(t, p, runde, strat.k) * strat.lust, kosten });
      });
    }
    const gut = optionen.filter((o) => o.nutzen > 0).sort((a, b) => b.nutzen - a.nutzen);
    if (!gut.length) break;
    const o = gut[0];
    if (o.art === "ausbau") { plan.ausbau = o.pfad; geld -= o.kosten; continue; }
    geld += o.erloes - karte(o.id).kosten;
    t.grid[o.feld] = { id: o.id, w: karte(o.id).staerke };
    plan.kaeufe.push({ id: o.id, feld: o.feld });
    verfuegbar.splice(verfuegbar.indexOf(o.id), 1);
  }
  // Ausbau muss nach den Käufen bezahlbar sein (gleiche Reihenfolge wie planRechnen)
  return plan;
}

// ---- Neues Spiel ----------------------------------------------------------------------
export function neuesSpiel(reihenfolge, zufall = Math.random) {
  const teams = {};
  reihenfolge.forEach((id) => {
    teams[id] = { geld: CFG.startGeld, grid: startRaster(zufall), trib: 0, hex: 0, punkte: 0, tore: 0, gegentore: 0, s: 0, u: 0, n: 0, aufhol: false, hand: [] };
  });
  const deck = {
    1: mischen(alleKarten().filter((k) => k.deck === 1).map((k) => k.id), zufall),
    2: mischen(alleKarten().filter((k) => k.deck === 2).map((k) => k.id), zufall)
  };
  return { teams, deck, ablage: { 1: [], 2: [] } };
}

export function ziehen(zustand, nr, anzahl, zufall = Math.random) {
  const out = [];
  for (let i = 0; i < anzahl; i++) {
    if (!zustand.deck[nr].length) {
      zustand.deck[nr] = mischen(zustand.ablage[nr], zufall);
      zustand.ablage[nr] = [];
      if (!zustand.deck[nr].length) break;
    }
    out.push(zustand.deck[nr].pop());
  }
  return out;
}

// Verkaufte / abgelegte Karte zurück auf die Ablage ihres Decks (Deck 1 fliegt ab Runde 5 raus)
export function zurueckLegen(zustand, id, runde) {
  const k = karte(id);
  if (!k || k.start) return;
  if (k.deck === 1 && runde >= CFG.deckWechselRunde) return;
  zustand.ablage[k.deck].push(id);
}
