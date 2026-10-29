// Feld-Erzeugung für Revierkampf: Raster aus kleinen Quadraten, aufgeteilt in
// zusammenhängende Gebiete (eines pro Spieler). Alle Gebiete sind fast gleich
// groß, aber nie exakt - jede Größe kommt nur einmal vor.
function zufall(n) { return Math.floor(Math.random() * n); }
function mische(liste) {
  const a = [...liste];
  for (let i = a.length - 1; i > 0; i--) {
    const j = zufall(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export function feldMasse(n) {
  const w = n <= 2 ? 8 : 12;
  const h = Math.max(6, Math.min(20, Math.ceil((n * 22) / w)));
  return [w, h];
}

// n verschiedene Größen, Summe = w*h, Abstand 1 (bei 2 Gebieten 2).
export function gebietsGroessen(n, gesamt) {
  const abstand = n === 2 ? 2 : 1;
  const mitte = Math.floor((n - 1) / 2);
  const off = [...Array(n).keys()].map((i) => (i - mitte) * abstand);
  const summeOff = off.reduce((a, b) => a + b, 0);
  const basis = Math.floor((gesamt - summeOff) / n);
  let rest = gesamt - summeOff - n * basis;
  const groessen = off.map((o) => basis + o);
  for (let i = n - 1; i >= 0 && rest > 0; i--, rest--) groessen[i] += 1;
  return groessen;
}

function nachbarn(i, w, h) {
  const x = i % w, y = Math.floor(i / w), r = [];
  if (x > 0) r.push(i - 1);
  if (x < w - 1) r.push(i + 1);
  if (y > 0) r.push(i - w);
  if (y < h - 1) r.push(i + w);
  return r;
}

function startpunkte(n, w, h) {
  const T = w * h;
  const starts = [zufall(T)];
  while (starts.length < n) {
    const kand = [];
    for (let i = 0; i < T; i++) {
      if (starts.includes(i)) continue;
      const d = Math.min(...starts.map((s) => Math.hypot((s % w) - (i % w), Math.floor(s / w) - Math.floor(i / w))));
      kand.push([d + Math.random() * 1.5, i]);
    }
    kand.sort((a, b) => b[0] - a[0]);
    starts.push(kand[0][1]);
  }
  return starts;
}

// Schritt 1: alle Gebiete wachsen gleichmäßig, bis das Raster voll ist.
function wachseFrei(n, w, h) {
  const T = w * h;
  const reg = new Array(T).fill(-1);
  const zellen = Array.from({ length: n }, () => []);
  startpunkte(n, w, h).forEach((s, g) => { reg[s] = g; zellen[g].push(s); });
  let frei = T - n;
  while (frei > 0) {
    const reihenfolge = [...Array(n).keys()].sort((a, b) => zellen[a].length - zellen[b].length + (Math.random() - 0.5));
    let bewegt = false;
    for (const g of reihenfolge) {
      let beste = -1, bestScore = -1;
      const gesehen = new Set();
      for (const z of zellen[g]) {
        for (const nb of nachbarn(z, w, h)) {
          if (reg[nb] !== -1 || gesehen.has(nb)) continue;
          gesehen.add(nb);
          const eigene = nachbarn(nb, w, h).filter((q) => reg[q] === g).length;
          const score = eigene + Math.random() * 1.3;
          if (score > bestScore) { bestScore = score; beste = nb; }
        }
      }
      if (beste === -1) continue;
      reg[beste] = g; zellen[g].push(beste); frei--; bewegt = true;
      break;
    }
    if (!bewegt) return null;
  }
  return reg;
}

function bleibtZusammenhaengend(reg, g, ohne, w, h) {
  const zellen = [];
  for (let i = 0; i < reg.length; i++) if (reg[i] === g && i !== ohne) zellen.push(i);
  if (zellen.length === 0) return false;
  const gesehen = new Set([zellen[0]]);
  const stapel = [zellen[0]];
  while (stapel.length) {
    const z = stapel.pop();
    for (const nb of nachbarn(z, w, h)) {
      if (nb !== ohne && reg[nb] === g && !gesehen.has(nb)) { gesehen.add(nb); stapel.push(nb); }
    }
  }
  return gesehen.size === zellen.length;
}

// Eine Zelle von Gebiet a an Nachbargebiet b abgeben (a bleibt zusammenhängend).
function gibZelleAb(reg, a, b, w, h) {
  const kand = [];
  for (let i = 0; i < reg.length; i++) {
    if (reg[i] === a && nachbarn(i, w, h).some((q) => reg[q] === b)) kand.push(i);
  }
  for (const z of mische(kand)) {
    if (bleibtZusammenhaengend(reg, a, z, w, h)) { reg[z] = b; return true; }
  }
  return false;
}

// Schritt 2: Größen auf die Zielgrößen schieben (Zellen wandern entlang von Nachbargebieten).
function wachse(n, w, h, ziele) {
  const reg = wachseFrei(n, w, h);
  if (!reg) return null;
  const groesse = () => { const c = new Array(n).fill(0); reg.forEach((g) => { c[g]++; }); return c; };
  // größtes Gebiet bekommt das größte Ziel usw.
  const c0 = groesse();
  const rangG = [...Array(n).keys()].sort((a, b) => c0[b] - c0[a]);
  const rangZ = [...ziele].sort((a, b) => b - a);
  const ziel = new Array(n);
  rangG.forEach((g, i) => { ziel[g] = rangZ[i]; });
  for (let runde = 0; runde < 600; runde++) {
    const c = groesse();
    const diff = c.map((x, g) => x - ziel[g]);
    if (diff.every((d) => d === 0)) return reg;
    const quelle = diff.indexOf(Math.max(...diff));
    // Breitensuche über Nachbargebiete zu einem Gebiet mit Mangel
    const vorg = new Array(n).fill(-2);
    vorg[quelle] = -1;
    const schlange = [quelle];
    let senke = -1;
    while (schlange.length && senke === -1) {
      const g = schlange.shift();
      const nachb = new Set();
      for (let i = 0; i < reg.length; i++) {
        if (reg[i] !== g) continue;
        for (const q of nachbarn(i, w, h)) if (reg[q] !== g) nachb.add(reg[q]);
      }
      for (const m of mische([...nachb])) {
        if (vorg[m] !== -2) continue;
        vorg[m] = g;
        if (diff[m] < 0) { senke = m; break; }
        schlange.push(m);
      }
    }
    if (senke === -1) return null;
    const pfad = [];
    for (let g = senke; g !== -1; g = vorg[g]) pfad.unshift(g);
    for (let i = pfad.length - 2; i >= 0; i--) {
      if (!gibZelleAb(reg, pfad[i], pfad[i + 1], w, h)) return null;
    }
  }
  return null;
}

// Notlösung: Schlangenlinie in Stücke zerlegen (immer zusammenhängend)
function schlange(n, w, h, ziele) {
  const reg = new Array(w * h).fill(-1);
  let g = 0, links = ziele[0];
  for (let y = 0; y < h; y++) {
    for (let k = 0; k < w; k++) {
      const x = y % 2 === 0 ? k : w - 1 - k;
      while (links === 0) { g++; links = ziele[g]; }
      reg[y * w + x] = g; links--;
    }
  }
  return reg;
}

// Ergebnis: { w, h, reg: [Gebiet je Zelle], ord: [[Zellen in Abbau-Reihenfolge] je Gebiet] }
export function erzeugeFeld(n) {
  const [w, h] = feldMasse(n);
  const ziele = mische(gebietsGroessen(n, w * h));
  let reg = null;
  for (let v = 0; v < 60 && !reg; v++) reg = wachse(n, w, h, ziele);
  if (!reg) reg = schlange(n, w, h, ziele);
  const ord = Array.from({ length: n }, () => []);
  reg.forEach((g, i) => ord[g].push(i));
  return { w, h, reg, ord: ord.map(mische) };
}
