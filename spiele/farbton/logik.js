// Farbton! - Farbrechnung: HSB (wie die drei Regler) -> RGB -> CIELAB, Abstand -> Prozent
export function hsbZuRgb(h, s, b) {
  s /= 100; b /= 100;
  const k = (n) => (n + h / 60) % 6;
  const f = (n) => b * (1 - s * Math.max(0, Math.min(k(n), 4 - k(n), 1)));
  return [Math.round(f(5) * 255), Math.round(f(3) * 255), Math.round(f(1) * 255)];
}
export function hsbCss(h, s, b) { const [r, g, bl] = hsbZuRgb(h, s, b); return `rgb(${r},${g},${bl})`; }
export function hsbHex(h, s, b) {
  return "#" + hsbZuRgb(h, s, b).map((v) => v.toString(16).padStart(2, "0")).join("");
}

function rgbZuLab([r, g, b]) {
  const lin = (v) => { v /= 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const R = lin(r), G = lin(g), B = lin(b);
  let x = (0.4124564 * R + 0.3575761 * G + 0.1804375 * B) / 0.95047;
  let y = 0.2126729 * R + 0.7151522 * G + 0.072175 * B;
  let z = (0.0193339 * R + 0.119192 * G + 0.9503041 * B) / 1.08883;
  const f = (t) => (t > 216 / 24389 ? Math.cbrt(t) : (24389 / 27 * t + 16) / 116);
  x = f(x); y = f(y); z = f(z);
  return [116 * y - 16, 500 * (x - y), 200 * (y - z)];
}

// Wahrnehmungsabstand (Delta E, CIE76): ~2 kaum sichtbar, ~10 deutlich, ~30+ ganz andere Farbe
export function farbAbstand(a, b) {
  const la = rgbZuLab(hsbZuRgb(a[0], a[1], a[2])), lb = rgbZuLab(hsbZuRgb(b[0], b[1], b[2]));
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
}

// Genauigkeit in Prozent (eine Nachkommastelle)
export const DELTA_MAX = 70;
export function genauigkeit(ziel, tipp) {
  const d = farbAbstand(ziel, tipp);
  return Math.round(Math.pow(Math.max(0, 1 - d / DELTA_MAX), 2) * 1000) / 10;
}

// Zufallsfarben: nicht zu grau und nicht zu dunkel, damit sie sich merken lassen; Töne weit auseinander
export function waehleFarben(n) {
  const out = [];
  while (out.length < n) {
    let c;
    for (let versuch = 0; versuch < 40; versuch++) {
      c = [Math.floor(Math.random() * 360), 30 + Math.floor(Math.random() * 71), 40 + Math.floor(Math.random() * 61)];
      if (!out.slice(-8).some((o) => farbAbstand(o, c) < 25)) break;   // nur gegen die letzten Farben prüfen
    }
    out.push(c);
  }
  return out;
}
