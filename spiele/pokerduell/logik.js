// ============================================================================
//  Pokerduell - reine Logik (ohne Oberfläche, ohne Firebase)
// ----------------------------------------------------------------------------
//  Karten-Code: Farbe + Wert, z. B. "H12" (Herz Dame). Farben: C Kreuz, S Pik,
//  H Herz, D Karo. Werte: 2 bis 10, 11 Bube, 12 Dame, 13 König, 14 Ass.
// ============================================================================
export const ZELLEN = 25;
export const RUNDEN = 25;
export const FARBEN = ["C", "S", "H", "D"];
const FARB_ORDNER = { C: "kreuz", S: "pik", H: "herz", D: "karo" };
const WERT_ORDNER = { 11: "bube", 12: "dame", 13: "koenig", 14: "ass" };

export const wertVon = (code) => Number(code.slice(1));
export const farbeVon = (code) => code[0];
export const istRot = (code) => code[0] === "H" || code[0] === "D";

/** Bildpfad einer Karte (gemalte Karten aus bilder/doppelkopf). */
export function kartenBild(code) {
  const w = wertVon(code);
  return `bilder/doppelkopf/${FARB_ORDNER[code[0]]}-${WERT_ORDNER[w] || w}.webp?v=${w >= 9 ? 379 : 453}`;
}
export function alleKartenBilder() {
  const liste = [];
  FARBEN.forEach((f) => { for (let w = 2; w <= 14; w++) liste.push(kartenBild(f + w)); });
  return liste;
}

/** Ist es eine Wahlrunde? (jede dritte Runde: zwei Karten, eine davon wählen) */
export const istWahlRunde = (index) => (index + 1) % 3 === 0;

/** Mischt ein volles 52er-Blatt (Zufallsquelle austauschbar für Tests). */
export function mischeBlatt(zufall = Math.random) {
  const deck = [];
  FARBEN.forEach((f) => { for (let w = 2; w <= 14; w++) deck.push(f + w); });
  for (let i = deck.length - 1; i > 0; i--) {
    const j = Math.floor(zufall() * (i + 1));
    [deck[i], deck[j]] = [deck[j], deck[i]];
  }
  return deck;
}

/** 25 Runden als Textliste: "H12" oder bei Wahlrunden "H12|S3". (Firestore kennt keine verschachtelten Listen.) */
export function baueRunden(zufall = Math.random) {
  const deck = mischeBlatt(zufall);
  const runden = [];
  for (let i = 0; i < RUNDEN; i++) runden.push(istWahlRunde(i) ? `${deck.pop()}|${deck.pop()}` : deck.pop());
  return runden;
}
export const kartenDerRunde = (runden, i) => (runden?.[i] ?? "").split("|").filter(Boolean);

// ---- Reihen --------------------------------------------------------------------
/** Die 12 Reihen: 5 Zeilen, 5 Spalten, 2 Diagonalen (jeweils Zellindizes 0-24). */
export const REIHEN = (() => {
  const r = [];
  for (let z = 0; z < 5; z++) r.push({ id: `z${z}`, name: `Zeile ${z + 1}`, zellen: [0, 1, 2, 3, 4].map((s) => z * 5 + s) });
  for (let s = 0; s < 5; s++) r.push({ id: `s${s}`, name: `Spalte ${s + 1}`, zellen: [0, 1, 2, 3, 4].map((z) => z * 5 + s) });
  r.push({ id: "d1", name: "Diagonale ↘", zellen: [0, 6, 12, 18, 24] });
  r.push({ id: "d2", name: "Diagonale ↙", zellen: [4, 8, 12, 16, 20] });
  return r;
})();

// ---- Pokerhände ------------------------------------------------------------------
const PLURAL = { 2: "Zweier", 3: "Dreier", 4: "Vierer", 5: "Fünfer", 6: "Sechser", 7: "Siebener", 8: "Achter", 9: "Neuner", 10: "Zehner", 11: "Buben", 12: "Damen", 13: "Könige", 14: "Asse" };
const EINZEL = { 11: "Bube", 12: "Dame", 13: "König", 14: "Ass" };
const einzel = (w) => EINZEL[w] || String(w);
export const FARBNAME = { C: "Kreuz", S: "Pik", H: "Herz", D: "Karo" };

/** Bonuspunkte je Handkategorie (0 Hohe Karte ... 8 Straight Flush); Royal Flush zählt mehr als jeder andere Straight Flush. */
export const BONUS_KATEGORIE = [0, 0, 0, 0, 1, 2, 3, 5, 8];
export const BONUS_ROYAL = 12;

export const KATEGORIEN = ["Hohe Karte", "Paar", "Zwei Paare", "Drilling", "Straße", "Flush", "Full House", "Vierling", "Straight Flush"];

/** Bewertet genau 5 Karten. Rückgabe: { kat (0-8), werte: [...], name } - vergleichbar mit vergleicheHaende(). */
export function bewerteHand(codes) {
  const werte = codes.map(wertVon).sort((a, b) => b - a);
  const gleicheFarbe = codes.every((c) => c[0] === codes[0][0]);
  const zaehler = new Map();
  werte.forEach((w) => zaehler.set(w, (zaehler.get(w) || 0) + 1));
  const gruppen = [...zaehler.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0]);
  const verteilung = gruppen.map((g) => g[1]).join("");
  const ordnung = gruppen.map((g) => g[0]);

  let strasse = false, hoch = werte[0];
  if (gruppen.length === 5) {
    if (werte[0] - werte[4] === 4) strasse = true;
    else if (werte.join() === "14,5,4,3,2") { strasse = true; hoch = 5; }   // Rad: A-2-3-4-5
  }

  const fn = FARBNAME[codes[0][0]];
  let kat, vergleich, name;
  if (strasse && gleicheFarbe) {
    kat = 8; vergleich = [hoch];
    name = hoch === 14 ? `Royal Flush in ${fn}` : `Straight Flush in ${fn} (${einzel(hoch)} hoch)`;
  } else if (verteilung === "41") {
    kat = 7; vergleich = ordnung; name = `Vierling (${PLURAL[ordnung[0]]})`;
  } else if (verteilung === "32") {
    kat = 6; vergleich = ordnung; name = `Full House (${PLURAL[ordnung[0]]} und ${PLURAL[ordnung[1]]})`;
  } else if (gleicheFarbe) {
    kat = 5; vergleich = werte; name = `${fn}-Flush (${einzel(werte[0])} hoch)`;
  } else if (strasse) {
    kat = 4; vergleich = [hoch]; name = `Straße (${einzel(hoch)} hoch)`;
  } else if (verteilung === "311") {
    kat = 3; vergleich = ordnung; name = `Drilling (${PLURAL[ordnung[0]]})`;
  } else if (verteilung === "221") {
    kat = 2; vergleich = ordnung; name = `Zwei Paare (${PLURAL[ordnung[0]]} und ${PLURAL[ordnung[1]]})`;
  } else if (verteilung === "2111") {
    kat = 1; vergleich = ordnung; name = `Paar (${PLURAL[ordnung[0]]})`;
  } else {
    kat = 0; vergleich = werte; name = `Hohe Karte (${einzel(werte[0])})`;
  }
  const bonus = kat === 8 && hoch === 14 ? BONUS_ROYAL : BONUS_KATEGORIE[kat];
  return { kat, werte: vergleich, name, bonus };
}

/** >0: a besser, <0: b besser, 0: gleich stark. */
export function vergleicheHaende(a, b) {
  if (a.kat !== b.kat) return a.kat - b.kat;
  for (let i = 0; i < Math.max(a.werte.length, b.werte.length); i++) {
    const d = (a.werte[i] ?? 0) - (b.werte[i] ?? 0);
    if (d) return d;
  }
  return 0;
}

// ---- Auswertung ---------------------------------------------------------------------
/**
 * zellenProSpieler: { spielerId: [25 Codes] }.
 * Je Reihe bekommt der Beste so viele Reihenpunkte wie es Spieler gibt, der Nächste einen weniger ...
 * der Letzte 1; Gleichstand teilt sich den besseren Platz (wie beim einheitlichen Punktesystem).
 * Dazu kommt je Reihe der Bonus der Hand (Straße +1 ... Royal Flush +12), unabhängig vom Rang.
 * Rückgabe: { reihen: { spielerId: [{ reihe, hand, rang, punkte, bonus }] }, summe: { spielerId: n (inkl. Bonus) }, bonus: { spielerId: n }, rangfolge: [ids] }
 */
export function wertePokerduellAus(zellenProSpieler) {
  const ids = Object.keys(zellenProSpieler);
  const n = ids.length;
  const reihen = Object.fromEntries(ids.map((id) => [id, []]));
  const summe = Object.fromEntries(ids.map((id) => [id, 0]));
  const bonus = Object.fromEntries(ids.map((id) => [id, 0]));
  REIHEN.forEach((reihe) => {
    const haende = ids.map((id) => ({ id, hand: bewerteHand(reihe.zellen.map((z) => zellenProSpieler[id][z])) }));
    haende.sort((a, b) => vergleicheHaende(b.hand, a.hand));
    let rang = 1;
    haende.forEach((h, i) => {
      if (i > 0 && vergleicheHaende(haende[i - 1].hand, h.hand) !== 0) rang = i + 1;
      const punkte = n - rang + 1;
      reihen[h.id].push({ reihe: reihe.id, name: reihe.name, hand: h.hand, rang, punkte, bonus: h.hand.bonus });
      summe[h.id] += punkte + h.hand.bonus;
      bonus[h.id] += h.hand.bonus;
    });
  });
  const rangfolge = [...ids].sort((a, b) => summe[b] - summe[a]);
  return { reihen, summe, bonus, rangfolge };
}

// ---- Tausch --------------------------------------------------------------------------
/** Irgendwann zwischen der 11. und 20. Karte (Index 10-19) darf jeder einmal zwei Karten im eigenen Raster tauschen.
 *  Wahlrunden (zwei Karten zur Auswahl) werden ausgelassen, damit nie zwei Sonderregeln zusammenfallen. */
export function waehleTauschRunde(zufall = Math.random) {
  const kandidaten = [];
  for (let i = 10; i <= 19; i++) if (!istWahlRunde(i)) kandidaten.push(i);
  return kandidaten[Math.floor(zufall() * kandidaten.length)];
}

/** Gültiger Tausch: zwei verschiedene, belegte Felder. */
export function tauschGueltig(zellen, paar) {
  return Array.isArray(paar) && paar.length === 2 && paar[0] !== paar[1]
    && paar.every((i) => Number.isInteger(i) && i >= 0 && i < ZELLEN && zellen[i]);
}

/** Kopie des Rasters mit vertauschten Karten (bei ungültigem Tausch unverändert). */
export function tauscheZellen(zellen, paar) {
  const z = [...zellen];
  if (tauschGueltig(z, paar)) [z[paar[0]], z[paar[1]]] = [z[paar[1]], z[paar[0]]];
  return z;
}

/** Zellen eines Spielers aus der Liste der Züge ({ spielerId, zelle, karte, tausch? }); ein Tausch gilt vor dem Ablegen derselben Runde. */
export function zellenAusZuegen(zuege, spielerId) {
  let z = Array(ZELLEN).fill(null);
  zuege.filter((m) => m.spielerId === spielerId).sort((a, b) => a.rundenIndex - b.rundenIndex)
    .forEach((m) => {
      if (m.tausch) z = tauscheZellen(z, m.tausch);
      if (m.zelle >= 0 && m.zelle < ZELLEN && !z[m.zelle]) z[m.zelle] = m.karte;
    });
  return z;
}
