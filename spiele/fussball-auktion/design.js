// ============================================================================
//  Fußball-Auktion - Kartendesign ("Split × Neon Carbon")
// ----------------------------------------------------------------------------
//  Reine Design-Konfiguration (Farben pro Nation, Flaggen-Grafik, echte
//  Spielerbilder), getrennt von der Spiellogik (logik.js) und vom
//  DOM-Code (spiel.js) - gleiches Trennungsmuster wie im Rest des Projekts.
// ============================================================================

// Diagonal-Split-Farben pro Nation (angelehnt an die jeweilige Flagge, für den
// oberen Kartenbereich) plus eine Neon-Akzentfarbe für Rating-Kreis und
// Namens-Glow.
//
// flagSvg/flagViewBox zeichnen die ECHTE Flagge als Hintergrund hinter den
// Stats. Der Stats-Streifen ist sehr breit und flach (Kartenseitenverhältnis
// 3:4, Streifenhöhe 30% der Karte -> Streifen-Seitenverhältnis 2.5:1), jede
// Flagge ist aber deutlich "hochkantiger" (~1.5:1 bzw. 10:7 bei Brasilien).
// Damit beim Skalieren nichts abgeschnitten wird (z.B. die brasilianische
// Raute oder die spanischen roten Balken), bekommt JEDE Flagge ein
// gemeinsames, bereits 2.5:1-breites Außen-viewBox (0 0 30 12) und wird darin
// über wrapFlag() verkleinert (80% der Höhe) und zentriert eingebettet - der
// Rand bleibt transparent, die dunkle Verlaufs-Überlagerung (.fa-karte-statovl)
// scheint dort durch. Das macht die Flaggen zugleich etwas kleiner/weniger
// "gezoomt" und verhindert jedes Clipping, weil nichts mehr vom SVG-Viewport
// weggeschnitten wird.
const AUSSEN_VIEWBOX = "0 0 30 12";

function wrapFlag(breite, hoehe, inhalt) {
  const zielHoehe = 10.8; // 90% von 12 - jetzt als randloses Badge auf der Karte, volleres Bild
  const skala = zielHoehe / hoehe;
  const skalierteBreite = breite * skala;
  const x = (30 - skalierteBreite) / 2;
  const y = (12 - zielHoehe) / 2;
  return `<g transform="translate(${x.toFixed(3)},${y.toFixed(3)}) scale(${skala.toFixed(4)})">${inhalt}</g>`;
}

// Spanisches Wappen (stilisiert: gevierteltes Schild mit Burg/Löwen-Andeutung,
// Krone, zwei Säulen = Säulen des Herkules) - sitzt im gelben Streifen, leicht
// links von der Flaggenmitte (x=1.5), wie beim echten "Wappenflagge"-Muster.
const ES_WAPPEN = `
  <g>
    <rect x="0.56" y="0.64" width="0.1" height="0.72" rx="0.03" fill="#d4af37"/>
    <rect x="0.50" y="0.60" width="0.22" height="0.08" rx="0.02" fill="#d4af37"/>
    <rect x="0.50" y="1.30" width="0.22" height="0.08" rx="0.02" fill="#d4af37"/>
    <rect x="1.34" y="0.64" width="0.1" height="0.72" rx="0.03" fill="#d4af37"/>
    <rect x="1.28" y="0.60" width="0.22" height="0.08" rx="0.02" fill="#d4af37"/>
    <rect x="1.28" y="1.30" width="0.22" height="0.08" rx="0.02" fill="#d4af37"/>
    <path d="M 0.78 0.68 H 1.22 V 1.00 Q 1.22 1.22 1.00 1.30 Q 0.78 1.22 0.78 1.00 Z"
          fill="#f1bf00" stroke="#7a0f14" stroke-width="0.012"/>
    <path d="M 0.78 0.68 H 1.22 V 0.86 H 0.78 Z" fill="#aa151b"/>
    <path d="M 0.78 1.02 H 1.22 V 1.00 Q 1.22 1.14 1.08 1.22 L 0.92 1.22 Q 0.78 1.14 0.78 1.00 Z" fill="#aa151b"/>
    <rect x="0.80" y="0.70" width="0.07" height="0.1" fill="#f1bf00"/>
    <rect x="1.13" y="0.70" width="0.07" height="0.1" fill="#f1bf00"/>
    <circle cx="1.00" cy="1.11" r="0.045" fill="#f1bf00"/>
    <path d="M 0.70 0.66 Q 1.00 0.46 1.30 0.66 L 1.24 0.70 Q 1.00 0.56 0.76 0.70 Z" fill="#d4af37" stroke="#7a0f14" stroke-width="0.008"/>
    <circle cx="0.80" cy="0.52" r="0.035" fill="#d4af37"/>
    <circle cx="1.00" cy="0.47" r="0.04" fill="#d4af37"/>
    <circle cx="1.20" cy="0.52" r="0.035" fill="#d4af37"/>
    <rect x="0.74" y="0.60" width="0.52" height="0.07" rx="0.02" fill="#aa151b" stroke="#d4af37" stroke-width="0.012"/>
  </g>
`;

// Argentinische "Sol de Mayo" - Gesicht mit 16 abwechselnd geraden/
// geschwungenen Strahlen statt eines einfachen Kreises.
function argentinischeSonne() {
  let strahlen = "";
  for (let i = 0; i < 16; i++) {
    const winkel = i * 22.5;
    const gerade = i % 2 === 0;
    const form = gerade
      ? '<polygon points="1.415,0.80 1.585,0.80 1.5,0.54" fill="#F6B40E" stroke="#85540A" stroke-width="0.012"/>'
      : '<path d="M1.46,0.805 C1.435,0.72 1.45,0.62 1.5,0.545 C1.55,0.62 1.565,0.72 1.54,0.805 Z" fill="#F6B40E" stroke="#85540A" stroke-width="0.012"/>';
    strahlen += `<g transform="rotate(${winkel} 1.5 1)">${form}</g>`;
  }
  return (
    `<g>${strahlen}` +
    `<circle cx="1.5" cy="1" r="0.2" fill="#F6B40E" stroke="#85540A" stroke-width="0.025"/>` +
    `<circle cx="1.44" cy="0.95" r="0.022" fill="#85540A"/>` +
    `<circle cx="1.56" cy="0.95" r="0.022" fill="#85540A"/>` +
    `<path d="M1.46,1.04 Q1.5,1.08 1.54,1.04" stroke="#85540A" stroke-width="0.02" fill="none" stroke-linecap="round"/>` +
    `</g>`
  );
}

export const NATION_DESIGN = {
  Deutschland: {
    top: "#1a1a1a", mid: "#dd0000", bottom: "#1a1a1a", akzent: "#ffd700", flagge: "🇩🇪",
    flagViewBox: AUSSEN_VIEWBOX,
    flagSvg: wrapFlag(5, 3,
      '<rect width="5" height="1" y="0" fill="#1a1a1a"/><rect width="5" height="1" y="1" fill="#dd0000"/><rect width="5" height="1" y="2" fill="#ffce00"/>'
    )
  },
  Brasilien: {
    top: "#046A38", mid: "#ffcc29", bottom: "#002776", akzent: "#ffea00", flagge: "🇧🇷",
    flagViewBox: AUSSEN_VIEWBOX,
    flagSvg: wrapFlag(10, 7,
      '<rect width="10" height="7" fill="#046A38"/><polygon points="5,0.7 9.3,3.5 5,6.3 0.7,3.5" fill="#FEDD00"/><circle cx="5" cy="3.5" r="1.7" fill="#002776"/>'
    )
  },
  Argentinien: {
    top: "#6CACE4", mid: "#ffffff", bottom: "#6CACE4", akzent: "#85c7f2", flagge: "🇦🇷",
    flagViewBox: AUSSEN_VIEWBOX,
    flagSvg: wrapFlag(3, 2,
      '<rect width="3" height="2" fill="#6CACE4"/><rect width="3" height="0.667" y="0.667" fill="#ffffff"/>' + argentinischeSonne()
    )
  },
  Frankreich: {
    top: "#0055A4", mid: "#ffffff", bottom: "#EF4135", akzent: "#2979ff", flagge: "🇫🇷",
    flagViewBox: AUSSEN_VIEWBOX,
    flagSvg: wrapFlag(3, 2,
      '<rect width="1" height="2" x="0" fill="#0055A4"/><rect width="1" height="2" x="1" fill="#ffffff"/><rect width="1" height="2" x="2" fill="#EF4135"/>'
    )
  },
  Italien: {
    top: "#046A38", mid: "#f4f4f0", bottom: "#ce2b37", akzent: "#00ff88", flagge: "🇮🇹",
    flagViewBox: AUSSEN_VIEWBOX,
    flagSvg: wrapFlag(3, 2,
      '<rect width="1" height="2" x="0" fill="#046A38"/><rect width="1" height="2" x="1" fill="#f4f4f0"/><rect width="1" height="2" x="2" fill="#CE2B37"/>'
    )
  },
  Japan: {
    top: "#f2f0ea", mid: "#bc002d", bottom: "#8a0020", akzent: "#ff1744", flagge: "🇯🇵",
    flagViewBox: AUSSEN_VIEWBOX,
    flagSvg: wrapFlag(3, 2,
      '<rect width="3" height="2" fill="#f2f0ea"/><circle cx="1.5" cy="1" r="0.6" fill="#bc002d"/>'
    )
  },
  Nigeria: {
    top: "#008751", mid: "#eafff2", bottom: "#004d2a", akzent: "#00e676", flagge: "🇳🇬",
    flagViewBox: AUSSEN_VIEWBOX,
    flagSvg: wrapFlag(3, 2,
      '<rect width="1" height="2" x="0" fill="#008751"/><rect width="1" height="2" x="1" fill="#ffffff"/><rect width="1" height="2" x="2" fill="#008751"/>'
    )
  },
  Spanien: {
    top: "#aa151b", mid: "#f1bf00", bottom: "#7a0f14", akzent: "#f1bf00", flagge: "🇪🇸",
    flagViewBox: AUSSEN_VIEWBOX,
    flagSvg: wrapFlag(3, 2,
      '<rect width="3" height="2" fill="#AA151B"/><rect width="3" height="1" y="0.5" fill="#F1BF00"/>' + ES_WAPPEN
    )
  }
};

const STANDARD_DESIGN = {
  top: "#1e293b", mid: "#334155", bottom: "#0f172a", akzent: "#38bdf8", flagge: "🏳️",
  flagViewBox: AUSSEN_VIEWBOX,
  flagSvg: wrapFlag(3, 2,
    '<rect width="1" height="2" x="0" fill="#1e293b"/><rect width="1" height="2" x="1" fill="#334155"/><rect width="1" height="2" x="2" fill="#0f172a"/>'
  )
};

export function nationDesign(nation) {
  return NATION_DESIGN[nation] ?? STANDARD_DESIGN;
}

// Echte Spielerbilder (freigestellter Cutout statt Silhouette), pro Karten-ID.
// Alle Karten, die hier NICHT eingetragen sind, bekommen automatisch die
// gezeichnete Platzhalter-Silhouette (siehe kartenPortraitHtml in spiel.js).
export const PORTRAET_BILDER = {
  "it-1": "bilder/fussball-auktion/spieler-it-1.png?v=237",
  "it-2": "bilder/fussball-auktion/spieler-it-2.png?v=237",
  "it-3": "bilder/fussball-auktion/spieler-it-3.png?v=237",
  "it-4": "bilder/fussball-auktion/spieler-it-4.png?v=237",
  "it-5": "bilder/fussball-auktion/spieler-it-5.png?v=237",
  "jp-1": "bilder/fussball-auktion/spieler-jp-1.png?v=236",
  "jp-2": "bilder/fussball-auktion/spieler-jp-2.png?v=238",
  "jp-3": "bilder/fussball-auktion/spieler-jp-3.png?v=236",
  "jp-4": "bilder/fussball-auktion/spieler-jp-4.png?v=236",
  "jp-5": "bilder/fussball-auktion/spieler-jp-5.png?v=236",
  "ar-1": "bilder/fussball-auktion/spieler-ar-1.png?v=236",
  "ar-2": "bilder/fussball-auktion/spieler-ar-2.png?v=236",
  "ar-3": "bilder/fussball-auktion/spieler-ar-3.png?v=236",
  "ar-4": "bilder/fussball-auktion/spieler-ar-4.png?v=236",
  "ar-5": "bilder/fussball-auktion/spieler-ar-5.png?v=236",
  "fr-1": "bilder/fussball-auktion/spieler-fr-1.png?v=236",
  "fr-2": "bilder/fussball-auktion/spieler-fr-2.png?v=236",
  "fr-3": "bilder/fussball-auktion/spieler-fr-3.png?v=236",
  "fr-4": "bilder/fussball-auktion/spieler-fr-4.png?v=236",
  "fr-5": "bilder/fussball-auktion/spieler-fr-5.png?v=236"
};

// Manche Porträts sind (je nach Bildausschnitt) von Natur aus breiter als
// andere und ragen dadurch mit dem Kopf zu weit nach rechts in Richtung des
// Flaggen-Badges hinein. Pro Karten-ID lässt sich hier zusätzlich zur
// Standardposition (siehe .fa-karte-portrait in stil.css) ein zusätzlicher
// Versatz nach links angeben, in Prozentpunkten der Kartenbreite.
export const PORTRAET_VERSATZ = {
  "it-1": 14,
  "it-2": 15,
  "it-4": 19,
  "it-5": 14,
  "jp-3": 21,
  "jp-4": 19,
  "jp-5": 14,
  "ar-1": -5,
  "fr-2": 12,
  "fr-3": 21
};

// Porträts mit einem sehr BREITEN Bildausschnitt (Seitenverhältnis > 1.2,
// z.B. Oberkörper mit verschränkten Armen) werden bei fixer Standardhöhe
// (siehe .fa-karte-portrait in stil.css) breiter als die Karte selbst und
// werden dadurch links und/oder rechts abgeschnitten (z.B. Ellbogen). Pro
// Karten-ID lässt sich hier die Höhe etwas REDUZIEREN (in Prozentpunkten
// relativ zur Standardhöhe aus stil.css), damit das ganze Bild in die Karte
// passt, plus ein passender Bottom-Versatz, damit der Kopf trotzdem auf
// Höhe des Flaggen-Badges bleibt.
export const PORTRAET_GROESSE = {
  "jp-2": { hoehe: 56, unten: 21 },
  "jp-3": { hoehe: 68 },
  "ar-3": { hoehe: 54, unten: 23 },
  "ar-5": { hoehe: 54, unten: 21 },
  "it-3": { hoehe: 52, unten: 25 }
};
