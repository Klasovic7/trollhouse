// ============================================================================
//  Fußball-Auktion - Kartendesign ("Split × Neon Carbon")
// ----------------------------------------------------------------------------
//  Reine Design-Konfiguration (Farben pro Nation, Flaggen-Emoji, echte
//  Spielerbilder), getrennt von der Spiellogik (logik.js) und vom
//  DOM-Code (spiel.js) - gleiches Trennungsmuster wie im Rest des Projekts.
// ============================================================================

// Diagonal-Split-Farben pro Nation (angelehnt an die jeweilige Flagge) plus
// eine Neon-Akzentfarbe für Rating-Kreis, Namensschrift und aktive Stat-Chips.
export const NATION_DESIGN = {
  Deutschland: { top: "#1a1a1a", mid: "#dd0000", bottom: "#1a1a1a", akzent: "#ffd700", flagge: "🇩🇪" },
  Brasilien:   { top: "#046A38", mid: "#ffcc29", bottom: "#002776", akzent: "#ffea00", flagge: "🇧🇷" },
  England:     { top: "#f4f4f0", mid: "#c8102e", bottom: "#1a1a1a", akzent: "#ff1744", flagge: "🏴" },
  Frankreich:  { top: "#0055A4", mid: "#ffffff", bottom: "#EF4135", akzent: "#2979ff", flagge: "🇫🇷" },
  Italien:     { top: "#046A38", mid: "#f4f4f0", bottom: "#ce2b37", akzent: "#00ff88", flagge: "🇮🇹" },
  Japan:       { top: "#f2f0ea", mid: "#bc002d", bottom: "#1a1a1a", akzent: "#ff1744", flagge: "🇯🇵" },
  Nigeria:     { top: "#008751", mid: "#eafff2", bottom: "#004d2a", akzent: "#00e676", flagge: "🇳🇬" },
  Spanien:     { top: "#aa151b", mid: "#f1bf00", bottom: "#7a0f14", akzent: "#f1bf00", flagge: "🇪🇸" }
};

const STANDARD_DESIGN = { top: "#1e293b", mid: "#334155", bottom: "#0f172a", akzent: "#38bdf8", flagge: "🏳️" };

export function nationDesign(nation) {
  return NATION_DESIGN[nation] ?? STANDARD_DESIGN;
}

// Echte Spielerbilder (freigestellter Cutout statt Silhouette), pro Karten-ID.
// Alle Karten, die hier NICHT eingetragen sind, bekommen automatisch die
// gezeichnete Platzhalter-Silhouette (siehe kartenPortraitHtml in spiel.js).
export const PORTRAET_BILDER = {
  "it-1": "bilder/fussball-auktion/spieler-it-1.png?v=219"
};
