// Strecken von A nach B. Zwei Bauarten:
//  - "punkte": Spline durch Stuetzpunkte [x, z, Hoehe, Breite]
//  - "ops":    Fahrer-Anweisungen  ["g", Laenge] gerade, ["l"|"r", Radius, Grad] Kurve links/rechts
// Reine Mathematik ohne Three.js, damit Physik und Bot auch in Node laufen.
// s = Weg entlang der Strecke in Metern (0 = hinterste Mauer am Start).

export const DS = 2;                 // Abstand der Stuetzpunkte in Metern
export const KERB = 1.3;             // Kerb-Streifen neben der Fahrbahn
export const GRAS = 3.4;             // Gras-Streifen bis zur Bande
export const WAND_ABSTAND = KERB + GRAS; // Bande liegt so weit ausserhalb des Fahrbahnrands
export const START_S = 36;           // Startlinie (Auto steht kurz dahinter)
export const AUSLAUF = 85;           // Auslauf hinter der Ziellinie bis zur Endmauer


// Untergruende: wirken auf Haftung, Beschleunigung, Bremsen, Hoechsttempo und wie lange ein Rutscher anhaelt.
export const UNTERGRUND = {
  asphalt: { name: "Asphalt", icon: "🛣️", grip: 1,    traktion: 1,    gripK: 1,    bremse: 1,    vmax: 1 },
  eis:     { name: "Eis",     icon: "❄️", grip: 0.6,  traktion: 0.8,  gripK: 0.5,  bremse: 0.7,  vmax: 1 },
  sand:    { name: "Sand",    icon: "🏜️", grip: 0.8,  traktion: 0.9,  gripK: 0.75, bremse: 0.9,  vmax: 0.94 },
  offroad: { name: "Offroad", icon: "🌲", grip: 0.86, traktion: 0.93, gripK: 0.9,  bremse: 0.9,  vmax: 0.96 },
};

// ---------------------------------------------------------------------------------------------
//  Die Strecken
// ---------------------------------------------------------------------------------------------
export const STRECKEN = [
  // 4 Streckenarten x 4 Strecken, jeweils unterschiedlich lang. Alle Strecken sind so gebaut, dass der Test-Bot
  // 25-35 Sekunden braucht; ein Mensch liegt damit realistisch bei 27-40 Sekunden.
  {
    id: "loop", name: "Looping-Arena", km: 0.78, untergrund: "asphalt", thema: "nacht", grip: 0.98, traktion: 1, breite: 13,
    ops: [["g", 120], ["r", 20, 90], ["g", 30], ["l", 20, 90], ["g", 80], ["loop", 16, 30], ["g", 40], ["r", 16, 180], ["g", 20], ["l", 16, 90], ["r", 16, 90], ["g", 30], ["l", 14, 180], ["g", 20], ["r", 22, 100], ["l", 22, 100], ["g", 169]],
    hoehen: [[0, 0], [900, 0]],
    sprung: [],
    boosts: (L, info) => [info.loops[0].s0 - 40, L * 0.78],
    bruecken: [], tribuenen: [{s:60, seite:1}],
    medaillen: { autor: 25, gold: 26.9, silber: 29.7, bronze: 34.3 },
  },
  {
    id: "kart", name: "Kartbahn", km: 0.87, untergrund: "asphalt", thema: "tag", breite: 12,
    ops: [["g", 110], ["r", 14, 90], ["g", 29], ["l", 14, 90], ["g", 29], ["r", 14, 90], ["l", 14, 90], ["g", 36], ["r", 22, 180], ["g", 44], ["l", 18, 110], ["r", 18, 110], ["g", 36], ["l", 12, 180], ["g", 44], ["r", 25, 120], ["l", 25, 60], ["g", 29], ["r", 16, 90], ["l", 16, 90], ["r", 16, 90], ["g", 29], ["l", 30, 120], ["g", 120]],
    hoehen: [[0, 0], [450, 2], [900, 0]],
    sprung: [],
    boosts: (L) => [150, L * 0.55],
    bruecken: [], tribuenen: [{s:60, seite:1}],
    medaillen: { autor: 30.8, gold: 33.1, silber: 36.5, bronze: 42.2 },
  },
  {
    id: "nacht", name: "Neon-Nacht", km: 1.09, untergrund: "asphalt", thema: "nacht", grip: 0.98, traktion: 1, breite: 15,
    ops: [["g", 125], ["l", 30, 90], ["g", 40], ["r", 30, 90], ["g", 10], ["l", 18, 180], ["g", 40], ["r", 60, 90], ["g", 11], ["l", 60, 90], ["g", 40], ["l", 38, 40], ["r", 38, 80], ["l", 38, 40], ["g", 50], ["l", 16, 180], ["g", 30], ["r", 60, 90], ["g", 10], ["r", 80, 100], ["g", 120]],
    hoehen: [[0, 0], [300, 0], [600, 2.5], [900, 1], [1200, 3]],
    sprung: [],
    boosts: (L) => [140, L * 0.45, L * 0.76],
    bruecken: [200], tribuenen: [{s:60, seite:1}, {s:460, seite:-1}],
    medaillen: { autor: 31.8, gold: 34.2, silber: 37.7, bronze: 43.6 },
  },
  {
    id: "tal", name: "Grünes Tal", km: 1.18, untergrund: "asphalt", thema: "tag", grip: 1, traktion: 1,
    punkte: [
      [-36, 0, 0, 15], [40, 0, 0, 15], [140, 0, 1, 15], [230, 8, 2.5, 14], [300, 50, 4.5, 14], [335, 120, 5.5, 14],
      [328, 195, 5, 14], [285, 250, 3.5, 15], [215, 268, 1.8, 14], [160, 292, 1, 13], [95, 318, 2, 13], [30, 300, 3.5, 13],
      [-15, 250, 4.5, 14], [-80, 215, 4, 14], [-150, 205, 2.5, 15], [-225, 175, 1, 15], [-300, 150, 0.5, 15], [-370, 140, 0.5, 15],
    ],
    sprung: [{ s0: 215, auf: 15, ab: 6, hoehe: 1.7 }],
    boosts: (L) => [120, L * 0.5, L * 0.74],
    bruecken: [90], tribuenen: [{ s: 58, seite: 1 }, { s: -8, seite: -1 }],
    medaillen: { autor: 26.1, gold: 28.1, silber: 31.0, bronze: 35.8 },
  },
  {
    id: "frost", name: "Frostkante", km: 0.6, untergrund: "eis", thema: "schnee", breite: 14,
    ops: [["g", 130], ["l", 30, 90], ["g", 22], ["r", 30, 90], ["g", 22], ["r", 40, 120], ["g", 22], ["l", 22, 170], ["g", 22], ["r", 30, 90], ["g", 32], ["l", 28, 100], ["g", 129]],
    hoehen: [[0, 10], [250, 7], [500, 3], [700, 0]],
    sprung: [],
    boosts: (L) => [135, L * 0.5, L * 0.78],
    bruecken: [], tribuenen: [{s:60, seite:-1}],
    medaillen: { autor: 25.7, gold: 27.7, silber: 30.5, bronze: 35.2 },
  },
  {
    id: "glet", name: "Gletscher-Schlange", km: 0.66, untergrund: "eis", thema: "schnee", breite: 12,
    ops: [["g", 110], ["l", 17, 180], ["g", 11], ["r", 17, 180], ["g", 11], ["l", 17, 180], ["g", 21], ["r", 30, 90], ["l", 30, 90], ["g", 13], ["r", 17, 180], ["g", 11], ["l", 17, 180], ["g", 11], ["r", 17, 180], ["g", 14], ["l", 17, 150], ["g", 120]],
    hoehen: [[0, 24], [200, 20], [400, 12], [600, 5], [850, 0]],
    sprung: [],
    boosts: (L) => [140, L * 0.55],
    bruecken: [], tribuenen: [{s:60, seite:1}],
    medaillen: { autor: 34.4, gold: 37, silber: 40.8, bronze: 47.1 },
  },
  {
    id: "eis", name: "Eispass", km: 0.72, untergrund: "eis", thema: "schnee", breite: 15,
    ops: [["g", 125], ["r", 40, 100], ["g", 35], ["l", 21, 180], ["g", 28], ["r", 21, 180], ["g", 41], ["r", 50, 80], ["g", 41], ["l", 28, 125], ["g", 35], ["r", 75, 60], ["g", 120]],
    hoehen: [[0, 0], [200, 3], [400, 10], [600, 18], [800, 24], [1000, 20], [1200, 12], [1400, 6]],
    sprung: [],
    boosts: (L) => [130, L * 0.55, L * 0.78],
    bruecken: [], tribuenen: [{s:58, seite:1}],
    medaillen: { autor: 30, gold: 32.3, silber: 35.6, bronze: 41.1 },
  },
  {
    id: "polar", name: "Polar-Express", km: 0.82, untergrund: "eis", thema: "schnee", breite: 14,
    ops: [["g", 125], ["r", 90, 45], ["g", 24], ["l", 90, 45], ["g", 19], ["l", 30, 150], ["g", 15], ["r", 30, 150], ["g", 29], ["r", 60, 70], ["g", 19], ["l", 60, 70], ["g", 19], ["l", 26, 120], ["g", 15], ["r", 26, 110], ["g", 120]],
    hoehen: [[0, 6], [300, 14], [600, 22], [900, 14], [1200, 5]],
    sprung: [],
    boosts: (L) => [140, L * 0.45, L * 0.75],
    bruecken: [], tribuenen: [{s:60, seite:1}],
    medaillen: { autor: 31.3, gold: 33.7, silber: 37.1, bronze: 42.9 },
  },
  {
    id: "oase", name: "Oasen-Runde", km: 0.68, untergrund: "sand", thema: "wueste", breite: 14,
    ops: [["g", 150], ["l", 40, 100], ["g", 24], ["r", 40, 100], ["g", 18], ["r", 30, 140], ["g", 24], ["l", 24, 150], ["g", 24], ["r", 45, 80], ["g", 24], ["l", 30, 90], ["g", 145]],
    hoehen: [[0, 0], [250, 3], [500, 2], [800, 0]],
    sprung: [{s0:70, auf:14, ab:6, hoehe:1.5}],
    boosts: (L) => [130, L * 0.55],
    bruecken: [], tribuenen: [{s:60, seite:1}],
    medaillen: { autor: 25.6, gold: 27.5, silber: 30.4, bronze: 35.1 },
  },
  {
    id: "duene", name: "Dünen-Slalom", km: 0.75, untergrund: "sand", thema: "wueste", breite: 13,
    ops: [["g", 110], ["l", 40, 70], ["r", 40, 110], ["l", 35, 100], ["r", 30, 90], ["g", 29], ["l", 22, 150], ["g", 20], ["r", 38, 100], ["l", 38, 80], ["r", 30, 70], ["g", 20], ["l", 26, 120], ["r", 26, 90], ["l", 26, 60], ["g", 120]],
    hoehen: [[0, 0], [200, 3], [380, 7], [560, 3], [700, 6], [900, 2]],
    sprung: [{s0:62, auf:14, ab:6, hoehe:1.6}],
    boosts: (L) => [135, L * 0.5],
    bruecken: [], tribuenen: [{s:60, seite:1}],
    medaillen: { autor: 27.6, gold: 29.7, silber: 32.7, bronze: 37.8 },
  },
  {
    id: "canyon", name: "Canyon-Jagd", km: 0.88, untergrund: "sand", thema: "wueste", breite: 14,
    ops: [["g", 140], ["r", 35, 110], ["g", 16], ["l", 35, 110], ["g", 31], ["l", 70, 60], ["g", 23], ["r", 24, 170], ["g", 39], ["l", 50, 90], ["r", 50, 90], ["g", 31], ["l", 22, 160], ["g", 31], ["r", 90, 40], ["g", 124]],
    hoehen: [[0, 0], [300, 6], [500, 10], [700, 5], [900, 8], [1100, 2]],
    sprung: [{s0:330, auf:16, ab:7, hoehe:1.8}],
    boosts: (L) => [120, L * 0.42, L * 0.72],
    bruecken: [], tribuenen: [{s:60, seite:1}],
    medaillen: { autor: 30.5, gold: 32.8, silber: 36.2, bronze: 41.8 },
  },
  {
    id: "wueste", name: "Wüstenhitze", km: 1.01, untergrund: "sand", thema: "wueste", breite: 17,
    ops: [["g", 143], ["l", 60, 65], ["g", 29], ["r", 50, 95], ["g", 43], ["l", 36, 125], ["g", 29], ["r", 80, 45], ["g", 57], ["r", 22, 170], ["g", 50], ["l", 70, 70], ["g", 50], ["r", 45, 95], ["l", 80, 35], ["g", 157]],
    hoehen: [[0, 0], [250, 0], [420, 4], [560, 9], [760, 5], [950, 2], [1150, 7], [1380, 4], [1650, 2], [2200, 1]],
    sprung: [{s0:330, auf:16, ab:7, hoehe:2}, {s0:900, auf:16, ab:7, hoehe:1.8}],
    boosts: (L) => [110, L * 0.38, L * 0.7],
    bruecken: [], tribuenen: [{s:60, seite:1}],
    medaillen: { autor: 32.9, gold: 35.4, silber: 39, bronze: 45.1 },
  },
  {
    id: "herbst", name: "Herbstpfad", km: 0.65, untergrund: "offroad", thema: "herbst", breite: 12,
    ops: [["g", 110], ["r", 24, 100], ["l", 16, 160], ["g", 15], ["r", 16, 160], ["g", 25], ["l", 30, 90], ["r", 30, 60], ["g", 30], ["l", 20, 120], ["r", 20, 100], ["g", 20], ["l", 14, 180], ["g", 20], ["r", 20, 90], ["l", 20, 90], ["r", 16, 100], ["g", 120]],
    hoehen: [[0, 0], [250, 4], [450, 9], [650, 5], [800, 3]],
    sprung: [],
    boosts: (L) => [140, L * 0.6],
    bruecken: [], tribuenen: [{s:60, seite:1}],
    medaillen: { autor: 25.8, gold: 27.8, silber: 30.6, bronze: 35.3 },
  },
  {
    id: "wald", name: "Waldweg", km: 0.73, untergrund: "offroad", thema: "wald", breite: 12,
    ops: [["g", 130], ["l", 35, 80], ["g", 22], ["r", 35, 80], ["g", 22], ["r", 28, 120], ["g", 27], ["l", 20, 150], ["g", 22], ["r", 45, 70], ["l", 45, 70], ["g", 27], ["l", 18, 160], ["g", 22], ["r", 30, 100], ["g", 152]],
    hoehen: [[0, 0], [200, 3], [400, 7], [600, 4], [800, 1]],
    sprung: [],
    boosts: (L) => [140, L * 0.55],
    bruecken: [], tribuenen: [{s:60, seite:1}],
    medaillen: { autor: 26.3, gold: 28.3, silber: 31.2, bronze: 36 },
  },
  {
    id: "stein", name: "Steinbruch", km: 0.83, untergrund: "offroad", thema: "herbst", breite: 13,
    ops: [["g", 125], ["r", 30, 90], ["g", 28], ["l", 30, 90], ["g", 28], ["l", 60, 50], ["g", 28], ["r", 18, 170], ["g", 28], ["l", 40, 100], ["r", 40, 100], ["g", 28], ["l", 16, 180], ["g", 28], ["r", 25, 110], ["g", 28], ["l", 30, 90], ["g", 141]],
    hoehen: [[0, 0], [250, 6], [450, 14], [650, 8], [900, 2]],
    sprung: [{s0:280, auf:14, ab:6, hoehe:1.6}],
    boosts: (L) => [135, L * 0.5, L * 0.78],
    bruecken: [], tribuenen: [{s:60, seite:1}],
    medaillen: { autor: 29.5, gold: 31.7, silber: 35, bronze: 40.4 },
  },
  {
    id: "schlamm", name: "Schlammpiste", km: 0.93, untergrund: "offroad", thema: "wald", breite: 13,
    ops: [["g", 126], ["l", 50, 70], ["g", 27], ["r", 50, 70], ["g", 27], ["r", 24, 150], ["g", 27], ["l", 24, 150], ["g", 36], ["l", 70, 50], ["g", 27], ["r", 20, 170], ["g", 27], ["l", 35, 100], ["g", 27], ["r", 35, 100], ["g", 36], ["l", 18, 160], ["g", 144]],
    hoehen: [[0, 2], [300, 8], [600, 3], [900, 9], [1200, 1]],
    sprung: [],
    boosts: (L) => [140, L * 0.45, L * 0.75],
    bruecken: [], tribuenen: [{s:60, seite:1}],
    medaillen: { autor: 33.6, gold: 36.2, silber: 39.8, bronze: 46 },
  },
];
export const STRECKEN_ARTEN = ["asphalt", "eis", "sand", "offroad"];   // Reihenfolge im Menue (wie die Cups bei Mario Kart)
export const streckeNachId = (id) => STRECKEN.find((t) => t.id === id) || STRECKEN[0];

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
const smooth = (u) => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };

// Hermite-Verlauf durch Hoehen-Stuetzstellen [[s, y], ...]
function verlauf(keys, s) {
  const K = keys.length;
  if (s <= keys[0][0]) return keys[0][1];
  if (s >= keys[K - 1][0]) return keys[K - 1][1];
  let k = 0; while (k < K - 2 && keys[k + 1][0] < s) k++;
  const [s0, y0] = keys[k], [s1, y1] = keys[k + 1];
  const m = (j) => { const a = keys[Math.max(0, j - 1)], b = keys[Math.min(K - 1, j + 1)]; return (b[1] - a[1]) / Math.max(1e-6, b[0] - a[0]); };
  const h = s1 - s0, t = (s - s0) / h, t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * m(k) + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * m(k + 1);
}

// "ops" -> Stuetzpunkte im Abstand DS (x, z, y, w) + Looping-Daten
function ausOps(def) {
  const kap = [];
  const loops = [];
  for (const [typ, a, b] of def.ops) {
    if (typ === "g") for (let m = 0; m < a; m++) kap.push(0);
    else if (typ === "loop") {
      if (kap.length % 2) kap.push(0);
      const R = a, D = b || 30;
      const arc = 2 * Math.round(Math.hypot(2 * Math.PI * R, D) / 2);
      loops.push({ m0: kap.length, m1: kap.length + arc, R, D, arc });
      for (let m = 0; m < arc; m++) kap.push(0);
    } else {
      const rad = (b * Math.PI) / 180, len = Math.max(1, Math.round(a * rad)), k = (rad / len) * (typ === "l" ? 1 : -1);
      for (let m = 0; m < len; m++) kap.push(k);
    }
  }
  // Kruemmungsaufbau weich machen (Gesamtwinkel bleibt erhalten)
  const W = def.glatt || 11;
  let cur = kap;
  for (let pass = 0; pass < 2; pass++) {
    const nxt = new Array(cur.length).fill(0);
    for (let i = 0; i < cur.length; i++) {
      let sum = 0;
      for (let j = -W; j <= W; j++) { const q = i + j; if (q >= 0 && q < cur.length) sum += cur[q]; }
      nxt[i] = sum / (2 * W + 1);
    }
    cur = nxt;
  }
  let th = Math.PI / 2, x = 0, z = 0;
  const px = [0], pz = [0], py = [0];
  const N = cur.length;
  const lo = new Int8Array(N + 1).fill(-1);
  const nrm = new Float32Array((N + 1) * 3);
  for (let m = 0; m <= N; m++) { nrm[m * 3 + 1] = 1; }
  let L = 0, ex = 0, ez = 0, fx = 0, fz = 0, rx = 0, rz = 0;
  for (let m = 0; m < N; m++) {
    const lp = loops.findIndex((l) => m >= l.m0 && m < l.m1);
    if (lp >= 0) {
      const l = loops[lp];
      if (m === l.m0) { ex = x; ez = z; fx = Math.sin(th); fz = Math.cos(th); rx = -fz; rz = fx; lo[m] = lp; }
      const u = (m + 1 - l.m0) / l.arc, ph = 2 * Math.PI * u;
      x = ex + fx * l.R * Math.sin(ph) + rx * l.D * u; z = ez + fz * l.R * Math.sin(ph) + rz * l.D * u;
      px.push(x); pz.push(z); py.push(l.R * (1 - Math.cos(ph)));
      lo[m + 1] = lp;
      nrm[(m + 1) * 3] = -fx * Math.sin(ph); nrm[(m + 1) * 3 + 1] = Math.cos(ph); nrm[(m + 1) * 3 + 2] = -fz * Math.sin(ph);
      if (m === l.m0) { lo[m] = lp; }
      continue;
    }
    const th2 = th + cur[m] * 0.5;
    x += Math.sin(th2); z += Math.cos(th2); th += cur[m];
    px.push(x); pz.push(z); py.push(0);
  }
  const n = Math.floor(N / DS) + 1;
  const out = [], extra = { nx: new Float32Array(n), ny: new Float32Array(n).fill(1), nz: new Float32Array(n), loop: new Int8Array(n).fill(-1), fx: new Float32Array(n), fz: new Float32Array(n) };
  for (let i = 0; i < n; i++) {
    const s = i * DS, m = i * DS;
    const w = def.breiten ? verlauf(def.breiten, s) : def.breite || 14;
    const lp = lo[m];
    const yBasis = def.hoehen ? verlauf(def.hoehen, lp >= 0 ? loops[lp].m0 : s) : 0;
    out.push([px[m], pz[m], yBasis + py[m], w]);
    if (lp >= 0) { extra.loop[i] = lp; extra.nx[i] = nrm[m * 3]; extra.ny[i] = nrm[m * 3 + 1]; extra.nz[i] = nrm[m * 3 + 2]; }
  }
  // Schleifen: Index-Bereiche und Vorwaertsrichtung
  const info = loops.map((l, k) => {
    const i0 = l.m0 / DS, i1 = l.m1 / DS;
    const dxe = px[l.m0 + 1] - px[l.m0];       // nur zur Richtung vor der Schleife
    void dxe;
    return { i0, i1, R: l.R, D: l.D, arc: l.arc, k };
  });
  return { pts: out, extra, info, th0: Math.PI / 2, px, pz };
}

export function baueStrecke(def = STRECKEN[0]) {
  let n, ds, x, z, y, w, ops = null;
  if (def.ops) {
    ops = ausOps(def);
    const pts = ops.pts;
    n = pts.length; ds = DS;
    x = new Float32Array(n); z = new Float32Array(n); y = new Float32Array(n); w = new Float32Array(n);
    pts.forEach((p, i) => { x[i] = p[0]; z[i] = p[1]; y[i] = p[2]; w[i] = p[3]; });
  } else {
    const PUNKTE = def.punkte, K = PUNKTE.length;
    const pt = (k) => {
      if (k < 0) return PUNKTE[0].map((v, c) => 2 * v - PUNKTE[1][c]);
      if (k >= K) return PUNKTE[K - 1].map((v, c) => 2 * v - PUNKTE[K - 2][c]);
      return PUNKTE[k];
    };
    const fein = [];
    const STEPS = 48;
    for (let k = 0; k < K - 1; k++) {
      const p0 = pt(k - 1), p1 = pt(k), p2 = pt(k + 1), p3 = pt(k + 2);
      for (let s = 0; s < STEPS; s++) {
        const t = s / STEPS;
        fein.push([0, 1, 2, 3].map((c) => catmull(p0[c], p1[c], p2[c], p3[c], t)));
      }
    }
    fein.push(PUNKTE[K - 1].slice());
    const cum = [0];
    for (let i = 1; i < fein.length; i++) {
      const a = fein[i - 1], b = fein[i];
      cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    const gesamt = cum[cum.length - 1];
    n = Math.round(gesamt / DS) + 1;
    ds = gesamt / (n - 1);
    x = new Float32Array(n); z = new Float32Array(n); y = new Float32Array(n); w = new Float32Array(n);
    let j = 0;
    for (let i = 0; i < n; i++) {
      const s = i * ds;
      while (j < cum.length - 2 && cum[j + 1] < s) j++;
      const u = Math.min(1, (s - cum[j]) / (cum[j + 1] - cum[j]));
      const a = fein[j], b = fein[j + 1];
      x[i] = a[0] + (b[0] - a[0]) * u; z[i] = a[1] + (b[1] - a[1]) * u;
      y[i] = a[2] + (b[2] - a[2]) * u; w[i] = a[3] + (b[3] - a[3]) * u;
    }
  }
  // Sprungschanzen
  const SPRUENGE = def.sprung || [];
  for (const SP of SPRUENGE) {
    for (let i = 0; i < n; i++) {
      const s = i * ds;
      if (s >= SP.s0 && s <= SP.s0 + SP.auf) y[i] += SP.hoehe * ((s - SP.s0) / SP.auf);
      else if (s > SP.s0 + SP.auf && s < SP.s0 + SP.auf + SP.ab) y[i] += SP.hoehe * (1 - smooth((s - SP.s0 - SP.auf) / SP.ab));
    }
  }
  // Tangenten, Kruemmung (an den Enden einseitig)
  const tx = new Float32Array(n), tz = new Float32Array(n), kr = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = Math.max(0, i - 1), b = Math.min(n - 1, i + 1);
    const dx = x[b] - x[a], dz = z[b] - z[a], l = Math.hypot(dx, dz);
    tx[i] = dx / l; tz[i] = dz / l;
  }
  // Normalen / Rechtsvektoren (ausserhalb von Schleifen: senkrecht nach oben bzw. waagerecht rechts)
  const NX = new Float32Array(n), NY = new Float32Array(n).fill(1), NZ = new Float32Array(n), RXA = new Float32Array(n), RZA = new Float32Array(n);
  const loopIdx = new Int8Array(n).fill(-1);
  const loopsS = [];
  if (ops) {
    ops.info.forEach((l) => {
      // Vorwaertsrichtung der Schleife = Richtung unmittelbar vor dem Einstieg
      const ia = Math.max(0, l.i0 - 1);
      const fx = tx[ia], fz = tz[ia];
      for (let i = l.i0; i <= l.i1; i++) { tx[i] = fx; tz[i] = fz; loopIdx[i] = l.k; NX[i] = ops.extra.nx[i]; NY[i] = ops.extra.ny[i]; NZ[i] = ops.extra.nz[i]; }
      const cum = new Float32Array(l.i1 - l.i0 + 1);
      for (let i = l.i0 + 1; i <= l.i1; i++) cum[i - l.i0] = cum[i - l.i0 - 1] + Math.hypot(x[i] - x[i - 1], y[i] - y[i - 1], z[i] - z[i - 1]);
      loopsS.push({ i0: l.i0, i1: l.i1, s0: l.i0 * ds, s1: l.i1 * ds, R: l.R, D: l.D, arc: cum[cum.length - 1], cum, fx, fz });
    });
  }
  for (let i = 0; i < n; i++) { RXA[i] = -tz[i]; RZA[i] = tx[i]; }
  for (let i = 1; i < n - 1; i++) {
    if (loopIdx[i] >= 0) continue;
    const c = tx[i - 1] * tz[i + 1] - tz[i - 1] * tx[i + 1];
    kr[i] = Math.asin(Math.max(-1, Math.min(1, c))) / (2 * ds);   // >0: Linkskurve in (x,z)
  }

  const laenge = (n - 1) * ds;
  const UG = UNTERGRUND[def.untergrund || "asphalt"];
  const S = {
    def, id: def.id, n, ds, laenge, x, z, y, w, tx, tz, kr, NX, NY, NZ, RXA, RZA, loopIdx, loops: loopsS, sprung: SPRUENGE[0] || null, startS: START_S, zielS: laenge - AUSLAUF,
    untergrund: def.untergrund || "asphalt", grip: def.grip || UG.grip, traktion: def.traktion || UG.traktion, gripK: UG.gripK, bremse: UG.bremse, vmaxFak: UG.vmax,
  };
  S.boosts = def.boosts(laenge, { loops: loopsS }).map((s) => ({ s, lat: 0 }));
  S.checkpoints = [];

  // Raster fuer Abstandsabfragen (Gelaende, Baeume)
  const ZELLE = 40;
  const raster = new Map(), raster3 = new Map();
  for (let i = 0; i < n; i++) {
    const key = Math.floor(x[i] / ZELLE) + "," + Math.floor(z[i] / ZELLE);
    if (!raster.has(key)) raster.set(key, []);
    raster.get(key).push(i);
    if (i % 3 === 0 && loopIdx[i] < 0) { if (!raster3.has(key)) raster3.set(key, []); raster3.get(key).push(i); }
  }
  S.abstand = (px, pz, maxR = 160) => {
    let best = maxR * maxR;
    const r = Math.ceil(maxR / ZELLE);
    const cx = Math.floor(px / ZELLE), cz = Math.floor(pz / ZELLE);
    for (let gx = cx - r; gx <= cx + r; gx++) for (let gz = cz - r; gz <= cz + r; gz++) {
      const l = raster.get(gx + "," + gz);
      if (!l) continue;
      for (const i of l) { const d = (x[i] - px) ** 2 + (z[i] - pz) ** 2; if (d < best) best = d; }
    }
    return Math.sqrt(best);
  };
  // Abstand zur Strecke + abstandsgewichtete Streckenhoehe (damit das Gelaende dem Hang folgt)
  S.gelaende = (px, pz, maxR = 120, out = {}) => {
    let best = maxR * maxR, sw = 0, sy = 0;
    const r = Math.ceil(maxR / ZELLE);
    const cx = Math.floor(px / ZELLE), cz = Math.floor(pz / ZELLE);
    for (let gx = cx - r; gx <= cx + r; gx++) for (let gz = cz - r; gz <= cz + r; gz++) {
      const l = raster3.get(gx + "," + gz);
      if (!l) continue;
      for (const i of l) {
        const d = (x[i] - px) ** 2 + (z[i] - pz) ** 2;
        if (d < best) best = d;
        if (d < maxR * maxR) { const q = d + 36, wt = 1 / (q * q); sw += wt; sy += wt * y[i]; }
      }
    }
    out.d = Math.sqrt(best); out.y = sw > 0 ? sy / sw : 0; out.treffer = sw > 0;
    return out;
  };

  // Naechster Punkt auf der Mittellinie. hint = letzter Index (schnell), sonst global.
  // out.over: Ueberstand ueber Start (<0) bzw. Ende (>0) in Metern, sonst 0.
  S.nahe = (px, pz, hint, out = {}) => {
    let bestD = Infinity, bi = 0, bt = 0, rawT = 0;
    const test = (i) => {
      const j2 = i + 1;
      const ex = x[j2] - x[i], ez = z[j2] - z[i];
      const raw = ((px - x[i]) * ex + (pz - z[i]) * ez) / (ex * ex + ez * ez);
      const t = raw < 0 ? 0 : raw > 1 ? 1 : raw;
      const dx = px - (x[i] + ex * t), dz = pz - (z[i] + ez * t);
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; bi = i; bt = t; rawT = raw; }
    };
    if (hint == null) for (let i = 0; i < n - 1; i++) test(i);
    else { const lo = Math.max(0, hint - 14), hi = Math.min(n - 2, hint + 14); for (let i = lo; i <= hi; i++) test(i); }
    const j2 = bi + 1;
    out.i = bi; out.t = bt;
    out.s = (bi + bt) * ds;
    out.over = bi === 0 && rawT < 0 ? rawT * ds : bi === n - 2 && rawT > 1 ? (rawT - 1) * ds : 0;
    out.y = y[bi] + (y[j2] - y[bi]) * bt;
    out.w = w[bi] + (w[j2] - w[bi]) * bt;
    let ttx = tx[bi] + (tx[j2] - tx[bi]) * bt, ttz = tz[bi] + (tz[j2] - tz[bi]) * bt;
    const tl = Math.hypot(ttx, ttz); ttx /= tl; ttz /= tl;
    out.tx = ttx; out.tz = ttz;
    out.rx = -ttz; out.rz = ttx;
    const cx = x[bi] + (x[j2] - x[bi]) * bt, cz = z[bi] + (z[j2] - z[bi]) * bt;
    out.lat = (px - cx) * out.rx + (pz - cz) * out.rz;
    out.cx = cx; out.cz = cz;
    return out;
  };
  return S;
}

// Startaufstellung: kurz hinter der Startlinie
export function startPose(S) {
  const i = Math.round((S.startS - 7) / S.ds);
  return { x: S.x[i], z: S.z[i], y: S.y[i], theta: Math.atan2(S.tx[i], S.tz[i]), i };
}
