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
    nickV: 0, gier: 0,
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
  const gripFak = a.fl === 2 ? 0.42 : a.fl === 1 ? 0.9 : 1;
  const vmaxFl = a.fl === 2 ? 0.62 : 1;
  const gy = tmp.y;

  if (!a.luft) {
    // --- Laengsbeschleunigung
    const vmax = P.VMAX * vmaxFl + (a.boost > 0 ? P.BOOST_PLUS : 0);
    let acc = 0;
    const gas = e.gas !== false;
    a.bremsend = false; a.rueck = false;
    if (e.bremse) {
      if (vF > 1.5) { acc = -P.BREMSE * (Math.abs(a.lenk) > 0.3 && vF > 22 ? 0.35 : 1); a.bremsend = true; }
      else if (vF > -P.RUECKWAERTS) { acc = -P.BESCHL * 0.8; a.rueck = true; }
    } else if (gas) {
      const q = klemme(vF / vmax, 0, 1.3);
      acc = P.BESCHL * (1 - q * q) + (a.boost > 0 ? P.BOOST_BESCHL * (1 - klemme(vF / vmax, 0, 1)) : 0);
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
    const abbau = klemme(vR * P.GRIP_K * (drift ? 0.45 : 1), -grip, grip) * dt;
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
  const grenze = tmp.w / 2 + WAND_ABSTAND;
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

  // --- Boost-Felder
  if (!a.luft) {
    for (const b of S.boosts) {
      let d = a.s - b.s; if (d > S.laenge / 2) d -= S.laenge; if (d < -S.laenge / 2) d += S.laenge;
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
