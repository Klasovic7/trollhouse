// ============================================================================
//  Fußball-Auktion - Kartendesign ("Split × Neon Carbon")
// ----------------------------------------------------------------------------
//  Reine Design-Konfiguration (Farben pro Nation, Flaggen-Grafik, echte
//  Spielerbilder), getrennt von der Spiellogik (logik.js) und vom
//  DOM-Code (spiel.js) - gleiches Trennungsmuster wie im Rest des Projekts.
// ============================================================================

// Diagonal-Split-Farben pro Nation (angelehnt an die jeweilige Flagge, für den
// oberen Kartenbereich) plus eine Neon-Akzentfarbe für Rating-Kreis und
// Namens-Glow. flagSvg/flagViewBox zeichnen die ECHTE Flagge als Hintergrund
// hinter den Stats (nicht nur 3 angenäherte Grundfarben).
export const NATION_DESIGN = {
  Deutschland: {
    top: "#1a1a1a", mid: "#dd0000", bottom: "#1a1a1a", akzent: "#ffd700", flagge: "🇩🇪",
    flagViewBox: "0 0 5 3",
    flagSvg: '<rect width="5" height="1" y="0" fill="#1a1a1a"/><rect width="5" height="1" y="1" fill="#dd0000"/><rect width="5" height="1" y="2" fill="#ffce00"/>'
  },
  Brasilien: {
    top: "#046A38", mid: "#ffcc29", bottom: "#002776", akzent: "#ffea00", flagge: "🇧🇷",
    flagViewBox: "0 0 10 7",
    flagSvg: '<rect width="10" height="7" fill="#046A38"/><polygon points="5,0.7 9.3,3.5 5,6.3 0.7,3.5" fill="#FEDD00"/><circle cx="5" cy="3.5" r="1.7" fill="#002776"/>'
  },
  Argentinien: {
    top: "#6CACE4", mid: "#ffffff", bottom: "#6CACE4", akzent: "#85c7f2", flagge: "🇦🇷",
    flagViewBox: "0 0 3 2",
    flagSvg: '<rect width="3" height="2" fill="#6CACE4"/><rect width="3" height="0.667" y="0.667" fill="#ffffff"/><circle cx="1.5" cy="1" r="0.22" fill="#F6B40E" stroke="#85540A" stroke-width="0.03"/>'
  },
  Frankreich: {
    top: "#0055A4", mid: "#ffffff", bottom: "#EF4135", akzent: "#2979ff", flagge: "🇫🇷",
    flagViewBox: "0 0 3 2",
    flagSvg: '<rect width="1" height="2" x="0" fill="#0055A4"/><rect width="1" height="2" x="1" fill="#ffffff"/><rect width="1" height="2" x="2" fill="#EF4135"/>'
  },
  Italien: {
    top: "#046A38", mid: "#f4f4f0", bottom: "#ce2b37", akzent: "#00ff88", flagge: "🇮🇹",
    flagViewBox: "0 0 3 2",
    flagSvg: '<rect width="1" height="2" x="0" fill="#046A38"/><rect width="1" height="2" x="1" fill="#f4f4f0"/><rect width="1" height="2" x="2" fill="#CE2B37"/>'
  },
  Japan: {
    top: "#f2f0ea", mid: "#bc002d", bottom: "#8a0020", akzent: "#ff1744", flagge: "🇯🇵",
    flagViewBox: "0 0 3 2",
    flagSvg: '<rect width="3" height="2" fill="#f2f0ea"/><circle cx="1.5" cy="1" r="0.6" fill="#bc002d"/>'
  },
  Nigeria: {
    top: "#008751", mid: "#eafff2", bottom: "#004d2a", akzent: "#00e676", flagge: "🇳🇬",
    flagViewBox: "0 0 3 2",
    flagSvg: '<rect width="1" height="2" x="0" fill="#008751"/><rect width="1" height="2" x="1" fill="#ffffff"/><rect width="1" height="2" x="2" fill="#008751"/>'
  },
  Spanien: {
    top: "#aa151b", mid: "#f1bf00", bottom: "#7a0f14", akzent: "#f1bf00", flagge: "🇪🇸",
    flagViewBox: "0 0 3 2",
    flagSvg: '<rect width="3" height="2" fill="#AA151B"/><rect width="3" height="1" y="0.5" fill="#F1BF00"/>'
  }
};

const STANDARD_DESIGN = {
  top: "#1e293b", mid: "#334155", bottom: "#0f172a", akzent: "#38bdf8", flagge: "🏳️",
  flagViewBox: "0 0 3 2",
  flagSvg: '<rect width="1" height="2" x="0" fill="#1e293b"/><rect width="1" height="2" x="1" fill="#334155"/><rect width="1" height="2" x="2" fill="#0f172a"/>'
};

export function nationDesign(nation) {
  return NATION_DESIGN[nation] ?? STANDARD_DESIGN;
}

// Echte Spielerbilder (freigestellter Cutout statt Silhouette), pro Karten-ID.
// Alle Karten, die hier NICHT eingetragen sind, bekommen automatisch die
// gezeichnete Platzhalter-Silhouette (siehe kartenPortraitHtml in spiel.js).
export const PORTRAET_BILDER = {
  "it-1": "bilder/fussball-auktion/spieler-it-1.png?v=221"
};
