// Arcade-Fahrphysik. Rein rechnerisch (laeuft im Browser und in Node).
// Koordinaten: x, z in der Ebene, y = Hoehe. Vorwaerts f = (sin t, cos t), rechts r = (-cos t, sin t).
import { KERB, WAND_ABSTAND } from "./strecke.js";

export const P = {
  VMAX: 68,            // m/s  (~245 km/h)
  BESCHL: 17,          // m/s^2 aus dem Stand
  BREMSE: 42,
  RUECKWAERTS: 9,
  BOOST_ZEIT: 1.7,
  BOOST_PLUS: 17,
  BOOST_BESCHL: 26,
  GRIP: 44,            // maximale Querbeschleunigung der Reifen auf Asphalt (m/s^2)
  GRIP_K: 11,          // wie schnell Querschlupf abgebaut wird
  QUER_MAX: 36,        // so viel Querbeschleunigung kann gelenkt werden
  GIER_MAX: 2.6,
  G: 23,
};

const klemme = (v, a, b) => (v < a ? a : v > b ? b : v);

export function neuesAuto(pose) {
  return {
    x: pose.x, z: pose.z, y: pose.y, vy: 0, theta: pose.theta,
    vx: 0, vz: 0, lenk: 0, boost: 0, luft: false, luftZeit: 0,
    i: pose.i, s: 0, lat: 0, fl: 0,   // fl = Flaeche: 0 Asphalt, 1 Kerb, 2 Gras
    vF: 0, vR: 0, schlupf: 0, wandZeit: 0, rueck: false, bremsend: false, driftend: false,
    nickV: 0, gier: 0, loop: null, sVor: 0, loopT: null, loopN: null,
  };
}

const tmp = {};

// eingabe: { lenk -1..1 (+ = rechts), bremse: bool, gas: bool (Standard: true) }
// Gibt eine Liste von Ereignissen zurueck.
export function schritt(a, e, dt, S) {
  const ev = [];
  // --- Lenkeingabe glaetten (Touch-Tasten sind digital)
  const ziel = klemme(e.lenk || 0, -1, 1);
  const wechsel = Math.sign(ziel) !== Math.sign(a.lenk) && a.lenk !== 0;
  const rate = wechsel ? 12 : Math.abs(ziel) > Math.abs(a.lenk) ? 5.2 : 9;
  a.lenk += klemme(ziel - a.lenk, -rate * dt, rate * dt);

  if (a.loop) return loopSchritt(a, e, dt, S);
  const ft = Math.sin(a.theta), fz = Math.cos(a.theta);
  const rx = -fz, rz = ft;
  let vF = a.vx * ft + a.vz * fz;
  let vR = a.vx * rx + a.vz * rz;

  // --- Untergrund
  S.nahe(a.x, a.z, a.i, tmp);
  a.i = tmp.i; a.s = tmp.s; a.lat = tmp.lat;
  const halb = tmp.w / 2;
  const abst = Math.abs(tmp.lat);
  a.fl = abst <= halb ? 0 : abst <= halb + KERB ? 1 : 2;
  const gripFak = (a.fl === 2 ? 0.42 : a.fl === 1 ? 0.9 : 1) * S.grip;
  const vmaxFl = a.fl === 2 ? 0.62 : 1;
  const gy = tmp.y;

  if (!a.luft) {
    // --- Laengsbeschleunigung
    const vmax = P.VMAX * vmaxFl * S.vmaxFak + (a.boost > 0 ? P.BOOST_PLUS : 0);
    let acc = 0;
    const gas = e.gas !== false;
    a.bremsend = false; a.rueck = false;
    if (e.bremse) {
      if (vF > 1.5) { acc = -P.BREMSE * (0.55 + 0.45 * S.grip) * S.bremse * (Math.abs(a.lenk) > 0.3 && vF > 22 ? 0.35 : 1); a.bremsend = true; }
      else if (vF > -P.RUECKWAERTS) { acc = -P.BESCHL * 0.8; a.rueck = true; }
    } else if (gas) {
      const q = klemme(vF / vmax, 0, 1.3);
      acc = P.BESCHL * S.traktion * (1 - q * q) + (a.boost > 0 ? P.BOOST_BESCHL * (1 - klemme(vF / vmax, 0, 1)) : 0);
      if (vF < 0) acc = P.BREMSE;           // aus dem Rueckwaertsgang schnell wieder nach vorn
    } else { const c = 2.2 * dt; if (Math.abs(vF) <= c) vF = 0; else vF -= Math.sign(vF) * c; }
    acc -= 0.0012 * vF * Math.abs(vF);       // Luftwiderstand
    vF += acc * dt;

    // --- Lenken
    const absV = Math.abs(vF);
    const drift = e.bremse && absV > 22 && Math.abs(a.lenk) > 0.25;
    a.driftend = drift;
    let gier = a.lenk * Math.min(P.GIER_MAX, (P.QUER_MAX * gripFak) / Math.max(absV, 7));
    if (drift) gier *= 1.55;
    if (absV < 4) gier *= absV / 4;          // im Stand nicht drehen
    if (vF < 0) gier = -gier;
    a.gier = gier;

    // --- Seitenhaftung
    const grip = (drift ? P.GRIP * 0.32 : P.GRIP) * gripFak;
    const abbau = klemme(vR * P.GRIP_K * S.gripK * (drift ? 0.45 : 1), -grip, grip) * dt;
    vR -= Math.abs(abbau) > Math.abs(vR) ? vR : abbau;
    // Reibungsverlust beim Rutschen
    vF -= Math.sign(vF) * Math.min(Math.abs(vF), Math.abs(abbau) * 0.12);
    if (a.fl === 2) vF -= Math.sign(vF) * 6 * dt;

    a.vx = ft * vF + rx * vR; a.vz = fz * vF + rz * vR;
    a.theta -= gier * dt;     // + = rechts => Kurswinkel sinkt
    a.schlupf = vR;
  } else {
    // --- in der Luft: kaum Einfluss
    a.vx *= 1 - 0.01 * dt; a.vz *= 1 - 0.01 * dt;
    a.theta -= a.lenk * 0.5 * dt;
    a.bremsend = false; a.driftend = false; a.gier = 0;
  }
  a.vF = vF; a.vR = vR;

  // --- Position
  a.x += a.vx * dt; a.z += a.vz * dt;

  // --- Wand
  S.nahe(a.x, a.z, a.i, tmp);
  // Karosserie hat Ausmasse: je nach Winkel zur Strecke ragt sie seitlich bzw. in Fahrtrichtung weiter
  const cF = Math.sin(a.theta) * tmp.tx + Math.cos(a.theta) * tmp.tz;      // cos(Winkel zur Strecke)
  const sF = Math.sin(a.theta) * tmp.rx + Math.cos(a.theta) * tmp.rz;      // sin(Winkel zur Strecke)
  const halbQuer = 0.98 * Math.abs(cF) + 2.3 * Math.abs(sF) + 0.05;
  const halbLang = 2.3 * Math.abs(cF) + 0.98 * Math.abs(sF) + 0.05;
  const grenze = tmp.w / 2 + WAND_ABSTAND - halbQuer;
  if (Math.abs(tmp.lat) > grenze) {
    const sg = Math.sign(tmp.lat);
    const ueber = Math.abs(tmp.lat) - grenze;
    a.x -= tmp.rx * sg * ueber; a.z -= tmp.rz * sg * ueber;
    const vn = (a.vx * tmp.rx + a.vz * tmp.rz) * sg;       // nach aussen
    if (vn > 0) {
      a.vx -= 1.25 * vn * tmp.rx * sg; a.vz -= 1.25 * vn * tmp.rz * sg;
      const sp = Math.hypot(a.vx, a.vz);
      const f = Math.max(0.0, 1 - 0.012 * vn);
      a.vx *= f; a.vz *= f;
      // Auto zum Streckenverlauf ausrichten (sonst bleibt es quer stehen)
      const soll = Math.atan2(tmp.tx, tmp.tz) + (Math.cos(a.theta - Math.atan2(tmp.tx, tmp.tz)) < 0 ? Math.PI : 0);
      let d = soll - a.theta; d = Math.atan2(Math.sin(d), Math.cos(d));
      a.theta += d * Math.min(1, 0.35 + vn * 0.01);
      if (vn > 3) ev.push({ t: "wand", staerke: vn, seite: sg, x: a.x + tmp.rx * sg * 1.0, z: a.z + tmp.rz * sg * 1.0, y: a.y });
      void sp;
    }
  }

  // --- Endmauern (Start hinten, Ende hinter dem Auslauf): Auto-Nase bzw. -Heck stoesst an
  S.nahe(a.x, a.z, a.i, tmp);
  {
    const sEff = tmp.s + tmp.over;
    const penEnde = sEff - (S.laenge - halbLang), penStart = halbLang - sEff;
    if (penEnde > 0 || penStart > 0) {
      const vorw = penEnde > 0, pen = vorw ? penEnde : penStart;
      const vt = a.vx * tmp.tx + a.vz * tmp.tz;       // Tempo entlang der Strecke
      const sg = vorw ? -1 : 1;
      a.x += tmp.tx * sg * pen; a.z += tmp.tz * sg * pen;
      if ((vorw && vt > 0) || (!vorw && vt < 0)) {
        a.vx -= 1.3 * vt * tmp.tx; a.vz -= 1.3 * vt * tmp.tz;
        a.vx *= 0.6; a.vz *= 0.6;
        if (Math.abs(vt) > 3) ev.push({ t: "wand", staerke: Math.abs(vt), seite: 0, x: a.x, z: a.z, y: a.y });
      }
    }
  }

  // --- Looping: Einstieg nur mit genug Tempo, sonst prallt das Auto am Anstieg ab
  if (S.loops.length && !a.luft) {
    for (const L of S.loops) {
      if (a.sVor < L.s0 && tmp.s >= L.s0 - 2.4 && tmp.s < L.s0 + 6) {
        const sp = Math.hypot(a.vx, a.vz), vt = a.vx * tmp.tx + a.vz * tmp.tz;
        if (sp >= Math.sqrt(5 * P.G * L.R) * 1.03 && vt > 0) {
          a.loop = { L, sig: 0, k: 0, v0: sp, y0: S.y[L.i0], h: 0, lat: klemme(tmp.lat, -(tmp.w / 2 - 1.4), tmp.w / 2 - 1.4) };
          ev.push({ t: "looping" });
        } else if (vt > 0) {
          const zuweit = tmp.s - (L.s0 - 2.4);
          if (zuweit > 0) { a.x -= tmp.tx * zuweit; a.z -= tmp.tz * zuweit; }
          a.vx -= 1.3 * vt * tmp.tx; a.vz -= 1.3 * vt * tmp.tz; a.vx *= 0.5; a.vz *= 0.5;
          ev.push({ t: "loopzulangsam", staerke: vt, vmin: Math.sqrt(5 * P.G * L.R) * 1.03 });
        }
      }
    }
    if (a.loop) { a.sVor = tmp.s; return ev; }
  }
  a.sVor = tmp.s;

  // --- Boost-Felder
  if (!a.luft) {
    for (const b of S.boosts) {
      const d = a.s - b.s;
      if (Math.abs(d) < 3.2 && Math.abs(a.lat - b.lat) < 3.6) {
        if (a.boost < P.BOOST_ZEIT * 0.6) ev.push({ t: "boost" });
        a.boost = P.BOOST_ZEIT;
      }
    }
  }
  if (a.boost > 0) a.boost = Math.max(0, a.boost - dt);

  // --- Hoehe / Sprung
  S.nahe(a.x, a.z, a.i, tmp);
  const gy2 = tmp.y;
  if (a.luft) {
    a.vy -= P.G * dt;
    a.y += a.vy * dt;
    a.luftZeit += dt;
    if (a.y <= gy2) {
      ev.push({ t: "landung", staerke: -a.vy, zeit: a.luftZeit });
      a.y = gy2; a.luft = false; a.luftZeit = 0;
      a.vy = 0;
    }
  } else {
    const vyBoden = (gy2 - a.y) / dt;
    const frei = a.y + a.vy * dt - 0.5 * P.G * dt * dt;
    if (frei > gy2 + 0.045 && Math.hypot(a.vx, a.vz) > 8) {
      a.luft = true; a.luftZeit = 0;
      a.y = frei; a.vy -= P.G * dt;
      ev.push({ t: "absprung" });
    } else {
      a.y = gy2; a.vy = klemme(vyBoden, -40, 40);
    }
  }
  void gy;
  return ev;
}

// Looping: das Auto folgt der Schleife entlang des Bogens, Tempo ergibt sich aus der Hoehe (Energie)
function loopSchritt(a, e, dt, S) {
  const ev = [];
  const Lp = a.loop, L = Lp.L;
  const halb = S.w[L.i0] / 2 - 1.4;
  Lp.lat = klemme(Lp.lat + (a.lenk || 0) * 6 * dt, -halb, halb);
  Lp.v0 *= 1 - 0.015 * dt;
  const v = Math.sqrt(Math.max(9, Lp.v0 * Lp.v0 - 2 * P.G * Lp.h));
  Lp.sig += v * dt;
  const cum = L.cum;
  if (Lp.sig >= L.arc - 1e-3) {
    const i = L.i1;
    a.loop = null; a.loopT = null; a.loopN = null;
    a.theta = Math.atan2(L.fx, L.fz);
    a.x = S.x[i] + S.RXA[i] * Lp.lat; a.z = S.z[i] + S.RZA[i] * Lp.lat; a.y = S.y[i]; a.vy = 0;
    a.vx = L.fx * v; a.vz = L.fz * v; a.vF = v; a.vR = 0; a.luft = false; a.i = i; a.s = L.s1; a.sVor = L.s1; a.lat = Lp.lat;
    a.nickV = 0; a.lenk = 0;
    ev.push({ t: "loopfertig" });
    return ev;
  }
  let k = Lp.k;
  while (k < cum.length - 2 && cum[k + 1] < Lp.sig) k++;
  Lp.k = k;
  const i = L.i0 + k, j = i + 1;
  const u = (Lp.sig - cum[k]) / Math.max(1e-6, cum[k + 1] - cum[k]);
  const px = S.x[i] + (S.x[j] - S.x[i]) * u, py = S.y[i] + (S.y[j] - S.y[i]) * u, pz = S.z[i] + (S.z[j] - S.z[i]) * u;
  let Tx = S.x[j] - S.x[i], Ty = S.y[j] - S.y[i], Tz = S.z[j] - S.z[i];
  const tl = Math.hypot(Tx, Ty, Tz) || 1; Tx /= tl; Ty /= tl; Tz /= tl;
  let Nx = S.NX[i] + (S.NX[j] - S.NX[i]) * u, Ny = S.NY[i] + (S.NY[j] - S.NY[i]) * u, Nz = S.NZ[i] + (S.NZ[j] - S.NZ[i]) * u;
  const nl = Math.hypot(Nx, Ny, Nz) || 1; Nx /= nl; Ny /= nl; Nz /= nl;
  const Rx = S.RXA[i], Rz = S.RZA[i];
  a.x = px + Rx * Lp.lat; a.y = py; a.z = pz + Rz * Lp.lat;
  Lp.h = py - Lp.y0;
  a.vx = Tx * v; a.vz = Tz * v; a.vy = Ty * v; a.vF = v; a.vR = 0;
  a.theta = Math.atan2(L.fx, L.fz);
  a.i = i; a.s = (i + u) * S.ds; a.sVor = a.s; a.lat = Lp.lat; a.luft = false; a.fl = 0;
  a.bremsend = false; a.driftend = false; a.gier = 0;
  a.loopT = [Tx, Ty, Tz]; a.loopN = [Nx, Ny, Nz];
  if (a.boost > 0) a.boost = Math.max(0, a.boost - dt);
  return ev;
}
