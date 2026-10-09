// ============================================================================
//  Größenvergleich - Objekte
// ----------------------------------------------------------------------------
//  Jedes Objekt hat:
//    id, artikel + name   (für Fragen wie "Wie hoch ist der Elefant?")
//    kat                  Kategorie (nur zur Variation bei der Paarbildung)
//    art  "hoch" | "lang" | "breit"   - welche Ausdehnung der Silhouette gemeint ist
//    m                    echte Größe dieser Ausdehnung in Metern
//    vb   [Breite, Höhe]  Koordinatensystem der Silhouette (y nach unten)
//    pfade                Liste von SVG-Pfaden (jeder wird mit fill-rule evenodd gezeichnet)
//
//  Tiere kommen aus silhouetten.js (PhyloPic, gemeinfrei), alles andere ist für
//  dieses Spiel selbst als einfacher Umriss gezeichnet.
// ============================================================================
import { TIER_DATEN } from "./silhouetten.js";

// ---- kleine Zeichenhelfer --------------------------------------------------
const f = (n) => Math.round(n * 100) / 100;
const poly = (pts) => "M" + pts.map((p) => `${f(p[0])} ${f(p[1])}`).join("L") + "Z";
const rechteck = (x, y, b, h) => poly([[x, y], [x + b, y], [x + b, y + h], [x, y + h]]);
const kreis = (cx, cy, r) =>
  `M${f(cx - r)} ${f(cy)}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0Z`;
// Achsensymmetrische Form: halb = [[halbeBreite, y], ...] von oben nach unten
const spiegeln = (cx, halb) => poly([
  ...halb.map(([dx, y]) => [cx + dx, y]),
  ...[...halb].reverse().map(([dx, y]) => [cx - dx, y])
]);

// Punktliste eines Tier-Umrisses glatt als Pfad (Quadratkurven über Mittelpunkte)
function glattePfad(teile) {
  return teile.map((t) => {
    const p = t.trim().split(/\s+/).map((s) => s.split(",").map(Number));
    const n = p.length;
    const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
    let d = "M" + mid(p[n - 1], p[0]).map(f).join(" ");
    for (let i = 0; i < n; i++) {
      const m = mid(p[i], p[(i + 1) % n]);
      d += `Q${f(p[i][0])} ${f(p[i][1])} ${f(m[0])} ${f(m[1])}`;
    }
    return d + "Z";
  }).join("");
}

function tier(id, artikel, name, art, m, extra = {}) {
  const d = TIER_DATEN[id];
  return { id, artikel, name, kat: "Tier", art, m, vb: d.vb, pfade: [glattePfad(d.teile)], ...extra };
}

// ---- gezeichnete Objekte ---------------------------------------------------
const MENSCH = [
  kreis(20, 9, 8) + poly([[13, 20], [27, 20]]).replace("Z", "") +
  "Q33 20 33 27V52Q33 55 30 55Q27 55 27 52V33H26V97Q26 100 23 100H20.5V68H19.5V100H17Q14 100 14 97V33H13V52Q13 55 10 55Q7 55 7 52V27Q7 20 13 20Z"
];

const AUTO = [
  "M10 112Q10 92 40 86L112 72Q150 22 215 22H300Q352 22 386 72L430 84Q446 90 446 112V122H10Z" +
    "M128 72L166 34H210V72Z" + "M226 34H296Q330 38 350 72H226Z",
  kreis(100, 125, 30), kreis(350, 125, 30)
];

let busFenster = "";
for (let i = 0; i < 8; i++) busFenster += rechteck(60 + i * 128, 55, 100, 80);
const BUS = [
  "M20 45Q20 20 50 20H1150Q1180 20 1180 50V292H20Z" + busFenster + rechteck(1075, 55, 70, 190),
  kreis(260, 302, 46), kreis(930, 302, 46)
];

const BOEING = [
  "M0 172Q4 140 50 130L100 122Q130 66 200 64H300Q360 66 420 88H760L905 92L990 148L975 162L720 198L130 200Q20 205 0 172Z",
  poly([[760, 88], [885, 0], [942, 0], [930, 92]]),
  poly([[430, 150], [650, 150], [545, 222], [515, 222]]),
  "M455 205h80q12 0 12 14q0 14-12 14h-80q-12 0-12-14q0-14 12-14Z",
  "M590 205h80q12 0 12 14q0 14-12 14h-80q-12 0-12-14q0-14 12-14Z",
  kreis(240, 262, 13) + kreis(560, 262, 13).replace(/^M/, "M"),
  rechteck(235, 198, 10, 52), rechteck(555, 198, 10, 52)
];

const FUSSBALLTOR = [
  "M0 244V0H732V244H714V18H18V244Z",
  // Netz-Andeutung
  (() => { let d = ""; for (let x = 54; x < 714; x += 36) d += rechteck(x, 18, 4, 226); return d; })()
];

// Eiffelturm
const EIFFEL = (() => {
  const aussen = [[0.5, 0], [1.5, 30], [3, 54], [5.5, 54], [5.5, 58], [7.5, 100], [11.5, 170], [17.5, 213], [24.5, 213], [24.5, 218],
    [27.5, 250], [30.5, 272], [37.5, 272], [37.5, 278], [49.5, 300], [62.5, 330]];
  const bogen = [];
  for (let i = 0; i <= 14; i++) {
    const t = (i / 14) * Math.PI / 2;
    bogen.push([42 * Math.cos(t), 330 - 50 * Math.sin(t)]);
  }
  const cx = 62.5;
  const pts = [
    ...aussen.map(([dx, y]) => [cx + dx, y]),
    ...bogen.map(([dx, y]) => [cx + dx, y]),
    ...[...bogen].reverse().map(([dx, y]) => [cx - dx, y]),
    ...[...aussen].reverse().map(([dx, y]) => [cx - dx, y])
  ];
  return [poly(pts)];
})();

// Burj Khalifa (abgestufter Turm mit Spitze)
const BURJ = [spiegeln(50, [[0.8, 0], [0.8, 160], [5, 160], [5, 250], [8, 250], [8, 330], [11, 330], [11, 410], [14, 410],
  [14, 490], [17, 490], [17, 570], [20, 570], [20, 650], [24, 650], [24, 730], [27, 730], [27, 790], [30, 790], [30, 828]])];

// Elizabeth Tower (Big Ben)
const BIGBEN = [
  spiegeln(8, [[0, 0], [1.2, 14], [3.6, 27], [5, 28], [5, 40], [5.6, 40], [5.6, 53], [5, 53], [5, 96]]) +
    kreis(8, 46.5, 3.4)
];

// Freiheitsstatue (samt Sockel)
const FREIHEIT = (() => {
  const strahlen = [];
  for (let i = 0; i < 7; i++) {
    const a = Math.PI * (1.12 + i * 0.126);
    const c = [28 + 4.6 * Math.cos(a), 11 + 4.6 * Math.sin(a)];
    const sp = [28 + 9.6 * Math.cos(a), 11 + 9.6 * Math.sin(a)];
    const b = 0.1;
    strahlen.push(poly([[28 + 4 * Math.cos(a - b), 11 + 4 * Math.sin(a - b)], sp, [28 + 4 * Math.cos(a + b), 11 + 4 * Math.sin(a + b)]]));
    void c;
  }
  const koerper = poly([[4, 93], [4, 86], [9, 86], [9, 68], [7, 68], [7, 60], [11, 60], [11, 47], [13, 47], [13, 40], [14, 33],
    [13, 28], [9, 26], [8, 18], [15, 15], [18, 19], [19, 24], [23, 17], [33, 17], [35, 19], [36, 14], [36, 9], [34, 8], [35, 3],
    [39, 0], [43, 3], [42, 8], [40, 9], [40, 14], [40, 24], [41, 30], [43, 38], [45, 47], [49, 47], [49, 60], [53, 60], [53, 68],
    [51, 68], [51, 86], [56, 86], [56, 93]]);
  return [koerper, kreis(28, 11, 4.4), ...strahlen];
})();

const PYRAMIDE = [poly([[0, 138.5], [115, 0], [230, 138.5]])];

const TITANIC = [
  poly([[0, 24], [12, 28], [255, 28], [269, 22], [240, 53], [14, 53]]),
  rechteck(55, 16, 160, 12), rechteck(205, 11, 22, 5),
  rechteck(73, 4, 14, 12), rechteck(103, 4, 14, 12), rechteck(133, 4, 14, 12), rechteck(163, 4, 14, 12),
  rechteck(238, 6, 1.6, 22), rechteck(30, 9, 1.6, 19)
];

const SATURN = [spiegeln(7.5, [[0.4, 0], [0.4, 10], [1.9, 13], [1.9, 22], [3.3, 28], [3.3, 44], [5, 46], [5, 99], [7.2, 110.6]])];

const WINDRAD = (() => {
  const dreh = (pt, grad) => {
    const a = (grad * Math.PI) / 180, dx = pt[0] - 50, dy = pt[1] - 50;
    return [50 + dx * Math.cos(a) - dy * Math.sin(a), 50 + dx * Math.sin(a) + dy * Math.cos(a)];
  };
  const blatt = (g) => poly([[48.4, 50], [50, 0], [51.6, 50]].map((p) => dreh(p, g)));
  return [poly([[47.5, 150], [48.5, 52], [51.5, 52], [52.5, 150]]), rechteck(46, 47.5, 9, 5), kreis(50, 50, 3.2),
    blatt(0), blatt(120), blatt(240)];
})();

const MAINTOWER = [
  "M5 240V52Q5 42 14 42H26Q35 42 35 52V240Z",
  rechteck(19.2, 0, 1.6, 42), rechteck(16, 8, 8, 1.4), rechteck(17, 18, 6, 1.4)
];

// Kölner Dom (Westfassade mit zwei Türmen)
const DOM = (() => {
  const turm = [[0.3, 0], [2, 28], [5, 55], [8.5, 57], [8.5, 64], [9, 66], [9.5, 95], [11.5, 97], [12, 110], [14, 112], [15, 125], [20, 157]];
  return [spiegeln(21, turm), spiegeln(65, turm), rechteck(20, 104, 46, 53), spiegeln(43, [[0.3, 74], [1.2, 90], [1.4, 104], [0, 104]])];
})();

// Schiefer Turm von Pisa
const PISA = (() => {
  const mitte = (y) => 9 + (5 * (56 - y)) / 56;
  const stufe = (o, u, hb) => poly([[mitte(o) - hb, o], [mitte(o) + hb, o], [mitte(u) + hb, u], [mitte(u) - hb, u]]);
  const p = [stufe(49, 56, 7.3)];
  for (let i = 0; i < 6; i++) p.push(stufe(7 + i * 7, 7 + i * 7 + 6.4, 6.9));
  p.push(stufe(0, 6.4, 4.6));
  return p;
})();

// ---- Objektliste -----------------------------------------------------------
export const OBJEKTE = [
  tier("elefant", "der", "Elefant", "hoch", 3.3),
  tier("giraffe", "die", "Giraffe", "hoch", 5.5),
  tier("blauwal", "der", "Blauwal", "lang", 27),
  tier("weisserhai", "der", "Weiße Hai", "lang", 5),
  tier("trex", "der", "T-Rex", "lang", 12),
  tier("brachiosaurus", "der", "Brachiosaurus", "hoch", 12.5),
  tier("eisbaer", "der", "Eisbär", "lang", 2.5),
  tier("gorilla", "der", "Gorilla", "hoch", 1.7),
  { id: "mensch", artikel: "der", name: "Mensch", kat: "Alltag", art: "hoch", m: 1.75, vb: [40, 100], pfade: MENSCH },
  { id: "auto", artikel: "das", name: "Auto", kat: "Fahrzeug", art: "lang", m: 4.5, vb: [450, 155], pfade: AUTO },
  { id: "bus", artikel: "der", name: "Linienbus", kat: "Fahrzeug", art: "lang", m: 12, vb: [1200, 350], pfade: BUS },
  { id: "boeing", artikel: "die", name: "Boeing 747", kat: "Fahrzeug", art: "lang", m: 70.6, vb: [1000, 275], pfade: BOEING },
  { id: "tor", artikel: "das", name: "Fußballtor", kat: "Alltag", art: "breit", m: 7.32, vb: [732, 244], pfade: FUSSBALLTOR },
  { id: "eiffel", artikel: "der", name: "Eiffelturm", kat: "Bauwerk", art: "hoch", m: 330, vb: [125, 330], pfade: EIFFEL },
  { id: "burj", artikel: "der", name: "Burj Khalifa", kat: "Bauwerk", art: "hoch", m: 828, vb: [100, 828], pfade: BURJ },
  { id: "bigben", artikel: "der", name: "Elizabeth Tower (Big Ben)", kat: "Bauwerk", art: "hoch", m: 96, vb: [16, 96], pfade: BIGBEN },
  { id: "freiheit", artikel: "die", name: "Freiheitsstatue (mit Sockel)", kat: "Bauwerk", art: "hoch", m: 93, vb: [60, 93], pfade: FREIHEIT },
  { id: "pyramide", artikel: "die", name: "Cheops-Pyramide", kat: "Bauwerk", art: "hoch", m: 138.5, vb: [230, 138.5], pfade: PYRAMIDE },
  { id: "titanic", artikel: "die", name: "Titanic", kat: "Fahrzeug", art: "lang", m: 269, vb: [269, 53], pfade: TITANIC },
  { id: "saturn", artikel: "die", name: "Saturn-V-Rakete", kat: "Fahrzeug", art: "hoch", m: 110.6, vb: [15, 110.6], pfade: SATURN },
  { id: "windrad", artikel: "das", name: "Windrad", kat: "Bauwerk", art: "hoch", m: 150, vb: [100, 150], pfade: WINDRAD },
  { id: "maintower", artikel: "der", name: "Main Tower", kat: "Bauwerk", art: "hoch", m: 240, vb: [40, 240], pfade: MAINTOWER },
  { id: "dom", artikel: "der", name: "Kölner Dom", kat: "Bauwerk", art: "hoch", m: 157, vb: [86, 157], pfade: DOM },
  { id: "pisa", artikel: "der", name: "Schiefe Turm von Pisa", kat: "Bauwerk", art: "hoch", m: 56, vb: [22, 56], pfade: PISA }
];

export const OBJEKT_NACH_ID = Object.fromEntries(OBJEKTE.map((o) => [o.id, o]));

// ---- Länder (Fläche in km²) -------------------------------------------------
// Umrisse aus spiele/laenderumrisse/laender.json; die Umrisse sind dort einzeln
// auf eine Zeichenfläche normiert, ihre Größe wird hier über die echte Fläche
// wieder zueinander ins Verhältnis gesetzt.
const FLAECHE_KM2 = {
  deutschland: 357600, frankreich: 543940, spanien: 505990, italien: 301340, portugal: 92212,
  "vereinigtes-konigreich": 243610, irland: 70273, niederlande: 41850, belgien: 30528, schweiz: 41285,
  osterreich: 83871, polen: 312696, tschechien: 78867, griechenland: 131957, schweden: 450295,
  norwegen: 323802, finnland: 338424, danemark: 43094, ukraine: 603550, turkei: 783562, ungarn: 93028,
  island: 103000, estland: 45228, lettland: 64589, litauen: 65300, belarus: 207600, rumanien: 238397,
  bulgarien: 110879, serbien: 88361, kroatien: 56594, slowenien: 20273, slowakei: 49035, zypern: 9251,
  russland: 17098246, usa: 9833517, kanada: 9984670, mexiko: 1964375, kuba: 109884, brasilien: 8515767,
  argentinien: 2780400, chile: 756102, peru: 1285216, kolumbien: 1141748, venezuela: 916445,
  ecuador: 283561, bolivien: 1098581, paraguay: 406752, uruguay: 176215, agypten: 1002450,
  sudafrika: 1221037, marokko: 446550, madagaskar: 587041, nigeria: 923768, kenia: 580367,
  athiopien: 1104300, ghana: 238533, tunesien: 163610, algerien: 2381741, libyen: 1759540,
  sudan: 1861484, simbabwe: 390757, namibia: 825615, botswana: 581730, tansania: 945087, uganda: 241550,
  "demokratische-republik-kongo": 2344858, angola: 1246700, mosambik: 801590, senegal: 196722,
  kamerun: 475440, elfenbeinkuste: 322463, china: 9596961, japan: 377975, indien: 3287263,
  sudkorea: 100210, thailand: 513120, "saudi-arabien": 2149690, israel: 22072, iran: 1648195,
  irak: 438317, pakistan: 881913, bangladesch: 147570, vietnam: 331212, indonesien: 1904569,
  philippinen: 300000, malaysia: 330803, "sri-lanka": 65610, nepal: 147181, mongolei: 1564116,
  kasachstan: 2724900, myanmar: 676578, "vereinigte-arabische-emirate": 83600, australien: 7692024,
  neuseeland: 268021, "papua-neuguinea": 462840
};

// Länder, bei denen "das/die" im Namen steckt, brauchen keinen Artikel im Spieltext;
// hier wird der Name ohnehin immer ausgeschrieben.
export const LAENDER = [];
let laenderGeladen = false;

function landAusPfad(eintrag) {
  const zahlen = /(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g;
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const m of eintrag.pfad.matchAll(zahlen)) {
    const x = Number(m[1]), y = Number(m[2]);
    minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y);
  }
  const d = eintrag.pfad.replace(zahlen, (_, x, y) => `${f(Number(x) - minX)},${f(Number(y) - minY)}`);
  // Fläche der gezeichneten Form (Shoelace je Teilpfad, vorzeichenbehaftet)
  let flaeche = 0;
  for (const teil of d.split("M").filter(Boolean)) {
    const p = [...teil.matchAll(zahlen)].map((m) => [Number(m[1]), Number(m[2])]);
    let a = 0;
    for (let i = 0; i < p.length; i++) {
      const q = p[(i + 1) % p.length];
      a += p[i][0] * q[1] - q[0] * p[i][1];
    }
    flaeche += a / 2;
  }
  return { d, b: maxX - minX, h: maxY - minY, flaeche: Math.abs(flaeche) };
}

export async function ladeLaender() {
  if (laenderGeladen) return;
  laenderGeladen = true;
  try {
    const antwort = await fetch(new URL("../laenderumrisse/laender.json", import.meta.url));
    const daten = await antwort.json();
    for (const e of daten) {
      const km2 = FLAECHE_KM2[e.id];
      if (!km2) continue;
      const g = landAusPfad(e);
      if (!(g.flaeche > 0)) continue;
      const o = { id: "land-" + e.id, artikel: "", name: e.name, kat: "Land", art: "flaeche", m: km2,
        vb: [g.b, g.h], vbFlaeche: g.flaeche, pfade: ["M" + g.d.replace(/^M/, "")] };
      LAENDER.push(o);
      OBJEKT_NACH_ID[o.id] = o;
    }
  } catch (e) {
    laenderGeladen = false;
  }
}

// Echte Länge pro Zeicheneinheit (m bzw. bei Ländern km) für den Messwert x
function realProEinheit(o, x) {
  if (o.art === "flaeche") return Math.sqrt(x / o.vbFlaeche);
  return x / (o.art === "hoch" ? o.vb[1] : o.vb[0]);
}

export function formatMass(o, m) {
  if (o.art === "flaeche") return Math.round(m).toLocaleString("de-DE") + " km²";
  return formatMeter(m) + " m";
}

export function formatMeter(m) {
  let s;
  if (m >= 100) s = String(Math.round(m));
  else if (m >= 10) s = (Math.round(m * 10) / 10).toString();
  else s = (Math.round(m * 100) / 100).toString();
  return s.replace(".", ",");
}

// Silhouette als SVG-Gruppe (x = links, yUnten = Bodenlinie, s = Pixel pro echter Längeneinheit)
export function objektSvg(o, x, yUnten, s, attr, mass = o.m) {
  const sc = s * realProEinheit(o, mass);
  const hoehePx = o.vb[1] * sc;
  return `<g transform="translate(${f(x)} ${f(yUnten - hoehePx)}) scale(${sc})" ${attr}>` +
    o.pfade.map((d) => `<path d="${d}" fill-rule="evenodd"/>`).join("") + "</g>";
}

// Breite/Höhe in echten Längeneinheiten beim Messwert x
export function ausdehnung(o, mass = o.m) {
  const r = realProEinheit(o, mass);
  return { b: o.vb[0] * r, h: o.vb[1] * r };
}

export function skalierung(o, s, mass = o.m) { return s * realProEinheit(o, mass); }
