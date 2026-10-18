// Strecken von A nach B. Zwei Bauarten:
//  - "punkte": Spline durch Stuetzpunkte (x, z, Hoehe, Breite)
//  - "ops":    Fahrer-Anweisungen  ["g", Laenge] gerade, ["l"|"r", Radius, Grad] Kurve links/rechts
// Reine Mathematik ohne Three.js, damit Physik und Bot auch in Node laufen.
// s = Weg entlang der Strecke in Metern (0 = hinterste Mauer am Start).

export const DS = 2;                 // Abstand der Stuetzpunkte in Metern
export const KERB = 1.3;             // Kerb-Streifen neben der Fahrbahn
export const GRAS = 3.4;             // Gras-Streifen bis zur Bande
export const WAND_ABSTAND = KERB + GRAS; // Bande liegt so weit ausserhalb des Fahrbahnrands
export const START_S = 36;           // Startlinie (Auto steht kurz dahinter)
export const AUSLAUF = 85;           // Auslauf hinter der Ziellinie bis zur Endmauer

// x, z, Hoehe, Fahrbahnbreite
const PUNKTE = [
  [-36, 0, 0, 15],      // Startmauer
  [40, 0, 0, 15],
  [140, 0, 1, 15],
  [230, 8, 2.5, 14],
  [300, 50, 4.5, 14],
  [335, 120, 5.5, 14],
  [328, 195, 5, 14],
  [285, 250, 3.5, 15],
  [215, 268, 1.8, 14],
  [160, 292, 1, 13],
  [95, 318, 2, 13],
  [30, 300, 3.5, 13],
  [-15, 250, 4.5, 14],
  [-80, 215, 4, 14],
  [-150, 205, 2.5, 15],
  [-225, 175, 1, 15],
  [-300, 150, 0.5, 15],
  [-370, 140, 0.5, 15],   // Endmauer
];

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}
const smooth = (u) => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };

export function baueStrecke() {
  const K = PUNKTE.length;
  const pt = (k) => {
    if (k < 0) return PUNKTE[0].map((v, c) => 2 * v - PUNKTE[1][c]);
    if (k >= K) return PUNKTE[K - 1].map((v, c) => 2 * v - PUNKTE[K - 2][c]);
    return PUNKTE[k];
  };
  // 1) fein abtasten
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
  // 2) Bogenlaenge in der Ebene
  const cum = [0];
  for (let i = 1; i < fein.length; i++) {
    const a = fein[i - 1], b = fein[i];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const gesamt = cum[cum.length - 1];
  const n = Math.round(gesamt / DS) + 1;
  const ds = gesamt / (n - 1);
  const x = new Float32Array(n), z = new Float32Array(n), y = new Float32Array(n), w = new Float32Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const s = i * ds;
    while (j < cum.length - 2 && cum[j + 1] < s) j++;
    const u = Math.min(1, (s - cum[j]) / (cum[j + 1] - cum[j]));
    const a = fein[j], b = fein[j + 1];
    x[i] = a[0] + (b[0] - a[0]) * u; z[i] = a[1] + (b[1] - a[1]) * u;
    y[i] = a[2] + (b[2] - a[2]) * u; w[i] = a[3] + (b[3] - a[3]) * u;
  }
  // 3) Sprungschanze auf der ersten Geraden
  const SPRUNG = { s0: 215, auf: 15, ab: 6, hoehe: 1.7 };
  for (let i = 0; i < n; i++) {
    const s = i * ds;
    if (s >= SPRUNG.s0 && s <= SPRUNG.s0 + SPRUNG.auf) y[i] += SPRUNG.hoehe * ((s - SPRUNG.s0) / SPRUNG.auf);
    else if (s > SPRUNG.s0 + SPRUNG.auf && s < SPRUNG.s0 + SPRUNG.auf + SPRUNG.ab) y[i] += SPRUNG.hoehe * (1 - smooth((s - SPRUNG.s0 - SPRUNG.auf) / SPRUNG.ab));
  }
  // 4) Tangenten, Kruemmung (an den Enden einseitig)
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
  const S = { n, ds, laenge, x, z, y, w, tx, tz, kr, sprung: SPRUNG, startS: START_S, zielS: laenge - AUSLAUF };
  S.boosts = [
    { s: 120, lat: 0 },
    { s: laenge * 0.5, lat: 0 },
    { s: laenge * 0.74, lat: 0 },
  ];
  S.checkpoints = [];

  // Raster fuer Abstandsabfragen (Gelaende, Baeume)
  const ZELLE = 40;
  const raster = new Map();
  for (let i = 0; i < n; i++) {
    const key = Math.floor(x[i] / ZELLE) + "," + Math.floor(z[i] / ZELLE);
    if (!raster.has(key)) raster.set(key, []);
    raster.get(key).push(i);
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
