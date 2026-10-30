// ============================================================================
//  Spielanleitungen - Texte und selbst gezeichnete Szenen (SVG, 320 x 180)
// ----------------------------------------------------------------------------
//  Jede Anleitung ist eine Liste von Seiten: { t: Titel, x: [Absätze], s: Szene }.
//  "s" liefert nur den Inhalt der Zeichnung; der Hintergrund mit der Farbe des
//  Spiels kommt aus szene(). Texte: **fett** wird hervorgehoben.
//  Alle Regeln stammen aus dem Code der jeweiligen Spiele.
// ============================================================================
import { kartenSvg } from "./doppelkopf/karten.js?v=403";

let zaehler = 0;
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const SCHRIFT = "system-ui,-apple-system,'Segoe UI',sans-serif";

export function szene(farbe, inhalt) {
  const id = "anl" + zaehler++;
  return `<svg viewBox="0 0 320 180" xmlns="http://www.w3.org/2000/svg" class="anl-bild" aria-hidden="true">` +
    `<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${farbe}" stop-opacity=".7"/><stop offset="1" stop-color="#150f1c"/></linearGradient></defs>` +
    `<rect width="320" height="180" rx="14" fill="url(#${id})"/>${inhalt}</svg>`;
}

// ---- Bausteine ---------------------------------------------------------------
const T = (x, y, s, g = 12, f = "#fff", w = 700, a = "middle") =>
  `<text x="${x}" y="${y}" font-size="${g}" font-weight="${w}" fill="${f}" text-anchor="${a}" font-family="${SCHRIFT}">${esc(s)}</text>`;
const TZ = (x, y, zeilen, g = 11, f = "#fff", h = 14) => zeilen.map((z, i) => T(x, y + i * h, z, g, f)).join("");
const E = (x, y, e, g = 28) => `<text x="${x}" y="${y}" font-size="${g}" text-anchor="middle" dominant-baseline="central">${e}</text>`;
const R = (x, y, w, h, f, r = 8, extra = "") => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${f}" ${extra}/>`;
const C = (x, y, r, f, extra = "") => `<circle cx="${x}" cy="${y}" r="${r}" fill="${f}" ${extra}/>`;
const FARBEN = ["#f87171", "#60a5fa", "#4ade80", "#fbbf24", "#c084fc", "#f472b6"];

const avatar = (x, y, i = 0, name = "", r = 15) =>
  C(x, y, r, FARBEN[i % 6], 'stroke="#fff" stroke-width="2"') +
  C(x - r * 0.33, y - r * 0.15, r * 0.1, "#222") + C(x + r * 0.33, y - r * 0.15, r * 0.1, "#222") +
  `<path d="M${x - r * 0.4} ${y + r * 0.3} Q${x} ${y + r * 0.7} ${x + r * 0.4} ${y + r * 0.3}" fill="none" stroke="#222" stroke-width="1.6" stroke-linecap="round"/>` +
  (name ? T(x, y + r + 12, name, 9, "#fff", 600) : "");

const ph = (x, y, w, h, inner) =>
  R(x, y, w, h, "#0b0710", 16, 'stroke="#ffffff66" stroke-width="1.5"') + R(x + 5, y + 10, w - 10, h - 20, "#2a1f35", 8) + inner;

const blase = (x, y, s, w = 52, schwanz = "l") =>
  R(x, y, w, 22, "#fff", 11) +
  `<path d="${schwanz === "l" ? `M${x + 8} ${y + 20} l-4 8 l12 -6Z` : `M${x + w - 8} ${y + 20} l4 8 l-12 -6Z`}" fill="#fff"/>` +
  T(x + w / 2, y + 15, s, 10.5, "#222", 800);

const knopf = (x, y, w, h, s, f = "#ff5b36", tf = "#fff", g = 11) => R(x, y, w, h, f, h / 2) + T(x + w / 2, y + h / 2 + g * 0.36, s, g, tf, 800);
const kachel = (x, y, w, h, s, f = "#ffffff22", tf = "#fff", g = 10.5) => R(x, y, w, h, f, 8) + T(x + w / 2, y + h / 2 + g * 0.36, s, g, tf, 700);
const balken = (x, y, w, anteil, f = "#ff5b36", h = 6) => R(x, y, w, h, "#ffffff33", h / 2) + R(x, y, Math.max(h, w * anteil), h, f, h / 2);
const stern = (x, y, g = 14) => E(x, y, "⭐", g);

// Rangliste: Zeilen [Name, Wert, Farbindex]
const rang = (x, y, zeilen, w = 130) => zeilen.map(([n, v, i], k) =>
  R(x, y + k * 26, w, 22, "#ffffff22", 11) + avatar(x + 12, y + k * 26 + 11, i ?? k, "", 8) +
  T(x + 26, y + k * 26 + 15, n, 10, "#fff", 600, "start") + T(x + w - 8, y + k * 26 + 15, v, 10.5, "#fde68a", 800, "end")).join("");

const reihe = (y, n, von = 50, bis = 270, namen = []) =>
  Array.from({ length: n }, (_, i) => avatar(n === 1 ? 160 : von + ((bis - von) * i) / (n - 1), y, i, namen[i] ?? "")).join("");

// Playing card aus dem Doppelkopf-Kartensatz
const dkKarte = (id, x, y, w = 40, drehung = 0) => {
  const h = w * 1.5;
  const svg = kartenSvg(id).replace('class="dk-karte-svg"', "").replace("<svg ", `<svg x="${x}" y="${y}" width="${w}" height="${h}" `);
  return drehung ? `<g transform="rotate(${drehung} ${x + w / 2} ${y + h / 2})">${svg}</g>` : svg;
};
// Kartenrücken
const rueck = (x, y, w = 34, drehung = 0) => {
  const h = w * 1.5;
  const g = `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="4" fill="#2f4a8a" stroke="#fbf6e6" stroke-width="2"/>` +
    `<path d="M${x + w / 2} ${y + h * 0.25} L${x + w * 0.78} ${y + h / 2} L${x + w / 2} ${y + h * 0.75} L${x + w * 0.22} ${y + h / 2}Z" fill="none" stroke="#e8d28a" stroke-width="1.2"/>`;
  return drehung ? `<g transform="rotate(${drehung} ${x + w / 2} ${y + h / 2})">${g}</g>` : g;
};
const uhr = (x, y, r = 14) => C(x, y, r, "#fff", 'stroke="#ff5b36" stroke-width="3"') +
  `<path d="M${x} ${y} L${x} ${y - r * 0.6} M${x} ${y} L${x + r * 0.45} ${y + r * 0.2}" stroke="#222" stroke-width="2" stroke-linecap="round"/>`;
const pfeil = (x1, y1, x2, y2, f = "#fff") =>
  `<path d="M${x1} ${y1} L${x2} ${y2}" stroke="${f}" stroke-width="2.5" stroke-linecap="round" marker-end="none"/>` +
  `<circle cx="${x2}" cy="${y2}" r="3" fill="${f}"/>`;

// ---- Gemeinsame Bildbausteine für Buzzer-Spiele -------------------------------------
const buzzerSzene = (frage, hinweise) =>
  ph(105, 10, 110, 160, T(160, 38, frage, 10.5, "#fff", 700) +
    hinweise.map((h, i) => kachel(120, 50 + i * 24, 80, 19, h, "#ffffff22", "#fff", 9)).join("") +
    E(160, 138, "🔴", 34)) + avatar(45, 80, 0, "Du") + avatar(275, 80, 1, "Kevin") + blase(60, 48, "Buzzer!", 50, "l");

// ============================================================================
//  Anleitungen
// ============================================================================
export const ANLEITUNGEN = {
  // -------------------------------------------------------------------------
  schaetzfragen: [
    {
      t: "Worum geht's?",
      x: ["Eine Frage, deren Antwort eine **Zahl** ist - zum Beispiel die Höhe eines Turms. Alle schätzen gleichzeitig auf dem eigenen Handy.", "Wer am nächsten dran liegt, bekommt die meisten Punkte."],
      s: () => ph(105, 10, 110, 160, TZ(160, 40, ["Wie hoch ist", "der Eiffelturm?"], 11) + R(120, 78, 80, 28, "#fff", 8) + T(160, 97, "330", 15, "#222", 800) + knopf(125, 122, 70, 24, "Abschicken", "#ff5b36", "#fff", 10)) +
        avatar(45, 70, 0, "Du") + avatar(275, 70, 1, "Luca") + blase(62, 38, "250 m?", 48, "l") + blase(214, 38, "400 m?", 48, "r") + E(45, 140, "🤔", 24) + E(275, 140, "🤷", 24)
    },
    {
      t: "Wer liegt am weitesten daneben?",
      x: ["Vor der Auflösung tippst du, **wer am weitesten danebenliegt**. Hast du richtig getippt, bekommst du einen Extrapunkt."],
      s: () => ph(95, 8, 130, 164, T(160, 34, "Wer liegt am weitesten", 10, "#fff") + T(160, 47, "daneben?", 10, "#fff") +
        [0, 1, 2].map((i) => R(108, 56 + i * 36, 104, 30, i === 1 ? "#ff5b3655" : "#ffffff22", 10, i === 1 ? 'stroke="#ff5b36" stroke-width="2"' : "") + avatar(126, 71 + i * 36, i + 1, "", 9) + T(142, 75 + i * 36, ["Luca", "Kevin", "Niklas"][i], 11, "#fff", 700, "start")).join("")) + E(250, 100, "👆", 30)
    },
    {
      t: "Punkte nach Rang",
      x: ["Wer am **weitesten daneben** liegt, bekommt 0 Punkte. Jeder Platz näher dran gibt einen Punkt mehr.", "Genau richtig geschätzt? Dann gibt es **einen Extrapunkt**."],
      s: () => T(160, 24, "Wahrer Wert: 330 m", 13, "#fde68a", 800) + rang(95, 40, [["Du", "330 · 3+1", 0], ["Luca", "320 · 2", 1], ["Kevin", "400 · 1", 2], ["Niklas", "900 · 0", 3]], 130) + stern(250, 60) + E(262, 120, "🏆", 26)
    },
    {
      t: "Teammodus",
      x: ["Der Spielleiter kann **Teams** einschalten. Jeder wählt ein Team, die Punkte werden aber weiter einzeln vergeben.", "Zusätzlich seht ihr die Summe pro Team."],
      s: () => R(30, 30, 120, 120, "#f8717144", 16, 'stroke="#f87171" stroke-width="2"') + R(170, 30, 120, 120, "#60a5fa44", 16, 'stroke="#60a5fa" stroke-width="2"') +
        T(90, 52, "Team Rot", 12, "#fff") + T(230, 52, "Team Blau", 12, "#fff") + avatar(65, 90, 0, "Du") + avatar(115, 90, 5, "Niklas") + avatar(205, 90, 1, "Luca") + avatar(255, 90, 2, "Kevin") +
        T(90, 140, "7 Punkte", 12, "#fde68a", 800) + T(230, 140, "5 Punkte", 12, "#fde68a", 800)
    }
  ],
  // -------------------------------------------------------------------------
  "denk-gleich": [
    {
      t: "Worum geht's?",
      x: ["Alle bekommen **dieselbe offene Frage** und schreiben eine kurze Antwort - zum Beispiel \"Nenne eine Farbe\".", "Ziel: Antworte so, wie es auch die anderen tun würden."],
      s: () => ph(100, 10, 120, 160, TZ(160, 40, ["Nenne ein Obst,", "das gelb ist"], 11) + R(115, 78, 90, 28, "#fff", 8) + T(160, 97, "Banane", 13, "#222", 700) + knopf(120, 122, 80, 24, "Abschicken", "#ff5b36", "#fff", 10)) + avatar(45, 80, 0, "Du") + avatar(275, 80, 1, "Kevin") + E(45, 135, "💭", 22) + E(275, 135, "💭", 22)
    },
    {
      t: "Gleiche Antwort = Punkte",
      x: ["Nach dem Abschicken werden alle Antworten aufgedeckt. Für **jede andere Person mit derselben Antwort** bekommst du einen Punkt.", "Dieselbe Antwort wird dabei nicht streng nach Schreibweise verglichen, sondern ähnlich geschriebene gelten als gleich."],
      s: () => [["Du", "Banane", 0], ["Kevin", "Banane", 1], ["Sinan", "Zitrone", 2], ["Nader", "Banane", 3]].map(([n, a, i], k) =>
        R(60, 22 + k * 36, 200, 30, a === "Banane" ? "#4ade8055" : "#ffffff22", 12, a === "Banane" ? 'stroke="#4ade80" stroke-width="2"' : "") + avatar(78, 37 + k * 36, i, "", 10) + T(96, 41 + k * 36, n, 11, "#fff", 700, "start") + T(248, 41 + k * 36, a, 12, "#fff", 800, "end")).join("")
    },
    {
      t: "Mehr Gleiche, mehr Punkte",
      x: ["Drei gleiche Antworten bringen diesen drei Spielern also **jeweils zwei Punkte**. Wer eine Einzelantwort hat, geht leer aus.", "Gewinner ist, wer am Ende die meisten Punkte hat."],
      s: () => avatar(70, 70, 0, "Du") + avatar(160, 70, 1, "Kevin") + avatar(250, 70, 3, "Nader") + [70, 160, 250].map((x) => R(x - 24, 100, 48, 22, "#4ade8066", 11) + T(x, 115, "Banane", 10, "#fff", 800)).join("") + T(160, 150, "Jede(r): 2 Punkte", 14, "#fde68a", 800) + [70, 160, 250].map((x) => stern(x, 40, 13)).join("")
    }
  ],
  // -------------------------------------------------------------------------
  "zehn-treffer": [
    {
      t: "Worum geht's?",
      x: ["Es gibt einen **Oberbegriff** mit zehn gesuchten Treffern - zum Beispiel \"Obstsorten\". Eine Person oder ein Team rät, die anderen kontrollieren."],
      s: () => R(20, 40, 130, 100, "#ffffff22", 14) + R(170, 40, 130, 100, "#ffffff22", 14) + T(85, 60, "Ratende(r)", 10, "#fde68a", 700) + T(235, 60, "Kontrolle", 10, "#fde68a", 700) +
        T(85, 95, "Obstsorten", 14, "#fff", 800) + E(85, 118, "🗣️", 22) + [0, 1, 2, 3, 4].map((i) => T(210 + (i % 2) * 50, 82 + Math.floor(i / 2) * 18, ["Apfel", "Birne", "Kirsche", "Banane", "Traube"][i], 10, "#fff", 600)).join("") + E(280, 124, "✅", 20)
    },
    {
      t: "Raten und markieren",
      x: ["Die ratende Seite sieht **nur den Oberbegriff** und nennt passende Begriffe.", "Die andere Seite sieht die Trefferliste und **tippt einen Begriff an**, sobald er genannt wurde."],
      s: () => avatar(55, 75, 0, "Rät") + blase(78, 40, "Apfel!", 50, "l") + blase(78, 72, "Kirsche!", 56, "l") + ph(180, 12, 110, 156, T(235, 36, "Treffer", 10, "#fde68a") +
        ["Apfel", "Birne", "Kirsche", "Banane", "Traube", "Mango"].map((w, i) => R(190, 44 + i * 20, 90, 17, i === 0 || i === 2 ? "#4ade8077" : "#ffffff22", 8) + T(235, 56 + i * 20, w, 9.5, "#fff", 700)).join(""))
    },
    {
      t: "Punkte & Teams",
      x: ["**Jeder Treffer gibt einen Punkt.** Dann ist die nächste Person oder das nächste Team dran.", "Im Teammodus treten Blau und Rot abwechselnd an: Wer rät, sieht nur den Begriff, das andere Team markiert die Treffer."],
      s: () => R(30, 40, 110, 100, "#60a5fa44", 14, 'stroke="#60a5fa" stroke-width="2"') + R(180, 40, 110, 100, "#f8717144", 14, 'stroke="#f87171" stroke-width="2"') + T(85, 62, "Blau", 12) + T(235, 62, "Rot", 12) + T(85, 105, "6", 36, "#fde68a", 800) + T(235, 105, "4", 36, "#fde68a", 800) + T(85, 128, "Treffer", 10) + T(235, 128, "Treffer", 10) + E(160, 90, "⚔️", 24)
    }
  ],
  // -------------------------------------------------------------------------
  "reih-dich-ein": [
    {
      t: "Worum geht's?",
      x: ["Begriffe werden nacheinander in eine **wachsende, aufsteigende Reihe** gesetzt - zum Beispiel nach Größe oder Zahl.", "Ein Startbegriff liegt schon in der Reihe."],
      s: () => T(160, 28, "klein  →  groß", 11, "#fde68a") + [["Maus", 0], ["Hund", 1], ["Elefant", 2]].map(([w, i]) => kachel(30 + i * 95, 60, 85, 34, w, "#ffffff2a", "#fff", 12)).join("") + pfeil(40, 125, 280, 125, "#fde68a") + T(160, 150, "aufsteigende Reihe", 10, "#fff", 600)
    },
    {
      t: "Der Reihe nach",
      x: ["Immer **ein Spieler ist dran**: Er bekommt einen neuen Begriff und setzt ihn an die Stelle, an die er seiner Meinung nach gehört."],
      s: () => kachel(25, 30, 80, 30, "Maus", "#ffffff2a") + kachel(220, 30, 80, 30, "Elefant", "#ffffff2a") + R(115, 30, 90, 30, "#ff5b3633", 8, 'stroke="#ff5b36" stroke-width="2" stroke-dasharray="5 4"') + T(160, 49, "?", 16, "#ff5b36", 800) +
        kachel(105, 100, 110, 32, "Katze", "#fbbf24", "#222", 13) + pfeil(160, 98, 160, 66, "#fff") + avatar(45, 130, 0, "Du") + E(275, 125, "👆", 26)
    },
    {
      t: "Plus- und Minuspunkte",
      x: ["Eine **richtige Position** gibt einen Pluspunkt, eine **falsche** einen Minuspunkt.", "Danach ist der nächste Spieler dran."],
      s: () => R(30, 30, 120, 60, "#4ade8044", 14, 'stroke="#4ade80" stroke-width="2"') + R(170, 30, 120, 60, "#f8717144", 14, 'stroke="#f87171" stroke-width="2"') + E(60, 60, "✅", 28) + T(115, 68, "+1", 24, "#bbf7d0", 800) + E(200, 60, "❌", 28) + T(255, 68, "−1", 24, "#fecaca", 800) + T(90, 112, "richtig eingeordnet", 10) + T(230, 112, "falsch eingeordnet", 10) + rang(95, 125, [["Du", "+1", 0]], 130)
    }
  ],
  // -------------------------------------------------------------------------
  "wer-ist-es": [
    {
      t: "Worum geht's?",
      x: ["Es wird ein **Fußballer** gesucht. Nach und nach werden Hinweise aufgedeckt - **alle 7 Sekunden** kommt ein neuer dazu.", "Wer die Person erkennt, drückt den Buzzer."],
      s: () => buzzerSzene("Wer ist es?", ["Hinweis 1", "Hinweis 2", "Hinweis 3"])
    },
    {
      t: "Buzzern und raten",
      x: ["Wer **zuerst buzzert**, darf als Erstes raten und hat dafür **10 Sekunden**. Alle sehen den Namen, den du eintippst."],
      s: () => ph(95, 10, 130, 160, T(160, 38, "Du hast gebuzzert!", 11, "#fde68a") + R(108, 55, 104, 28, "#fff", 8) + T(160, 74, "Beckenbauer", 13, "#222", 700) + knopf(115, 100, 90, 26, "Antworten", "#ff5b36") + balken(112, 142, 96, 0.6, "#fde68a", 8)) + uhr(45, 90) + E(275, 90, "⚽", 30)
    },
    {
      t: "Je früher, desto mehr",
      x: ["Je **weniger Hinweise** bis zu deiner richtigen Antwort aufgedeckt waren, desto mehr Punkte gibt es."],
      s: () => [["1 Hinweis", 5], ["2 Hinweise", 4], ["3 Hinweise", 3], ["4 Hinweise", 2]].map(([a, p], i) => R(40, 22 + i * 36, 240, 28, "#ffffff22", 14) + T(60, 41 + i * 36, a, 11, "#fff", 600, "start") + R(140, 29 + i * 36, p * 20, 14, "#4ade80", 7) + T(268, 41 + i * 36, "+" + p, 12, "#fde68a", 800, "end")).join("")
    },
    {
      t: "Falsch geraten",
      x: ["Eine falsche Antwort kostet **Punkte**, und es wird sofort der nächste Hinweis aufgedeckt.", "Rät dieselbe Person bei derselben Frage nochmal falsch, steigt der Abzug: **−1, −2, −3 …** Auch wenn die 10 Sekunden ablaufen, zählt das als falsch."],
      s: () => E(160, 55, "❌", 40) + [["1. Fehlversuch", "−1"], ["2. Fehlversuch", "−2"], ["3. Fehlversuch", "−3"]].map(([a, p], i) => R(60, 90 + i * 28, 200, 24, "#f8717133", 12) + T(76, 106 + i * 28, a, 11, "#fff", 600, "start") + T(248, 106 + i * 28, p, 13, "#fecaca", 800, "end")).join("")
    }
  ],
  // -------------------------------------------------------------------------
  "wann-war-es": [
    {
      t: "Worum geht's?",
      x: ["Gesucht ist ein **Jahr**. Du bekommst nacheinander Hinweise zu Ereignissen aus diesem Jahr - alle **7 Sekunden** einen neuen.", "Wer das Jahr kennt, buzzert."],
      s: () => buzzerSzene("Wann war es?", ["Hinweis 1", "Hinweis 2", "Hinweis 3"]).replace("Buzzer!", "1954?")
    },
    {
      t: "Buzzern und Jahr tippen",
      x: ["Wer **zuerst buzzert**, darf das Jahr eintippen. Dafür hast du **10 Sekunden**."],
      s: () => ph(95, 10, 130, 160, T(160, 38, "Du bist dran!", 11, "#fde68a") + R(108, 55, 104, 32, "#fff", 8) + T(160, 79, "1954", 20, "#222", 800) + knopf(115, 104, 90, 26, "Antworten", "#ff5b36") + balken(112, 142, 96, 0.5, "#fde68a", 8)) + E(45, 90, "📅", 34) + E(275, 90, "🗓️", 34)
    },
    {
      t: "Punkte wie bei \"Wer ist es?\"",
      x: ["Weniger Hinweise = **mehr Punkte**. Eine falsche Antwort kostet Punkte (**−1, −2, −3 …** je Person und Frage) und deckt den nächsten Hinweis auf.", "Der Spielleiter kann die Runde auflösen, wenn niemand das Jahr kennt."],
      s: () => [["1 Hinweis", 5], ["2 Hinweise", 4], ["3 Hinweise", 3]].map(([a, p], i) => R(40, 25 + i * 34, 240, 26, "#ffffff22", 13) + T(58, 42 + i * 34, a, 11, "#fff", 600, "start") + T(268, 42 + i * 34, "+" + p, 12, "#fde68a", 800, "end")).join("") + R(40, 130, 240, 28, "#f8717133", 14) + T(160, 148, "Falsch: −1, dann −2, dann −3 …", 11, "#fecaca", 700)
    }
  ],
  // -------------------------------------------------------------------------
  blitzquiz: [
    {
      t: "Worum geht's?",
      x: ["Drei Frage-Typen, bunt gemischt - alle **auf Zeit**. Je schneller du richtig antwortest, desto mehr Punkte bekommst du."],
      s: () => [["⚡", "Schnell", "Antwort wählen"], ["🔤", "Wort", "Buchstaben raten"], ["🖼️", "Bild", "Bild erkennen"]].map(([e, n, u], i) => R(18 + i * 100, 40, 90, 100, "#ffffff22", 14) + E(63 + i * 100, 75, e, 32) + T(63 + i * 100, 108, n, 12, "#fff", 800) + T(63 + i * 100, 124, u, 8.5, "#fde68a", 600)).join("")
    },
    {
      t: "Typ 1: Schnell",
      x: ["Mehrfachauswahl auf Schnelligkeit. Die **schnellste richtige** Antwort bekommt so viele Punkte, wie Mitspieler dabei sind, die zweitschnellste einen weniger usw.", "Falsche Antworten bringen 0 Punkte."],
      s: () => ph(85, 10, 150, 160, T(160, 36, "Welches Land ist größer?", 10, "#fff") + ["Schweden", "Norwegen", "Finnland", "Dänemark"].map((a, i) => R(98, 48 + i * 27, 124, 22, i === 0 ? "#4ade8077" : "#ffffff22", 10, i === 0 ? 'stroke="#4ade80" stroke-width="2"' : "") + T(160, 63 + i * 27, a, 10.5, "#fff", 700)).join("")) + uhr(40, 60) + T(40, 95, "2,31 s", 11, "#fde68a") + E(280, 60, "🥇", 26) + T(280, 90, "+4", 14, "#fde68a", 800)
    },
    {
      t: "Typ 2: Wort",
      x: ["Für jeden Buchstaben der Lösung ein leeres Kästchen. **Alle 10 Sekunden** wird ein weiterer Buchstabe aufgedeckt - der letzte bleibt immer verdeckt.", "Du hast **nur einen Versuch**: Liegst du falsch, bist du für diese Runde gesperrt."],
      s: () => T(160, 36, "Hauptstadt von Frankreich", 11, "#fff") + ["P", "", "R", "", "S"].map((b, i) => R(55 + i * 44, 60, 38, 46, b ? "#4ade8066" : "#ffffff22", 8, 'stroke="#fff" stroke-width="1.5"') + T(74 + i * 44, 92, b, 24, "#fff", 800)).join("") + uhr(160, 143, 12) + T(180, 147, "+1 Buchstabe / 10 s", 10, "#fde68a", 600, "start")
    },
    {
      t: "Typ 3: Bild",
      x: ["Ein Bild startet **stark unscharf** und wird alle 10 Sekunden schärfer - der letzte Schritt bleibt leicht unscharf.", "Auch hier gilt: ein Versuch, die Schnellste richtige Lösung gewinnt."],
      s: () => [0, 1, 2].map((i) => `<g opacity="${0.5 + i * 0.25}">` + R(30 + i * 98, 40, 84, 84, "#ffffff22", 12) + E(72 + i * 98, 82, "🗼", 42 - (2 - i) * 4) + `</g>`).join("") + pfeil(106, 150, 214, 150, "#fde68a") + T(160, 170, "wird schärfer", 10, "#fff", 600)
    }
  ],
  // -------------------------------------------------------------------------
  doppelblick: [
    {
      t: "Worum geht's?",
      x: ["Zwei runde Karten liegen nebeneinander, jede mit **8 Symbolen**. Zwischen den beiden Karten gibt es immer **genau ein gemeinsames Symbol**."],
      s: () => C(90, 90, 62, "#fff") + C(230, 90, 62, "#fff") + ["🐶", "🍕", "⭐", "🚗", "🌵", "🎈"].map((e, i) => E(90 + Math.cos(i * 1.047) * 38, 90 + Math.sin(i * 1.047) * 38, e, 18)).join("") + ["🐱", "🍕", "💎", "🚀", "🌈", "🎸"].map((e, i) => E(230 + Math.cos(i * 1.047) * 38, 90 + Math.sin(i * 1.047) * 38, e, 18)).join("") + T(160, 94, "=", 20, "#fff", 800)
    },
    {
      t: "Zuerst antippen",
      x: ["Finde das gemeinsame Symbol und **tippe es an** - auf einer der beiden Karten.", "Du hast pro Runde **einen Versuch**. Tippst du falsch, bist du für diese Runde raus."],
      s: () => C(90, 90, 62, "#fff") + C(230, 90, 62, "#fff") + E(70, 70, "🍕", 22) + E(110, 105, "⭐", 18) + E(65, 110, "🌵", 18) + E(210, 70, "🍕", 22) + E(250, 105, "💎", 18) + E(255, 65, "🚀", 18) + C(70, 70, 18, "none", 'stroke="#ff5b36" stroke-width="3"') + E(150, 150, "👆", 26)
    },
    {
      t: "Punkte nach Tempo",
      x: ["Unter allen **richtigen** Antworten bekommt die schnellste so viele Punkte, wie Mitspieler dabei sind. Jede weitere einen weniger."],
      s: () => rang(70, 28, [["Nader", "+4", 1], ["Du", "+3", 0], ["Luca", "+2", 2], ["Niklas", "❌ 0", 3]], 180) + E(40, 45, "🥇", 22)
    }
  ],
  // -------------------------------------------------------------------------
  "merks-dir": [
    {
      t: "Worum geht's?",
      x: ["**20 Emojis** erscheinen nummeriert (1 bis 20). Merk dir so viele wie möglich - dann verschwindet die Liste."],
      s: () => Array.from({ length: 20 }, (_, i) => { const x = 40 + (i % 5) * 56, y = 25 + Math.floor(i / 5) * 38; return R(x - 20, y - 14, 40, 32, "#ffffff22", 8) + T(x - 13, y - 3, String(i + 1), 7, "#fde68a", 700) + E(x + 2, y + 5, ["🍎", "🐸", "🚗", "🎈", "🌵", "⭐", "🍕", "🦊", "🎸", "🌈", "🐙", "🍩", "⚽", "🌙", "🔔", "🐢", "🎁", "🍓", "🦋", "🔥"][i], 17); }).join("")
    },
    {
      t: "Stelle für Stelle abfragen",
      x: ["Danach wird **Stelle für Stelle** gefragt: Welches Emoji stand an Nummer 7? Tippe das richtige an.", "Wer falsch tippt oder zu langsam ist, **scheidet aus**."],
      s: () => T(160, 30, "Nummer 7?", 16, "#fde68a", 800) + [["🍕", 1], ["🦊", 0], ["🍎", 0], ["🎸", 0]].map(([e, ok], i) => R(35 + i * 62, 55, 54, 54, ok ? "#4ade8066" : "#ffffff22", 12, ok ? 'stroke="#4ade80" stroke-width="2"' : "") + E(62 + i * 62, 83, e, 28)).join("") + E(160, 145, "👆", 28)
    },
    {
      t: "Punkte nach Rang",
      x: ["Wer **zuerst ausscheidet**, bekommt 0 Punkte, jeder Platz später einen mehr. Scheiden mehrere gleichzeitig aus, teilen sie sich den besseren Platz.", "Wer als **Einzige(r) übrig** bleibt, bekommt einen Extrapunkt."],
      s: () => rang(70, 22, [["Du", "🏆 4", 0], ["Niklas", "2", 1], ["Sinan", "1", 2], ["Kevin", "0", 3]], 180) + stern(262, 35)
    }
  ],
  // -------------------------------------------------------------------------
  zeitgefuehl: [
    {
      t: "Worum geht's?",
      x: ["Alle bekommen dieselbe **Zielzeit** genannt, zum Beispiel 17 Sekunden (zufällig zwischen 5 und 30). Nach einem \"3, 2, 1, Los\" verschwindet die Zahl."],
      s: () => T(160, 40, "Zielzeit", 12, "#fde68a") + T(160, 100, "17 s", 54, "#fff", 800) + T(160, 140, "3 · 2 · 1 · Los", 14, "#fff", 700) + uhr(40, 90) + uhr(280, 90)
    },
    {
      t: "Blind mitzählen",
      x: ["Es bleibt nur ein **großer roter Buzzer**. Zähl für dich im Kopf mit und drück genau dann, wenn deiner Meinung nach die Zielzeit erreicht ist."],
      s: () => C(160, 90, 52, "#dc2626", 'stroke="#fecaca" stroke-width="5"') + T(160, 98, "BUZZ", 22, "#fff", 800) + E(55, 60, "🤫", 28) + E(265, 60, "🤫", 28) + T(160, 160, "Keine Uhr! Nur Gefühl.", 11, "#fde68a", 600)
    },
    {
      t: "Wer liegt am nächsten?",
      x: ["Wer am **weitesten daneben** liegt, bekommt 0 Punkte, jeder Platz näher dran einen mehr.", "Wer am nächsten dran ist, bekommt einen **Extrapunkt**."],
      s: () => T(160, 24, "Ziel: 17,0 s", 12, "#fde68a", 800) + rang(70, 36, [["Du", "17,2 · 3+1", 0], ["Nader", "15,9 · 2", 1], ["Sinan", "21,0 · 1", 2], ["Luca", "9,5 · 0", 3]], 180)
    }
  ],
  // -------------------------------------------------------------------------
  stimmts: [
    {
      t: "Worum geht's?",
      x: ["Pro Runde wird eine **Behauptung** gezeigt - einen bekannten Fakt oder einen Mythos. Alle tippen: Stimmt's oder stimmt's nicht?"],
      s: () => ph(95, 10, 130, 160, TZ(160, 40, ["Goldfische haben", "ein Gedächtnis von", "nur 3 Sekunden."], 10) + knopf(105, 100, 50, 28, "Stimmt", "#16a34a") + knopf(165, 100, 50, 28, "Falsch", "#dc2626") + T(160, 150, "Stimmt's?", 11, "#fde68a", 800)) + E(45, 90, "🤔", 32) + E(275, 90, "🧐", 32)
    },
    {
      t: "Auflösung mit Erklärung",
      x: ["Danach wird aufgelöst - mit einer **kurzen Erklärung** und mit allen Antworten. Dann kommt die nächste Behauptung."],
      s: () => R(50, 25, 220, 70, "#4ade8044", 14, 'stroke="#4ade80" stroke-width="2"') + E(80, 60, "✅", 28) + T(180, 52, "Falsch!", 18, "#bbf7d0", 800) + T(180, 72, "Goldfische merken sich Monate.", 9.5, "#fff", 600) + reihe(130, 4, 70, 250, ["Du", "Sinan", "Luca", "Nader"])
    },
    {
      t: "Punkte",
      x: ["Wer richtig tippt, bekommt **einen Punkt**. Wer am **schnellsten richtig** getippt hat, bekommt zusätzlich einen Bonuspunkt."],
      s: () => rang(60, 30, [["Sinan (schnell)", "+1 +1", 1], ["Du", "+1", 0], ["Luca", "0", 2]], 200) + E(40, 45, "⚡", 24) + stern(280, 45)
    }
  ],
  // -------------------------------------------------------------------------
  laenderumrisse: [
    {
      t: "Worum geht's?",
      x: ["Du siehst nur den **Umriss eines Landes**. Welches Land ist das? Die Antwort tippst du selbst ein - es gibt keine Auswahl."],
      s: () => `<path d="M120 30 C150 20 190 28 205 50 C215 70 190 80 195 100 C200 125 170 150 140 148 C115 146 100 120 108 98 C112 80 95 60 120 30Z" fill="#fde68a" stroke="#fff" stroke-width="2"/>` + R(95, 156, 130, 18, "#fff", 9) + T(160, 169, "Land eintippen …", 10, "#555", 600)
    },
    {
      t: "Schreibweise egal",
      x: ["**Groß- und Kleinschreibung und Umlaute** spielen keine Rolle. Deutsche und englische Namen zählen, auch gängige Kürzel wie \"USA\" oder \"UK\"."],
      s: () => ["Deutschland", "germany", "DEUTSCHLAND", "Deutschlnd?"].map((a, i) => R(60, 20 + i * 38, 200, 30, i < 3 ? "#4ade8044" : "#f8717144", 14) + T(80, 40 + i * 38, a, 13, "#fff", 700, "start") + E(240, 35 + i * 38, i < 3 ? "✅" : "❌", 16)).join("")
    },
    {
      t: "Buchstaben-Hinweise",
      x: ["Eine Runde dauert 45 Sekunden. **Nach 12 Sekunden** erscheint der erste Buchstabe des Landes, danach alle 7 Sekunden ein weiterer (bis zu 4)."],
      s: () => ["F", "", "A", "", "", "R", "", "", "", ""].map((b, i) => R(18 + i * 29, 70, 25, 34, b ? "#4ade8066" : "#ffffff22", 6, 'stroke="#fff" stroke-width="1"') + T(30.5 + i * 29, 95, b, 18, "#fff", 800)).join("") + balken(40, 135, 240, 0.4, "#ff5b36", 10) + uhr(160, 38, 14) + T(160, 165, "12 s · 19 s · 26 s · 33 s", 10, "#fde68a", 600)
    },
    {
      t: "Punkte",
      x: ["Wer richtig tippt, bekommt **einen Punkt**, wer am schnellsten richtig war, noch **einen Bonuspunkt**."],
      s: () => rang(60, 30, [["Sinan (schnell)", "+1 +1", 1], ["Du", "+1", 0], ["Kevin", "0", 2]], 200) + E(40, 45, "🌍", 26)
    }
  ],
  // -------------------------------------------------------------------------
  finto: [
    {
      t: "Worum geht's?",
      x: ["Es gibt eine **Frage, die kaum jemand weiß** - zum Beispiel ein kurioses Fakten-Quiz. Niemand muss die echte Antwort kennen."],
      s: () => ph(95, 10, 130, 160, TZ(160, 40, ["Wie viele Zähne hat", "eine Schnecke?"], 10.5) + E(160, 100, "🐌", 40) + T(160, 148, "Keine Ahnung? Perfekt!", 10, "#fde68a", 700)) + E(45, 90, "🤷", 30) + E(275, 90, "🤷", 30)
    },
    {
      t: "Bluffen",
      x: ["Jede(r) erfindet eine möglichst **glaubwürdige falsche Antwort**. Je überzeugender, desto besser."],
      s: () => ph(95, 10, 130, 160, T(160, 36, "Deine Bluff-Antwort", 10.5, "#fde68a") + R(108, 50, 104, 34, "#fff", 8) + T(160, 72, "ca. 14.000", 13, "#222", 700) + knopf(115, 104, 90, 26, "Abschicken", "#ff5b36") + E(160, 148, "😏", 22)) + E(45, 90, "🃏", 30) + E(275, 90, "🃏", 30)
    },
    {
      t: "Die echte Antwort finden",
      x: ["Alle Antworten werden zusammen mit der **echten** gemischt gezeigt. Jede(r) stimmt für die Antwort ab, die er oder sie für echt hält. Die eigene Antwort kann man nicht wählen."],
      s: () => ["ca. 14.000", "ca. 800", "ca. 25.000", "ca. 120"].map((a, i) => R(80, 18 + i * 38, 160, 30, i === 2 ? "#ff5b3655" : "#ffffff22", 12, i === 2 ? 'stroke="#ff5b36" stroke-width="2"' : "") + T(160, 38 + i * 38, a, 13, "#fff", 700)).join("") + E(265, 98, "👆", 28)
    },
    {
      t: "Punkte",
      x: ["**2 Punkte**, wenn du die richtige Antwort erkennst.", "**1 Punkt** für dich, wenn jemand auf deine erfundene Antwort hereinfällt - für jede hereingelegte Person."],
      s: () => R(20, 25, 135, 110, "#4ade8044", 14, 'stroke="#4ade80" stroke-width="2"') + R(165, 25, 135, 110, "#fbbf2444", 14, 'stroke="#fbbf24" stroke-width="2"') + E(88, 62, "🎯", 32) + T(88, 105, "+2", 24, "#bbf7d0", 800) + T(88, 125, "richtig erkannt", 9.5) + E(232, 62, "😈", 32) + T(232, 105, "+1", 24, "#fde68a", 800) + T(232, 125, "pro Hereingefallenem", 9.5)
    }
  ],
  // -------------------------------------------------------------------------
  imposter: [
    {
      t: "Worum geht's?",
      x: ["Alle sehen dasselbe **Geheimwort** - außer dem **Imposter**. Der bekommt nur einen vagen Hinweis und muss so tun, als wüsste er Bescheid."],
      s: () => [[50, 50, "🍕"], [125, 50, "🍕"], [200, 50, "🍕"], [275, 50, "❓"]].map(([x, y, e], i) => R(x - 30, y - 28, 60, 56, i === 3 ? "#dc262666" : "#ffffff2a", 12) + E(x, y, e, 28) + avatar(x, y + 50, i, i === 3 ? "Imposter" : "", 10)).join("") + T(160, 150, "Alle kennen das Wort - nur einer nicht", 11, "#fde68a", 600, "middle")
    },
    {
      t: "Karte aufdecken",
      x: ["Deine Karte zeigt deinen Namen. **Zieh sie nach oben**, dann siehst du den Begriff - oder \"Imposter\".", "Lässt du los, fällt sie wieder zu. So bleibt dein Geheimnis geheim."],
      s: () => ph(105, 10, 110, 160, R(115, 90, 90, 60, "#fff7ec", 10) + T(160, 125, "Niklas", 16, "#222", 800) + R(115, 40, 90, 44, "#fbbf24", 10) + T(160, 68, "PIZZA", 16, "#222", 800) + `<path d="M160 90 L160 74" stroke="#fff" stroke-width="3" marker-end="none"/>`) + E(250, 90, "👆", 32) + E(70, 90, "🤐", 32)
    },
    {
      t: "Reden und finden",
      x: ["Am Tisch beschreibt reihum jede(r) den Begriff - **nicht zu eindeutig**, damit der Imposter ihn nicht errät. Zufällig wird eine Person angezeigt, die beginnt.", "Der Imposter redet unauffällig mit."],
      s: () => avatar(60, 70, 0, "") + avatar(160, 50, 1, "") + avatar(260, 70, 2, "") + avatar(110, 130, 3, "") + avatar(210, 130, 4, "") + blase(76, 38, "lecker", 46, "l") + blase(176, 22, "rund", 38, "l") + blase(222, 48, "warm", 38, "r") + E(160, 100, "🗣️", 22)
    },
    {
      t: "Auflösen",
      x: ["Wenn genug diskutiert wurde, **löst der Spielleiter auf** und zeigt, wer der Imposter war.", "Imposter gibt es **ohne Punkte** - das Spiel lebt vom Gespräch am Tisch."],
      s: () => E(160, 70, "🎭", 56) + T(160, 125, "Der Imposter war …", 13, "#fde68a", 700) + knopf(105, 138, 110, 28, "Auflösen", "#ff5b36")
    }
  ],
  // -------------------------------------------------------------------------
  "fussball-auktion": [
    {
      t: "Worum geht's?",
      x: ["Du **ersteigerst Fußballer**, stellst dir damit ein Team zusammen und trittst in **5 Spielrunden** gegen deine Freunde an.", "Wer am Ende die meisten Punkte hat, gewinnt."],
      s: () => ["🇮🇹", "🇦🇷", "🇯🇵"].map((f, i) => R(50 + i * 75, 32, 62, 92, "#fff", 8, `transform="rotate(${(i - 1) * 8} ${81 + i * 75} 78)"`) + E(81 + i * 75, 62 + Math.abs(i - 1) * 2, f, 26) + T(81 + i * 75, 100, ["Verteidiger", "Stürmer", "Mittelfeld"][i], 8, "#222", 700)).join("") + T(160, 155, "Auktion → Spielrunden", 12, "#fde68a", 700)
    },
    {
      t: "Münzen und Karten",
      x: ["Jeder startet mit **50 Münzen**. Das ist dein Budget für die ganze Auktion - es gibt kein Nachfüllen.", "Du kannst **höchstens 5 Karten** besitzen. Die Auktion hat 5 Gebotsrunden. Was du nicht ausgibst, nimmst du mit in die Spielrunden (dort gibt es 15 Münzen dazu)."],
      s: () => E(80, 70, "🪙", 44) + T(80, 115, "50", 28, "#fde68a", 800) + T(80, 135, "Startmünzen", 10) + [0, 1, 2, 3, 4].map((i) => R(150 + i * 32, 45, 28, 42, i < 3 ? "#fff" : "#ffffff33", 5)).join("") + T(230, 110, "max. 5 Karten", 11, "#fff", 700)
    },
    {
      t: "Verdeckt bieten",
      x: ["Alle sehen dieselben Karten und bieten **gleichzeitig und verdeckt** Münzen darauf.", "Alle Gebote einer Runde zusammen dürfen deine Münzen nicht übersteigen. Ein Gebot von 0 heißt: Diese Karte interessiert dich nicht."],
      s: () => [0, 1, 2].map((i) => R(30 + i * 95, 25, 78, 80, "#fff", 8) + E(69 + i * 95, 55, ["🇧🇷", "🇩🇪", "🇫🇷"][i], 24) + R(40 + i * 95, 82, 58, 18, "#2a1f35", 9) + T(69 + i * 95, 95, ["12", "20", "0"][i] + " 🪙", 10, "#fff", 800)).join("") + T(160, 135, "Summe: 32 / 50 Münzen", 12, "#fde68a", 700) + balken(60, 148, 200, 0.64, "#4ade80", 8)
    },
    {
      t: "Wer bekommt die Karte?",
      x: ["Das **höchste Gebot** gewinnt und zahlt genau diesen Betrag.", "Gleichstand = **Stechen**: Wer gleichauf liegt, hat 10 Sekunden zum Erhöhen. Läuft der Timer ab, entscheidet das Los. Unverkaufte Karten kommen in einer Bonusrunde nochmal dran."],
      s: () => avatar(70, 70, 0, "Du") + avatar(250, 70, 1, "Luca") + blase(30, 30, "20 🪙", 50, "l") + blase(222, 30, "20 🪙", 50, "r") + T(160, 80, "= Stechen", 16, "#fde68a", 800) + uhr(160, 125, 14) + T(160, 160, "10 Sekunden", 10, "#fff", 600)
    },
    {
      t: "Länderboni",
      x: ["Besitzt du **mehrere Spieler desselben Landes**, bekommst du einen Bonus - je mehr, desto stärker (ab 2 Karten).", "Zum Beispiel Italien: Verteidigung +2 auf beiden Karten bei zwei Italienern. Deutschland und Nigeria haben Sonderboni."],
      s: () => ["🇮🇹", "🇮🇹"].map((f, i) => R(80 + i * 85, 28, 70, 104, "#fff", 8) + E(115 + i * 85, 62, f, 28) + T(115 + i * 85, 95, "Verteidigung", 8.5, "#222", 700) + R(95 + i * 85, 104, 40, 18, "#16a34a", 9) + T(115 + i * 85, 117, "+2", 11, "#fff", 800)).join("") + T(160, 160, "2 Italiener = Verteidigung +2", 11, "#fde68a", 700)
    },
    {
      t: "Die Spielrunden",
      x: ["Jede der 5 Runden hat zwei Schritte: Erst wählst du **verdeckt eine Karte**, die du noch nicht gespielt hast. Dann setzt du **Münzen auf die 6 Fähigkeiten** (Schuss, Pass, Technik, Verteidigung, Tempo, Spielverständnis).", "Die **zwei Fähigkeiten mit den meisten Münzen** entscheiden die Runde."],
      s: () => ["SCH", "PAS", "TEC", "VER", "TEM", "SPI"].map((k, i) => R(22 + i * 46, 100 - [18, 40, 12, 30, 6, 14][i], 38, [18, 40, 12, 30, 6, 14][i] + 30, i === 1 || i === 3 ? "#fbbf24" : "#ffffff33", 6) + T(41 + i * 46, 146, k, 9, "#fff", 700)).join("") + T(160, 40, "Münzen auf Fähigkeiten", 11, "#fde68a", 700) + T(160, 160, "Die zwei höchsten zählen", 11, "#fff", 600)
    },
    {
      t: "Punkte pro Runde",
      x: ["Alle Karten werden aufgedeckt und nach ihrer Summe sortiert. **Letzter Platz: −1**, der Vorletzte 1, jeder Platz weiter oben einen Punkt mehr. **Der Beste bekommt zusätzlich +2.**"],
      s: () => rang(70, 22, [["Luca", "+5", 1], ["Du", "+2", 0], ["Sinan", "+1", 2], ["Niklas", "−1", 3]], 180) + E(44, 35, "🥇", 24) + T(262, 35, "+2 Bonus", 9, "#fde68a", 700)
    }
  ],
  // -------------------------------------------------------------------------
  groessenvergleich: [
    {
      t: "Worum geht's?",
      x: ["Du siehst zwei Silhouetten nebeneinander: ein **blaues Vorbild** mit angegebener echter Größe - zum Beispiel \"Eiffelturm: 330 m\" - und eine **rote Silhouette**, die du einstellen musst."],
      s: () => `<path d="M80 150 L95 40 L105 150Z" fill="#60a5fa" stroke="#fff" stroke-width="1.5"/>` + T(92, 30, "330 m", 11, "#bfdbfe", 800) + `<path d="M205 150 C205 120 215 70 225 70 C235 70 245 120 245 150Z" fill="#f87171" stroke="#fff" stroke-width="1.5"/>` + T(225, 30, "Blauwal?", 11, "#fecaca", 800) + `<line x1="40" y1="150" x2="280" y2="150" stroke="#fff" stroke-width="1.5"/>`
    },
    {
      t: "Mit dem Regler einstellen",
      x: ["Mit einem **Schieberegler** stellst du ein, wie groß oder lang du das Rote Objekt schätzt. Alle schätzen gleichzeitig."],
      s: () => `<path d="M90 120 C90 95 100 60 110 60 C120 60 130 95 130 120Z" fill="#f87171" stroke="#fff" stroke-width="1.5"/>` + R(60, 140, 200, 8, "#ffffff44", 4) + R(60, 140, 120, 8, "#ff5b36", 4) + C(180, 144, 12, "#fff", 'stroke="#ff5b36" stroke-width="3"') + E(240, 70, "👆", 28) + T(200, 40, "Wie lang ist der Blauwal?", 11, "#fff", 700)
    },
    {
      t: "Wer liegt am nächsten?",
      x: ["Wer **prozentual am nächsten** an der echten Größe liegt, bekommt die meisten Punkte - Rang-Punkte wie bei Zeitgefühl, plus ein Extrapunkt für die beste Schätzung."],
      s: () => T(160, 24, "Echt: 30 m", 12, "#fde68a", 800) + rang(70, 36, [["Du", "28 m · 3+1", 0], ["Niklas", "40 m · 2", 1], ["Kevin", "5 m · 1", 2], ["Nader", "90 m · 0", 3]], 180)
    }
  ],
  // -------------------------------------------------------------------------
  knobeln: [
    {
      t: "Worum geht's?",
      x: ["Das klassische **Streichholz-Knobeln**: Jede(r) nimmt heimlich **0 bis 3 Hölzer** in die Faust."],
      s: () => [0, 1, 2, 3].map((i) => E(55 + i * 70, 85, "✊", 40) + T(55 + i * 70, 125, ["2", "0", "3", "1"][i] + " 🔥", 11, "#fde68a", 700) + R(35 + i * 70, 62, 40, 14, "#0b0710", 7) + T(55 + i * 70, 73, "?", 10, "#fff", 800)).join("") + T(160, 160, "Heimlich auswählen", 11, "#fff", 600)
    },
    {
      t: "Gesamtzahl tippen",
      x: ["Danach tippt **reihum** jede(r), wie viele Hölzer **insgesamt** in allen Fäusten stecken. Jede Zahl darf pro Runde **nur einmal** getippt werden."],
      s: () => T(160, 30, "Wie viele Hölzer insgesamt?", 12, "#fde68a", 700) + [0, 1, 2, 3, 4, 5, 6].map((i) => R(25 + i * 38, 55, 33, 40, i === 3 || i === 5 ? "#ffffff11" : "#ffffff33", 8) + T(41 + i * 38, 82, String(i), 16, i === 3 || i === 5 ? "#ffffff55" : "#fff", 800)).join("") + T(160, 125, "Schon vergeben: durchgestrichen", 10, "#fff", 600) + avatar(60, 150, 0, "") + avatar(100, 150, 1, "") + avatar(140, 150, 2, "")
    },
    {
      t: "Aufdecken",
      x: ["Dann wird aufgelöst: Wer die **Gesamtzahl richtig** getippt hat, ist **raus** (gerettet). Mit den Übrigen beginnt die nächste Runde.", "Das geht so weiter, bis nur noch eine Person übrig ist - das ist der **Verlierer**."],
      s: () => E(160, 55, "🔥", 36) + T(160, 98, "Gesamt: 6", 18, "#fde68a", 800) + avatar(60, 140, 0, "Du ✅") + avatar(130, 140, 1, "Kevin") + avatar(200, 140, 2, "Nader") + avatar(270, 140, 3, "Niklas") + E(60, 120, "🎉", 16)
    },
    {
      t: "Optionen & Punkte",
      x: ["Der Spielleiter stellt ein, **wie viele richtige Tipps** man braucht, um rauszugehen (1 bis 3). Optional gibt es ein **Finale**: zwei Durchgänge mit allen, danach spielen die beiden Verlierer gegeneinander.", "Wer zuerst rausgeht, bekommt die meisten Punkte, der Verlierer 0. Der Finalsieger erhält **3 Zusatzpunkte**."],
      s: () => rang(70, 22, [["Kevin (zuerst raus)", "4", 1], ["Du", "3", 0], ["Nader", "2", 2], ["Niklas (Verlierer)", "0", 3]], 180) + E(44, 35, "🏁", 22)
    }
  ],
  // -------------------------------------------------------------------------
  tetris: [
    {
      t: "Alle spielen gleichzeitig",
      x: ["Alle spielen **gleichzeitig** ihr eigenes Tetris - mit **denselben Steinen** in derselben Reihenfolge. Oben siehst du live die Spielfelder der anderen mit ihren Punkten.", "Rechts neben deinem Feld stehen die **nächsten drei Steine** sowie Punkte, Zeilen und Level. Nach einem **3-2-1-Countdown** geht es für alle gleichzeitig los."],
      s: () => R(40, 30, 90, 130, "#0b0710", 8, 'stroke="#fff" stroke-opacity=".4"') + R(150, 30, 60, 130, "#0b0710", 8, 'stroke="#fff" stroke-opacity=".4"') + R(230, 30, 60, 60, "#0b0710", 8, 'stroke="#fff" stroke-opacity=".4"') + R(50, 130, 70, 20, "#06b6d4", 3) + R(160, 140, 40, 10, "#a855f7", 2) + T(90, 22, "Du", 11, "#fff", 800) + T(180, 22, "Luca", 10) + T(260, 22, "Kevin", 10)
    },
    {
      t: "Steuerung",
      x: ["Mit den **Tasten** unten bewegst du den Stein (◀ ▶), drehst ihn (⟲ ⟳) oder lässt ihn **sofort fallen** (⤓).", "Alternativ **wischst** du auf dem Spielfeld: seitlich = bewegen, **tippen** = drehen, **nach unten wischen** = fallen lassen. Der blasse **Schatten** zeigt, wo der Stein landet."],
      s: () => knopf(20, 128, 62, 32, "◀", "#ffffff22") + knopf(88, 128, 62, 32, "▶", "#ffffff22") + knopf(156, 128, 40, 32, "⟲", "#ffffff22") + knopf(202, 128, 40, 32, "⟳", "#ffffff22") + knopf(248, 128, 52, 32, "⤓", "#06b6d4") + R(120, 20, 80, 30, "#06b6d4", 4) + T(160, 90, "oder wischen", 13, "#fde68a", 700)
    },
    {
      t: "Müllzeilen an alle",
      x: ["Löschst du Zeilen, schickst du **Müllzeilen an alle anderen**: 2 Zeilen = 1, 3 Zeilen = 2, 4 Zeilen = 4. Ab dem **dritten Treffer in Folge** gibt es 1 Müllzeile extra.", "Eingehender Müll steht als **roter Balken** neben deinem Feld. Er kommt erst, wenn du einen Stein ablegst, **ohne Zeilen zu löschen**. Eigene Angriffe heben ihn vorher auf. Jede Müllzeile hat **ein Loch**.", "Der Spielleiter kann Müllzeilen im Setup auch ausschalten."],
      s: () => R(100, 30, 100, 120, "#0b0710", 8, 'stroke="#fff" stroke-opacity=".4"') + R(100, 120, 45, 15, "#8b93a7", 0) + R(155, 120, 45, 15, "#8b93a7", 0) + R(100, 135, 45, 15, "#8b93a7", 0) + R(155, 135, 45, 15, "#8b93a7", 0) + R(215, 100, 10, 50, "#ef4444", 5) + T(250, 125, "Müll!", 12, "#fecaca", 800)
    },
    {
      t: "Ausscheiden und Gewinnen",
      x: ["Stößt dein Stapel oben an, **scheidest du aus** und schaust den anderen zu. **Gewonnen** hat, wer als **Letzter** übrig bleibt. Mit der Zeit wird das Spiel immer **schneller**.", "Der Letzte bekommt **1 Punkt**, jeder bessere Platz einen mehr. Auch allein kannst du spielen: Im Setup nimmst du **1 bis 3 Bots** dazu und stellst ihre **Stärke** ein (Leicht, Mittel, Schwer). Die Bots laufen auf dem Handy des Spielleiters."],
      s: () => rang(70, 22, [["Du", "3 P.", 0], ["Luca", "2 P.", 1], ["Niklas", "1 P.", 2]], 180) + E(44, 35, "🏆", 24) + T(160, 150, "Letzter Spieler gewinnt", 11, "#fde68a", 700)
    }
  ],
  // -------------------------------------------------------------------------
  doppelkopf: [
    {
      t: "Worum geht's?",
      x: ["Doppelkopf wird zu **viert** gespielt (zu fünft setzt der Geber aus). Ihr könnt auch **alleine mit Bots** spielen: fehlende Plätze werden aufgefüllt.", "Zwei Teams: **Re** (wer eine Kreuz-Dame hat) gegen **Kontra**."],
      s: () => dkKarte("CQ0", 70, 25, 52, -8) + dkKarte("CQ1", 105, 30, 52, 6) + T(110, 155, "Re", 14, "#fecaca", 800) + avatar(235, 55, 1, "") + avatar(280, 55, 2, "") + avatar(235, 105, 3, "") + T(258, 155, "Kontra", 14, "#bfdbfe", 800) + rueck(190, 38, 26, 0)
    },
    {
      t: "Trumpf: die starken Karten",
      x: ["Trümpfe sind **Herz-10 (Dulle)**, alle **Damen**, alle **Buben** und alle **Karo**-Karten. Die Reihenfolge von stark nach schwach: Dulle, Damen (Kreuz, Pik, Herz, Karo), Buben (gleiche Reihenfolge), dann Karo-Ass, Karo-10, Karo-König, Karo-9.", "Im Blatt liegen die **besten Karten ganz rechts**."],
      s: () => ["HT0", "DQ0", "SQ0", "HQ0", "CQ0", "CJ0"].map((id, i) => dkKarte(id, 20 + i * 37, 40 + (i % 2) * 6, 44)).join("") + T(160, 25, "stark  →  schwach", 10, "#fde68a", 700) + T(160, 160, "Dulle · Damen · Buben · Karo", 11, "#fff", 600)
    },
    {
      t: "Stiche und Augen",
      x: ["Es gilt **Farbzwang**: Du musst die ausgespielte Farbe bedienen (Trumpf mit Trumpf). Wer das nicht kann, darf stechen oder abwerfen. Die höchste Karte gewinnt den Stich.", "Zählwerte: **Ass 11, 10 = 10, König 4, Dame 3, Bube 2, Neun 0**. Insgesamt 240 Augen - Re braucht **121** zum Gewinnen."],
      s: () => dkKarte("SA0", 40, 20, 52, -10) + dkKarte("S90", 95, 12, 52, 4) + dkKarte("SK0", 150, 22, 52, 12) + dkKarte("HQ0", 205, 16, 52, 24) + E(160, 125, "🃏", 0) + T(160, 150, "Höchste Karte gewinnt den Stich", 11, "#fde68a", 700) + T(160, 168, "11 · 10 · 4 · 3 · 2 · 0 Augen", 10, "#fff", 600)
    },
    {
      t: "Gesund oder Vorbehalt?",
      x: ["Vor dem Spiel wird **reihum** gefragt: **Gesund** (ganz normal spielen) oder **Vorbehalt**?", "Vorbehalte sind: **Hochzeit** (beide Kreuz-Damen: du suchst dir einen Partner), **Armut** (höchstens 3 Trümpfe), **Schmeißen** (mindestens 5 Neuner) oder ein **Solo** - alleine gegen die anderen, mit dreifachen Punkten."],
      s: () => R(60, 25, 200, 130, "#0b0710cc", 16, 'stroke="#fff" stroke-opacity=".3"') + T(160, 52, "Du bist dran", 14, "#fff", 800) + knopf(80, 66, 160, 28, "Gesund", "#ff5b36") + knopf(80, 104, 160, 28, "Vorbehalt", "#ffffff22", "#ff8a6b")
    },
    {
      t: "Ansagen und Punkte",
      x: ["Du kannst **Re** oder **Kontra** ansagen und damit mehr riskieren (später Keine 90, Keine 60, Keine 30, Schwarz). Jede Ansage gibt einen Punkt dazu.", "Punkte gibt es für **Gewinnen**, **Keine 90/60/30**, **Gegen die Alten** und je nach Einstellung für Sonderpunkte wie **Fuchs** (Karo-Ass fangen), **Doppelkopf** (Stich mit mindestens 40 Augen) und **Karlchen** (letzter Stich mit Kreuz-Bube)."],
      s: () => R(20, 28, 135, 60, "#f8717144", 14) + T(88, 55, "Re!", 22, "#fecaca", 800) + T(88, 76, "Ansage", 10, "#fff", 600) + R(165, 28, 135, 60, "#60a5fa44", 14) + T(232, 55, "Kontra!", 20, "#bfdbfe", 800) + T(232, 76, "Ansage", 10, "#fff", 600) + [["Gewonnen", "+1"], ["Keine 90", "+1"], ["Fuchs gefangen", "+1"]].map(([a, p], i) => T(70, 112 + i * 17, a, 11, "#fff", 600, "start") + T(250, 112 + i * 17, p, 12, "#fde68a", 800, "end")).join("")
    },
    {
      t: "Mehrere Runden",
      x: ["Gespielt werden **mehrere Runden** (Anzahl stellt der Spielleiter ein). Die Punkte jeder Partie werden zusammengezählt.", "Zwischendurch gibt es **Bockrunden** (nach 0-Punkte-Spielen, doppelte Punkte) und je Spieler ein **Pflichtsolo**, wenn aktiviert. Ein Tipp: Mit \"Letzter Stich\" siehst du den vorherigen Stich nochmal."],
      s: () => rang(70, 22, [["Sinan", "+12", 1], ["Du", "+5", 0], ["Nader", "−7", 2], ["Kevin", "−10", 3]], 180) + E(44, 35, "🏆", 24) + T(160, 150, "Punktestand nach 4 Partien", 11, "#fde68a", 700)
    }
  ]
};

// ============================================================================
//  Feinschliff nach dem Abgleich mit dem echten Spiel (Screenshots der Seiten
//  liegen in bilder/anleitung/<spiel>-<seite>.webp)
// ============================================================================
const fix = (spiel, seite, teil) => Object.assign(ANLEITUNGEN[spiel][seite - 1], teil);
const plus = (spiel, seite, ...absaetze) => ANLEITUNGEN[spiel][seite - 1].x.push(...absaetze);

fix("schaetzfragen", 2, {
  t: "Dummkopf-Modus (optional)",
  x: ["Der Spielleiter kann vor dem Start den **Dummkopf-Modus** einschalten. Dann tippst du vor jeder Frage, **wer am weitesten danebenliegt** - nur auf andere Mitspieler.",
    "**Nur in diesem Modus** kannst du dafür einen **Extrapunkt** bekommen, nämlich wenn dein Tipp richtig war. Ohne Dummkopf-Modus gibt es diesen Schritt und diesen Punkt nicht."]
});
plus("schaetzfragen", 3, "Mit eingeschaltetem Dummkopf-Modus kommt bei richtigem Tipp **+1** dazu.");
fix("wer-ist-es", 2, { x: ["Wer **zuerst buzzert**, darf als Erstes raten und hat dafür **10 Sekunden**. Die anderen sehen nur, wer gerade antwortet - ein **falscher Name** erscheint danach für alle in der Liste."] });
plus("zehn-treffer", 2, "Pro Runde habt ihr **40 Sekunden** - oder bis alle 10 Treffer markiert sind.");
plus("reih-dich-ein", 1, "Es gibt mehrere **Kategorien** hintereinander, jede mit einer neuen Reihe.");
plus("reih-dich-ein", 3, "Auch bei einer falschen Position landet der Begriff danach an der **richtigen Stelle** der Reihe.");
fix("wann-war-es", 3, { x: ["Weniger Hinweise = **mehr Punkte**. Eine falsche Antwort kostet Punkte (**−1, −2, −3 …** je Person und Frage) und deckt den nächsten Hinweis auf.", "Sind **alle Hinweise aufgedeckt** und niemand kennt das Jahr, kann der Spielleiter die Runde auflösen."] });
fix("blitzquiz", 4, { x: ["Ein Bild startet **stark unscharf** und wird **gleichmäßig schärfer** - nach **32 Sekunden** ist es ganz scharf.", "Auch hier gilt: ein Versuch, die schnellste richtige Lösung gewinnt."] });
plus("doppelblick", 1, "Im Setup gibt es außerdem den Modus **Turm**: Jeder hat einen eigenen Kartenstapel, wer seinen Stapel zuerst los ist, gewinnt.");
fix("merks-dir", 3, { x: ["Wer **zuerst ausscheidet**, bekommt 0 Punkte, jeder Platz später einen mehr. Scheiden mehrere gleichzeitig aus, teilen sie sich den besseren Platz.", "Wer **am längsten dabei** ist (bei Gleichstand alle davon), bekommt einen Extrapunkt."] });
plus("merks-dir", 1, "Die Merk- und Tippzeit stellt der Spielleiter ein (Standard 15 Sekunden).");
fix("zeitgefuehl", 1, { x: ["Alle bekommen dieselbe **Zielzeit** genannt, zum Beispiel 17 Sekunden (zufällig zwischen 5 und 30). Nach einem **3-2-1-Countdown** verschwindet die Zahl."] });
fix("groessenvergleich", 1, { x: ["Du siehst zwei Silhouetten nebeneinander: ein **blaues Vorbild** (zum Beispiel der Eiffelturm) und eine **rote Silhouette**, die du auf die richtige Größe einstellen musst.", "Die Größen sind **nicht angegeben** - du schätzt aus dem Gefühl. Der Spielleiter wählt vorab Objekte, Länder (Fläche) oder gemischt."] });
fix("groessenvergleich", 2, { x: ["Mit einem **Schieberegler** (feiner mit **− / +**) stellst du ein, wie groß oder lang du das rote Objekt schätzt. Alle schätzen gleichzeitig.", "Du hast **30 Sekunden** - danach zählt deine aktuelle Einstellung. Bestätige mit **\"Das ist meine Schätzung\"**."] });
plus("imposter", 4, "Der Spielleiter kann im Setup auch **mehrere Imposter** einstellen.");
plus("fussball-auktion", 2, "Für Gebote und Spielrunden hast du jeweils **60 Sekunden**. Wer am Ende weniger als 5 Karten hat, bekommt unverkaufte Karten zufällig geschenkt.");
plus("fussball-auktion", 4, "Jedes Erhöhen setzt den Timer wieder auf 10 Sekunden.");
plus("fussball-auktion", 6, "Bezahlt werden nur die Münzen auf den **zwei entscheidenden Fähigkeiten**, der Rest kommt zurück.");
plus("fussball-auktion", 7, "Bei gleicher Summe entscheidet die **Gesamtwertung** der Karte.");
plus("doppelkopf", 4, "Wer nach **30 Sekunden** nicht entscheidet, ist automatisch gesund.");
fix("doppelkopf", 5, { x: [
  "Du kannst **Re** oder **Kontra** ansagen und damit mehr riskieren. Das geht, **bis du deine 2. Karte gelegt hast** (also vor deiner zweiten Karte).",
  "**Keine 90** darfst du ansagen, wenn deine Partei vorher schon Re/Kontra gesagt hat - spätestens **vor deiner 3. Karte**. Dann geht es weiter: Keine 60 vor der 4. Karte, Keine 30 vor der 5., Schwarz vor der 6. Jede Ansage gibt einen Punkt dazu.",
  "Bei einer **Hochzeit** verschiebt sich das, bis die Partner gefunden sind. Ist der Partner schon im 1. Stich klar, kannst du Re/Kontra noch **vor deiner 3. Karte** ansagen - und Keine 90/60/30/Schwarz jeweils eine Karte später.",
  "Punkte gibt es für **Gewinnen**, **Keine 90/60/30**, **Gegen die Alten** und je nach Einstellung für Sonderpunkte wie **Fuchs** (Karo-Ass fangen), **Doppelkopf** (Stich mit mindestens 40 Augen) und **Karlchen** (letzter Stich mit Kreuz-Bube)."
] });
plus("doppelkopf", 5, "Sagt jemand an, erscheint die Ansage kurz **groß in der Mitte**. Für diese Zeit ist der Ansage-Knopf gesperrt, damit niemand versehentlich die nächste Stufe anklickt.");
plus("doppelkopf", 6, "Im Ergebnis steht das **Siegerteam oben**, und unter jedem Profilbild siehst du den **Gesamtstand** des Spielers.");

// ---------------------------------------------------------------------------
// v360: Einheitliches Punktesystem. Platz 1 = Spieleranzahl + 1 Punkt, Platz 2 = n−1, Platz 3 = n−2 …
// (der Letzte bekommt 1); wer nichts geschafft hat, bekommt 0. Szenen gehen von 4 Spielern aus (5 · 3 · 2 · 1).
// Seiten mit "ohneFoto" zeigen die gezeichnete Szene statt eines (veralteten) Screenshots.
// ---------------------------------------------------------------------------
const PL = "Platz 1 bekommt **so viele Punkte wie Spieler im Raum plus 1**, Platz 2 einen Punkt weniger als die Spieleranzahl, Platz 3 zwei weniger und so weiter. Der Letzte bekommt 1 Punkt. Bei 4 Spielern: **5 · 3 · 2 · 1**.";
const RUNDEN = "Die Punkte aller Runden werden zusammengezählt und gehen in die **Gesamtwertung**.";
const GW = "**Gesamtwertung:** Am Ende zählt dein Platz in diesem Spiel - Platz 1 bekommt Spieleranzahl + 1 Punkte, Platz 2 einen weniger als die Spieleranzahl, Platz 3 zwei weniger usw. (bei 4 Spielern: 5 · 3 · 2 · 1).";
const unifiedRang = (zeilen) => rang(70, 28, zeilen, 180) + E(40, 45, "🥇", 22);

fix("schaetzfragen", 3, {
  ohneFoto: true,
  x: ["Wer am **nächsten** an der richtigen Zahl liegt, ist Platz 1. " + PL, "Wer **keinen Tipp** abgibt, bekommt 0 Punkte.", RUNDEN],
  s: () => T(160, 24, "Wahrer Wert: 330 m", 13, "#fde68a", 800) + rang(95, 40, [["Du", "330 · 5", 0], ["Luca", "320 · 3", 1], ["Kevin", "400 · 2", 2], ["Niklas", "900 · 1", 3]], 130) + stern(250, 60) + E(262, 120, "🏆", 26)
});
plus("schaetzfragen", 3, "Mit eingeschaltetem Dummkopf-Modus kommt bei richtigem Tipp **+1** dazu.");

fix("wer-ist-es", 1, {
  ohneFoto: true,
  x: ["Es wird ein **Fußballer** gesucht. Nach und nach werden Hinweise aufgedeckt - **alle 7 Sekunden** kommt ein neuer dazu.", "Wer die Person erkennt, **tippt den Namen ein**. Alle raten gleichzeitig und dürfen so oft tippen, wie sie wollen."],
  s: () => T(160, 30, "Wer ist es?", 14, "#fde68a", 800) + ["Hinweis 1", "Hinweis 2", "Hinweis 3"].map((h, i) => R(50, 42 + i * 30, 220, 24, "#ffffff22", 12) + T(160, 59 + i * 30, h, 11, "#fff", 600)).join("") + R(90, 142, 140, 26, "#fff", 8) + T(160, 160, "Name eintippen …", 11, "#555", 600)
});
fix("wer-ist-es", 2, {
  ohneFoto: true,
  t: "Punkte nach Reihenfolge",
  x: ["Wer **zuerst richtig** liegt, ist Platz 1, wer als Nächster richtig liegt, Platz 2 und so weiter. " + PL, "Die anderen **raten weiter**. Haben **alle** richtig getippt, endet die Runde sofort.", RUNDEN],
  s: () => unifiedRang([["Kevin", "+5", 1], ["Du", "+3", 0], ["Luca", "+2", 2], ["Sinan", "+1", 3]])
});
fix("wer-ist-es", 3, {
  ohneFoto: true,
  t: "Nicht gelöst = 0 Punkte",
  x: ["Wer es bis zum Ende nicht erkennt, bekommt **0 Punkte**.", "Nach dem **letzten Hinweis** bleiben noch **10 Sekunden** zum Lösen, danach wird die Runde aufgelöst.", "Sind alle Hinweise aufgedeckt und niemand kennt die Person, kann der Spielleiter die Runde auch sofort auflösen."],
  s: () => uhr(160, 80, 40) + T(160, 90, "10 s", 18, "#ff5b36", 800) + T(160, 160, "Letzter Hinweis - letzte Chance", 11, "#fde68a", 600)
});
fix("wer-ist-es", 4, {
  ohneFoto: true,
  x: ["Eine falsche Antwort kostet **Punkte** - und alle sehen den falschen Namen in der Liste.", "Tippst du bei derselben Frage nochmal falsch, steigt der Abzug: **−1, −2, −3 …** Du darfst aber weiter raten."]
});
fix("wann-war-es", 1, {
  ohneFoto: true,
  x: ["Gesucht ist ein **Jahr**. Du bekommst nacheinander Hinweise zu Ereignissen aus diesem Jahr - alle **7 Sekunden** einen neuen.", "Wer das Jahr kennt, **tippt es ein**. Alle raten gleichzeitig und dürfen so oft tippen, wie sie wollen."],
  s: () => T(160, 30, "Wann war es?", 14, "#fde68a", 800) + ["Hinweis 1", "Hinweis 2", "Hinweis 3"].map((h, i) => R(50, 42 + i * 30, 220, 24, "#ffffff22", 12) + T(160, 59 + i * 30, h, 11, "#fff", 600)).join("") + R(90, 142, 140, 26, "#fff", 8) + T(160, 160, "1954?", 12, "#555", 700)
});
fix("wann-war-es", 2, {
  ohneFoto: true,
  t: "Jahr tippen",
  x: ["Gib deinen Tipp ein und schicke ihn ab - **so oft du willst**, bis du richtig liegst.", "Ein falscher Tipp kostet Punkte: **−1, −2, −3 …** je Person und Frage."],
  s: () => ph(95, 10, 130, 160, T(160, 38, "Du bist dran!", 11, "#fde68a") + R(108, 55, 104, 32, "#fff", 8) + T(160, 79, "1954", 20, "#222", 800) + knopf(115, 104, 90, 26, "Antworten", "#ff5b36"))
});
fix("wann-war-es", 3, {
  ohneFoto: true,
  t: "Punkte wie bei \"Wer ist es?\"",
  x: ["Wer **zuerst das richtige Jahr** nennt, ist Platz 1. " + PL, "Wer es nicht löst, bekommt **0**. Nach dem letzten Hinweis bleiben **10 Sekunden** zum Lösen. Sind alle richtig, endet die Runde sofort.", "Sind alle Hinweise aufgedeckt und niemand kennt das Jahr, kann der Spielleiter die Runde auch sofort auflösen.", RUNDEN],
  s: () => unifiedRang([["Luca", "+5", 1], ["Du", "+3", 0], ["Sinan", "+2", 2], ["Nader", "0", 3]])
});
fix("blitzquiz", 2, {
  ohneFoto: true,
  x: ["Mehrfachauswahl auf Schnelligkeit. Die **schnellste richtige** Antwort ist Platz 1. " + PL, "Falsche oder fehlende Antworten bringen 0 Punkte.", RUNDEN]
});
fix("doppelblick", 3, {
  ohneFoto: true,
  x: ["Unter allen **richtigen** Antworten ist die schnellste Platz 1. " + PL, "Wer falsch tippt, bekommt 0 Punkte. Im Modus **Turm** gilt dieselbe Punkteverteilung für die Platzierung am Ende.", RUNDEN],
  s: () => unifiedRang([["Nader", "+5", 1], ["Du", "+3", 0], ["Luca", "+2", 2], ["Niklas", "❌ 0", 3]])
});
fix("merks-dir", 3, {
  ohneFoto: true,
  x: ["Wer **am längsten dabei** ist, ist Platz 1. " + PL.replace("Der Letzte bekommt 1 Punkt.", "Wer als Erster ausscheidet, bekommt 1 Punkt."), "Scheiden mehrere gleichzeitig aus, teilen sie sich den besseren Platz.", RUNDEN],
  s: () => rang(70, 22, [["Du", "🏆 5", 0], ["Niklas", "3", 1], ["Sinan", "2", 2], ["Kevin", "1", 3]], 180) + stern(262, 35)
});
fix("zeitgefuehl", 1, {
  ohneFoto: true,
  x: ["Alle bekommen dieselbe **Zielzeit** genannt, zum Beispiel 17 Sekunden (zufällig zwischen 5 und 30).", "Beim Start läuft ein Countdown **−3, −2, −1, 0**. Bei 0 hört die Anzeige auf zu laufen - ab hier zählst du **selbst im Kopf** mit."],
  s: () => T(160, 40, "Zielzeit", 12, "#fde68a") + T(160, 100, "17 s", 54, "#fff", 800) + T(160, 140, "−3 · −2 · −1 · 0", 14, "#fff", 700) + uhr(40, 90) + uhr(280, 90)
});
fix("zeitgefuehl", 3, {
  ohneFoto: true,
  x: ["Wer am **nächsten** an der Zielzeit dran ist, ist Platz 1. " + PL, "Wer nicht drückt, bekommt 0 Punkte.", RUNDEN],
  s: () => T(160, 24, "Ziel: 17,0 s", 12, "#fde68a", 800) + rang(70, 36, [["Du", "17,2 · 5", 0], ["Nader", "15,9 · 3", 1], ["Sinan", "21,0 · 2", 2], ["Luca", "9,5 · 1", 3]], 180)
});
fix("groessenvergleich", 3, {
  ohneFoto: true,
  x: ["Wer **prozentual am nächsten** an der echten Größe liegt, ist Platz 1. " + PL, "Wer nichts abgibt, bekommt 0 Punkte.", RUNDEN],
  s: () => T(160, 24, "Echt: 30 m", 12, "#fde68a", 800) + rang(70, 36, [["Du", "28 m · 5", 0], ["Niklas", "40 m · 3", 1], ["Kevin", "5 m · 2", 2], ["Nader", "90 m · 1", 3]], 180)
});
fix("tetris", 4, {
  ohneFoto: true,
  x: ["Stößt dein Stapel oben an, **scheidest du aus** und schaust den anderen zu. **Gewonnen** hat, wer als **Letzter** übrig bleibt. Mit der Zeit wird das Spiel immer **schneller**.", "Wer **zuletzt übrig** bleibt, ist Platz 1. " + PL.replace("Der Letzte bekommt 1 Punkt.", "Wer als Erster ausscheidet, bekommt 1 Punkt."), "Tetris braucht **mindestens 2 Spieler**."],
  s: () => rang(70, 22, [["Du", "4 P.", 0], ["Luca", "2 P.", 1], ["Niklas", "1 P.", 2]], 180) + E(44, 35, "🏆", 24) + T(160, 150, "Letzter Spieler gewinnt", 11, "#fde68a", 700)
});
fix("imposter", 4, {
  ohneFoto: true,
  x: ["Wenn genug diskutiert wurde, **löst der Spielleiter auf** und zeigt, wer der Imposter war.", "Danach wählt der Spielleiter aus, **wer gewonnen hat** (Crew, Imposter oder einzelne Personen). Jede(r) Sieger(in) bekommt **1 Punkt** für die Gesamtwertung.", "Der Spielleiter kann im Setup auch **mehrere Imposter** einstellen."]
});

// Spiele mit eigener Punktezählung: im Spiel bleibt alles wie bisher, für die Gesamtwertung zählt der Platz.
plus("denk-gleich", 3, GW);
plus("zehn-treffer", 3, GW);
plus("reih-dich-ein", 3, GW);
plus("stimmts", 3, GW);
plus("laenderumrisse", 4, GW);
plus("finto", 4, GW);
plus("fussball-auktion", 7, GW);
plus("knobeln", 4, GW);
plus("doppelkopf", 6, "**Gesamtwertung:** Nach der letzten Partie bekommt der Erste im Gesamtstand Spieleranzahl + 1 Punkte, der Zweite einen weniger als die Spieleranzahl, der Dritte zwei weniger usw. (bei 4 Spielern: 5 · 3 · 2 · 1).");
plus("stimmts", 3, RUNDEN);

// ---------------------------------------------------------------------------
// Neue Anleitungen (v360): Wo liegt's?, Passgenau, Run, Turbo
// ---------------------------------------------------------------------------
const globus = (x, y, r = 62) => C(x, y, r, "#1d4ed8", 'stroke="#bfdbfe" stroke-width="2"') +
  `<path d="M${x - r * 0.55} ${y - r * 0.2} q${r * 0.25} -${r * 0.45} ${r * 0.55} -${r * 0.2} q${r * 0.1} ${r * 0.4} -${r * 0.2} ${r * 0.55} q-${r * 0.3} ${r * 0.1} -${r * 0.35} -${r * 0.35}Z" fill="#4ade80"/>` +
  `<path d="M${x + r * 0.2} ${y + r * 0.25} q${r * 0.3} -${r * 0.1} ${r * 0.4} ${r * 0.15} q-${r * 0.1} ${r * 0.3} -${r * 0.4} ${r * 0.2}Z" fill="#4ade80"/>`;
const stecknadel = (x, y, f = "#ef4444") => `<path d="M${x} ${y} l-7 -16 a8 8 0 1 1 14 0Z" fill="${f}" stroke="#fff" stroke-width="1.5"/>` + C(x, y - 18, 3, "#fff");
const teil = (x, y, zellen, f, z = 14) => zellen.map(([a, b]) => R(x + a * z, y + b * z, z - 1.5, z - 1.5, f, 3)).join("");

ANLEITUNGEN["wo-liegts"] = [
  {
    t: "Worum geht's?",
    x: ["Pro Runde wird ein **Ort genannt** - eine Stadt oder eine Sehenswürdigkeit. Alle setzen gleichzeitig eine **Stecknadel** auf einen drehbaren Globus.", "Der Spielleiter wählt im Setup, was gesucht wird: **Städte weltweit**, **Städte in Deutschland** oder **Sehenswürdigkeiten** (mehrere gleichzeitig sind möglich)."],
    s: () => T(160, 22, "Wo liegt Lissabon?", 14, "#fde68a", 800) + globus(160, 100) + stecknadel(150, 100)
  },
  {
    t: "Nadel setzen",
    x: ["**Drehen:** mit einem Finger ziehen. **Zoomen:** zwei Finger auseinander oder mit + / −.", "**Kurz tippen** setzt die Nadel - mit **\"Nadel setzen\"** bestätigst du sie. Pro Runde hast du **60 Sekunden**."],
    s: () => globus(120, 90, 56) + stecknadel(112, 92) + E(210, 100, "👆", 32) + knopf(190, 130, 110, 28, "Nadel setzen", "#ff5b36")
  },
  {
    t: "Punkte nach Entfernung",
    x: ["Wer (Luftlinie) am **nächsten** am Ziel liegt, ist Platz 1. " + PL, "Wer **keine Nadel** setzt, bekommt 0 Punkte. " + RUNDEN],
    s: () => unifiedRang([["Luca", "12 km · 5", 1], ["Du", "80 km · 3", 0], ["Niklas", "410 km · 2", 2], ["Nader", "keine · 0", 3]])
  },
  {
    t: "Volltreffer",
    x: ["Liegt deine Nadel **unter 100 km** daneben (bei **deutschen Städten unter 50 km**), steht im Ergebnis **Volltreffer**.", "Der Extrapunkt gehört aber nur dem Sieger der Runde. Wo liegt's braucht **mindestens 2 Spieler**."],
    s: () => globus(110, 90, 54) + stecknadel(104, 84, "#4ade80") + stecknadel(112, 90) + T(235, 70, "Volltreffer!", 14, "#bbf7d0", 800) + T(235, 92, "unter 100 km", 11, "#fff", 600)
  }
];
ANLEITUNGEN["passgenau"] = [
  {
    t: "Worum geht's?",
    x: ["Alle bekommen **dasselbe Feld** und **dieselben Teile** (je nach Einstellung 3 bis 5).", "Die Teile müssen das Feld **genau ausfüllen** - keine Lücke, kein Teil darf überstehen oder ein anderes überlappen."],
    s: () => R(110, 30, 100, 100, "#ffffff22", 6) + teil(116, 36, [[0, 0], [1, 0], [2, 0], [0, 1]], "#f87171") + teil(116, 78, [[0, 0], [1, 0], [0, 1]], "#60a5fa") + teil(158, 64, [[0, 0], [1, 0], [1, 1], [1, 2]], "#4ade80") + T(160, 155, "Alle Lücken füllen", 12, "#fde68a", 700)
  },
  {
    t: "Teile legen",
    x: ["**Zieh** die Teile aufs Feld. Ein **Tipp aufs Teil** dreht es (oder der Drehen-Knopf).", "Es gibt immer eine Lösung - das Feld entsteht aus den Teilen."],
    s: () => R(60, 30, 100, 100, "#ffffff22", 6) + teil(66, 36, [[0, 0], [1, 0], [2, 0], [0, 1]], "#f87171") + teil(210, 50, [[0, 0], [1, 0], [0, 1]], "#60a5fa") + E(230, 120, "👆", 30) + pfeil(205, 70, 150, 70, "#fde68a") + T(160, 160, "Ziehen und drehen", 12, "#fff", 600)
  },
  {
    t: "Zeit und Runden",
    x: ["Der Spielleiter stellt **Runden**, **Teile pro Feld** und das **Zeitlimit** (60 bis 180 Sekunden) ein.", "Nach einem **3-2-1-Countdown** geht es für alle gleichzeitig los. Am Ende der Runde wird die Lösung kurz gezeigt."],
    s: () => uhr(160, 80, 40) + T(160, 90, "90 s", 16, "#ff5b36", 800) + T(160, 155, "3 · 2 · 1 · Los", 13, "#fff", 700)
  },
  {
    t: "Punkte nach Tempo",
    x: ["Wer **zuerst fertig** ist, ist Platz 1. " + PL, "Wer es im **Zeitlimit nicht schafft**, bekommt 0 Punkte. Wer gleichzeitig fertig wird, teilt sich den Platz. " + RUNDEN + " Passgenau braucht **mindestens 2 Spieler**."],
    s: () => unifiedRang([["Nader", "42 s · 5", 1], ["Du", "55 s · 3", 0], ["Kevin", "71 s · 2", 2], ["Niklas", "⏰ 0", 3]])
  }
];
const mmKarte = (x, y, f = "#6d4ee6", o = false) => (o ? R(x, y, 34, 34, "#fffdf5", 6, 'stroke="#22c55e" stroke-width="2"') + E(x + 17, y + 17, "🧑", 20) : R(x, y, 34, 34, f, 6, 'stroke="#ffffff88" stroke-width="1.5"') + E(x + 17, y + 17, "⚽", 16));
ANLEITUNGEN["memory"] = [
  {
    t: "Worum geht's?",
    x: ["Memory **von oben**: Du siehst das Feld von oben und steuerst **deine Figur** über die Karten. Jede*r hat ein **eigenes Feld** - die Karten liegen aber bei allen **an derselben Stelle**.", "Wer zuerst **alle Paare** gefunden hat, gewinnt die Runde. Auf den Karten sind **Fußballer**."],
    s: () => [0, 1, 2, 3].map((i) => mmKarte(90 + (i % 2) * 42, 40 + Math.floor(i / 2) * 42)).join("") + avatar(150, 100, 1, "Du", 12) + T(240, 80, "Eigenes Feld,", 12, "#fde68a", 700) + T(240, 96, "gleiche Karten", 12, "#fde68a", 700)
  },
  {
    t: "Steuern und aufdecken",
    x: ["Am Handy steuerst du mit dem **Joystick**: Zieh ihn in die Richtung, in die du laufen willst - je weiter, desto schneller. Am Computer gehen die **Pfeiltasten** (oder W, A, S, D).", "Aufdecken geht nur, wenn du **auf einer Karte stehst**: Dann leuchtet der **Aufdecken-Knopf** (am Computer geht auch die Leertaste). Steht du auf keiner Karte, bleibt er grau."],
    s: () => mmKarte(60, 40) + mmKarte(104, 40, "#6d4ee6", true) + avatar(77, 57, 1, "", 11) + knopf(190, 60, 90, 40, "Aufdecken", "#22c55e", "#052e16", 13) + T(160, 150, "Knopf leuchtet = Karte unter dir", 11, "#fff", 600)
  },
  {
    t: "Kein Paar?",
    x: ["Es sind **höchstens 2 Karten** gleichzeitig offen. Passen sie zusammen, bleiben beide **als Paar** liegen.", "Passen sie nicht, **drehen sie sich nach etwa 1,5 Sekunden automatisch wieder um**. Merk dir also, wo welcher Spieler liegt - dann geht es mit der nächsten Karte weiter."],
    s: () => mmKarte(60, 40, "#6d4ee6", true) + mmKarte(104, 40, "#6d4ee6", true) + T(100, 100, "Kein Paar!", 13, "#fca5a5", 800) + T(230, 85, "↻", 34, "#fde68a", 800) + T(160, 150, "Drehen sich von allein wieder um", 11, "#fff", 600)
  },
  {
    t: "Teammodus",
    x: ["Der Spielleiter kann den **Teammodus** einschalten. Jedes Team spielt dann auf **einem gemeinsamen Feld** - ihr seht die Figuren eures Teams.", "Jede*r deckt nur **eine Karte** auf, das Paar entsteht aus den Karten **zweier Teammitglieder**. Solange deine Karte offen ist, kannst du dich **nicht bewegen** - der Joystick ist dann grau. Den Teammodus gibt es nur bei einer **geraden Spielerzahl** (mindestens 4), jedes Team braucht mindestens 2 Personen."],
    s: () => mmKarte(70, 45, "#6d4ee6", true) + mmKarte(116, 45, "#6d4ee6", true) + avatar(87, 62, 0, "", 11) + avatar(133, 62, 2, "", 11) + T(160, 120, "Zwei Karten, ein Paar", 13, "#fde68a", 800) + T(160, 145, "Wer eine Karte hält, steht still", 11, "#fff", 600)
  },
  {
    t: "Dreierteams",
    x: ["Bei **genau 6 Spielern** gibt es im Teammodus die Option **Dreierteams**: zwei Teams mit je **3 Personen**. Statt Paaren liegen dann **Drillinge** auf dem Feld - immer **drei gleiche Karten** (5, 6 oder 7 Drillinge).", "Es läuft wie sonst: Jede*r im Team deckt **eine Karte** auf und bleibt dabei stehen. Sind **alle drei gleich**, bleiben sie liegen - sonst drehen sie sich nach etwa 1,5 Sekunden wieder um."],
    s: () => mmKarte(60, 50, "#6d4ee6", true) + mmKarte(104, 50, "#6d4ee6", true) + mmKarte(148, 50, "#6d4ee6", true) + T(160, 120, "3 gleiche Karten = Drilling", 13, "#fde68a", 800) + T(160, 145, "Nur bei 6 Spielern", 11, "#fff", 600)
  },
  {
    t: "Zeit und Runden",
    x: ["Der Spielleiter stellt **Runden** (bis 15) und **Paare pro Feld** (6, 8, 10 oder 12) ein. Es gibt **kein Zeitlimit**.", "Nach einem **3-2-1-Countdown** geht es für alle gleichzeitig los. Oben läuft deine **Stoppuhr**. Die Runde endet, wenn **alle fertig** sind."],
    s: () => uhr(160, 80, 40) + T(160, 90, "23 s", 16, "#ff5b36", 800) + T(160, 155, "3 · 2 · 1 · Los", 13, "#fff", 700)
  },
  {
    t: "Punkte nach Tempo",
    x: ["Wer **zuerst alle Paare** hat, ist Platz 1. " + PL, "Im Teammodus zählt die **Zeit des Teams** - alle im Team bekommen gleich viele Punkte. " + RUNDEN + " Memory braucht **mindestens 2 Spieler** (im Teammodus 4)."],
    s: () => unifiedRang([["Luca", "22 s · 5", 1], ["Du", "30 s · 3", 0], ["Kevin", "46 s · 2", 2], ["Sinan", "52 s · 1", 3]])
  }
];
ANLEITUNGEN["revier"] = [
  {
    t: "Worum geht's?",
    x: ["Das Feld besteht aus **kleinen Quadraten**, die zu **Gebieten** zusammengefasst sind - ein Gebiet pro Spieler. Die Gebiete sind **fast gleich groß, aber nie exakt**.", "Ziel: Sichere dir das **größte** Gebiet. Alle **starten in der Mitte**."],
    s: () => [0, 1, 2, 3].map((i) => R(90 + (i % 2) * 70, 30 + Math.floor(i / 2) * 55, 66, 51, ["#22c55e", "#06b6d4", "#ef4444", "#f59e0b"][i], 6)).join("") + avatar(160, 85, 1, "Du", 12)
  },
  {
    t: "Gebiet sichern",
    x: ["Lauf mit dem **Joystick** (am Computer: Pfeiltasten oder W, A, S, D) in ein Gebiet. Steht du in einem **freien** Gebiet, leuchtet der Knopf **Gebiet sichern**.", "Das Gebiet färbt sich in **deiner Farbe** und ist für alle anderen **gesperrt**. Wer zuerst drückt, bekommt es. Du hast **25 Sekunden** - wer nichts wählt, bekommt ein zufälliges freies Gebiet."],
    s: () => R(60, 40, 90, 70, "#cbd5e1", 6) + R(150, 40, 90, 70, "#ef4444", 6) + avatar(105, 75, 1, "Du", 12) + knopf(160, 140, 130, 34, "Gebiet sichern", "#22c55e", "#052e16", 13)
  },
  {
    t: "Wer hat mehr?",
    x: ["Haben **alle gewählt**, werden die **kleinen Quadrate** sichtbar. Dann verschwindet **aus jeder Farbe nach und nach ein Quadrat**.", "Wessen Farbe **am längsten übrig bleibt**, hatte das größte Gebiet. Unten siehst du, wie viele Quadrate jede Farbe noch hat."],
    s: () => [0, 1, 2, 3, 4, 5].map((i) => R(70 + i * 30, 50, 26, 26, "#06b6d4", 4)).join("") + [0, 1, 2, 3].map((i) => R(70 + i * 30, 90, 26, 26, "#ef4444", 4)).join("") + T(160, 145, "Rot ist zuerst leer", 12, "#fde68a", 700)
  },
  {
    t: "Punkte nach Größe",
    x: ["Das **größte** Gebiet ist Platz 1. " + PL, RUNDEN + " Revierkampf braucht **mindestens 2 Spieler**."],
    s: () => unifiedRang([["Luca", "26 Quadrate · 5", 1], ["Du", "25 · 3", 0], ["Kevin", "23 · 2", 2], ["Sinan", "22 · 1", 3]])
  }
];
ANLEITUNGEN["kartentausch"] = [
  {
    t: "Worum geht's?",
    x: ["Auf dem Tisch liegen **20 Karten** mit Fußballern. Oben siehst du **einen Fußballer** - er steckt **so oft im Feld, wie Spieler mitspielen**.", "Merk dir, wo er liegt: Die Karten werden **umgedreht** und dann **viermal vier Karten vertauscht** (je zwei Paare gleichzeitig)."],
    s: () => mmKarte(80, 40, "#6d4ee6", true) + mmKarte(124, 40, "#6d4ee6", true) + mmKarte(168, 40, "#6d4ee6", true) + T(160, 120, "⇄ Karten tauschen", 14, "#fde68a", 800) + T(160, 150, "Immer im Blick behalten!", 11, "#fff", 600)
  },
  {
    t: "Karte auswählen",
    x: ["Nach einem **3-2-1-Countdown** laufen alle los - **alle starten oben in der Mitte**. Steuere mit dem **Joystick** (am Computer: Pfeiltasten oder W, A, S, D).", "Steh auf der Karte, die du für richtig hältst, und tippe **Auswählen**. Eine gewählte Karte ist **für alle anderen gesperrt**."],
    s: () => mmKarte(90, 55, "#6d4ee6", true) + avatar(107, 72, 1, "Du", 11) + knopf(190, 60, 90, 40, "Auswählen", "#22c55e", "#052e16", 13) + T(160, 150, "Gesperrt für alle anderen", 11, "#fff", 600)
  },
  {
    t: "Aufdecken",
    x: ["Haben alle gewählt (oder nach **20 Sekunden**), werden **alle Karten aufgedeckt**. Nur die **gesuchten Karten** bleiben hell, alle anderen werden abgedunkelt. Gewählte Karten haben einen Rahmen in **der Farbe des Spielers**."],
    s: () => mmKarte(80, 40) + mmKarte(124, 40) + mmKarte(168, 40) + T(160, 130, "✅ richtig   ❌ falsch", 14, "#fff", 800)
  },
  {
    t: "Punkte",
    x: ["Wer **richtig** gewählt hat, steht vor allen, die falsch lagen - und unter den Richtigen zählt, **wer schneller gewählt hat**. Wer nichts wählt, ist Letzter. " + PL, RUNDEN + " Kartentausch braucht **mindestens 2 Spieler**."],
    s: () => unifiedRang([["Luca", "richtig · 5", 1], ["Du", "richtig · 3", 0], ["Kevin", "falsch · 2", 2], ["Sinan", "nichts · 1", 3]])
  }
];
ANLEITUNGEN["schnellschuss"] = [
  {
    ohneFoto: true,
    t: "Worum geht's?",
    x: ["Auf deinem Handy ist ein **großer Knopf**. Nacheinander poppen **Emojis** auf - bei allen Spielern **gleichzeitig**.", "Ist es etwas **Gutes** (⚽ 🏀 🏈), tippst du so **schnell wie möglich**."],
    s: () => E(160, 70, "⚽", 44) + knopf(100, 120, 120, 40, "TIPPEN", "#22c55e", "#052e16", 15) + T(160, 30, "Schnell sein!", 14, "#fde68a", 800)
  },
  {
    ohneFoto: true,
    t: "Finger weg!",
    x: ["Ist es etwas **Schlechtes** (💣 🍅 💩 🧨), darfst du **nicht** tippen. Wer es trotzdem tut, bekommt **einen Minuspunkt**.", "Das Bild verschwindet nach kurzer Zeit wieder, dann kommt das nächste - es wird **immer schneller**."],
    s: () => E(160, 70, "💣", 44) + T(160, 120, "Nicht tippen!", 15, "#fca5a5", 800) + T(160, 150, "Sonst: −1 Punkt", 12, "#fff", 600)
  },
  {
    ohneFoto: true,
    t: "Punkte",
    x: ["Bei jedem guten Bild bekommt der **Schnellste so viele Punkte wie Spieler mitspielen**, der Zweite einen weniger usw. Der Letzte, der getippt hat, bekommt 1 Punkt. **Bei 4 Spielern: 4 · 3 · 2 · 1.** Wer nicht tippt, bekommt 0.", "Gemessen wird die Reaktionszeit **auf deinem eigenen Handy** - ein schlechtes Netz ist also kein Nachteil. Rechts siehst du immer den **aktuellen Punktestand**."],
    s: () => unifiedRang([["Luca", "0,31 s · +4", 1], ["Du", "0,38 s · +3", 0], ["Kevin", "0,52 s · +2", 2], ["Sinan", "Bombe · −1", 3]])
  },
  {
    ohneFoto: true,
    t: "Wertung",
    x: ["Nach dem letzten Bild gibt es den **Endstand**. Die Platzierung geht in die **Gesamtwertung**.", RUNDEN + " Schnellschuss braucht **mindestens 2 Spieler**."],
    s: () => unifiedRang([["Luca", "12", 1], ["Du", "9", 0], ["Kevin", "4", 2], ["Sinan", "−1", 3]])
  }
];
ANLEITUNGEN["run"] = [
  {
    t: "Worum geht's?",
    x: ["Alle rennen **gleichzeitig** auf derselben Strecke. Jedes Handy berechnet den eigenen Lauf - die Hindernisse sind bei allen gleich.", "Die Strecke ist **endlos** und wird mit der Zeit **immer schneller**."],
    s: () => R(60, 120, 200, 30, "#ffffff22", 6) + E(110, 100, "🏃", 36) + E(160, 100, "🏃", 36) + E(210, 100, "🏃", 36) + T(160, 40, "Alle gleichzeitig", 14, "#fde68a", 800)
  },
  {
    t: "Steuerung",
    x: ["Es gibt **drei Spuren**. **Links/rechts wischen** wechselt die Spur, **hoch wischen** springt, **runter wischen** rutscht."],
    s: () => pfeil(90, 90, 40, 90, "#fde68a") + pfeil(230, 90, 280, 90, "#fde68a") + pfeil(160, 70, 160, 25, "#fde68a") + pfeil(160, 110, 160, 155, "#fde68a") + E(160, 90, "🏃", 34) + T(160, 168, "runter = rutschen", 9, "#fff", 600)
  },
  {
    t: "Hindernisse und Leben",
    x: ["**Niedrige Hürden** überspringst du, **hohe Tore** unterrutschst du, **Blöcke** umläufst du.", "Der Spielleiter stellt **1 oder 3 Leben** ein. Eine Runde endet, wenn **alle gestürzt** sind."],
    s: () => R(40, 110, 60, 14, "#fbbf24", 4) + T(70, 140, "Hürde: springen", 9, "#fff", 600) + R(130, 70, 60, 8, "#f87171", 3) + R(130, 70, 6, 60, "#f87171", 2) + R(184, 70, 6, 60, "#f87171", 2) + T(160, 140, "Tor: rutschen", 9, "#fff", 600) + R(220, 85, 50, 45, "#60a5fa", 6) + T(245, 142, "Block: ausweichen", 9, "#fff", 600) + T(160, 30, "❤️ ❤️ ❤️", 16, "#fff", 800)
  },
  {
    t: "Punkte nach Strecke",
    x: ["Wer **am weitesten kommt**, ist Platz 1. " + PL, "Wer gleich weit kommt, teilt sich den Platz. Wer kein Ergebnis hat, bekommt 0 Punkte. " + RUNDEN + " Run braucht **mindestens 2 Spieler**."],
    s: () => unifiedRang([["Niklas", "1240 m · 5", 1], ["Du", "980 m · 3", 0], ["Sinan", "600 m · 2", 2], ["Kevin", "310 m · 1", 3]])
  }
];
ANLEITUNGEN["turbo"] = [
  {
    t: "Worum geht's?",
    x: ["**Zeitjagd im Rennwagen:** Alle fahren auf **derselben Strecke** gegen die Uhr - jede(r) für sich, ohne Zusammenstöße.", "Wer in der eingestellten Zeit die **schnellste Runde** schafft, gewinnt."],
    s: () => R(30, 110, 260, 36, "#475569", 8) + R(30, 126, 260, 4, "#fde68a", 2) + E(110, 100, "🏎️", 44) + T(160, 40, "Schnellste Runde gewinnt", 14, "#fde68a", 800)
  },
  {
    t: "Strecke wählen",
    x: ["Oben stehen die **4 Streckenarten**: **Asphalt, Eis, Sand und Offroad**. Tippe eine Art an, dann erscheinen darunter **4 Strecken** mit Vorschaubild und **Länge in km**.", "Der **Spielleiter** tippt die Strecke an, die gefahren wird. Bei allen anderen stellt sie sich automatisch ein. Jede Strecke ist so gebaut, dass eine Runde etwa **25 bis 40 Sekunden** dauert."],
    s: () => E(70, 45, "🛣️", 26) + E(130, 45, "❄️", 26) + E(190, 45, "🏜️", 26) + E(250, 45, "🌲", 26) + R(40, 80, 110, 42, "#ffffff22", 8) + R(170, 80, 110, 42, "#ffffff22", 8) + R(40, 130, 110, 42, "#ffffff22", 8) + R(170, 130, 110, 42, "#ffffff22", 8) + T(95, 105, "0,68 km", 10) + T(225, 105, "0,75 km", 10) + T(95, 155, "0,88 km", 10) + T(225, 155, "1,01 km", 10)
  },
  {
    t: "Zeit und Bereit",
    x: ["Der **Spielleiter** stellt die **Dauer** ein (3, 4 oder 5 Minuten). Bei allen anderen stellt sich das automatisch ein.", "Alle anderen drücken **Bereit** - ihre Profilbilder zeigen, wer schon so weit ist. Erst wenn **alle bereit** sind, kann der Spielleiter **starten**."],
    s: () => avatar(70, 70, 0, "Kevin") + avatar(160, 70, 1, "Luca") + avatar(250, 70, 2, "Nader") + T(70, 112, "✅", 14) + T(160, 112, "✅", 14) + T(250, 112, "⏳", 14) + knopf(90, 135, 140, 28, "Starten", "#ff5b36")
  },
  {
    t: "Steuerung",
    x: ["**Lenken** mit den Tasten links, **Gas** und **Bremse** rechts. **Bremse + Lenken** = Drift.", "**Boost-Felder** geben Extra-Tempo, der **blaue Geist** zeigt deinen Bestlauf. Mit **↻** oben startest du neu - im Ziel geht es automatisch neu los."],
    s: () => knopf(25, 125, 40, 34, "◀", "#ffffff33") + knopf(72, 125, 40, 34, "▶", "#ffffff33") + knopf(215, 95, 80, 30, "Gas", "#4ade80", "#052e16") + knopf(215, 132, 80, 30, "Bremse", "#f87171", "#450a0a") + E(160, 70, "🏎️", 40)
  },
  {
    t: "Mehrere Fahrten und Beenden",
    x: ["Du kannst **so lange neue Fahrten starten, bis die Zeit abgelaufen ist**. Die laufende Fahrt darfst du danach noch **zu Ende fahren**.", "Willst du nicht mehr, tippst du auf **Beenden** - du verlässt damit **nicht den Raum**, nur das Zeitfahren. Dann siehst du, **wer noch fährt** und wer schon fertig ist."],
    s: () => uhr(80, 80, 34) + T(80, 135, "Zeit um", 11, "#fff", 700) + knopf(150, 60, 140, 30, "Beenden", "#dc2626") + avatar(190, 120, 0, "fertig", 12) + avatar(250, 120, 1, "fährt", 12)
  },
  {
    t: "Bestzeiten und Punkte",
    x: ["Oben rechts siehst du die **Bestzeiten** der anderen - und **deine eigene** mit deinem aktuellen Platz.", "Für die Gesamtwertung zählt am Ende die **schnellste Runde**: Wer sie fährt, ist Platz 1. " + PL, "Wer keine gültige Runde schafft, bekommt 0 Punkte."],
    s: () => unifiedRang([["Kevin", "1:02,4 · 5", 1], ["Du", "1:05,0 · 3", 0], ["Luca", "1:11,9 · 2", 2], ["Nader", "keine · 0", 3]])
  }
];

// ============================================================================
//  v379: Abgleich aller Anleitungen mit dem echten Spiel (Texte + echte Screenshots).
//  Alle Seiten zeigen jetzt Screenshots aus dem laufenden Spiel; die gezeichneten Szenen
//  bleiben nur als Ersatz, falls ein Bild nicht geladen werden kann.
// ============================================================================
for (const folien of Object.values(ANLEITUNGEN)) folien.forEach((f) => { delete f.ohneFoto; });

fix("reih-dich-ein", 2, { x: [
  "Immer **ein Spieler ist dran**: Er bekommt einen neuen Begriff und setzt ihn an die Stelle, an die er seiner Meinung nach gehört.",
  "Der Spielleiter kann vor dem Start den **Fairen Modus** einschalten: Dann hat jede Kategorie gleich viele Begriffe, der Startspieler wechselt jede Runde und alle kommen **gleich oft** dran."
] });
fix("stimmts", 1, { x: [
  "Pro Runde wird eine **Behauptung** gezeigt - ein bekannter Fakt oder ein Mythos. Alle tippen: **Stimmt** oder **Stimmt nicht**?",
  "Du hast dafür **15 Sekunden** Zeit (der Spielleiter kann 5 bis 30 Sekunden einstellen). Wer nicht rechtzeitig tippt, geht leer aus."
] });
fix("stimmts", 2, { x: [
  "Danach wird aufgelöst - mit einer **kurzen Erklärung** und mit allen Antworten.",
  "Nach wenigen Sekunden geht es **automatisch** mit der nächsten Behauptung weiter."
] });
fix("wer-ist-es", 1, { x: [
  "Es wird ein **Fußballer** gesucht. Nach und nach werden **nummerierte Hinweise** aufgedeckt - **alle 7 Sekunden** kommt ein neuer dazu.",
  "Wer die Person erkennt, **tippt ein paar Buchstaben des Namens**, **wählt den Namen aus der Vorschlagsliste** und tippt auf **Absenden**. Nur Namen aus der Liste sind möglich. Alle raten gleichzeitig und dürfen so oft tippen, wie sie wollen."
] });
fix("blitzquiz", 1, { x: ["Drei Frage-Typen **im Wechsel** (Wort, Schnell, Bild) - alle **auf Zeit**. Je schneller du richtig antwortest, desto mehr Punkte bekommst du."] });
fix("blitzquiz", 3, { x: [
  "Für jeden Buchstaben der Lösung ein leeres Kästchen. **Alle 10 Sekunden** wird ein weiterer Buchstabe aufgedeckt - der letzte bleibt immer verdeckt.",
  "Du hast **nur einen Versuch**: Liegst du falsch, bist du für diese Runde gesperrt.",
  "Punkte wie bei Typ 1: die **schnellste richtige** Lösung bekommt am meisten."
] });
fix("blitzquiz", 4, { x: [
  "Ein Bild startet **stark unscharf** und wird **gleichmäßig schärfer** - nach **32 Sekunden** ist es ganz scharf.",
  "Auch hier gilt: **ein Versuch**. Die **schnellste richtige** Lösung bekommt die meisten Punkte (bei 4 Spielern **5 · 3 · 2 · 1**)."
] });
fix("doppelblick", 2, { x: [
  "Finde das gemeinsame Symbol und **tippe es an** - auf einer der beiden Karten.",
  "**Schnelligkeit:** Du hast pro Runde **einen Versuch**. Tippst du falsch, bist du für diese Runde raus.",
  "**Turm:** Tippe das gemeinsame Symbol auf **deiner** Karte an (die Karte in der **Mitte** ist nur zum Vergleichen). Richtig: deine Karte kommt in die Mitte, die nächste ist dran. Falsch: du bekommst von **jedem anderen die unterste Karte** - dein Stapel wächst."
] });
fix("doppelblick", 3, { x: [
  ANLEITUNGEN["doppelblick"][2].x[0],
  "Wer falsch tippt, bekommt 0 Punkte. Im Modus **Turm** endet das Spiel sofort, wenn jemand seinen Stapel **leer** hat; danach gilt dieselbe Punkteverteilung nach den **übrigen Karten** (wenigste Karten = Platz 1).",
  ANLEITUNGEN["doppelblick"][2].x[2]
] });
fix("merks-dir", 2, { x: [
  "Danach wird **Stelle für Stelle** gefragt: Welches Emoji stand an Nummer 7? Tippe das richtige an.",
  "Wer falsch tippt oder zu langsam ist, **scheidet aus**. Der Durchgang endet, sobald **nur noch eine Person** übrig ist - oder nach Stelle 20."
] });
fix("zeitgefuehl", 2, { x: ["Nach dem Countdown bleibt nur ein **großer roter Buzzer** (die **Zielzeit** steht klein darunter). Zähl für dich im Kopf mit und drück genau dann, wenn deiner Meinung nach die Zielzeit erreicht ist."] });
fix("laenderumrisse", 1, { x: ["Du siehst nur den **Umriss eines Landes**. Welches Land ist das? Die Antwort tippst du selbst in die **Buchstabenkästchen** ein - es gibt keine Auswahl."] });
fix("laenderumrisse", 3, { x: ["Eine Runde dauert 45 Sekunden. **Nach 12 Sekunden** wird ein **zufälliger Buchstabe** des Landes aufgedeckt, danach alle 7 Sekunden ein weiterer (bis zu 4). Nach dem letzten bleiben noch 12 Sekunden zum Tippen."] });
fix("knobeln", 2, { x: [
  "Danach tippt **reihum** jede(r), wie viele Hölzer **insgesamt** in allen Fäusten stecken. Jede Zahl darf pro Runde **nur einmal** getippt werden.",
  "Zum Wählen und Tippen bleiben **30 bzw. 25 Sekunden** - danach wird zufällig gewählt."
] });
fix("knobeln", 4, { x: [
  "Der Spielleiter stellt ein, **wie viele richtige Tipps** man braucht, um rauszugehen (1 bis 3). Optional gibt es ein **Finale**: zwei Durchgänge mit allen, danach spielen die beiden Verlierer gegeneinander (bei zweimal derselben Person entfällt es).",
  ANLEITUNGEN["knobeln"][3].x[1],
  ANLEITUNGEN["knobeln"][3].x[2]
] });
fix("fussball-auktion", 2, { x: [
  ANLEITUNGEN["fussball-auktion"][1].x[0],
  ANLEITUNGEN["fussball-auktion"][1].x[1],
  "Für Gebote und Spielrunden hast du jeweils **60 Sekunden**. Wer am Ende weniger als 5 Karten hat, bekommt unverkaufte Karten zufällig geschenkt - dafür gibt es **2 Münzen weniger Bonus pro geschenkter Karte**."
] });
fix("fussball-auktion", 6, { x: [
  "Jede der 5 Runden hat zwei Schritte: Erst wählst du **verdeckt eine Karte**, die du noch nicht gespielt hast. Dann setzt du **Münzen auf die 6 Fähigkeiten** (Schuss, Pass, Technik, Verteidigung, Geschwindigkeit, Spielverständnis).",
  "Die **zwei Fähigkeiten mit den meisten Münzen** entscheiden die Runde (bei Gleichstand zählen alle gleichauf liegenden).",
  "Bezahlt werden nur die Münzen auf den **entscheidenden Fähigkeiten**, der Rest kommt zurück."
] });
fix("doppelkopf", 2, { x: [
  "Trümpfe sind **Herz-10 (Dulle)**, alle **Damen**, alle **Buben** und alle **Karo**-Karten. Die Reihenfolge von stark nach schwach: Dulle, Damen (Kreuz, Pik, Herz, Karo), Buben (gleiche Reihenfolge), dann Karo-Ass, Karo-10, Karo-König, Karo-9.",
  "Wer **beide Karo-Asse** hat (**Sau**), spielt sie als höchste Trümpfe, sogar über der Dulle. Sobald die Sau gespielt wurde, stechen die Karo-Neunen sie (**Super-Sau**). Die **zweite Dulle** sticht die erste. Der Spielleiter kann das im Setup ausschalten.",
  "Im Blatt liegen die **besten Karten ganz rechts**."
] });
fix("doppelkopf", 4, { x: [
  "Vor dem Spiel wird **reihum** gefragt: **Gesund** (ganz normal spielen) oder **Vorbehalt**?",
  "Vorbehalte sind: **Hochzeit** (beide Kreuz-Damen: du suchst dir einen Partner), **Armut** (höchstens 3 Trümpfe), **Schmeißen** (mindestens 5 Neuner) oder ein **Solo** - alleine gegen die anderen, mit dreifachen Punkten. Der Spielleiter kann Armut, Schmeißen und Solos im Setup abschalten.",
  "Wer nach **30 Sekunden** nicht entscheidet, ist automatisch gesund (mit beiden Kreuz-Damen: Hochzeit)."
] });
fix("wo-liegts", 2, { x: [
  "**Drehen:** mit einem Finger ziehen. **Zoomen:** zwei Finger auseinander oder mit + / −.",
  "**Kurz tippen** setzt die Nadel (woanders tippen verschiebt sie) - mit **\"Nadel setzen\"** bestätigst du sie. Nur bestätigte Nadeln zählen. Pro Runde hast du **60 Sekunden**, sind alle fertig, geht es früher weiter."
] });
fix("wo-liegts", 4, { x: [
  "Liegt deine Nadel **unter 100 km** daneben (bei **deutschen Städten unter 50 km**), steht im Ergebnis **Volltreffer**.",
  "Das ist nur eine Anzeige - Punkte gibt es allein nach **Platz**. Wo liegt's braucht **mindestens 2 Spieler**."
] });
fix("passgenau", 3, { x: [
  "Der Spielleiter stellt **Runden** (bis 15), **Teile pro Feld** (3, 4 oder 5) und das **Zeitlimit** (60, 90, 120 oder 180 Sekunden) ein.",
  "Nach einem **3-2-1-Countdown** geht es für alle gleichzeitig los. Wer es nicht schafft, sieht am Ende die **Lösung**."
] });
fix("run", 3, { x: [
  "**Niedrige Hürden** überspringst du, **hohe Tore** unterrutschst du, **Blöcke** umläufst du. Bei einem Treffer verlierst du ein Leben, wirst kurz langsamer und bist einen Moment **unverwundbar**.",
  "Der Spielleiter stellt **1 oder 3 Leben** ein. Hast du keins mehr, bist du **gestürzt**. Eine Runde endet, wenn **alle gestürzt** sind."
] });
fix("turbo", 3, { x: [
  "Der **Spielleiter** stellt die **Dauer** ein (3, 4 oder 5 Minuten). Bei allen anderen stellt sich das automatisch ein.",
  "Halte das Handy **quer**. Alle anderen drücken **Bereit** - ihre Profilbilder zeigen, wer schon so weit ist. Erst wenn **alle bereit** sind, kann der Spielleiter **starten**."
] });
fix("turbo", 4, { x: [
  "**Lenken** mit den Tasten links, **Gas** und **Bremse** rechts. **Bremse + Lenken** = Drift.",
  "**Boost-Felder** geben Extra-Tempo, der **blaue Geist** zeigt ab deiner ersten Zielfahrt deinen Bestlauf. Mit **↻** oben startest du neu - im Ziel geht es automatisch neu los."
] });
fix("turbo", 5, { x: [
  "Du kannst **so lange neue Fahrten starten, bis die Zeit abgelaufen ist**. Die laufende Fahrt darfst du danach noch **zu Ende fahren**.",
  "Nach Ablauf der Zeit erscheint oben **Beenden**: Damit beendest du das Zeitfahren (oder es endet im Ziel automatisch) - du verlässt **nicht den Raum**. Dann siehst du eine **Rangliste**: wer noch fährt und wer schon fertig ist."
] });
fix("turbo", 6, { x: [
  ANLEITUNGEN["turbo"][5].x[0],
  ANLEITUNGEN["turbo"][5].x[1],
  "Wer keine gültige Runde schafft, bekommt 0 Punkte. Die Punkte gibt es, sobald alle Fahrer **Beenden** gedrückt haben oder ihre Zeit abgelaufen ist."
] });
