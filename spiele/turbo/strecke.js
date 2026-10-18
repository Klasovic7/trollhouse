// Strecke: geschlossene Spline (x, z, Hoehe, Breite), gleichmaessig abgetastet.
// Reine Mathematik ohne Three.js, damit Physik und Bot auch in Node laufen.

export const DS = 2;                 // Abstand der Stuetzpunkte in Metern
export const KERB = 1.3;             // Kerb-Streifen neben der Fahrbahn
export const GRAS = 3.4;             // Gras-Streifen bis zur Bande
export const WAND_ABSTAND = KERB + GRAS; // Bande liegt so weit ausserhalb des Fahrbahnrands

// x, z, Hoehe, Fahrbahnbreite
const PUNKTE = [
  [0, 0, 0, 15],
  [120, 0, 0, 15],
  [230, 8, 2.5, 14],
  [305, 50, 5, 14],
  [335, 130, 5.5, 14],
  [305, 210, 3, 16],
  [225, 245, 1, 13],
  [165, 205, 0, 13],
  [110, 250, 1.5, 13],
  [40, 305, 4, 14],
  [-60, 305, 4.5, 14],
  [-135, 240, 2.5, 14],
  [-140, 150, 0.5, 15],
  [-95, 80, 0, 15],
  [-50, 28, 0, 15],
];

function catmull(p0, p1, p2, p3, t) {
  const t2 = t * t, t3 = t2 * t;
  return 0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 + (-p0 + 3 * p1 - 3 * p2 + p3) * t3);
}

const smooth = (u) => { u = Math.max(0, Math.min(1, u)); return u * u * (3 - 2 * u); };

export function baueStrecke() {
  const K = PUNKTE.length;
  // 1) fein abtasten
  const fein = [];
  const STEPS = 48;
  for (let k = 0; k < K; k++) {
    const p0 = PUNKTE[(k - 1 + K) % K], p1 = PUNKTE[k], p2 = PUNKTE[(k + 1) % K], p3 = PUNKTE[(k + 2) % K];
    for (let s = 0; s < STEPS; s++) {
      const t = s / STEPS;
      fein.push([0, 1, 2, 3].map((c) => catmull(p0[c], p1[c], p2[c], p3[c], t)));
    }
  }
  // 2) Bogenlaenge in der Ebene
  const cum = [0];
  for (let i = 1; i <= fein.length; i++) {
    const a = fein[i - 1], b = fein[i % fein.length];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const laenge = cum[cum.length - 1];
  const n = Math.round(laenge / DS);
  const ds = laenge / n;
  const x = new Float32Array(n), z = new Float32Array(n), y = new Float32Array(n), w = new Float32Array(n);
  let j = 0;
  for (let i = 0; i < n; i++) {
    const s = i * ds;
    while (cum[j + 1] < s) j++;
    const u = (s - cum[j]) / (cum[j + 1] - cum[j]);
    const a = fein[j], b = fein[(j + 1) % fein.length];
    x[i] = a[0] + (b[0] - a[0]) * u; z[i] = a[1] + (b[1] - a[1]) * u;
    y[i] = a[2] + (b[2] - a[2]) * u; w[i] = a[3] + (b[3] - a[3]) * u;
  }
  // 3) Sprungschanze auf der ersten Geraden
  const SPRUNG = { s0: 170, auf: 15, ab: 6, hoehe: 1.7 };
  for (let i = 0; i < n; i++) {
    const s = i * ds;
    if (s >= SPRUNG.s0 && s <= SPRUNG.s0 + SPRUNG.auf) y[i] += SPRUNG.hoehe * ((s - SPRUNG.s0) / SPRUNG.auf);
    else if (s > SPRUNG.s0 + SPRUNG.auf && s < SPRUNG.s0 + SPRUNG.auf + SPRUNG.ab) y[i] += SPRUNG.hoehe * (1 - smooth((s - SPRUNG.s0 - SPRUNG.auf) / SPRUNG.ab));
  }
  // 4) Tangenten, Kruemmung
  const tx = new Float32Array(n), tz = new Float32Array(n), kr = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const a = (i - 1 + n) % n, b = (i + 1) % n;
    const dx = x[b] - x[a], dz = z[b] - z[a], l = Math.hypot(dx, dz);
    tx[i] = dx / l; tz[i] = dz / l;
  }
  for (let i = 0; i < n; i++) {
    const a = (i - 1 + n) % n, b = (i + 1) % n;
    const c = tx[a] * tz[b] - tz[a] * tx[b]; // sin des Winkels
    kr[i] = Math.asin(Math.max(-1, Math.min(1, c))) / (2 * ds); // >0: Linkskurve in (x,z)
  }

  const S = { n, ds, laenge: n * ds, x, z, y, w, tx, tz, kr, sprung: SPRUNG };

  // Boost-Felder, Checkpoints (als Anteil der Runde)
  S.boosts = [
    { s: 105, lat: 0 },
    { s: n * ds * 0.52, lat: 0 },
    { s: n * ds * 0.83, lat: 0 },
  ];
  S.checkpoints = [0.25, 0.5, 0.75];

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
  S.nahe = (px, pz, hint, out = {}) => {
    let lo = 0, hi = n - 1;
    const fenster = hint == null ? null : 14;
    let bestD = Infinity, bi = 0, bt = 0;
    const test = (i) => {
      const j2 = (i + 1) % n;
      const ex = x[j2] - x[i], ez = z[j2] - z[i];
      let t = ((px - x[i]) * ex + (pz - z[i]) * ez) / (ex * ex + ez * ez);
      t = t < 0 ? 0 : t > 1 ? 1 : t;
      const dx = px - (x[i] + ex * t), dz = pz - (z[i] + ez * t);
      const d = dx * dx + dz * dz;
      if (d < bestD) { bestD = d; bi = i; bt = t; }
    };
    if (fenster == null) for (let i = 0; i < n; i++) test(i);
    else for (let k = -fenster; k <= fenster; k++) test((hint + k + n * 4) % n);
    const j2 = (bi + 1) % n;
    out.i = bi; out.t = bt;
    out.s = (bi + bt) * ds;
    out.y = y[bi] + (y[j2] - y[bi]) * bt;
    out.w = w[bi] + (w[j2] - w[bi]) * bt;
    let ttx = tx[bi] + (tx[j2] - tx[bi]) * bt, ttz = tz[bi] + (tz[j2] - tz[bi]) * bt;
    const tl = Math.hypot(ttx, ttz); ttx /= tl; ttz /= tl;
    out.tx = ttx; out.tz = ttz;
    // rechts-Vektor (im Spiel: r = (-fz, fx))
    out.rx = -ttz; out.rz = ttx;
    const cx = x[bi] + (x[j2] - x[bi]) * bt, cz = z[bi] + (z[j2] - z[bi]) * bt;
    out.lat = (px - cx) * out.rx + (pz - cz) * out.rz; // >0: rechts der Mittellinie
    out.cx = cx; out.cz = cz;
    return out;
  };
  return S;
}

// Startaufstellung: kurz hinter der Ziellinie
export function startPose(S) {
  const i = Math.round(5 / S.ds);
  return { x: S.x[i], z: S.z[i], y: S.y[i], theta: Math.atan2(S.tx[i], S.tz[i]), i };
}
