// ============================================================================
//  Doppelkopf - Regelwerk (reine Funktionen, ohne Oberfläche)
// ----------------------------------------------------------------------------
//  Angelehnt an die Turnierspielregeln des Deutschen Doppelkopf-Verbands (DDV).
//  Karten-IDs: Farbe + Rang + Kopie, z. B. "HT0" = Herz-Zehn (erste Kopie).
//  Farben: D = Karo, H = Herz, S = Pik, C = Kreuz. Ränge: 9, J (Bube), Q (Dame),
//  K (König), T (Zehn), A (Ass).
// ============================================================================
export const FARBEN = ["D", "H", "S", "C"];
export const FARBEN_NAME = { D: "Karo", H: "Herz", S: "Pik", C: "Kreuz" };
export const RAENGE = ["9", "J", "Q", "K", "T", "A"];
export const RANG_NAME = { 9: "Neun", J: "Bube", Q: "Dame", K: "König", T: "Zehn", A: "Ass" };
export const AUGEN = { 9: 0, J: 2, Q: 3, K: 4, T: 10, A: 11 };
export const SPIELARTEN = {
  normal: "Normalspiel",
  "solo-D": "Karo-Solo", "solo-H": "Herz-Solo", "solo-S": "Pik-Solo", "solo-C": "Kreuz-Solo",
  damen: "Damen-Solo", buben: "Buben-Solo", fleischlos: "Fleischlos"
};
export const ANSAGE_NAMEN = ["", "Re/Kontra", "Keine 90", "Keine 60", "Keine 30", "Schwarz"];

export const basis = (id) => id.slice(0, 2);
export const farbeVon = (id) => id[0];
export const rangVon = (id) => id[1];
export const augenVon = (id) => AUGEN[id[1]];

export function kartenDeck() {
  const d = [];
  for (let k = 0; k < 2; k++) for (const f of FARBEN) for (const r of RAENGE) d.push(`${f}${r}${k}`);
  return d;
}

export function mischen(liste, zufall = Math.random) {
  const a = [...liste];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(zufall() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Trumpfliste (hoch -> niedrig) als Basis-Codes ohne Kopie
// opts: { sau: DA-Paar in einer Hand ist höchster Trumpf }
export function trumpfListe(typ, opts = {}) {
  const damen = ["CQ", "SQ", "HQ", "DQ"], buben = ["CJ", "SJ", "HJ", "DJ"];
  if (typ === "damen") return damen;
  if (typ === "buben") return buben;
  if (typ === "fleischlos") return [];
  if (typ && typ.startsWith("solo-") && typ !== "solo-D") {
    const f = typ[5];
    const farbkarten = f === "H" ? ["HA", "HK", "H9"] : [`${f}A`, `${f}T`, `${f}K`, `${f}9`];
    return ["HT", ...damen, ...buben, ...farbkarten];
  }
  if (typ === "normal" && opts.sau) {
    return ["DA", "HT", ...damen, ...buben, "DT", "DK", "D9"];
  }
  return ["HT", ...damen, ...buben, "DA", "DT", "DK", "D9"]; // Normalspiel und Karo-Solo
}

const RANG_STAERKE = { 9: 0, J: 1, Q: 2, K: 3, T: 4, A: 5 };

export function regelnFuer(typ, opts = {}) {
  const liste = trumpfListe(typ, opts);
  const index = new Map(liste.map((b, i) => [b, i]));
  const istTrumpf = (id) => index.has(basis(id));
  const farbe = (id) => (istTrumpf(id) ? "T" : farbeVon(id));
  const staerke = (id) => (istTrumpf(id) ? 1000 - index.get(basis(id)) : RANG_STAERKE[rangVon(id)]);
  return { typ, istTrumpf, farbe, staerke, anzahlTrumpf: liste.length, zweiteDulle: Boolean(opts.zweiteDulle),
    // Super-Sau: Karo-9 sticht die Sau, sobald eine Sau gespielt wurde (sauGespielt = in früheren Stichen)
    superSau: Boolean(opts.sau && opts.superSau && typ === "normal"), sauGespielt: Boolean(opts.sauGespielt) };
}

// Erlaubte Karten aus der Hand, wenn schon Karten im Stich liegen
export function erlaubteKarten(hand, stich, regeln) {
  if (!stich.length) return [...hand];
  const lead = regeln.farbe(stich[0].karte);
  const passend = hand.filter((k) => regeln.farbe(k) === lead);
  return passend.length ? passend : [...hand];
}

// Index der Karte im Stich, die gewinnt (bei Gleichstand die zuerst gespielte)
export function stichGewinnerIndex(stich, regeln) {
  const lead = regeln.farbe(stich[0].karte);
  // wirksame Stärke einer Karte im Stich (Super-Sau: Karo-9 nach gespielter Sau)
  const eff = (i) => {
    const c = stich[i].karte;
    if (regeln.superSau && basis(c) === "D9" &&
      (regeln.sauGespielt || stich.slice(0, i).some((x) => basis(x.karte) === "DA"))) return 5000;
    return regeln.staerke(c);
  };
  let best = 0;
  for (let i = 1; i < stich.length; i++) {
    const c = stich[i].karte, b = stich[best].karte;
    const cf = regeln.farbe(c), bf = regeln.farbe(b);
    let schlaegt = false;
    if (cf === "T" && bf !== "T") schlaegt = true;
    else if (cf === "T" && bf === "T") {
      schlaegt = eff(i) > eff(best) ||
        (regeln.zweiteDulle && basis(c) === "HT" && basis(b) === "HT");
    } else if (cf === lead && bf === lead) schlaegt = eff(i) > eff(best);
    if (schlaegt) best = i;
  }
  return best;
}

export function sortiereHand(hand, regeln) {
  const reihenfolgeFarben = ["C", "H", "S", "D", "T"]; // Fehlfarben Kreuz, Herz, Pik, Karo (nur im Solo) - Trumpf ganz rechts
  return [...hand].sort((a, b) => {
    const fa = reihenfolgeFarben.indexOf(regeln.farbe(a)), fb = reihenfolgeFarben.indexOf(regeln.farbe(b));
    if (fa !== fb) return fa - fb;
    // Fehlfarben: hoch -> niedrig; Trumpf: niedrig -> hoch, damit die besten Karten ganz rechts liegen
    const d = fa === reihenfolgeFarben.length - 1 ? regeln.staerke(a) - regeln.staerke(b) : regeln.staerke(b) - regeln.staerke(a);
    return d || (a < b ? -1 : 1);
  });
}

export const hatBeideKreuzDamen = (hand) => hand.filter((k) => basis(k) === "CQ").length === 2;

// ---- Wertung ----------------------------------------------------------------
// ansagenWert: Schwelle der Gegenpartei je Absage-Stufe (2: <90, 3: <60, 4: <30, 5: schwarz)
const SCHWELLE = { 2: 90, 3: 60, 4: 30 };

// Gegenpartei hat die Absage "stufe" verfehlt?  (= Absage der Partei erfüllt, wenn false)
function absageErfuellt(stufe, gegnerAugen, gegnerStiche) {
  if (stufe === 5) return gegnerStiche === 0;
  return gegnerAugen < SCHWELLE[stufe];
}

/**
 * ctx = {
 *   typ,                // Spielart (siehe SPIELARTEN)
 *   art,                // "normal" | "hochzeit" | "solo" | "stilleHochzeit"
 *   re,                 // Ids der Re-Partei (bei Solo: nur der Solospieler)
 *   spielerIds,         // die vier Mitspielenden
 *   stiche,             // [{ gewinner, karten:[{spielerId, karte}] }] in Reihenfolge
 *   ansagen: { re, kontra }  // höchste Ansage-Stufe je Partei (0 = keine)
 * }
 */
export function bewerte(ctx) {
  const { typ, art, re, spielerIds, stiche } = ctx;
  const aRe = ctx.ansagen?.re ?? 0, aKo = ctx.ansagen?.kontra ?? 0;
  const istRe = (id) => re.includes(id);
  const solo = art === "solo" || art === "stilleHochzeit";
  const normalRegeln = art === "normal" || art === "hochzeit" || art === "stilleHochzeit" || art === "armut";
  const opt = { fuchs: true, karlchen: true, doppelkopf: true, ...(ctx.opt || {}) };
  const mitFuchsKarlchen = (art === "normal" || art === "hochzeit" || art === "stilleHochzeit" || art === "armut") && (typ === "normal");
  const mitFuchs = mitFuchsKarlchen && opt.fuchs && !ctx.sau;
  const mitKarlchen = mitFuchsKarlchen && opt.karlchen;

  let reAugen = 0, koAugen = 0, reStiche = 0, koStiche = 0;
  const sp = { re: [], kontra: [] };
  stiche.forEach((st, nr) => {
    const augen = st.karten.reduce((s, k) => s + augenVon(k.karte), 0);
    const reGewinnt = istRe(st.gewinner);
    if (reGewinnt) { reAugen += augen; reStiche++; } else { koAugen += augen; koStiche++; }
    const team = reGewinnt ? "re" : "kontra";
    if (opt.doppelkopf && augen >= 40) sp[team].push({ text: "Doppelkopf", punkte: 1 });
    if (mitFuchs) {
      st.karten.forEach((k) => {
        if (basis(k.karte) === "DA" && istRe(k.spielerId) !== reGewinnt) sp[team].push({ text: "Fuchs gefangen", punkte: 1 });
      });
    }
    if (mitKarlchen) {
      if (nr === stiche.length - 1) {
        const w = st.karten.find((k) => k.spielerId === st.gewinner);
        if (w && basis(w.karte) === "CJ") sp[team].push({ text: "Karlchen", punkte: 1 });
      }
    }
  });

  // Wer gewinnt?
  let reGewinnt;
  const reErf = aRe >= 2 ? absageErfuellt(aRe, koAugen, koStiche) : null;
  const koErf = aKo >= 2 ? absageErfuellt(aKo, reAugen, reStiche) : null;
  if (reErf !== null && koErf === null) reGewinnt = reErf;
  else if (koErf !== null && reErf === null) reGewinnt = !koErf;
  else if (reErf !== null && koErf !== null && reErf !== koErf) reGewinnt = reErf;
  else reGewinnt = reAugen >= 121;

  const details = [];
  let basisPunkte = 0;
  const add = (text, p) => { basisPunkte += p; details.push({ text, punkte: p }); };
  add("Gewonnen", 1);
  const verliererAugen = reGewinnt ? koAugen : reAugen;
  const verliererStiche = reGewinnt ? koStiche : reStiche;
  if (verliererAugen < 90) add("Keine 90", 1);
  if (verliererAugen < 60) add("Keine 60", 1);
  if (verliererAugen < 30) add("Keine 30", 1);
  if (verliererStiche === 0) add("Schwarz", 1);
  if (!reGewinnt && !solo && normalRegeln) add("Gegen die Alten", 1);
  if (aRe >= 1) add("Re angesagt", 1);
  if (aKo >= 1) add("Kontra angesagt", 1);
  for (let s = 2; s <= aRe; s++) add(`Re: ${ANSAGE_NAMEN[s]} angesagt`, 1);
  for (let s = 2; s <= aKo; s++) add(`Kontra: ${ANSAGE_NAMEN[s]} angesagt`, 1);

  const spRe = sp.re.reduce((s, x) => s + x.punkte, 0);
  const spKo = sp.kontra.reduce((s, x) => s + x.punkte, 0);
  const wert = (reGewinnt ? basisPunkte : -basisPunkte) + spRe - spKo; // aus Sicht der Re-Partei

  const punkte = {};
  const faktorSolo = solo ? 3 : 1;
  spielerIds.forEach((id) => {
    if (istRe(id)) punkte[id] = wert * (solo ? faktorSolo : 1);
    else punkte[id] = -wert;
  });
  return { reAugen, koAugen, reStiche, koStiche, reGewinnt, basisPunkte, details, sonderRe: sp.re, sonderKontra: sp.kontra, wert, punkte };
}

// Rangpunkte für die App-Wertung: n-1 für den Besten ... 0, gleiche Summen teilen sich den Rang
export function rangPunkte(summen) {
  const ids = Object.keys(summen);
  const sortiert = [...ids].sort((a, b) => summen[b] - summen[a]);
  const res = {};
  let vorher = null, vorherPunkte = null;
  sortiert.forEach((id, i) => {
    const p = vorher !== null && summen[id] === vorher ? vorherPunkte : ids.length - 1 - i;
    res[id] = p; vorher = summen[id]; vorherPunkte = p;
  });
  return res;
}
