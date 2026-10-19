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

// ---------------------------------------------------------------------------------------------
//  Die Strecken
// ---------------------------------------------------------------------------------------------
export const STRECKEN = [
  {
    id: "tal", name: "Grünes Tal", kurz: "Tag · Wiese", thema: "tag", grip: 1, traktion: 1,
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
    id: "gp", name: "Grand Prix", kurz: "Tag · Haarnadeln", thema: "tag", grip: 1, traktion: 1, breite: 15,
    ops: [
      ["g", 340], ["r", 28, 90], ["g", 40], ["r", 20, 90], ["g", 60], ["l", 40, 40], ["r", 40, 40], ["g", 90],
      ["l", 18, 180], ["g", 30], ["r", 55, 90], ["g", 60], ["l", 55, 90], ["g", 250],
      ["r", 60, 90], ["g", 40], ["l", 17, 180], ["g", 25], ["r", 60, 90], ["g", 120],
      ["l", 70, 60], ["g", 80], ["r", 45, 100], ["l", 45, 70], ["g", 250],
    ],
    hoehen: [[0, 0], [300, 0.5], [520, 4], [760, 3], [1000, 1], [1250, 6], [1500, 3], [1750, 5], [2000, 1], [2400, 0]],
    sprung: [],
    boosts: (L) => [150, L * 0.46, L * 0.8],
    bruecken: [240], tribuenen: [{ s: 60, seite: 1 }, { s: 520, seite: -1 }],
    medaillen: { autor: 53.0, gold: 57.0, silber: 62.9, bronze: 72.6 },
  },
  {
    id: "wueste", name: "Wüstenhitze", kurz: "Tag · Sandpiste", thema: "wueste", grip: 0.84, traktion: 0.94, breite: 17,
    ops: [
      ["g", 260], ["l", 90, 65], ["g", 60], ["r", 75, 95], ["g", 90],
      ["l", 48, 125], ["g", 50], ["r", 130, 45], ["g", 200],
      ["r", 24, 170], ["g", 140], ["l", 105, 70], ["g", 130],
      ["r", 65, 95], ["l", 120, 35], ["g", 330],
    ],
    hoehen: [[0, 0], [250, 0], [420, 4], [560, 9], [760, 5], [950, 2], [1150, 7], [1380, 4], [1650, 2], [2200, 1]],
    sprung: [{ s0: 330, auf: 16, ab: 7, hoehe: 2.0 }, { s0: 1220, auf: 16, ab: 7, hoehe: 1.8 }],
    boosts: (L) => [110, L * 0.38, L * 0.7],
    bruecken: [], tribuenen: [{ s: 60, seite: 1 }],
    medaillen: { autor: 47.9, gold: 51.5, silber: 56.9, bronze: 65.6 },
  },
  {
    id: "eis", name: "Eispass", kurz: "Tag · Schnee, glatt", thema: "schnee", grip: 0.7, traktion: 0.86, breite: 15,
    ops: [
      ["g", 220], ["r", 40, 100], ["g", 70],
      ["l", 21, 180], ["g", 90], ["r", 21, 180], ["g", 90], ["l", 21, 180], ["g", 100],
      ["r", 50, 80], ["g", 110], ["l", 28, 125], ["g", 80], ["r", 75, 60], ["g", 280],
    ],
    hoehen: [[0, 0], [260, 1], [520, 12], [760, 22], [960, 30], [1160, 38], [1360, 33], [1560, 22], [1800, 12], [2000, 6], [2300, 4]],
    sprung: [],
    boosts: (L) => [130, L * 0.55, L * 0.78],
    bruecken: [], tribuenen: [{ s: 58, seite: 1 }],
    medaillen: { autor: 49.2, gold: 52.9, silber: 58.4, bronze: 67.4 },
  },
  {
    id: "nacht", name: "Neon-Nacht", kurz: "Nacht · Flutlicht", thema: "nacht", grip: 0.98, traktion: 1, breite: 15,
    ops: [
      ["g", 360], ["l", 30, 90], ["g", 40], ["r", 30, 90], ["g", 120], ["l", 18, 180], ["g", 40], ["r", 60, 90], ["g", 120],
      ["l", 60, 90], ["g", 40], ["l", 38, 40], ["r", 38, 80], ["l", 38, 40], ["g", 50],
      ["l", 16, 180], ["g", 30], ["r", 60, 90], ["g", 120], ["r", 80, 100], ["g", 320],
    ],
    hoehen: [[0, 0], [400, 0], [800, 2.5], [1150, 1], [1550, 3], [2100, 0.5]],
    sprung: [],
    boosts: (L) => [140, L * 0.42, L * 0.76],
    bruecken: [200], tribuenen: [{ s: 60, seite: 1 }, { s: 560, seite: -1 }],
    medaillen: { autor: 48.4, gold: 52.1, silber: 57.5, bronze: 66.3 },
  },
];
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

// "ops" -> Stuetzpunkte im Abstand DS (x, z, y, w)
function ausOps(def) {
  const kap = [];
  for (const [typ, a, b] of def.ops) {
    if (typ === "g") for (let m = 0; m < a; m++) kap.push(0);
    else {
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
  const px = [0], pz = [0];
  for (let m = 0; m < cur.length; m++) {
    const th2 = th + cur[m] * 0.5;
    x += Math.sin(th2); z += Math.cos(th2); th += cur[m];
    px.push(x); pz.push(z);
  }
  const n = Math.floor(cur.length / DS) + 1;
  const out = [];
  for (let i = 0; i < n; i++) {
    const s = i * DS;
    const w = def.breiten ? verlauf(def.breiten, s) : def.breite || 14;
    out.push([px[i * DS], pz[i * DS], def.hoehen ? verlauf(def.hoehen, s) : 0, w]);
  }
  return out;
}

export function baueStrecke(def = STRECKEN[0]) {
  let n, ds, x, z, y, w;
  if (def.ops) {
    const pts = ausOps(def);
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
  for (let i = 1; i < n - 1; i++) {
    const c = tx[i - 1] * tz[i + 1] - tz[i - 1] * tx[i + 1];
    kr[i] = Math.asin(Math.max(-1, Math.min(1, c))) / (2 * ds);   // >0: Linkskurve in (x,z)
  }

  const laenge = (n - 1) * ds;
  const S = {
    def, id: def.id, n, ds, laenge, x, z, y, w, tx, tz, kr, sprung: SPRUENGE[0] || null, startS: START_S, zielS: laenge - AUSLAUF,
    grip: def.grip || 1, traktion: def.traktion || 1,
  };
  S.boosts = def.boosts(laenge).map((s) => ({ s, lat: 0 }));
  S.checkpoints = [];

  // Raster fuer Abstandsabfragen (Gelaende, Baeume)
  const ZELLE = 40;
  const raster = new Map(), raster3 = new Map();
  for (let i = 0; i < n; i++) {
    const key = Math.floor(x[i] / ZELLE) + "," + Math.floor(z[i] / ZELLE);
    if (!raster.has(key)) raster.set(key, []);
    raster.get(key).push(i);
    if (i % 3 === 0) { if (!raster3.has(key)) raster3.set(key, []); raster3.get(key).push(i); }
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
