// ============================================================================
//  Doppelkopf - Kartengrafik (alles selbst als SVG gezeichnet, keine fremden Bilder)
// ----------------------------------------------------------------------------
//  Klassisches Blatt mit französischen Farben: cremefarbene Karte, Eckindex
//  (9, 10, B, D, K, A) mit Farbzeichen, Zahlenkarten mit Farbzeichen, Bube /
//  Dame / König als bunte Doppelfiguren.
// ============================================================================
const ROT = "#c62828";
const SCHWARZ = "#1f1f24";
const FARB_ROT = { H: true, D: true };
const INDEX = { 9: "9", T: "10", J: "B", Q: "D", K: "K", A: "A" };

// Farbzeichen, jeweils um (0,0) zentriert, ca. 26 x 26 Einheiten groß
function zeichen(farbe) {
  const f = FARB_ROT[farbe] ? ROT : SCHWARZ;
  switch (farbe) {
    case "H": return `<path fill="${f}" d="M0 11 C-17 -1 -12 -12 -5.5 -12 C-2.5 -12 0 -9.5 0 -6.5 C0 -9.5 2.5 -12 5.5 -12 C12 -12 17 -1 0 11Z"/>`;
    case "D": return `<path fill="${f}" d="M0 -13 L10 0 L0 13 L-10 0Z"/>`;
    case "S": return `<path fill="${f}" d="M0 -13 C-4 -5 -14 -3 -14 4 C-14 9.500 -6.500 10.500 -3.500 6 C-3.500 10 -4.500 12 -7 13.500 L7 13.500 C4.500 12 3.500 10 3.500 6 C6.500 10.500 14 9.500 14 4 C14 -3 4 -5 0 -13Z"/>`;
    default: return `<g fill="${f}"><circle cx="0" cy="-6.500" r="6"/><circle cx="-7" cy="3.500" r="6"/><circle cx="7" cy="3.500" r="6"/><path d="M-1.500 3 L-4 13.500 L4 13.500 L1.500 3Z"/></g>`;
  }
}
const pip = (farbe, x, y, s = 1, drehen = false) =>
  `<g transform="translate(${x} ${y}) scale(${s}) ${drehen ? "rotate(180)" : ""}">${zeichen(farbe)}</g>`;

// Pip-Positionen für 9 und 10 (x, y, gedreht)
const PIPS = {
  9: [[34, 36, 0], [34, 62, 0], [34, 88, 1], [34, 114, 1], [66, 36, 0], [66, 62, 0], [66, 88, 1], [66, 114, 1], [50, 75, 0]],
  T: [[34, 36, 0], [34, 62, 0], [34, 88, 1], [34, 114, 1], [66, 36, 0], [66, 62, 0], [66, 88, 1], [66, 114, 1], [50, 49, 0], [50, 101, 1]]
};

const FIGUR_FARBEN = {
  C: { main: "#2f7d4b", hell: "#d8ecdc", akzent: "#f2c230" },
  S: { main: "#2f5fa8", hell: "#d9e5f6", akzent: "#f2c230" },
  H: { main: "#c0392b", hell: "#f7dcd8", akzent: "#f2c230" },
  D: { main: "#e09a14", hell: "#fbecc6", akzent: "#c0392b" }
};
const HAUT = "#f3c9a0";
const LINIE = 'stroke="#2b2b2b" stroke-width=".7" stroke-linejoin="round"';

// Obere Hälfte einer Figur (Karten-Koordinaten, y von 14 bis 75); die untere
// Hälfte ist dieselbe Figur um 180° gedreht.
function figurHaelfte(rang, farbe) {
  const c = FIGUR_FARBEN[farbe];
  let s = "";
  if (rang === "Q") {
    // lange Haare hinter dem Kopf
    s += `<path ${LINIE} fill="#a0602a" d="M40 30 Q38 21 50 21 Q62 21 60 30 L63 55 Q57 53 57.500 45 L42.500 45 Q43 53 37 55Z"/>`;
  }
  // Oberkörper
  s += `<path ${LINIE} fill="${c.main}" d="M27 75 L29 58 Q33 49 43 47 L57 47 Q67 49 71 58 L73 75Z"/>`;
  if (rang === "K") {
    s += `<path ${LINIE} fill="#fff" d="M37 47.500 Q50 60 63 47.500 L67 53 Q50 68 33 53Z"/>`;
    s += `<g fill="#222"><circle cx="40" cy="55" r=".8"/><circle cx="47" cy="60" r=".8"/><circle cx="53" cy="60" r=".8"/><circle cx="60" cy="55" r=".8"/></g>`;
  } else if (rang === "Q") {
    s += `<path fill="none" stroke="${c.akzent}" stroke-width="1.600" d="M41 49 Q50 60 59 49"/>`;
    s += `<path ${LINIE} fill="${c.akzent}" d="M43 70 L50 62 L57 70Z"/>`;
  } else {
    s += `<path fill="${c.akzent}" d="M29 66 L71 54 L72 60 L29 72Z" opacity=".95"/>`;
  }
  // Hals und Kopf
  s += `<rect ${LINIE} x="46" y="42" width="8" height="7" fill="${HAUT}"/>`;
  s += `<ellipse ${LINIE} cx="50" cy="34" rx="8.500" ry="10" fill="${HAUT}"/>`;
  s += `<g fill="#222"><circle cx="46.500" cy="33" r=".9"/><circle cx="53.500" cy="33" r=".9"/></g>`;
  s += `<path fill="none" stroke="#8a3b2b" stroke-width=".7" d="M47.500 39 Q50 40.500 52.500 39"/>`;
  if (rang === "K") {
    s += `<path ${LINIE} fill="#6b4a2b" d="M41.500 34 Q40 24 50 23.500 Q60 24 58.500 34 Q56 28 50 28 Q44 28 41.500 34Z"/>`;
    s += `<path ${LINIE} fill="#8a6a3d" d="M41.500 36 Q50 54 58.500 36 Q55 44 50 44 Q45 44 41.500 36Z"/>`;
    s += `<path ${LINIE} fill="${c.akzent}" d="M40.500 25 L41.500 14.500 L46 20 L50 13 L54 20 L58.500 14.500 L59.500 25Z"/>`;
    s += `<circle cx="50" cy="22.500" r="1.300" fill="${ROT}"/>`;
    s += `<path stroke="#7a6a4a" stroke-width="2" d="M70 75 L69 40"/><circle cx="69" cy="38" r="3" fill="${c.akzent}" ${LINIE}/>`;
  } else if (rang === "Q") {
    s += `<path ${LINIE} fill="#a0602a" d="M41 33 Q41 24 50 24 Q59 24 59 33 Q55 28 50 28 Q45 28 41 33Z"/>`;
    s += `<path ${LINIE} fill="${c.akzent}" d="M43.500 25 L44.500 19 L47.500 22 L50 17.500 L52.500 22 L55.500 19 L56.500 25Z"/>`;
    s += `<path stroke="#3a7a2b" stroke-width="1.200" d="M66 75 L66 58"/><circle cx="66" cy="55.500" r="3.200" fill="#e86a9b" ${LINIE}/><circle cx="66" cy="55.500" r="1" fill="#f6d24a"/>`;
  } else {
    s += `<path ${LINIE} fill="#6b4a2b" d="M41.500 34 Q40 27 50 26 Q60 27 58.500 34 Q56 29.500 50 29.500 Q44 29.500 41.500 34Z"/>`;
    s += `<path ${LINIE} fill="${c.main}" d="M38.500 28.500 Q39 15 52 16.500 Q63 18 61.500 28.500 Q50 23 38.500 28.500Z"/>`;
    s += `<path ${LINIE} fill="${c.akzent}" d="M56 19 Q70 8 67 27 Q65 17 57 22Z"/>`;
    s += `<path stroke="#8a8f98" stroke-width="1.800" d="M69 75 L67 36"/><path ${LINIE} fill="#b8bec9" d="M67 36 L64.500 41 L69.500 41Z"/>`;
  }
  s += `<g transform="translate(33 26) scale(.46)">${zeichen(farbe)}</g>`;
  return s;
}

function figurKarte(rang, farbe) {
  const c = FIGUR_FARBEN[farbe];
  const h = figurHaelfte(rang, farbe);
  return `<rect x="25" y="13.500" width="50" height="123" rx="2" fill="${c.hell}" stroke="#2b2b2b" stroke-width=".8"/>` +
    `<line x1="25" y1="75" x2="75" y2="75" stroke="#2b2b2b" stroke-width=".5" opacity=".5"/>` +
    `<svg x="25" y="13.500" width="50" height="61.500" viewBox="25 13.500 50 61.500" overflow="hidden">${h}</svg>` +
    `<g transform="rotate(180 50 75)"><svg x="25" y="13.500" width="50" height="61.500" viewBox="25 13.500 50 61.500" overflow="hidden">${h}</svg></g>`;
}

function index(rang, farbe) {
  const f = FARB_ROT[farbe] ? ROT : SCHWARZ;
  const txt = INDEX[rang];
  const groesse = txt.length > 1 ? 14 : 17;
  const one = `<text x="11.500" y="${txt.length > 1 ? 19 : 20}" font-family="Georgia, 'Times New Roman', serif" font-weight="700" font-size="${groesse}" text-anchor="middle" fill="${f}">${txt}</text>` +
    pip(farbe, 11.500, 33, .5);
  return one + `<g transform="rotate(180 50 75)">${one}</g>`;
}

const cache = new Map();
/** Karten-ID wie "HT0" -> SVG-Text (Seitenverhältnis 2:3) */
export function kartenSvg(id) {
  const farbe = id[0], rang = id[1];
  if (cache.has(id)) return cache.get(id);
  let mitte = "";
  if (rang === "A") mitte = pip(farbe, 50, 75, 2.300);
  else if (rang === "9" || rang === "T") {
    mitte = PIPS[rang].map(([x, y, d]) => pip(farbe, x, y, .66, Boolean(d))).join("");
  } else mitte = figurKarte(rang, farbe);
  const svg = `<svg class="dk-karte-svg" viewBox="0 0 100 150" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${farbe}${rang}">` +
    `<rect x=".6" y=".6" width="98.800" height="148.800" rx="8" fill="#fbf6e6" stroke="#8c8574" stroke-width="1.200"/>` +
    index(rang, farbe) + mitte + `</svg>`;
  cache.set(id, svg);
  return svg;
}

export function rueckSvg() {
  return `<svg class="dk-karte-svg" viewBox="0 0 100 150" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">` +
    `<rect x=".6" y=".6" width="98.800" height="148.800" rx="8" fill="#fbf6e6" stroke="#8c8574" stroke-width="1.200"/>` +
    `<rect x="7" y="7" width="86" height="136" rx="5" fill="#2f4a8a"/>` +
    `<rect x="12" y="12" width="76" height="126" rx="3" fill="none" stroke="#e8d28a" stroke-width="1.200"/>` +
    `<path d="M50 30 L72 75 L50 120 L28 75Z" fill="none" stroke="#e8d28a" stroke-width="1.400"/>` +
    `<path d="M50 48 L62 75 L50 102 L38 75Z" fill="#e8d28a" opacity=".85"/></svg>`;
}
