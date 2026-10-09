// ============================================================================
//  Doppelkopf - Kartengrafik (alles selbst als SVG gezeichnet, keine fremden Bilder)
// ----------------------------------------------------------------------------
//  Klassisches Blatt mit französischen Farben: cremefarbene Karte, Eckindex
//  (9, 10, B, D, K, A) mit Farbzeichen, Zahlenkarten mit Farbzeichen, Bube /
//  Dame / König als bunte Doppelfiguren (Anlehnung an den Stil klassischer
//  deutsch-französischer Blätter, aber eigene Zeichnung).
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
  C: { main: "#2e7d4a", zweit: "#f2c230", hell: "#e3f0e4", dunkel: "#1d5a33" },
  S: { main: "#2f5fa8", zweit: "#d9423a", hell: "#e0e9f7", dunkel: "#1d3f78" },
  H: { main: "#c8382b", zweit: "#2f5fa8", hell: "#f9e1dc", dunkel: "#8f2219" },
  D: { main: "#e3a11b", zweit: "#2f6fb5", hell: "#fbefcc", dunkel: "#a8700a" }
};
const HAUT = "#f3c9a0";
const GOLD = "#f2c230";
const GOLD_DUNKEL = "#b8860b";
const LINIE = 'stroke="#2b2b2b" stroke-width=".7" stroke-linejoin="round"';
const DUENN = 'stroke="#2b2b2b" stroke-width=".4" stroke-linejoin="round"';

// Halskrause aus kleinen Rundungen
function krause(y = 48.500) {
  let s = "";
  for (let i = 0; i < 7; i++) s += `<circle cx="${37.5 + i * 4.2}" cy="${y}" r="3" fill="#fff" ${DUENN}/>`;
  return s;
}

// Gesicht (Augen, Brauen, Nase, Mund, Wangen) um Mittelpunkt (50, 33)
function gesicht(dame) {
  return `<ellipse ${LINIE} cx="50" cy="33" rx="8.300" ry="9.800" fill="${HAUT}"/>` +
    `<circle cx="44.600" cy="36.200" r="1.800" fill="#e8806a" opacity=".45"/><circle cx="55.400" cy="36.200" r="1.800" fill="#e8806a" opacity=".45"/>` +
    `<ellipse cx="46.300" cy="32.500" rx="1.600" ry=".9" fill="#fff" ${DUENN}/><ellipse cx="53.700" cy="32.500" rx="1.600" ry=".9" fill="#fff" ${DUENN}/>` +
    `<circle cx="46.500" cy="32.500" r=".65" fill="#222"/><circle cx="53.500" cy="32.500" r=".65" fill="#222"/>` +
    `<path fill="none" stroke="#3a2a1a" stroke-width="${dame ? ".5" : ".8"}" d="M44 30.200 Q46.300 28.800 48.500 30M51.500 30 Q53.700 28.800 56 30.200"/>` +
    (dame ? `<path fill="none" stroke="#222" stroke-width=".5" d="M44.600 31.600 L43.500 31M55.400 31.600 L56.500 31"/>` : "") +
    `<path fill="none" stroke="#8a5a40" stroke-width=".6" d="M50 33 L49 36.800 Q50 37.500 51.200 36.800"/>` +
    `<path fill="${dame ? "#c43a4a" : "#a8402e"}" d="M47.200 39.500 Q50 38.600 52.800 39.500 Q50 41.600 47.200 39.500Z"/>`;
}

// Obere Hälfte einer Figur (Karten-Koordinaten, y von 14 bis 75); die untere
// Hälfte ist dieselbe Figur um 180° gedreht.
function figurHaelfte(rang, farbe) {
  const c = FIGUR_FARBEN[farbe];
  let s = "";
  // Hinterkopf-Haar / Mantel (hinter dem Körper)
  if (rang === "Q") s += `<path ${LINIE} fill="#c98a3a" d="M40 31 Q38 20 50 20 Q62 20 60 31 L64 58 Q57 56 57 46 L43 46 Q43 56 36 58Z"/>`;
  if (rang === "K") s += `<path ${LINIE} fill="#8a6a3d" d="M40 30 Q38 20 50 20 Q62 20 60 30 L63 48 L37 48Z"/>`;
  // Arme + Schmuckstück (hinter dem Körper)
  if (rang === "K") {
    s += `<path stroke="#7a5a2a" stroke-width="1.600" d="M71 75 L70 38"/>`;
    s += `<circle cx="70" cy="35.500" r="3.200" fill="${GOLD}" ${LINIE}/><path stroke="${GOLD_DUNKEL}" stroke-width="1" d="M70 32 L70 27M67.800 29.500 L72.200 29.500"/>`;
  } else if (rang === "J") {
    s += `<path ${LINIE} fill="#cfd5de" d="M71 20 L73 20 L73 58 L71 58Z"/><path ${LINIE} fill="${GOLD}" d="M67.500 58 L76.500 58 L76.500 60.500 L67.500 60.500Z"/><path ${LINIE} fill="${GOLD_DUNKEL}" d="M70.500 60.500 L73.500 60.500 L73.500 70 L70.500 70Z"/>`;
  } else {
    s += `<path stroke="#3a7a2b" stroke-width="1.200" d="M29 75 L30 52"/><path stroke="#3a7a2b" stroke-width="1" d="M30 62 Q25 58 24 55 Q28 55 30 60"/>` +
      `<g fill="#e86a9b" ${DUENN}><circle cx="30" cy="49" r="2.400"/><circle cx="27.600" cy="51" r="2.400"/><circle cx="32.400" cy="51" r="2.400"/><circle cx="28.500" cy="47.500" r="2.200"/><circle cx="31.500" cy="47.500" r="2.200"/></g><circle cx="30" cy="49.500" r="1.200" fill="${GOLD}"/>`;
  }
  // Oberkörper, geviertelt (links Hauptfarbe, rechts Zweitfarbe)
  s += `<path ${LINIE} fill="${c.main}" d="M25 75 L27 60 Q30 50 41 48 L50 48 L50 75Z"/>`;
  s += `<path ${LINIE} fill="${c.zweit}" d="M50 48 L59 48 Q70 50 73 60 L75 75 L50 75Z"/>`;
  // Muster auf dem Gewand
  if (rang === "Q") {
    s += `<path fill="none" stroke="${GOLD}" stroke-width=".7" d="M31 56 L36 62 L31 68M36 56 L41 62 L36 68M41 56 L46 62 L41 68"/>`;
    s += `<path fill="none" stroke="#fff" stroke-width=".7" d="M69 56 L64 62 L69 68M64 56 L59 62 L64 68M59 56 L54 62 L59 68"/>`;
  } else if (rang === "J") {
    s += `<path fill="none" stroke="${c.zweit}" stroke-width="1.600" d="M28 64 L47 64M29 70 L47 70"/><path fill="none" stroke="${c.main}" stroke-width="1.600" d="M53 64 L72 64M53 70 L71 70"/>`;
  }
  s += `<rect x="25" y="70.500" width="50" height="2.400" fill="${GOLD}" opacity=".95"/>`;
  s += `<g fill="${GOLD_DUNKEL}">` + [54, 59, 64].map((y) => `<circle cx="50" cy="${y}" r="1"/>`).join("") + `</g>`;
  if (rang === "K") {
    // Hermelinkragen mit Schwänzchen
    s += `<path ${LINIE} fill="#fff" d="M34 49 Q50 66 66 49 L71 56 Q50 76 29 56Z"/>`;
    s += `<g fill="#222">` + [[37, 57], [42, 63], [50, 66.500], [58, 63], [63, 57]].map(([x, y]) => `<path d="M${x} ${y} l-.7 2.600 l1.400 0Z"/>`).join("") + `</g>`;
  }
  // Hände
  if (rang === "K") s += `<circle cx="70.500" cy="58" r="2.700" fill="${HAUT}" ${LINIE}/>`;
  else if (rang === "J") s += `<circle cx="72" cy="66" r="2.700" fill="${HAUT}" ${LINIE}/>`;
  else s += `<circle cx="29.500" cy="60" r="2.700" fill="${HAUT}" ${LINIE}/>`;
  // Hals + Krause
  s += `<rect ${LINIE} x="46" y="41" width="8" height="8" fill="${HAUT}"/>`;
  if (rang === "Q") {
    s += `<g fill="#f4efe0" ${DUENN}>` + [0, 1, 2, 3, 4, 5, 6].map((i) => `<circle cx="${40 + i * 3.340}" cy="${48.500 + Math.sin((i / 6) * Math.PI) * 3.500}" r="1.300"/>`).join("") + `</g>`;
  } else s += krause(rang === "K" ? 49.500 : 48.500);
  // Kopf
  s += gesicht(rang === "Q");
  if (rang === "K") {
    s += `<path ${LINIE} fill="#9a7a4a" d="M41.500 34 Q40.500 46 50 51 Q59.500 46 58.500 34 Q56 39 53 38.800 Q50 37.600 47 38.800 Q44 39 41.500 34Z"/>`;
    s += `<path fill="none" stroke="#6b4a2b" stroke-width=".4" d="M44 41 Q45 46 47 48M56 41 Q55 46 53 48M50 42 L50 49"/>`;
    s += `<path ${LINIE} fill="#9a7a4a" d="M45 38 Q47.500 36.500 50 38 Q52.500 36.500 55 38 Q52.500 40 50 38.700 Q47.500 40 45 38Z"/>`;
    // Krone
    s += `<path ${LINIE} fill="#a8201e" d="M41 27 Q41 19 50 19 Q59 19 59 27Z"/>`;
    s += `<path ${LINIE} fill="${GOLD}" d="M39.500 27.500 L38.500 14.500 L44.500 20.500 L50 13 L55.500 20.500 L61.500 14.500 L60.500 27.500Z"/>`;
    s += `<rect x="39.500" y="24.500" width="21" height="3.200" fill="${GOLD_DUNKEL}" ${DUENN}/>`;
    s += `<g fill="#fff" ${DUENN}><circle cx="38.500" cy="14" r="1.300"/><circle cx="50" cy="12.500" r="1.400"/><circle cx="61.500" cy="14" r="1.300"/></g>`;
    s += `<g ${DUENN}><circle cx="44.500" cy="26" r="1" fill="#d9423a"/><circle cx="50" cy="26" r="1.100" fill="#2f6fb5"/><circle cx="55.500" cy="26" r="1" fill="#d9423a"/></g>`;
  } else if (rang === "Q") {
    s += `<path ${LINIE} fill="#c98a3a" d="M41 33 Q40 23.500 50 23 Q60 23.500 59 33 Q56 27.500 50 27.500 Q44 27.500 41 33Z"/>`;
    s += `<path ${LINIE} fill="${GOLD}" d="M42.500 25.500 L42.500 17.500 L46.500 21.500 L50 15.500 L53.500 21.500 L57.500 17.500 L57.500 25.500Z"/>`;
    s += `<g fill="#fff" ${DUENN}><circle cx="42.500" cy="17" r="1.100"/><circle cx="50" cy="15" r="1.200"/><circle cx="57.500" cy="17" r="1.100"/></g>`;
    s += `<circle cx="50" cy="23" r="1.200" fill="#2f6fb5" ${DUENN}/>`;
  } else {
    s += `<path ${LINIE} fill="#7a4a22" d="M40.500 36 Q38.500 26 50 25 Q61.500 26 59.500 36 Q57 29.500 50 29.500 Q43 29.500 40.500 36Z"/>`;
    // Barett mit Feder
    s += `<path ${LINIE} fill="${c.main}" d="M37 28.500 Q36 20 48 16.500 Q62 15 63 28.500 Q50 23.500 37 28.500Z"/>`;
    s += `<path ${LINIE} fill="${c.zweit}" d="M37 28.500 Q50 24 63 28.500 L63 30.500 Q50 26 37 30.500Z"/>`;
    s += `<path ${LINIE} fill="#fff" d="M56 19 Q74 6 71 26 Q68 15 58 22Z"/>`;
    s += `<path fill="none" stroke="#b8bec9" stroke-width=".5" d="M58 20.500 Q68 12 70 22"/>`;
    s += `<circle cx="39.500" cy="29" r="1.200" fill="${GOLD}" ${DUENN}/>`;
  }
  s += `<g transform="translate(33 27) scale(.44)">${zeichen(farbe)}</g>`;
  return s;
}

function figurKarte(rang, farbe) {
  const c = FIGUR_FARBEN[farbe];
  const h = figurHaelfte(rang, farbe);
  return `<rect x="23" y="12.500" width="54" height="125" rx="2" fill="${GOLD}" stroke="#2b2b2b" stroke-width=".8"/>` +
    `<rect x="24.600" y="14.100" width="50.800" height="121.800" rx="1.200" fill="${c.hell}" stroke="${c.dunkel}" stroke-width=".6"/>` +
    `<svg x="24.600" y="14.100" width="50.800" height="60.900" viewBox="24.600 14.100 50.800 60.900" overflow="hidden">${h}</svg>` +
    `<g transform="rotate(180 50 75)"><svg x="24.600" y="14.100" width="50.800" height="60.900" viewBox="24.600 14.100 50.800 60.900" overflow="hidden">${h}</svg></g>` +
    `<line x1="24.600" y1="75" x2="75.400" y2="75" stroke="${c.dunkel}" stroke-width=".9"/>`;
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
