// ============================================================================
//  Länderspiel - Kartendesign ("Split × Neon Carbon")
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

// Fünfzackiger Stern der türkischen Flagge (Mitte bei x=1.62, y=1).
function tuerkischerStern() {
  const cx = 1.62, cy = 1, R = 0.2, r = 0.08;
  const punkte = [];
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 === 0 ? R : r;
    const w = (-90 + i * 36) * Math.PI / 180;
    punkte.push(`${(cx + rad * Math.cos(w)).toFixed(3)},${(cy + rad * Math.sin(w)).toFixed(3)}`);
  }
  return `<polygon points="${punkte.join(" ")}" fill="#ffffff"/>`;
}

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
    top: "#1a1a1a", mid: "#dd0000", bottom: "#ffce00", akzent: "#ffd700", flagge: "🇩🇪",
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
  "Türkei": {
    top: "#e30a17", mid: "#ffffff", bottom: "#a8070f", akzent: "#ff3b47", flagge: "🇹🇷",
    flagViewBox: AUSSEN_VIEWBOX,
    flagSvg: wrapFlag(3, 2,
      '<rect width="3" height="2" fill="#e30a17"/><circle cx="1.08" cy="1" r="0.5" fill="#ffffff"/><circle cx="1.22" cy="1" r="0.4" fill="#e30a17"/>' + tuerkischerStern()
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
  "de-1": "bilder/fussball-auktion/spieler-de-1.png?v=255",
  "de-2": "bilder/fussball-auktion/spieler-de-2.png?v=255",
  "de-3": "bilder/fussball-auktion/spieler-de-3.png?v=255",
  "de-4": "bilder/fussball-auktion/spieler-de-4.png?v=255",
  "de-5": "bilder/fussball-auktion/spieler-de-5.png?v=255",
  "it-1": "bilder/fussball-auktion/spieler-it-1.png?v=255",
  "it-2": "bilder/fussball-auktion/spieler-it-2.png?v=255",
  "it-3": "bilder/fussball-auktion/spieler-it-3.png?v=255",
  "it-4": "bilder/fussball-auktion/spieler-it-4.png?v=255",
  "it-5": "bilder/fussball-auktion/spieler-it-5.png?v=255",
  "jp-1": "bilder/fussball-auktion/spieler-jp-1.png?v=255",
  "jp-2": "bilder/fussball-auktion/spieler-jp-2.png?v=255",
  "jp-3": "bilder/fussball-auktion/spieler-jp-3.png?v=255",
  "jp-4": "bilder/fussball-auktion/spieler-jp-4.png?v=255",
  "jp-5": "bilder/fussball-auktion/spieler-jp-5.png?v=255",
  "ar-1": "bilder/fussball-auktion/spieler-ar-1.png?v=255",
  "ar-2": "bilder/fussball-auktion/spieler-ar-2.png?v=255",
  "ar-3": "bilder/fussball-auktion/spieler-ar-3.png?v=255",
  "ar-4": "bilder/fussball-auktion/spieler-ar-4.png?v=255",
  "ar-5": "bilder/fussball-auktion/spieler-ar-5.png?v=255",
  "fr-1": "bilder/fussball-auktion/spieler-fr-1.png?v=255",
  "fr-2": "bilder/fussball-auktion/spieler-fr-2.png?v=255",
  "fr-3": "bilder/fussball-auktion/spieler-fr-3.png?v=255",
  "fr-4": "bilder/fussball-auktion/spieler-fr-4.png?v=255",
  "fr-5": "bilder/fussball-auktion/spieler-fr-5.png?v=255",
  "ng-1": "bilder/fussball-auktion/spieler-ng-1.png?v=255",
  "ng-2": "bilder/fussball-auktion/spieler-ng-2.png?v=255",
  "ng-3": "bilder/fussball-auktion/spieler-ng-3.png?v=255",
  "ng-4": "bilder/fussball-auktion/spieler-ng-4.png?v=255",
  "ng-5": "bilder/fussball-auktion/spieler-ng-5.png?v=255",
  "br-1": "bilder/fussball-auktion/spieler-br-1.png?v=255",
  "br-2": "bilder/fussball-auktion/spieler-br-2.png?v=255",
  "br-3": "bilder/fussball-auktion/spieler-br-3.png?v=255",
  "br-4": "bilder/fussball-auktion/spieler-br-4.png?v=255",
  "br-5": "bilder/fussball-auktion/spieler-br-5.png?v=255",
  "es-1": "bilder/fussball-auktion/spieler-es-1.png?v=255",
  "es-2": "bilder/fussball-auktion/spieler-es-2.png?v=255",
  "es-3": "bilder/fussball-auktion/spieler-es-3.png?v=255",
  "es-4": "bilder/fussball-auktion/spieler-es-4.png?v=255",
  "es-5": "bilder/fussball-auktion/spieler-es-5.png?v=255"
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
  "it-5": 14.1,
  "jp-3": 21,
  "jp-4": 19,
  "jp-5": 19,
  "fr-1": 16,
  "fr-2": 23,
  "fr-3": 21,
  "fr-4": 15,
  "fr-5": 15,
  "ng-1": 18,
  "ng-3": 3,
  "ng-4": 16,
  "ar-4": 17,
  "de-1": 15,
  "de-2": 13,
  "de-3": 15,
  "de-4": 17,
  "de-5": 4.4,
  "it-3": 14,
  "ng-2": 10.3,
  "br-1": 21.4,
  "br-2": 18.1,
  "br-3": 18,
  "br-4": 18,
  "br-5": 22.7,
  "es-1": 24.0,
  "es-2": 16.7,
  "es-3": 25.1,
  "es-4": 17.2,
  "es-5": 24.6,
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
  "ar-1": { hoehe: 54, unten: 20 },
  "ar-2": { hoehe: 54, unten: 20 },
  "ar-4": { hoehe: 70, unten: 8 },
  "ar-3": { hoehe: 54, unten: 20 },
  "ar-5": { hoehe: 54, unten: 19 },
  "ng-2": { hoehe: 55, unten: 13 },
  "it-5": { hoehe: 62, unten: 13 },
  "ng-5": { hoehe: 61, unten: 16 },
  "jp-5": { unten: 22 },
  "de-5": { hoehe: 62, unten: 13 },
  "br-1": { hoehe: 66, unten: 13 },
  "br-2": { hoehe: 66, unten: 13 },
  "br-3": { hoehe: 66, unten: 13 },
  "br-4": { hoehe: 66, unten: 13 },
  "br-5": { hoehe: 66, unten: 13 },
  "es-1": { hoehe: 64, unten: 13 },
  "es-2": { hoehe: 64, unten: 13 },
  "es-3": { hoehe: 64, unten: 13 },
  "es-4": { hoehe: 64, unten: 13 },
  "es-5": { hoehe: 64, unten: 13 }
};
