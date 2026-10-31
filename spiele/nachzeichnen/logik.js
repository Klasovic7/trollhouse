// ============================================================================
//  Nachmalen! - Formen und Bewertung (reine Logik, ohne DOM)
// ----------------------------------------------------------------------------
//  Alle Formen liegen in einem Koordinatenraum von -1 bis 1 (Mitte = 0/0,
//  y zeigt nach unten wie auf dem Bildschirm). Gezeichnet wird in demselben
//  Raum: die Oberfläche rechnet Fingerpositionen vorher um.
//  Bewertung: Wie weit liegt die gezeichnete Linie im Mittel von der Vorlage
//  entfernt (in beide Richtungen) - plus Abzug für Stellen, die gar nicht
//  nachgezeichnet wurden.
// ============================================================================

const TAU = Math.PI * 2;

function kurve(n, f) {
  return Array.from({ length: n }, (_, i) => f(i / (n - 1)));
}

// Skaliert eine Punktliste so, dass sie (mit Seitenverhältnis) in [-1, 1] passt und zentriert ist.
function normalisiere(pt) {
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of pt) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const s = 2 / Math.max(x1 - x0, y1 - y0);
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  return pt.map(([x, y]) => [(x - cx) * s, (y - cy) * s]);
}

function stern() {
  const p = [];
  for (let i = 0; i < 10; i++) {
    const r = i % 2 === 0 ? 1 : 0.42, a = -Math.PI / 2 + (i * Math.PI) / 5;
    p.push([r * Math.cos(a), r * Math.sin(a)]);
  }
  return p;
}

function mond() {
  const c = 0.5, r = 0.8;
  const x = (1 - r * r + c * c) / (2 * c), y = Math.sqrt(1 - x * x);
  const a0 = Math.atan2(y, x), p = [];
  for (let i = 0; i <= 60; i++) { const a = a0 + (i / 60) * (TAU - 2 * a0); p.push([Math.cos(a), Math.sin(a)]); }
  const b0 = Math.atan2(-y, x - c);          // Spitze unten am Innenkreis
  const b1 = Math.atan2(y, x - c);
  for (let i = 0; i <= 50; i++) { const a = (b0 + TAU) - (i / 50) * ((b0 + TAU) - b1); p.push([c + r * Math.cos(a), r * Math.sin(a)]); }
  return p;
}

// geschlossen: Linie schließt sich selbst; schwer: 1 leicht ... 3 schwer
const ROH = [
  { id: "haus", name: "Haus", schwer: 1, geschlossen: true,
    pt: [[-0.8, 0.9], [-0.8, -0.1], [0, -0.9], [0.8, -0.1], [0.8, 0.9]] },
  { id: "sechseck", name: "Sechseck", schwer: 1, geschlossen: true,
    pt: Array.from({ length: 6 }, (_, i) => [Math.cos((i * TAU) / 6), Math.sin((i * TAU) / 6)]) },
  { id: "kreuz", name: "Kreuz", schwer: 1, geschlossen: true,
    pt: [[-0.25, -1], [0.25, -1], [0.25, -0.25], [1, -0.25], [1, 0.25], [0.25, 0.25], [0.25, 1], [-0.25, 1], [-0.25, 0.25], [-1, 0.25], [-1, -0.25], [-0.25, -0.25]] },
  { id: "stern", name: "Stern", schwer: 2, geschlossen: true, pt: stern() },
  { id: "herz", name: "Herz", schwer: 2, geschlossen: true,
    pt: kurve(80, (t) => { const a = t * TAU; return [16 * Math.sin(a) ** 3, -(13 * Math.cos(a) - 5 * Math.cos(2 * a) - 2 * Math.cos(3 * a) - Math.cos(4 * a))]; }) },
  { id: "blitz", name: "Blitz", schwer: 2, geschlossen: true,
    pt: [[0.2, -1], [-0.6, 0.15], [-0.08, 0.15], [-0.3, 1], [0.6, -0.25], [0.05, -0.25]] },
  { id: "pfeil", name: "Pfeil", schwer: 2, geschlossen: true,
    pt: [[-1, -0.25], [0.15, -0.25], [0.15, -0.7], [1, 0], [0.15, 0.7], [0.15, 0.25], [-1, 0.25]] },
  { id: "welle", name: "Welle", schwer: 2, geschlossen: false,
    pt: kurve(90, (t) => [t * 2 - 1, 0.45 * Math.sin(t * TAU * 2)]) },
  { id: "mond", name: "Mondsichel", schwer: 2, geschlossen: true, pt: mond() },
  { id: "unendlich", name: "Unendlich-Zeichen", schwer: 3, geschlossen: true,
    pt: kurve(120, (t) => { const a = t * TAU, d = 1 + Math.sin(a) ** 2; return [Math.cos(a) / d, (Math.sin(a) * Math.cos(a)) / d]; }) },
  { id: "spirale", name: "Spirale", schwer: 3, geschlossen: false,
    pt: kurve(160, (t) => { const a = t * TAU * 2.5, r = 0.08 + t * 0.92; return [r * Math.cos(a), r * Math.sin(a)]; }) },
  { id: "blume", name: "Blume", schwer: 3, geschlossen: true,
    pt: kurve(200, (t) => { const a = t * Math.PI, r = Math.cos(5 * a); return [r * Math.cos(a), r * Math.sin(a)]; }) }
];

export const FORMEN = ROH.map((f) => ({ ...f, pt: normalisiere(f.pt) }));
export const formPerId = (id) => FORMEN.find((f) => f.id === id) || FORMEN[0];

// Gleichmäßig verteilte Punkte entlang der Linie
export function verdichte(pt, geschlossen, schritt = 0.02) {
  const liste = geschlossen ? [...pt, pt[0]] : pt;
  const aus = [];
  for (let i = 0; i < liste.length - 1; i++) {
    const [ax, ay] = liste[i], [bx, by] = liste[i + 1];
    const len = Math.hypot(bx - ax, by - ay);
    const n = Math.max(1, Math.ceil(len / schritt));
    for (let k = 0; k < n; k++) aus.push([ax + ((bx - ax) * k) / n, ay + ((by - ay) * k) / n]);
  }
  aus.push(liste[liste.length - 1]);
  return aus;
}

export function strichLaenge(striche) {
  let s = 0;
  for (const st of striche) for (let i = 1; i < st.length; i++) s += Math.hypot(st[i][0] - st[i - 1][0], st[i][1] - st[i - 1][1]);
  return s;
}

function naechsterAbstand(p, menge) {
  let m = Infinity;
  for (let i = 0; i < menge.length; i++) {
    const d = (p[0] - menge[i][0]) ** 2 + (p[1] - menge[i][1]) ** 2;
    if (d < m) m = d;
  }
  return Math.sqrt(m);
}

const TOLERANZ = 0.15;     // mittlere Abweichung, ab der es 0 % gibt (Form ist 2 breit)
const LUECKE = 0.2;        // so weit darf die Linie von einer Stelle der Vorlage weg sein

// Rückgabe: Genauigkeit in Prozent (0 bis 100, eine Nachkommastelle)
export function bewerteZeichnung(form, striche) {
  const gueltig = (striche || []).filter((s) => s.length > 1);
  if (!gueltig.length || strichLaenge(gueltig) < 0.4) return 0;
  const ziel = verdichte(form.pt, form.geschlossen, 0.025);
  const mein = [];
  for (const st of gueltig) mein.push(...verdichte(st, false, 0.025));
  let cov = 0, luecken = 0;
  for (const z of ziel) { const d = naechsterAbstand(z, mein); cov += d; if (d > LUECKE) luecken++; }
  cov /= ziel.length;
  let prec = 0;
  for (const m of mein) prec += naechsterAbstand(m, ziel);
  prec /= mein.length;
  const fehler = (cov + prec) / 2;
  const roh = Math.pow(Math.max(0, 1 - fehler / TOLERANZ), 1.2);
  const vollstaendig = 1 - luecken / ziel.length;
  return Math.round(roh * vollstaendig * 1000) / 10;
}

// Mischt alle Formen und liefert die ersten n (bei mehr als vorhanden: nochmal gemischt hinten dran)
export function waehleFormen(n) {
  const mische = () => {
    const a = FORMEN.map((f) => f.id);
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
  };
  let ids = mische();
  while (ids.length < n) ids = ids.concat(mische());
  return ids.slice(0, n);
}

// Punkte für Firestore: flache Liste ganzer Zahlen (0..1000, bei Strichen über den Rand auch negativ oder größer),
// SEP trennt die Striche
const SEP = -99999;
export function packe(striche, maxPunkte = 260) {
  const gesamt = striche.reduce((s, st) => s + st.length, 0);
  const jeder = Math.max(1, Math.ceil(gesamt / maxPunkte));
  const aus = [];
  for (const st of striche) {
    if (st.length < 2) continue;
    if (aus.length) aus.push(SEP);
    st.forEach((p, i) => {
      if (i % jeder === 0 || i === st.length - 1) aus.push(Math.round((p[0] + 1) * 500), Math.round((p[1] + 1) * 500));
    });
  }
  return aus;
}

export function entpacke(flach) {
  const striche = [];
  let akt = [];
  for (let i = 0; i < (flach || []).length;) {
    if (flach[i] === SEP) { if (akt.length) striche.push(akt); akt = []; i += 1; continue; }
    akt.push([flach[i] / 500 - 1, flach[i + 1] / 500 - 1]);
    i += 2;
  }
  if (akt.length) striche.push(akt);
  return striche;
}
