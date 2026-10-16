// ============================================================================
//  Wo liegt's?
// ----------------------------------------------------------------------------
//  Pro Runde wird eine Stadt genannt. Alle setzen gleichzeitig eine Stecknadel
//  auf einen drehbaren, zoombaren Globus. Wer (Luftlinie) am nächsten dran ist,
//  bekommt die meisten Punkte; wer weniger als 100 km danebenliegt, bekommt
//  einen Volltreffer-Punkt extra. Alle Raumfelder beginnen mit "wl", die Tipps
//  liegen getrennt in der Subcollection "wlTipps".
//
//  Die Karte zeichnet d3-geo (siehe geo.js, ein gebündelter Auszug von d3-geo
//  und topojson-client) auf ein Canvas; die Weltdaten stammen aus Natural Earth
//  (welt.json, 1:50m).
// ============================================================================
import {
  doc, setDoc, updateDoc, deleteDoc, collection, getDocs, onSnapshot,
  serverTimestamp, increment, writeBatch
} from "../../kern/firebase.js";
import { spielerKarte, renderWarteAvatare, zeigeDebug, initBereitSystem, escapeHtml, avatarBild } from "../../kern/ui.js";
import { speichereWertung } from "../../kern/wertung.js";
import * as D3 from "./geo.js";
import { STAEDTE_WELT, STAEDTE_DE, SEHENSWUERDIGKEITEN } from "./staedte.js";

// Was gesucht wird (mehrere Kataloge gleichzeitig möglich): Städte weltweit
// (ohne Deutschland), deutsche Städte, Sehenswürdigkeiten
const MODI = {
  welt: { name: "Städte weltweit", daten: STAEDTE_WELT, einzahl: "Stadt" },
  de: { name: "Städte Deutschland", daten: STAEDTE_DE, einzahl: "Stadt" },
  sehens: { name: "Sehenswürdigkeiten", daten: SEHENSWUERDIGKEITEN, einzahl: "Sehenswürdigkeit" }
};

const STANDARD_ANZAHL = 8;
const MAX_ANZAHL = 25;
const RUNDENZEIT_MS = 60000;
const VOLLTREFFER_KM = 100;
const ERDRADIUS_KM = 6371;

// ---------------------------------------------------------------------------
//  Weltdaten (einmal pro App-Sitzung laden)
// ---------------------------------------------------------------------------
let welt = null;
let ladeFehler = "";

async function ladeWelt() {
  if (welt || ladeFehler) return;
  try {
    const antwort = await fetch(new URL("./welt.json", import.meta.url));
    const topo = await antwort.json();
    let deGrenzen = null;
    try {
      // { land: Umriss Deutschlands, grenzen: alle Bundesland-Linien inkl. Außengrenze }
      deGrenzen = await (await fetch(new URL("./de-grenzen.json", import.meta.url))).json();
    } catch (_) { /* Bundeslandgrenzen sind optional */ }
    welt = {
      deGrenzen,
      land: D3.feature(topo, topo.objects.land),
      grenzen: D3.mesh(topo, topo.objects.countries, (a, b) => a !== b),
      gitter: D3.geoGraticule10()
    };
  } catch (e) {
    ladeFehler = "Die Weltkarte konnte nicht geladen werden: " + e.message;
  }
}

function entfernungKm(lat1, lon1, lat2, lon2) {
  return D3.geoDistance([lon1, lat1], [lon2, lat2]) * ERDRADIUS_KM;
}

function kmText(km) {
  if (km == null) return "kein Tipp";
  if (km < 1) return "unter 1 km";
  return Math.round(km).toLocaleString("de-DE") + " km";
}

// Profilbilder für die Nadeln (einmal laden, danach aus dem Cache)
const bildCache = new Map();
function holeBild(url, beiFertig) {
  let eintrag = bildCache.get(url);
  if (!eintrag) {
    const img = new Image();
    eintrag = { img, fertig: false, wartende: [] };
    img.onload = () => { eintrag.fertig = true; eintrag.wartende.splice(0).forEach((f) => f()); };
    img.onerror = () => { eintrag.wartende.length = 0; };
    img.src = url;
    bildCache.set(url, eintrag);
  }
  if (eintrag.fertig && eintrag.img.naturalWidth) return eintrag.img;
  if (!eintrag.fertig) eintrag.wartende.push(beiFertig);
  return null;
}

// ---------------------------------------------------------------------------
//  Globus-Komponente
// ---------------------------------------------------------------------------
const MAX_ZOOM = 90;

class Globus {
  // behaelter: Element, in das Canvas + Zoom-Buttons gebaut werden
  // optionen.beiTipp(lat, lon): Tippen auf die Erde (nur wenn gesetzt)
  constructor(behaelter, optionen = {}) {
    this.behaelter = behaelter;
    this.beiTipp = optionen.beiTipp || null;
    this.bundeslaender = Boolean(optionen.bundeslaender);
    this.rot = [-10, -30];      // [Lambda, Phi] von d3 (Mitte = -Lambda, -Phi)
    this.zoom = 1;
    if (optionen.start) {       // Startansicht, z. B. direkt auf Deutschland
      this.rot = [-optionen.start.lon, -optionen.start.lat];
      this.zoom = optionen.start.zoom;
    }
    this.w = 0; this.h = 0; this.dpr = 1;
    this.markierungen = [];     // {typ:"nadel"|"ziel", lat, lon, farbe, text}
    this.linien = [];           // {von:[lon,lat], nach:[lon,lat], farbe}
    this.zeichnenAngefordert = false;
    this.fluege = 0;
    this.zeiger = new Map();
    this.tippStart = null;
    this.pinch = null;
    this.zerstoert = false;

    this.canvas = document.createElement("canvas");
    this.canvas.className = "wl-canvas";
    this.ctx = this.canvas.getContext("2d");
    behaelter.appendChild(this.canvas);

    const knoepfe = document.createElement("div");
    knoepfe.className = "wl-zoomknoepfe";
    knoepfe.innerHTML =
      `<button type="button" class="wl-zoom-plus" aria-label="Hineinzoomen">+</button>` +
      `<button type="button" class="wl-zoom-minus" aria-label="Herauszoomen">−</button>`;
    behaelter.appendChild(knoepfe);
    this.knoepfe = knoepfe;
    knoepfe.querySelector(".wl-zoom-plus").addEventListener("click", () => this.zoomUm(1.8));
    knoepfe.querySelector(".wl-zoom-minus").addEventListener("click", () => this.zoomUm(1 / 1.8));

    this.projektion = D3.geoOrthographic().clipAngle(90).precision(0.4);
    this.pfad = D3.geoPath(this.projektion, this.ctx);

    this.onDown = (e) => this.zeigerRunter(e);
    this.onMove = (e) => this.zeigerBewegt(e);
    this.onUp = (e) => this.zeigerHoch(e);
    this.onWheel = (e) => this.rad(e);
    this.canvas.addEventListener("pointerdown", this.onDown);
    this.canvas.addEventListener("pointermove", this.onMove);
    this.canvas.addEventListener("pointerup", this.onUp);
    this.canvas.addEventListener("pointercancel", this.onUp);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });

    this.beobachter = new ResizeObserver(() => this.groesseAnpassen());
    this.beobachter.observe(behaelter);
    this.groesseAnpassen();
  }

  destroy() {
    this.zerstoert = true;
    this.beobachter?.disconnect();
    this.canvas.removeEventListener("pointerdown", this.onDown);
    this.canvas.removeEventListener("pointermove", this.onMove);
    this.canvas.removeEventListener("pointerup", this.onUp);
    this.canvas.removeEventListener("pointercancel", this.onUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.canvas.remove();
    this.knoepfe.remove();
  }

  groesseAnpassen() {
    const r = this.behaelter.getBoundingClientRect();
    if (r.width < 10 || r.height < 10) return;
    this.w = r.width; this.h = r.height;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    this.canvas.width = Math.round(this.w * this.dpr);
    this.canvas.height = Math.round(this.h * this.dpr);
    this.canvas.style.width = this.w + "px";
    this.canvas.style.height = this.h + "px";
    this.zeichneSpaeter();
    if (this.wartendeAnpassung) {
      const p = this.wartendeAnpassung;
      this.wartendeAnpassung = null;
      this.passeAn(p, 700);
    }
  }

  grundRadius() { return Math.min(this.w, this.h) / 2 * 0.9; }
  radius() { return this.grundRadius() * this.zoom; }

  setzeMarkierungen(markierungen, linien = []) {
    this.markierungen = markierungen;
    this.linien = linien;
    this.zeichneSpaeter();
  }

  // --- Navigation ---------------------------------------------------------
  mitte() { return [-this.rot[0], -this.rot[1]]; }   // [lon, lat]

  schwenkeUmPixel(dx, dy) {
    const grad = 180 / (Math.PI * this.radius());
    this.rot[0] += dx * grad;
    this.rot[1] = Math.max(-89, Math.min(89, this.rot[1] - dy * grad));
    this.zeichneSpaeter();
  }

  setzeZoom(neu, ankerGeo, ankerPixel) {
    this.zoom = Math.max(1, Math.min(MAX_ZOOM, neu));
    this.wendeProjektionAn();
    if (ankerGeo && ankerPixel) {
      const p = this.projektion(ankerGeo);
      if (p) this.schwenkeUmPixel(ankerPixel[0] - p[0], ankerPixel[1] - p[1]);
    }
    this.zeichneSpaeter();
  }

  zoomUm(faktor) {
    this.setzeZoom(this.zoom * faktor);
  }

  wendeProjektionAn() {
    this.projektion
      .translate([this.w / 2, this.h / 2])
      .scale(this.radius())
      .rotate([this.rot[0], this.rot[1]])
      .clipExtent([[-40, -40], [this.w + 40, this.h + 40]]);
  }

  // Sanfter Kameraflug zu einem Punkt (lon/lat) mit gewünschtem Zoom.
  flugZu(lon, lat, zoom, dauerMs = 900) {
    const id = ++this.fluege;
    const von = { l: this.rot[0], p: this.rot[1], z: this.zoom };
    let nl = -lon;
    while (nl - von.l > 180) nl -= 360;
    while (nl - von.l < -180) nl += 360;
    const np = Math.max(-89, Math.min(89, -lat));
    const nz = Number.isFinite(zoom) ? Math.max(1, Math.min(MAX_ZOOM, zoom)) : 1;
    const start = performance.now();
    const schritt = (jetzt) => {
      if (this.zerstoert || id !== this.fluege) return;
      const t = Math.min(1, (jetzt - start) / dauerMs);
      const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
      this.rot[0] = von.l + (nl - von.l) * e;
      this.rot[1] = von.p + (np - von.p) * e;
      this.zoom = Math.exp(Math.log(von.z) + (Math.log(nz) - Math.log(von.z)) * e);
      this.zeichneSpaeter();
      if (t < 1) requestAnimationFrame(schritt);
    };
    requestAnimationFrame(schritt);
  }

  // Passt die Ansicht so an, dass alle Punkte sichtbar sind.
  passeAn(punkte /* [[lon,lat],...] */, dauerMs = 1000) {
    if (!punkte.length) return;
    // Container noch unsichtbar (Größe 0): erst anpassen, sobald er eine Größe hat
    if (this.w < 10) { this.wartendeAnpassung = punkte; return; }
    let x = 0, y = 0, z = 0;
    for (const [lon, lat] of punkte) {
      const lo = lon * Math.PI / 180, la = lat * Math.PI / 180;
      x += Math.cos(la) * Math.cos(lo);
      y += Math.cos(la) * Math.sin(lo);
      z += Math.sin(la);
    }
    const len = Math.hypot(x, y, z);
    let mLon, mLat;
    if (len < 1e-6) { mLon = punkte[0][0]; mLat = punkte[0][1]; }
    else { mLon = Math.atan2(y, x) * 180 / Math.PI; mLat = Math.asin(z / len) * 180 / Math.PI; }
    let maxWinkel = 0;
    for (const p of punkte) maxWinkel = Math.max(maxWinkel, D3.geoDistance([mLon, mLat], p));
    let ziel = 1;
    if (maxWinkel < 1.25) {
      // sin(winkel) * Radius soll in ca. 78 % der halben Breite passen
      ziel = (0.78 * 0.5 * Math.min(this.w, this.h)) / (Math.max(Math.sin(maxWinkel), 0.003) * this.grundRadius());
      ziel = Math.max(1, Math.min(ziel, 40));
    }
    this.flugZu(mLon, mLat, ziel, dauerMs);
  }

  // --- Eingabe --------------------------------------------------------------
  position(e) {
    const r = this.canvas.getBoundingClientRect();
    return [e.clientX - r.left, e.clientY - r.top];
  }

  zeigerRunter(e) {
    this.fluege++;   // laufenden Kameraflug abbrechen
    try { this.canvas.setPointerCapture?.(e.pointerId); } catch (_) { /* egal */ }
    const p = this.position(e);
    this.zeiger.set(e.pointerId, { x: p[0], y: p[1] });
    if (this.zeiger.size === 1) {
      this.tippStart = { x: p[0], y: p[1], t: performance.now(), bewegt: false, mehrere: false };
    } else {
      if (this.tippStart) this.tippStart.mehrere = true;
      this.starteGeste();
    }
  }

  starteGeste() {
    const pts = [...this.zeiger.values()];
    if (pts.length < 2) { this.pinch = null; return; }
    const mx = (pts[0].x + pts[1].x) / 2, my = (pts[0].y + pts[1].y) / 2;
    this.wendeProjektionAn();
    const anker = this.projektion.invert([mx, my]);
    this.pinch = {
      d0: Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1,
      z0: this.zoom, anker: anker && Number.isFinite(anker[0]) ? anker : null,
      mx, my
    };
  }

  zeigerBewegt(e) {
    if (!this.zeiger.has(e.pointerId)) return;
    const p = this.position(e);
    const alt = this.zeiger.get(e.pointerId);
    this.zeiger.set(e.pointerId, { x: p[0], y: p[1] });
    if (this.tippStart && Math.hypot(p[0] - this.tippStart.x, p[1] - this.tippStart.y) > 8) {
      this.tippStart.bewegt = true;
    }
    if (this.zeiger.size === 1) {
      if (this.tippStart?.bewegt) this.schwenkeUmPixel(p[0] - alt.x, p[1] - alt.y);
    } else if (this.zeiger.size >= 2 && this.pinch) {
      const pts = [...this.zeiger.values()];
      const d = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) || 1;
      const mx = (pts[0].x + pts[1].x) / 2, my = (pts[0].y + pts[1].y) / 2;
      // Mittelpunktsverschiebung wie Ziehen, danach Zoom um den Ankerpunkt
      this.schwenkeUmPixel(mx - this.pinch.mx, my - this.pinch.my);
      this.pinch.mx = mx; this.pinch.my = my;
      this.setzeZoom(this.pinch.z0 * d / this.pinch.d0, this.pinch.anker, [mx, my]);
    }
  }

  zeigerHoch(e) {
    if (!this.zeiger.has(e.pointerId)) return;
    const p = this.position(e);
    this.zeiger.delete(e.pointerId);
    this.pinch = null;
    if (this.zeiger.size >= 2) this.starteGeste();
    if (this.zeiger.size === 0 && this.tippStart) {
      const t = this.tippStart;
      this.tippStart = null;
      if (e.type !== "pointercancel" && !t.bewegt && !t.mehrere && performance.now() - t.t < 700) {
        this.tippen(p[0], p[1]);
      }
    }
  }

  rad(e) {
    e.preventDefault();
    this.fluege++;
    const p = this.position(e);
    this.wendeProjektionAn();
    const anker = this.projektion.invert(p);
    const faktor = Math.exp(-e.deltaY * (e.deltaMode === 1 ? 0.05 : 0.0018));
    this.setzeZoom(this.zoom * faktor, anker && Number.isFinite(anker[0]) ? anker : null, p);
  }

  tippen(x, y) {
    if (!this.beiTipp) return;
    this.wendeProjektionAn();
    const geo = this.projektion.invert([x, y]);
    if (!geo || !Number.isFinite(geo[0]) || !Number.isFinite(geo[1])) return;
    // außerhalb der Erdscheibe liefert invert Werte, die nicht zurückprojizieren
    const zurueck = this.projektion(geo);
    if (!zurueck || Math.hypot(zurueck[0] - x, zurueck[1] - y) > 2) return;
    this.beiTipp(geo[1], geo[0]);
  }

  // --- Zeichnen -------------------------------------------------------------
  zeichneSpaeter() {
    if (this.zeichnenAngefordert || this.zerstoert) return;
    this.zeichnenAngefordert = true;
    requestAnimationFrame(() => {
      this.zeichnenAngefordert = false;
      if (!this.zerstoert) this.zeichne();
    });
  }

  zeichne() {
    if (!welt || this.w < 10) return;
    const { ctx } = this;
    this.wendeProjektionAn();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, this.w, this.h);
    const k = this.radius();
    const cx = this.w / 2, cy = this.h / 2;

    // Meer
    const meer = ctx.createRadialGradient(cx - k * 0.35, cy - k * 0.4, k * 0.1, cx, cy, k * 1.02);
    meer.addColorStop(0, "#3b8fd9");
    meer.addColorStop(1, "#134b8f");
    ctx.beginPath(); this.pfad({ type: "Sphere" });
    ctx.fillStyle = meer; ctx.fill();

    // Gradnetz
    ctx.beginPath(); this.pfad(welt.gitter);
    ctx.strokeStyle = "rgba(255,255,255,0.16)"; ctx.lineWidth = 0.6; ctx.stroke();

    // Land
    ctx.beginPath(); this.pfad(welt.land);
    ctx.fillStyle = "#dfe8c6"; ctx.fill();
    ctx.strokeStyle = "#5c7a4a"; ctx.lineWidth = 0.7; ctx.stroke();

    // Ländergrenzen
    ctx.beginPath(); this.pfad(welt.grenzen);
    ctx.strokeStyle = "rgba(90,70,110,0.6)"; ctx.lineWidth = this.zoom > 6 ? 1 : 0.6; ctx.stroke();

    // Bundeslandgrenzen (nur wenn Deutschland im Spiel ist)
    if (this.bundeslaender && welt.deGrenzen) {
      // Deutschland aus den detaillierten Bundesland-Daten übermalen, damit Küste und
      // Grenzen exakt zu den lila Linien passen
      ctx.beginPath(); this.pfad(welt.deGrenzen.land);
      ctx.fillStyle = "#dfe8c6"; ctx.fill();
      ctx.beginPath(); this.pfad(welt.deGrenzen.grenzen);
      ctx.lineJoin = "round";
      ctx.strokeStyle = "rgba(130,70,170,0.8)"; ctx.lineWidth = this.zoom > 6 ? 1.4 : 1; ctx.stroke();
    }

    // Atmosphäre / Rand
    if (k < Math.max(this.w, this.h) * 0.9) {
      ctx.beginPath(); ctx.arc(cx, cy, k, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(160,205,255,0.55)"; ctx.lineWidth = 2; ctx.stroke();
      const glanz = ctx.createRadialGradient(cx, cy, k * 0.82, cx, cy, k);
      glanz.addColorStop(0, "rgba(10,25,60,0)");
      glanz.addColorStop(1, "rgba(10,25,60,0.38)");
      ctx.beginPath(); ctx.arc(cx, cy, k, 0, Math.PI * 2);
      ctx.fillStyle = glanz; ctx.fill();
    }

    // Verbindungslinien
    for (const l of this.linien) {
      ctx.beginPath();
      this.pfad({ type: "LineString", coordinates: [l.von, l.nach] });
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = l.farbe; ctx.lineWidth = 2;
      ctx.stroke();
      ctx.setLineDash([]);
    }

    // Markierungen (von hinten nach vorne: Ziel zuletzt)
    const mitteGeo = this.mitte();
    const sortiert = [...this.markierungen].sort((a, b) => (a.typ === "ziel") - (b.typ === "ziel"));
    for (const m of sortiert) {
      if (D3.geoDistance(mitteGeo, [m.lon, m.lat]) > Math.PI / 2 - 0.02) continue;
      const p = this.projektion([m.lon, m.lat]);
      if (!p) continue;
      if (m.typ === "ziel") this.zeichneZiel(p[0], p[1], m);
      else this.zeichneNadel(p[0], p[1], m);
    }
  }

  zeichneNadel(x, y, m) {
    const { ctx } = this;
    const R = 15;                      // Radius des Nadelkopfs (Profilbild)
    const kopfY = y - 30;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 5; ctx.shadowOffsetY = 2;
    // Nadel
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, kopfY + R - 2);
    ctx.strokeStyle = "#f3f4f6"; ctx.lineWidth = 2.4; ctx.stroke();
    // weißer Rand + Schatten
    ctx.beginPath(); ctx.arc(x, kopfY, R + 2, 0, Math.PI * 2);
    ctx.fillStyle = "#fff"; ctx.fill();
    ctx.restore();
    // Farbring des Spielers
    ctx.beginPath(); ctx.arc(x, kopfY, R, 0, Math.PI * 2);
    ctx.fillStyle = m.farbe; ctx.fill();
    // Spitze
    ctx.beginPath(); ctx.arc(x, y, 2.4, 0, Math.PI * 2);
    ctx.fillStyle = "#111827"; ctx.fill();
    // Profilbild (falls geladen), sonst Anfangsbuchstabe
    const bild = m.bild ? holeBild(m.bild, () => this.zeichneSpaeter()) : null;
    if (bild) {
      ctx.save();
      ctx.beginPath(); ctx.arc(x, kopfY, R - 3, 0, Math.PI * 2); ctx.clip();
      // Bild mittig quadratisch zuschneiden (Gesicht liegt meist oben)
      const q = Math.min(bild.naturalWidth, bild.naturalHeight);
      const sx = (bild.naturalWidth - q) / 2;
      const sy = Math.max(0, (bild.naturalHeight - q) * 0.2);
      ctx.drawImage(bild, sx, sy, q, q, x - R + 3, kopfY - R + 3, (R - 3) * 2, (R - 3) * 2);
      ctx.restore();
    } else if (m.initial) {
      ctx.fillStyle = "#fff"; ctx.font = "700 14px -apple-system, Helvetica, Arial, sans-serif";
      ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(m.initial, x, kopfY + 0.5);
    }
    if (m.text) this.zeichneText(m.text, x + R + 5, kopfY - 2, "left");
  }

  zeichneZiel(x, y, m) {
    const { ctx } = this;
    ctx.save();
    ctx.shadowColor = "rgba(0,0,0,0.5)"; ctx.shadowBlur = 5;
    ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.fillStyle = "#ef4444"; ctx.fill();
    ctx.restore();
    ctx.beginPath(); ctx.arc(x, y, 9, 0, Math.PI * 2);
    ctx.strokeStyle = "#fff"; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y, 3, 0, Math.PI * 2);
    ctx.fillStyle = "#fff"; ctx.fill();
    if (m.text) this.zeichneText(m.text, x, y + 22, "center", true);
  }

  zeichneText(text, x, y, ausrichtung, fett = false) {
    const { ctx } = this;
    ctx.font = `${fett ? 700 : 600} ${fett ? 13 : 11}px -apple-system, Helvetica, Arial, sans-serif`;
    ctx.textAlign = ausrichtung; ctx.textBaseline = "middle";
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(15,23,42,0.85)"; ctx.lineWidth = 3.5;
    ctx.strokeText(text, x, y);
    ctx.fillStyle = "#fff";
    ctx.fillText(text, x, y);
  }
}

// ---------------------------------------------------------------------------
//  Oberfläche
// ---------------------------------------------------------------------------
const VORLAGE = `
  <div id="wl-setup" class="bildschirm-karte" hidden>
    <h1>🌍 Wo liegt's?</h1>
    <p class="hinweis-text">Ein Ort wird genannt - alle setzen gleichzeitig eine Stecknadel auf den Globus.
      Drehen: mit einem Finger ziehen. Zoomen: zwei Finger auseinander oder mit + / −. Nadel setzen: kurz tippen.
      Wer (Luftlinie) am nächsten dran ist, bekommt die meisten Punkte, wer weniger als 100 km danebenliegt,
      zusätzlich einen Volltreffer-Punkt. Pro Runde habt ihr 60 Sekunden.</p>

    <div id="wl-modus-block" class="wl-modus-block">
      <span class="wl-modus-titel">Was wird gesucht? <small>(mehrere möglich)</small></span>
      <div id="wl-modus" class="wl-modus" role="group" aria-label="Was wird gesucht?">
        <button type="button" data-modus="welt">🌍 Städte weltweit</button>
        <button type="button" data-modus="de">🇩🇪 Städte Deutschland</button>
        <button type="button" data-modus="sehens">🗽 Sehenswürdigkeiten</button>
      </div>
      <p id="wl-modus-info" class="hinweis-text"></p>
    </div>

    <div id="wl-anzahl-zeile" class="setup-anzahlblock" hidden>
      <div class="setup-anzahl-zeile">
        <span>Anzahl Runden</span>
        <span class="anzahl-picker">
          <input id="wl-anzahl" type="text" inputmode="numeric" pattern="[0-9]*" min="1" class="anzahl-eingabe">
        </span>
      </div>
      <p id="wl-anzahl-max" class="hinweis-text"></p>
    </div>

    <p id="wl-setup-fehler" class="fehler-text"></p>
    <p><button id="wl-starten" class="btn-primaer" hidden>Spiel starten</button></p>
    <p id="wl-setup-warten" hidden><em>Warte, bis der Spielleiter das Spiel startet …</em></p>
    <div id="wl-bereit-bereich" class="bereit-bereich" hidden></div>
  </div>

  <div id="wl-frage-screen" class="bildschirm-karte" hidden>
    <p class="kategorie">Wo liegt …</p>
    <h2 id="wl-stadt" class="wl-stadt"></h2>
    <p id="wl-land" class="wl-land"></p>
    <div id="wl-globus-frage" class="wl-globus"></div>
    <p id="wl-frage-hinweis" class="hinweis-text"></p>
    <p><button id="wl-setzen" class="btn-primaer" type="button" disabled>Nadel setzen</button></p>
    <div id="wl-frage-status" class="warten-block"></div>
  </div>

  <div id="wl-ergebnis-screen" class="bildschirm-karte" hidden>
    <p class="kategorie">Das war</p>
    <h2 id="wl-erg-stadt" class="wl-stadt"></h2>
    <p id="wl-erg-land" class="wl-land"></p>
    <div id="wl-globus-ergebnis" class="wl-globus"></div>
    <ul id="wl-erg-liste"></ul>
    <p><button id="wl-weiter" class="btn-primaer" type="button" hidden>Weiter</button></p>
    <p id="wl-weiter-warten" hidden><em>Der Spielleiter geht gleich weiter …</em></p>
  </div>

  <div id="wl-endstand-screen" class="bildschirm-karte" hidden>
    <h1>Endstand</h1>
    <ul id="wl-endstand-liste"></ul>
    <p id="wl-endstand-warten" hidden><em>Der Spielleiter wählt gleich das nächste Spiel …</em></p>
    <p><button id="wl-gesamtwertung-btn" class="btn-primaer" type="button" hidden>Gesamtwertung</button></p>
  </div>
`;

let api = null;
let el = {};
let spielerListe = [];
let alleTipps = [];
let tippsUnsub = null;
let tickId = null;

let status = null;
let rundeIndex = -1;
let anzahlRunden = 0;
let anzahlEntwurf = null;
let anzahlEntwurfTimer = null;
let verwendet = [];
let stadtIdx = null;
let modi = ["welt"];
let ortsCache = { schluessel: "", liste: [] };
let frageSeit = 0;
let ergebnisSeit = 0;

let globusFrage = null;
let globusErgebnis = null;
let meineNadel = null;           // {lat, lon} noch nicht abgeschickt
let eigenerTippGesetzt = false;
let auswertungAusgeloest = false;
let frageGerendert = false;
let ergebnisGerendert = false;
let bereitSystem = null;
let olympiadeAutoStart = false;

const $ = (id) => el.wurzel.querySelector("#" + id);

// Gemeinsame Ortsliste aller gewählten Kataloge (feste Reihenfolge, damit der
// Index auf allen Geräten dasselbe meint). Jeder Eintrag: [name, land, lat, lon, katalog]
function ortsListe() {
  const schluessel = modi.join(",");
  if (ortsCache.schluessel !== schluessel) {
    const liste = [];
    for (const id of Object.keys(MODI)) {
      if (modi.includes(id)) MODI[id].daten.forEach((r) => liste.push([...r, id]));
    }
    ortsCache = { schluessel, liste };
  }
  return ortsCache.liste;
}

function stadt(idx) {
  const s = ortsListe()[idx];
  // Nur bei weltweiten Städten steht das Land dabei. Bei Sehenswürdigkeiten und deutschen
  // Städten (Bundesland) wäre es ein Hinweis, deshalb bleibt die Zeile leer.
  return s ? { name: s[0], land: s[4] === "welt" ? s[1] : "", lat: s[2], lon: s[3] } : null;
}

function neueStadtIdx(bisher) {
  const alle = ortsListe().map((_, i) => i);
  const frei = alle.filter((i) => !bisher.includes(i));
  const pool = frei.length ? frei : alle;
  return pool[Math.floor(Math.random() * pool.length)];
}

export async function starten(uebergebeneApi) {
  api = uebergebeneApi;
  el.wurzel = api.wurzel;
  el.wurzel.innerHTML = VORLAGE;
  bereitSystem = initBereitSystem(api, "wl");
  olympiadeAutoStart = false;

  await ladeWelt();
  if (ladeFehler) $("wl-setup-fehler").textContent = ladeFehler;

  verdrahte();
  tippsUnsub = onSnapshot(collection(api.db, "raeume", api.code, "wlTipps"), (snap) => {
    alleTipps = [];
    snap.forEach((d) => alleTipps.push(d.data()));
    if (status === "frage") aktualisiereFrageStatus();
    if (status === "ergebnis") rendereErgebnisListe();
  });

  if (api.istLeiter && !api.raum?.wlStatus) {
    await updateDoc(api.raumRef(), {
      wlStatus: "setup", wlModi: ["welt"], wlRundeIndex: 0, wlAnzahlRunden: 0, wlAnzahlEntwurf: 0,
      wlVerwendet: [], wlStadtIdx: null, wlFrageSeit: 0, wlErgebnisSeit: 0
    });
  }
  tickId = setInterval(tick, 250);
}

function verdrahte() {
  const feld = $("wl-anzahl");
  feld.addEventListener("input", () => {
    const b = feld.value.replace(/[^0-9]/g, "");
    if (b !== feld.value) feld.value = b;
    schreibeEntwurf();
  });
  feld.addEventListener("change", () => {
    let w = parseInt(feld.value, 10);
    if (!Number.isFinite(w) || w < 1) w = 1;
    if (w > MAX_ANZAHL) w = MAX_ANZAHL;
    feld.value = String(w);
  });
  feld.addEventListener("focus", () => feld.select());
  $("wl-modus").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-modus]");
    if (!btn || !api.istLeiter || api.olympiadeAnzahl) return;
    const id = btn.dataset.modus;
    if (!MODI[id]) return;
    // an-/abwählen, mindestens ein Katalog bleibt immer aktiv
    const neu = modi.includes(id) ? modi.filter((m) => m !== id) : [...modi, id];
    if (neu.length === 0) return;
    modi = Object.keys(MODI).filter((m) => neu.includes(m));   // sofort lokal anzeigen
    zeigeSetup();
    updateDoc(api.raumRef(), { wlModi: modi }).catch(() => {});
  });
  $("wl-starten").addEventListener("click", spielStarten);
  $("wl-setzen").addEventListener("click", nadelAbschicken);
  $("wl-weiter").addEventListener("click", weiterNachErgebnis);
}

function schreibeEntwurf() {
  if (!api.istLeiter) return;
  clearTimeout(anzahlEntwurfTimer);
  anzahlEntwurfTimer = setTimeout(() => {
    const w = parseInt($("wl-anzahl").value, 10);
    if (Number.isFinite(w) && w > 0) updateDoc(api.raumRef(), { wlAnzahlEntwurf: w }).catch(() => {});
  }, 300);
}

export function beenden() {
  bereitSystem = null;
  tippsUnsub?.(); tippsUnsub = null;
  if (tickId) { clearInterval(tickId); tickId = null; }
  clearTimeout(anzahlEntwurfTimer);
  zerstoereGlobus();
  el = {};
  spielerListe = []; alleTipps = [];
  status = null; rundeIndex = -1; anzahlRunden = 0; verwendet = []; stadtIdx = null;
  frageSeit = 0; ergebnisSeit = 0; meineNadel = null; eigenerTippGesetzt = false;
  auswertungAusgeloest = false; frageGerendert = false; ergebnisGerendert = false;
}

function zerstoereGlobus() {
  globusFrage?.destroy(); globusFrage = null;
  globusErgebnis?.destroy(); globusErgebnis = null;
}

export function spieler(liste) {
  spielerListe = liste;
  if (!el.wurzel) return;
  if (status === "frage") aktualisiereFrageStatus();
  else if (status === "ergebnis") rendereErgebnisListe();
  else if (status === "beendet") zeigeEndstand();
}

export function raumDaten(daten) {
  if (!daten || !el.wurzel) return;
  status = daten.wlStatus ?? null;
  anzahlRunden = daten.wlAnzahlRunden ?? 0;
  anzahlEntwurf = daten.wlAnzahlEntwurf ?? null;
  verwendet = daten.wlVerwendet ?? [];
  stadtIdx = daten.wlStadtIdx ?? null;
  const gewaehlt = Array.isArray(daten.wlModi) ? Object.keys(MODI).filter((m) => daten.wlModi.includes(m)) : [];
  modi = gewaehlt.length ? gewaehlt : ["welt"];

  const neueRunde = daten.wlRundeIndex ?? 0;
  const neuFrageSeit = daten.wlFrageSeit ?? 0;
  if (status === "frage" && (rundeIndex !== neueRunde || frageSeit !== neuFrageSeit)) {
    meineNadel = null;
    eigenerTippGesetzt = false;
    auswertungAusgeloest = false;
    frageGerendert = false;
  }
  rundeIndex = neueRunde;
  frageSeit = neuFrageSeit;

  const neuErgebnisSeit = daten.wlErgebnisSeit ?? 0;
  if (status === "ergebnis" && ergebnisSeit !== neuErgebnisSeit) ergebnisGerendert = false;
  ergebnisSeit = neuErgebnisSeit;

  api.fortschritt(["frage", "ergebnis"].includes(status) ? `${rundeIndex + 1}/${anzahlRunden}` : "");

  alleVerstecken();
  if (status === "setup" || !status) {
    zerstoereGlobus();
    zeigeSetup();
    $("wl-setup").hidden = false;
  } else if (status === "frage") {
    if (!frageGerendert) { frageGerendert = true; zeigeFrage(); }
    else aktualisiereFrageStatus();
    $("wl-frage-screen").hidden = false;
  } else if (status === "ergebnis") {
    if (!ergebnisGerendert) { ergebnisGerendert = true; zeigeErgebnis(); }
    $("wl-ergebnis-screen").hidden = false;
  } else if (status === "beendet") {
    zerstoereGlobus();
    zeigeEndstand();
    $("wl-endstand-screen").hidden = false;
  }
}

function alleVerstecken() {
  ["wl-setup", "wl-frage-screen", "wl-ergebnis-screen", "wl-endstand-screen"]
    .forEach((id) => { $(id).hidden = true; });
}

function zeigeSetup() {
  const feld = $("wl-anzahl");
  const max = Math.min(MAX_ANZAHL, ortsListe().length);
  feld.max = max;
  $("wl-modus").querySelectorAll("button").forEach((b) => {
    const an = modi.includes(b.dataset.modus);
    b.classList.toggle("aktiv", an);
    b.setAttribute("aria-pressed", an ? "true" : "false");
    b.disabled = !api.istLeiter || Boolean(api.olympiadeAnzahl);
  });
  $("wl-modus-info").textContent = `${ortsListe().length} Orte im Topf` +
    (modi.length > 1 ? ` (${modi.map((m) => MODI[m].daten.length).join(" + ")}).` : ".") +
    (modi.includes("welt") ? " Weltweite Städte ohne deutsche." : "");
  if (api.olympiadeAnzahl) {
    const n = Math.min(Math.max(1, api.olympiadeAnzahl), max);
    feld.value = String(n);
    $("wl-anzahl-max").textContent = `In der Olympiade festgelegt: ${n} ${n === 1 ? "Runde" : "Runden"}.`;
    feld.disabled = true;
  } else if (api.istLeiter) {
    if (!feld.value) feld.value = String(STANDARD_ANZAHL);
    $("wl-anzahl-max").textContent = `Bis zu ${max} Runden, jeweils mit einem neuen Ort.`;
    feld.disabled = false;
  } else {
    feld.value = String(anzahlEntwurf ?? STANDARD_ANZAHL);
    $("wl-anzahl-max").textContent = `Bis zu ${max} Runden, jeweils mit einem neuen Ort.`;
    feld.disabled = true;
  }
  $("wl-anzahl-zeile").hidden = false;
  $("wl-starten").hidden = !api.istLeiter || !welt;
  $("wl-setup-warten").hidden = api.istLeiter;
  bereitSystem?.render();

  if (api.istLeiter && api.olympiadeAnzahl && !olympiadeAutoStart && bereitSystem?.alleBereit()) {
    olympiadeAutoStart = true;
    spielStarten();
  }
}

async function spielStarten() {
  $("wl-setup-fehler").textContent = "";
  // TEST: Alleine spielen ist gerade erlaubt (zum Testen). Später wieder:
  // if (spielerListe.length < 2) { ... "mindestens zwei Spieler" ... return; }
  if (!welt) { $("wl-setup-fehler").textContent = ladeFehler || "Die Weltkarte ist nicht verfügbar."; return; }
  const max = Math.min(MAX_ANZAHL, ortsListe().length);
  let anzahl = parseInt($("wl-anzahl").value, 10);
  if (!Number.isFinite(anzahl) || anzahl < 1) anzahl = 1;
  if (anzahl > max) anzahl = max;
  const idx = neueStadtIdx([]);
  $("wl-starten").disabled = true;
  try {
    await raeumeAuf();
    await updateDoc(api.raumRef(), {
      wlStatus: "frage", wlModi: modi, wlRundeIndex: 0, wlAnzahlRunden: anzahl,
      wlVerwendet: [idx], wlStadtIdx: idx, wlFrageSeit: Date.now(), wlErgebnisSeit: 0
    });
  } catch (e) {
    zeigeDebug("Fehler beim Start: " + e.message);
  }
  $("wl-starten").disabled = false;
}

async function raeumeAuf() {
  const snap = await getDocs(collection(api.db, "raeume", api.code, "wlTipps"));
  await Promise.all(snap.docs.map((d) => deleteDoc(d.ref)));
  alleTipps = [];
  await Promise.all(spielerListe.map((s) => updateDoc(api.spielerRef(s.id), { punkte: 0 })));
}

export async function vorZurueck() {
  try {
    await raeumeAuf();
    await updateDoc(api.raumRef(), {
      wlStatus: null, wlModi: ["welt"], wlRundeIndex: 0, wlAnzahlRunden: 0, wlAnzahlEntwurf: 0,
      wlVerwendet: [], wlStadtIdx: null, wlFrageSeit: 0, wlErgebnisSeit: 0
    });
    await api.zurueckZurAuswahl();
  } catch (e) {
    zeigeDebug("Fehler beim Zurückkehren: " + e.message);
  }
}

// --- Frage ---------------------------------------------------------------
function eigeneFarbe() {
  return spielerListe.find((s) => s.id === api.spielerId)?.farbe || "#7c3aed";
}

function initiale(name) {
  return (name || "?").trim().charAt(0).toUpperCase();
}

function tippsDieserRunde() {
  const ids = new Set(spielerListe.map((s) => s.id));
  return alleTipps.filter((t) => t.rundeIndex === rundeIndex && ids.has(t.spielerId));
}

// Nur Deutschland gewählt: Globus startet direkt über Deutschland (mit Bundeslandgrenzen)
function globusOptionen() {
  const nurDe = modi.length === 1 && modi[0] === "de";
  return {
    bundeslaender: modi.includes("de"),
    start: nurDe ? { lon: 10.45, lat: 51.1, zoom: 12 } : null
  };
}

function zeigeFrage() {
  const s = stadt(stadtIdx);
  $("wl-stadt").textContent = s ? s.name : "?";
  $("wl-land").textContent = s ? s.land : "";
  zerstoereGlobus();
  globusFrage = new Globus($("wl-globus-frage"), {
    ...globusOptionen(),
    beiTipp: (lat, lon) => {
      if (eigenerTippGesetzt || status !== "frage") return;
      meineNadel = { lat, lon };
      zeichneEigeneNadel();
      aktualisiereFrageStatus();
    }
  });
  zeichneEigeneNadel();
  aktualisiereFrageStatus();
}

function zeichneEigeneNadel() {
  if (!globusFrage) return;
  globusFrage.setzeMarkierungen(meineNadel
    ? [{ typ: "nadel", lat: meineNadel.lat, lon: meineNadel.lon, farbe: eigeneFarbe(), initial: initiale(api.spielerName), bild: avatarBild(spielerListe.find((x) => x.id === api.spielerId)?.icon) }]
    : []);
}

function aktualisiereFrageStatus() {
  if (!el.wurzel || status !== "frage") return;
  const tipps = tippsDieserRunde();
  const gesetzt = new Set(tipps.map((t) => t.spielerId));
  eigenerTippGesetzt = gesetzt.has(api.spielerId);
  const btn = $("wl-setzen");
  btn.disabled = eigenerTippGesetzt || !meineNadel;
  btn.hidden = eigenerTippGesetzt;
  if (eigenerTippGesetzt) {
    $("wl-frage-hinweis").textContent = "Nadel gesetzt! Warte auf die anderen …";
  } else if (meineNadel) {
    $("wl-frage-hinweis").textContent = "Passt die Position? Dann „Nadel setzen“ - sonst einfach woanders tippen.";
  } else {
    $("wl-frage-hinweis").textContent = "Dreh und zoom den Globus und tippe auf die Stelle, wo die Stadt liegt.";
  }
  renderWarteAvatare($("wl-frage-status"), spielerListe.filter((sp) => !gesetzt.has(sp.id)));
}

async function nadelAbschicken() {
  if (status !== "frage" || eigenerTippGesetzt || !meineNadel) return;
  eigenerTippGesetzt = true;
  $("wl-setzen").disabled = true;
  try {
    await setDoc(doc(api.db, "raeume", api.code, "wlTipps", `${api.spielerId}_${rundeIndex}`), {
      spielerId: api.spielerId, spielerName: api.spielerName, rundeIndex,
      lat: meineNadel.lat, lon: meineNadel.lon, zeitpunkt: serverTimestamp()
    });
  } catch (e) {
    eigenerTippGesetzt = false;
    $("wl-setzen").disabled = false;
    zeigeDebug("Fehler beim Setzen: " + e.message);
  }
}

// --- Auswertung -------------------------------------------------------------
// Rang nach Entfernung; Punkte = Spielerzahl - Rang + 1 (Gleichstand = gleicher
// Rang), plus 1 Volltreffer-Punkt unter 100 km. Wer nichts gesetzt hat: 0.
function bewerte(tipps) {
  const s = stadt(stadtIdx);
  const n = spielerListe.length;
  const mit = [];
  const ohne = [];
  for (const sp of spielerListe) {
    const t = tipps.find((x) => x.spielerId === sp.id);
    if (t && s) mit.push({ id: sp.id, km: entfernungKm(t.lat, t.lon, s.lat, s.lon), lat: t.lat, lon: t.lon });
    else ohne.push({ id: sp.id, km: null, punkte: 0, rang: null, volltreffer: false });
  }
  mit.sort((a, b) => a.km - b.km);
  let rang = 1;
  mit.forEach((e, i) => {
    if (i > 0 && Math.round(e.km) > Math.round(mit[i - 1].km)) rang = i + 1;
    e.rang = rang;
    e.volltreffer = e.km <= VOLLTREFFER_KM;
    e.punkte = Math.max(1, n - rang + 1) + (e.volltreffer ? 1 : 0);
  });
  return [...mit, ...ohne];
}

function tick() {
  if (!el.wurzel) return;
  if (status === "frage") {
    const rest = Math.max(0, RUNDENZEIT_MS - (Date.now() - frageSeit));
    if (!eigenerTippGesetzt && meineNadel == null) {
      $("wl-frage-hinweis").textContent = rest > 0
        ? `Noch ${Math.ceil(rest / 1000)} s - dreh den Globus und tippe auf die Stelle.`
        : "Zeit ist um!";
    }
    if (api.istLeiter) pruefeAuswertung(rest);
  }
}

async function pruefeAuswertung(rest) {
  if (status !== "frage" || auswertungAusgeloest) return;
  const gesetzt = new Set(tippsDieserRunde().map((t) => t.spielerId));
  const fehlend = spielerListe.filter((sp) => !gesetzt.has(sp.id));
  if (fehlend.length > 0 && rest > 0) return;
  auswertungAusgeloest = true;
  try {
    const ergebnis = bewerte(tippsDieserRunde());
    const batch = writeBatch(api.db);
    ergebnis.forEach((e) => {
      if (e.punkte > 0) batch.update(api.spielerRef(e.id), { punkte: increment(e.punkte) });
    });
    batch.update(api.raumRef(), { wlStatus: "ergebnis", wlErgebnisSeit: Date.now() });
    await batch.commit();
  } catch (e) {
    auswertungAusgeloest = false;
    zeigeDebug("Fehler bei der Auswertung: " + e.message);
  }
}

// --- Ergebnis ---------------------------------------------------------------
function zeigeErgebnis() {
  const s = stadt(stadtIdx);
  $("wl-erg-stadt").textContent = s ? s.name : "?";
  $("wl-erg-land").textContent = s ? s.land : "";
  zerstoereGlobus();
  globusErgebnis = new Globus($("wl-globus-ergebnis"), { bundeslaender: modi.includes("de") });
  rendereErgebnisListe(true);
  $("wl-weiter").hidden = !api.istLeiter;
  $("wl-weiter").textContent = rundeIndex + 1 >= anzahlRunden ? "Zum Endstand" : "Nächste Runde";
  $("wl-weiter-warten").hidden = api.istLeiter;
}

let letzteErgebnisSignatur = "";

function rendereErgebnisListe(neuPassen = false) {
  if (!el.wurzel || status !== "ergebnis") return;
  const s = stadt(stadtIdx);
  const tipps = tippsDieserRunde();
  const ergebnis = bewerte(tipps).sort((a, b) => (a.rang ?? 99) - (b.rang ?? 99));

  const liste = $("wl-erg-liste");
  liste.innerHTML = "";
  ergebnis.forEach((e) => {
    const sp = spielerListe.find((x) => x.id === e.id);
    if (!sp) return;
    const extra = e.km == null
      ? "Keine Nadel gesetzt"
      : `${kmText(e.km)}${e.volltreffer ? " · Volltreffer +1" : ""}`;
    const li = document.createElement("li");
    li.innerHTML = spielerKarte(sp.name, sp.farbe, sp.icon, `+${e.punkte}`, { extra, punkteRechts: sp.punkte ?? 0 });
    liste.appendChild(li);
  });

  if (!globusErgebnis || !s) return;
  const markierungen = [];
  const linien = [];
  ergebnis.forEach((e) => {
    if (e.km == null) return;
    const sp = spielerListe.find((x) => x.id === e.id);
    if (!sp) return;
    markierungen.push({ typ: "nadel", lat: e.lat, lon: e.lon, farbe: sp.farbe || "#7c3aed", initial: initiale(sp.name), bild: avatarBild(sp.icon) });
    linien.push({ von: [e.lon, e.lat], nach: [s.lon, s.lat], farbe: sp.farbe || "#7c3aed" });
  });
  markierungen.push({ typ: "ziel", lat: s.lat, lon: s.lon, text: s.name });
  globusErgebnis.setzeMarkierungen(markierungen, linien);

  const signatur = `${rundeIndex}:` + ergebnis.map((e) => `${e.id}${e.km == null ? "-" : Math.round(e.km)}`).join(",");
  if (neuPassen || signatur !== letzteErgebnisSignatur) {
    if (neuPassen || tipps.length) {
      globusErgebnis.passeAn([[s.lon, s.lat], ...markierungen.filter((m) => m.typ === "nadel").map((m) => [m.lon, m.lat])]);
    }
    letzteErgebnisSignatur = signatur;
  }
}

async function weiterNachErgebnis() {
  if (!api.istLeiter || status !== "ergebnis") return;
  $("wl-weiter").disabled = true;
  try {
    if (rundeIndex + 1 >= anzahlRunden) {
      await updateDoc(api.raumRef(), { wlStatus: "beendet" });
      speichereWertung(api, "wo-liegts", Object.fromEntries(spielerListe.map((s) => [s.id, s.punkte ?? 0])));
    } else {
      const idx = neueStadtIdx(verwendet);
      await updateDoc(api.raumRef(), {
        wlStatus: "frage", wlRundeIndex: rundeIndex + 1,
        wlVerwendet: [...verwendet, idx], wlStadtIdx: idx,
        wlFrageSeit: Date.now(), wlErgebnisSeit: 0
      });
    }
  } catch (e) {
    zeigeDebug("Fehler beim Weiterschalten: " + e.message);
  }
  $("wl-weiter").disabled = false;
}

function zeigeEndstand() {
  if (!el.wurzel) return;
  const sortiert = [...spielerListe].sort((a, b) => (b.punkte ?? 0) - (a.punkte ?? 0));
  const liste = $("wl-endstand-liste");
  liste.innerHTML = "";
  sortiert.forEach((s, i) => {
    const li = document.createElement("li");
    li.innerHTML = spielerKarte(s.name, s.farbe, s.icon, s.punkte ?? 0, { rang: i + 1 });
    liste.appendChild(li);
  });
  $("wl-endstand-warten").hidden = api.istLeiter;
  const btn = $("wl-gesamtwertung-btn");
  btn.hidden = !(api.istLeiter && Boolean(api.olympiadeAnzahl));
  btn.onclick = () => api.zeigeGesamtwertung();
}
