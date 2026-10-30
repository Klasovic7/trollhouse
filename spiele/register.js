// Verzeichnis aller Spiele in der App.
//
// Ein neues Spiel hinzufügen = drei Schritte:
//   1. Ordner spiele/<meinspiel>/ mit einer spiel.js anlegen
//      (siehe spiele/schaetzfragen/spiel.js als Vorlage - nötig sind die Funktionen
//       starten(api), raumDaten(daten), spieler(liste) und beenden()).
//   2. Hier unten einen Eintrag ergänzen.
//   3. In sw.js die Dateien in die Liste DATEIEN aufnehmen, damit sie offline verfügbar sind.
//
// "laden" wird erst beim Klick auf die Kachel ausgeführt - so lädt die App beim Start
// nur das, was gerade gebraucht wird, und bleibt auch mit vielen Spielen schnell.
//
// v202-Fix: JEDES "laden" bekommt jetzt ?v=SPIEL_VERSION angehaengt. Ohne das
// konnte ein Geraet trotz aktuellem app.js/index.html noch die alte
// spiel.js eines einzelnen Spiels aus dem Browser-/GitHub-Pages-Cache
// bekommen (Import-Spezifizierer ohne Query werden wie eine unveraenderte
// Datei behandelt) - genau das hat den Anzeigefehler bei Mitspieler*innen
// in der Olympiade trotz Fix in v201/v202 teils noch bestehen lassen.
// WICHTIG: bei jedem Versionssprung hier UND in app.js (Import von
// register.js) mit hochzaehlen.
const SPIEL_VERSION = "433";

export const SPIELE = [
  {
    id: "schaetzfragen",
    name: "Schätzfragen",
    emoji: "🎯",
    bild: "bilder/schaetzfragen-kachel.webp",
    farbe: "#ff6b5c",
    beschreibung: "Wer tippt am nächsten dran?",
    minSpieler: 2,
    laden: () => import(`./schaetzfragen/spiel.js?v=${SPIEL_VERSION}`)
  },
  {
    id: "denk-gleich",
    name: "Denk gleich!",
    emoji: "🧠",
    farbe: "#818cf8",
    bild: "bilder/denk-gleich-kachel.webp",
    beschreibung: "Gleiche Antwort, gleiche Punkte!",
    minSpieler: 2,
    laden: () => import(`./denk-gleich/spiel.js?v=${SPIEL_VERSION}`)
  },
  {
    id: "zehn-treffer",
    name: "10 Treffer!",
    emoji: "💥",
    farbe: "#ffa94d",
    bild: "bilder/zehn-treffer-kachel.webp",
    beschreibung: "Ein Begriff, zehn gesuchte Treffer!",
    minSpieler: 2,
    laden: () => import(`./zehn-treffer/spiel.js?v=${SPIEL_VERSION}`)
  },
  {
    id: "reih-dich-ein",
    name: "Reih dich ein!",
    emoji: "↕️",
    bild: "bilder/reih-dich-ein-kachel.webp",
    farbe: "#2dd4bf",
    beschreibung: "Setz den Begriff an die richtige Stelle!",
    minSpieler: 2,
    laden: () => import(`./reih-dich-ein/spiel.js?v=${SPIEL_VERSION}`)
  },
  {
    id: "wer-ist-es",
    name: "Wer ist es?",
    emoji: "🕵️",
    bild: "bilder/wer-ist-es-kachel3.webp",
    farbe: "#4ade80",
    beschreibung: "Rate als Erster den Fußballer - je früher, desto mehr Punkte",
    minSpieler: 2,
    laden: () => import(`./wer-ist-es/spiel.js?v=${SPIEL_VERSION}`)
  },
  {
    id: "wann-war-es",
    name: "Wann war es?",
    emoji: "📅",
    farbe: "#c084fc",
    bild: "bilder/wann-war-es-kachel.webp",
    beschreibung: "Rate als Erster das gesuchte Jahr - je früher, desto mehr Punkte",
    minSpieler: 2,
    laden: () => import(`./wann-war-es/spiel.js?v=${SPIEL_VERSION}`)
  },
  {
    id: "blitzquiz",
    name: "Blitzquiz",
    emoji: "⚡",
    farbe: "#fbbf24",
    bild: "bilder/blitzquiz-kachel.webp",
    beschreibung: "Drei Frage-Typen auf Zeit: Schnelligkeit, Wortrate, Bild-Reveal",
    minSpieler: 2,
    laden: () => import(`./blitzquiz/spiel.js?v=${SPIEL_VERSION}`)
  },
  {
    id: "doppelblick",
    name: "Doppelblick!",
    emoji: "🔍",
    farbe: "#f472b6",
    bild: "bilder/doppelblick-kachel.webp",
    beschreibung: "Zwei Karten, ein gemeinsames Symbol - wer tippt es zuerst?",
    minSpieler: 2,
    laden: () => import(`./doppelblick/spiel.js?v=${SPIEL_VERSION}`)
  },
  {
    id: "merks-dir",
    name: "Merk's dir!",
    emoji: "🧩",
    bild: "bilder/merks-dir-karten.webp",
    farbe: "#84cc16",
    beschreibung: "Merkt euch 20 Emojis - wer sich am längsten erinnert, gewinnt",
    minSpieler: 2,
    laden: () => import(`./merks-dir/spiel.js?v=${SPIEL_VERSION}`)
  },
  {
    id: "zeitgefuehl",
    name: "Zeitgefühl!",
    emoji: "⏱️",
    farbe: "#ef4444",
    bild: "bilder/zeitgefuehl-kachel.webp",
    beschreibung: "Blind mitzählen und zur richtigen Sekunde buzzern",
    minSpieler: 2,
    laden: () => import(`./zeitgefuehl/spiel.js?v=${SPIEL_VERSION}`)
  },
  {
    id: "stimmts",
    name: "Stimmt's?",
    emoji: "🤔",
    farbe: "#a78bfa",
    beschreibung: "Wahr oder erfunden? Tippt so schnell wie möglich richtig",
    minSpieler: 2,
    laden: () => import(`./stimmts/spiel.js?v=${SPIEL_VERSION}`)
  },
  {
    id: "laenderumrisse",
    name: "Länderumrisse",
    emoji: "🗺️",
    bild: "bilder/laenderumrisse-kachel2.webp",
    farbe: "#0ea5e9",
    beschreibung: "Nur der Umriss ist zu sehen - welches Land ist das?",
    minSpieler: 2,
    laden: () => import(`./laenderumrisse/spiel.js?v=${SPIEL_VERSION}`)
  },
  {
    id: "wo-liegts",
    name: "Wo liegt's?",
    emoji: "🌍",
    farbe: "#10b981",
    bild: "bilder/wo-liegts-kachel.webp",
    beschreibung: "Städte oder Sehenswürdigkeiten auf dem Globus finden - wer liegt am nächsten dran?",
    minSpieler: 2,
    laden: () => import(`./wo-liegts/spiel.js?v=${SPIEL_VERSION}`)
  },
  {
    id: "fussball-auktion",
    name: "Länderspiel",
    emoji: "⚽",
    farbe: "#22c55e",
    bild: "bilder/laenderspiel-kachel2.webp",
    beschreibung: "Ersteigere Spielerkarten und gewinne mit der besten Kombination",
    minSpieler: 2,
    laden: () => import(`./fussball-auktion/spiel.js?v=${SPIEL_VERSION}`)
  },
  {
    id: "groessenvergleich",
    name: "Größenvergleich",
    emoji: "📏",
    bild: "bilder/groessenvergleich-kachel2.webp",
    farbe: "#38bdf8",
    beschreibung: "Zieh die rote Silhouette auf die richtige Größe",
    minSpieler: 2,
    laden: () => import(`./groessenvergleich/spiel.js?v=${SPIEL_VERSION}`)
  },
  {
    id: "knobeln",
    name: "Knobeln",
    emoji: "🔥",
    bild: "bilder/knobeln-kachel.webp",
    farbe: "#f59e0b",
    beschreibung: "Streichhölzer in der Faust - tippt die Gesamtzahl, wer richtig liegt, ist raus",
    minSpieler: 2,
    laden: () => import(`./knobeln/spiel.js?v=${SPIEL_VERSION}`)
  },
  {
    id: "tetris",
    name: "Tetris-Duell",
    emoji: "🧱",
    bild: "bilder/tetris-stein.webp",
    farbe: "#06b6d4",
    beschreibung: "Alle spielen gleichzeitig Tetris - mit Müllzeilen, auch gegen Bots",
    minSpieler: 2,
    laden: () => import(`./tetris/spiel.js?v=${SPIEL_VERSION}`)
  },
  {
    id: "doppelkopf",
    name: "Doppelkopf",
    emoji: "🃏",
    bild: "bilder/doppelkopf-dame.webp",
    farbe: "#16a34a",
    beschreibung: "Das Kartenspiel zu viert (oder fünft), alleine mit Bots spielbar",
    minSpieler: 1,
    mitBots: true,
    laden: () => import(`./doppelkopf/spiel.js?v=${SPIEL_VERSION}`)
  },
  {
    id: "passgenau",
    name: "Passgenau",
    emoji: "🧩",
    bild: "bilder/passgenau-bloecke2.webp",
    farbe: "#f59e0b",
    beschreibung: "Legt alle Teile passgenau ins Feld - wer zuerst fertig ist, gewinnt",
    minSpieler: 2,
    laden: () => import(`./passgenau/spiel.js?v=${SPIEL_VERSION}`)
  },
  {
    id: "memory",
    name: "Memory",
    emoji: "🃏",
    bild: "bilder/memory-karten.webp",
    farbe: "#22c55e",
    beschreibung: "Memory von oben: Lauft über die Karten, deckt Fußballer-Paare auf - allein oder im Team",
    minSpieler: 2,
    laden: () => import(`./memory/spiel.js?v=${SPIEL_VERSION}`)
  },
  {
    id: "revier",
    name: "Revierkampf",
    emoji: "🗺️",
    bild: "bilder/revier-gebiete2.webp",
    farbe: "#06b6d4",
    beschreibung: "Sichert euch ein Gebiet - am Ende gewinnt, wer die meisten Quadrate übrig hat",
    minSpieler: 2,
    laden: () => import(`./revier/spiel.js?v=${SPIEL_VERSION}`)
  },
  {
    id: "kartentausch",
    name: "Kartentausch",
    emoji: "🎴",
    bild: "bilder/kartentausch-karten.webp",
    farbe: "#a855f7",
    beschreibung: "Merkt euch den Fußballer, verfolgt die Tauschaktion und findet ihn wieder - jeder wählt eine Karte",
    minSpieler: 2,
    laden: () => import(`./kartentausch/spiel.js?v=${SPIEL_VERSION}`)
  },
  {
    id: "schnellschuss",
    name: "Schnellschuss",
    emoji: "⚡",
    bild: "bilder/schnellschuss-kachel4.webp",
    farbe: "#f59e0b",
    beschreibung: "Bälle poppen auf - tippt blitzschnell! Bei Bombe und Tomate heißt es: Finger weg",
    minSpieler: 2,
    laden: () => import(`./schnellschuss/spiel.js?v=${SPIEL_VERSION}`)
  },
  {
    id: "run",
    name: "Run",
    emoji: "🏃",
    bild: "bilder/run-kachel2.webp",
    farbe: "#f43f5e",
    beschreibung: "Rennt gleichzeitig durch die Stadt - weicht aus, springt und rutscht. Wer am weitesten kommt, gewinnt",
    minSpieler: 2,
    laden: () => import(`./run/spiel.js?v=${SPIEL_VERSION}`)
  },
  {
    id: "turbo",
    name: "Turbo",
    emoji: "🏎️",
    bild: "bilder/turbo-kachel.webp",
    farbe: "#06b6d4",
    beschreibung: "Zeitjagd im Rennwagen - 5 Minuten, gleiche Strecke",
    minSpieler: 2,
    laden: () => import(`./turbo/spiel.js?v=${SPIEL_VERSION}`)
  },
  {
    id: "finto",
    name: "Finto",
    emoji: "🦉",
    farbe: "#38bdf8",
    beschreibung: "Bluffe mit einer erfundenen Antwort und errate die echte",
    minSpieler: 3,
    laden: () => import(`./finto/spiel.js?v=${SPIEL_VERSION}`)
  },
  {
    id: "imposter",
    name: "Imposter",
    emoji: "🎭",
    farbe: "#fb7185",
    beschreibung: "Einer kennt das Geheimwort nicht - deckt eure Karte auf und findet ihn",
    minSpieler: 3,
    laden: () => import(`./imposter/spiel.js?v=${SPIEL_VERSION}`)
  }
];

export function spielInfo(id) {
  return SPIELE.find((s) => s.id === id) ?? null;
}
