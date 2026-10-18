// Einfacher Fahrer (Pure Pursuit + Tempoplanung). Dient als Test, als Referenzzeit fuer Medaillen
// und als Demo (?bot=1).
export function botEingabe(a, S, opt = {}) {
  const v = Math.max(a.vF, 5);
  const n = S.n, ds = S.ds;
  const vorschau = 9 + v * 0.34;
  const i0 = a.i;
  const k = Math.round(vorschau / ds);
  const ti = Math.min(n - 1, i0 + k);
  // Ziel: Mittellinie, leicht zur Kurvenaussenseite versetzt waere besser; hier einfach Mitte
  const tx = S.x[ti], tz = S.z[ti];
  const ft = Math.sin(a.theta), fz = Math.cos(a.theta);
  const rx = -fz, rz = ft;
  const dx = tx - a.x, dz = tz - a.z;
  const vorne = dx * ft + dz * fz, rechts = dx * rx + dz * rz;
  const winkel = Math.atan2(rechts, vorne);          // + = Ziel rechts
  let lenk = Math.max(-1, Math.min(1, winkel * 2.4 * (opt.lenkFaktor || 1)));

  // Tempo: maximale Kruemmung in den naechsten ~ (v^2/(2*b)) Metern
  const gr = S.grip || 1;
  const aQuer = (opt.aQuer || 30) * gr;
  const bremsWeg = (v * v) / (2 * 34 * (0.55 + 0.45 * gr)) + 12;
  const m = Math.round(bremsWeg / ds);
  let vZiel = 999;
  for (let q = 0; q <= m; q += 2) {
    const kr = Math.abs(S.kr[Math.min(n - 1, i0 + q)]);
    if (kr < 1e-4) continue;
    const vk = Math.sqrt(aQuer / kr);
    // so weit vorne duerfte man schon langsamer sein: v_ziel^2 + 2*b*dist >= v_kurve^2 -> hier vereinfacht
    const dist = q * ds;
    const erlaubt = Math.sqrt(vk * vk + 2 * 30 * (0.55 + 0.45 * gr) * dist);
    if (erlaubt < vZiel) vZiel = erlaubt;
  }
  const bremse = a.vF > vZiel + 1.5;
  return { lenk, bremse, gas: !bremse };
}
