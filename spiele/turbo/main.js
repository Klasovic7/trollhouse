// Trollhouse Turbo - Zeitjagd-Prototyp
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { baueStrecke, startPose, WAND_ABSTAND, STRECKEN, UNTERGRUND, streckeNachId } from "./strecke.js";
import { neuesAuto, schritt, P } from "./physik.js";
import { botEingabe } from "./bot.js";
import { baueWelt, baueHimmel } from "./welt.js";
import { baueAuto, ladeModell, MODELLE } from "./auto.js";
import { Partikel } from "./effekte.js";
import { Ton } from "./ton.js";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const BOT = params.has("bot");
const DEBUG = params.has("debug");
const FAST = params.has("fast");
const EINGEBETTET = window.parent !== window;
const ZEIT_PARAM = Number(params.get("zeit")) || 0;   // Test: Sekunden direkt vorgeben
let dauerMin = 5, dauerDarfWaehlen = !EINGEBETTET;      // im Raum bestimmt der Spielleiter die Dauer
if (!EINGEBETTET) { try { const g = Number(localStorage.getItem("tt_dauer")); if ([3, 4, 5].includes(g)) dauerMin = g; } catch (_) {} }
let SESSION_S = ZEIT_PARAM || dauerMin * 60;
const touch = matchMedia("(pointer: coarse)").matches;
const fmt = (t) => { if (t == null || !isFinite(t)) return "--:--.--"; const m = Math.floor(t / 60); const s = t - m * 60; return m + ":" + (s < 10 ? "0" : "") + s.toFixed(2); };
const fmtD = (d) => (d >= 0 ? "+" : "-") + Math.abs(d).toFixed(2);

// ---------------- Renderer
const canvas = $("c");
let renderer;
try { renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: "high-performance" }); }
catch (e) { $("lade").textContent = "Dein Gerät unterstützt kein WebGL."; throw e; }
renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1.0;
renderer.outputColorSpace = THREE.SRGBColorSpace;

const Q = { pr: Math.min(window.devicePixelRatio || 1, touch ? 1.6 : 2), bloom: true, schatten: touch ? 1024 : 2048 };
if (params.get("q") === "low") { Q.pr = 0.8; Q.bloom = false; Q.schatten = 1024; }
if (params.get("pr")) Q.pr = Number(params.get("pr"));
if (params.has("nobloom")) Q.bloom = false;

const STRECKE_ID = params.get("strecke") || (() => { try { return localStorage.getItem("tt_strecke"); } catch (_) { return null; } })() || "tal";
const S = baueStrecke(streckeNachId(STRECKE_ID));
const MEDAILLEN = S.def.medaillen || { autor: 26.8, gold: 28.8, silber: 31.5, bronze: 36 };   // Sekunden, Stehstart, aus Test-Bot geeicht
const world = baueWelt(S, { schatten: Q.schatten });
const { scene } = world;

// Himmels-Reflexion fuer Lack und Glas
{
  const pm = new THREE.PMREMGenerator(renderer);
  const es = new THREE.Scene(); es.add(baueHimmel(world.sunDir, world.thema.himmel));
  scene.environment = pm.fromScene(es, 0.03).texture;
  scene.environmentIntensity = world.thema.env;
  renderer.toneMappingExposure = world.thema.belichtung;
  pm.dispose();
}

const camera = new THREE.PerspectiveCamera(64, 1, 0.3, 2600);
scene.add(camera);

// ---------------- Auto, Geist, Partikel
const FARBEN = [0xff3b30, 0xffb000, 0x2d9cff, 0x35d07f, 0xc44dff];
const farbe = FARBEN[Number(params.get("farbe") || 0) % FARBEN.length];
const car = baueAuto(farbe); scene.add(car.gruppe);
if (world.thema.flutlicht) {   // Scheinwerfer bei Nacht
  const spot = new THREE.SpotLight(0xfff1d6, 1500, 95, 0.46, 0.6, 2);
  spot.position.set(0, 0.9, 1.6); spot.target.position.set(0, 0, 26); car.gruppe.add(spot, spot.target);
}
const geist = baueAuto(0x66e0ff, { geist: true }); geist.gruppe.visible = false; scene.add(geist.gruppe);
let MODELL_ID = (() => { try { return localStorage.getItem("tt_auto"); } catch (_) { return null; } })() || "race-future";
if (params.get("modell")) MODELL_ID = params.get("modell");
if (!MODELLE.some((m) => m.id === MODELL_ID)) MODELL_ID = MODELLE[0].id;
function setzeModell(id) { MODELL_ID = id; ladeModell(car, id); ladeModell(geist, id); }
setzeModell(MODELL_ID);
const rauch = new Partikel(420), funken = new Partikel(260, { additiv: true }), feuer = new Partikel(220, { additiv: true });
scene.add(rauch.punkte, funken.punkte, feuer.punkte);
rauch.punkte.renderOrder = 5; funken.punkte.renderOrder = 6; feuer.punkte.renderOrder = 6;

// ---------------- Nachbearbeitung
let composer = null, bloomPass = null;
function baueComposer() {
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(256, 256), world.thema.bloom, 0.55, world.thema.flutlicht ? 0.9 : 1.35);
  composer.addPass(bloomPass);
  composer.addPass(new OutputPass());
}
baueComposer();
function groesse() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setPixelRatio(Q.pr); renderer.setSize(w, h, false);
  composer.setPixelRatio(Q.pr); composer.setSize(w, h);
  camera.aspect = w / h; camera.updateProjectionMatrix();
  fx.width = w; fx.height = h;
}
const fx = $("fx"), fxc = fx.getContext("2d");
window.addEventListener("resize", groesse);
groesse();

// ---------------- Eingabe
const taste = { l: false, r: false, b: false, g: false };
const tstate = { l: false, r: false, b: false, g: false };
const keyMap = { ArrowLeft: "l", KeyA: "l", ArrowRight: "r", KeyD: "r", ArrowDown: "b", KeyS: "b", Space: "b", ShiftLeft: "b", ArrowUp: "g", KeyW: "g" };
window.addEventListener("keydown", (e) => {
  if (keyMap[e.code]) { taste[keyMap[e.code]] = true; e.preventDefault(); }
  if (e.repeat) return;
  if (e.code === "KeyR" || e.code === "Enter") { if (zustand === "run" || zustand === "countdown") neustart(); else if (zustand === "menu" && !EINGEBETTET) starte(); else if (zustand === "ende" && !EINGEBETTET) starte(); }
  if (e.code === "KeyM") schalteTon();
});
window.addEventListener("keyup", (e) => { if (keyMap[e.code]) taste[keyMap[e.code]] = false; });
// Touch-Steuerung: der Zustand wird bei JEDEM Touch-Ereignis aus der Liste der gerade aufliegenden Finger neu berechnet
// (statt pro Knopf "gedrueckt/losgelassen" zu merken). So kann kein Knopf haengen bleiben, wenn ein pointerup verloren geht
// (iOS-Systemgesten, Benachrichtigung, Knopf wird ausgeblendet, Finger rutscht ab ...).
const TASTEN = { l: "t-l", r: "t-r", b: "t-b", g: "t-g" };
function setzeTasten(neu) {
  for (const k in TASTEN) {
    const an = !!neu[k];
    if (tstate[k] !== an) { tstate[k] = an; $(TASTEN[k]).classList.toggle("an", an); }
  }
}
function loseAlleTasten() { setzeTasten({}); mausKey = null; }
let mausKey = null;
function ausTouches(list) {
  const neu = {};
  for (const k in TASTEN) {
    const r = $(TASTEN[k]).getBoundingClientRect();
    if (r.width === 0) continue;
    for (let i = 0; i < list.length; i++) {
      const t = list[i];
      if (t.clientX >= r.left - 6 && t.clientX <= r.right + 6 && t.clientY >= r.top - 6 && t.clientY <= r.bottom + 6) { neu[k] = true; break; }
    }
  }
  if (mausKey) neu[mausKey] = true;
  setzeTasten(neu);
}
for (const ev of ["touchstart", "touchmove", "touchend", "touchcancel"]) {
  window.addEventListener(ev, (e) => {
    ausTouches(e.touches);
    if (ev !== "touchend" && ev !== "touchcancel" && e.target && e.target.closest && e.target.closest("#steuer")) e.preventDefault();
  }, { passive: false, capture: true });
}
// Maus/Stift (Touch laeuft ueber die Touch-Ereignisse oben)
function binde(id, key) {
  const el = $(id);
  const an = (e) => { if (e.pointerType === "touch") return; mausKey = key; setzeTasten({ [key]: true }); e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (_) {} };
  const aus = (e) => { if (e.pointerType === "touch") return; mausKey = null; setzeTasten({}); e.preventDefault(); };
  el.addEventListener("pointerdown", an); el.addEventListener("pointerup", aus); el.addEventListener("pointercancel", aus); el.addEventListener("lostpointercapture", aus);
  el.addEventListener("contextmenu", (e) => e.preventDefault());
}
binde("t-l", "l"); binde("t-r", "r"); binde("t-b", "b"); binde("t-g", "g");
// Sicherheitsnetz: alles loslassen, wenn die Seite den Fokus verliert oder sich Ausrichtung/Groesse aendert
window.addEventListener("blur", loseAlleTasten);
window.addEventListener("pagehide", loseAlleTasten);
window.addEventListener("orientationchange", loseAlleTasten);
document.addEventListener("visibilitychange", () => { if (document.hidden) loseAlleTasten(); });
$("b-restart").addEventListener("click", () => neustart());
$("b-ton").addEventListener("click", () => schalteTon());
const verlassen = () => { if (window.parent !== window) window.parent.postMessage({ typ: "turbo-verlassen" }, "*"); else history.back(); };
$("b-exit").addEventListener("click", verlassen); $("b-quer-zurueck").addEventListener("click", verlassen);
function wechsleStrecke(id) { const u = new URL(location.href); u.searchParams.set("strecke", id); location.replace(u.toString()); }
function sperreStrecke() {
  const fix = EINGEBETTET && !dauerDarfWaehlen;
  const w = document.getElementById("strecken"); if (w) w.classList.toggle("fix", fix);
  const h = document.getElementById("h-strecke"); if (h) h.textContent = fix ? "Strecke · wählt die Spielleitung" : "Strecke";
}
function setzeDauer(min) {
  sperreStrecke();
  dauerMin = min;
  document.querySelectorAll("#dauerwahl .sw").forEach((b) => { b.classList.toggle("an", Number(b.dataset.min) === min); b.disabled = !dauerDarfWaehlen; b.style.opacity = dauerDarfWaehlen ? "" : (Number(b.dataset.min) === min ? "1" : ".45"); });
  const t = document.getElementById("dauertext"); if (t) t.textContent = min + " Minuten";
  const h = document.getElementById("dauerhinweis"); if (h) h.textContent = dauerDarfWaehlen ? "" : "Die Spielleitung legt die Dauer fest.";
}
window.addEventListener("message", (e) => {
  const d = e.data || {};
  if (d.typ === "dauer" && [3, 4, 5].includes(d.min)) { dauerDarfWaehlen = !!d.leiter; setzeDauer(d.min); }
  if (d.typ === "gegner" && Array.isArray(d.liste)) { gegnerListe = d.liste.filter((g) => !g.strecke || g.strecke === S.id); zeigeGegner(); }
});
let gegnerListe = [];
function zeigeGegner() {
  const box = $("gegner"); if (!box) return;
  const esc = (t) => String(t || "?").replace(/[<>&]/g, "");
  const alle = gegnerListe.map((g) => ({ name: g.name, zeit: g.zeit, ich: false }));
  if (best != null) alle.push({ name: "Du", zeit: best, ich: true });
  alle.sort((a, b) => a.zeit - b.zeit);
  if (!alle.length) { box.innerHTML = '<div class="leer">noch keine Zeiten</div>'; return; }
  const zeile = (g, i) => `<div class="z${g.ich ? " ich" : ""}"><span>${i + 1}. ${esc(g.name)}</span><i>${fmt(g.zeit)}</i></div>`;
  let teil = alle.slice(0, 5).map(zeile);
  const ichIdx = alle.findIndex((g) => g.ich);
  if (ichIdx >= 5) teil.push(zeile(alle[ichIdx], ichIdx));
  box.innerHTML = teil.join("");
}
const meldeBestzeit = (z) => { if (window.parent !== window) window.parent.postMessage({ typ: "bestzeit", zeit: z, strecke: S.id, laeufe: runden }, "*"); };
const meldeLaeufe = () => { if (window.parent !== window) window.parent.postMessage({ typ: "laeufe", n: runden, strecke: S.id }, "*"); };
{
  const wahl = $("strecken");
  STRECKEN.forEach((t) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "sw" + (t.id === S.id ? " an" : "");
    const ug = UNTERGRUND[t.untergrund || "asphalt"]; b.title = ug.name;
    b.innerHTML = "<b>" + ug.icon + " " + t.name + "</b><small>" + (t.km != null ? t.km.toFixed(1).replace(".", ",") + " km" : "") + "</small>";
    b.addEventListener("click", () => {
      if (t.id === S.id) return;
      if (EINGEBETTET) { if (dauerDarfWaehlen) window.parent.postMessage({ typ: "strecke-wahl", id: t.id }, "*"); return; }   // im Raum waehlt nur die Spielleitung
      try { localStorage.setItem("tt_strecke", t.id); } catch (_) {}
      wechsleStrecke(t.id);
    });
    wahl.appendChild(b);
  });
  // Auto wählen (wirkt sofort, ohne Neuladen)
  const autos = $("autos") || document.createElement("div");
  MODELLE.forEach((m) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "sw" + (m.id === MODELL_ID ? " an" : "");
    b.innerHTML = "<b>" + m.icon + " " + m.name + "</b>";
    b.addEventListener("click", () => {
      try { localStorage.setItem("tt_auto", m.id); } catch (_) {}
      autos.querySelectorAll(".sw").forEach((x) => x.classList.remove("an")); b.classList.add("an");
      setzeModell(m.id);
    });
    autos.appendChild(b);
  });
  // Dauer wählen (im Raum nur die Spielleitung, damit für alle gleich viele Versuche bleiben)
  const dauer = $("dauerwahl");
  [3, 4, 5].forEach((m) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "sw"; b.dataset.min = m; b.innerHTML = "<b>⏱ " + m + " min</b>";
    b.addEventListener("click", () => {
      if (!dauerDarfWaehlen) return;
      if (EINGEBETTET) window.parent.postMessage({ typ: "dauer-wahl", min: m }, "*");
      else { try { localStorage.setItem("tt_dauer", String(m)); } catch (_) {} setzeDauer(m); }
    });
    dauer.appendChild(b);
  });
  setzeDauer(dauerMin);
}
$("menue").addEventListener("pointerdown", () => { vollbild(); ton.start(); }, { once: true });
let LOBBY = null;
function zeigeLobby() {
  const box = $("lobby"), btn = $("b-start"); if (!LOBBY) return;
  const L = LOBBY, andere = L.spieler.length;
  $("b-menue-exit").textContent = L.leiter ? "← Spielauswahl" : "Raum verlassen";
  box.hidden = andere === 0;
  box.innerHTML = L.spieler.map((s) => `<div class="la${s.bereit ? " ok" : ""}" title="${String(s.name).replace(/[<>&"]/g, "")}">` +
    (s.bild ? `<img src="${s.bild}" alt="">` : `<span class="t">${String(s.name).slice(0, 1).replace(/[<>&"]/g, "")}</span>`) + (s.bereit ? "<i>✓</i>" : "") + "</div>").join("") +
    (andere ? `<div class="lt">${L.spieler.filter((s) => s.bereit).length} von ${andere} bereit</div>` : "");
  if (L.leiter) { btn.textContent = "START"; btn.disabled = !L.alleBereit; }
  else if (L.laufend) { btn.textContent = "STARTEN"; btn.disabled = false; }
  else if (L.ichBereit) { btn.textContent = "✓ BEREIT"; btn.disabled = true; }
  else { btn.textContent = "BEREIT"; btn.disabled = false; }
}
window.addEventListener("message", (e) => {
  const d = e.data || {};
  if (d.typ === "lobby" && Array.isArray(d.spieler)) { LOBBY = d; zeigeLobby(); const be = $("b-ende-exit"); be.hidden = false; be.textContent = d.leiter ? "← Spielauswahl" : "Raum verlassen"; }
  if (d.typ === "stand" && Array.isArray(d.liste)) { STAND = d.liste; if (zustand === "ende" && !$("ende").classList.contains("weg")) zeigeStand(); }
  if (d.typ === "los" && zustand === "menu") starte();
  if (d.typ === "strecke" && d.id !== S.id && zustand === "menu" && STRECKEN.some((t) => t.id === d.id)) wechsleStrecke(d.id);
});
$("b-menue-exit").addEventListener("click", () => verlassen());
$("b-start").addEventListener("click", () => {
  if (EINGEBETTET && LOBBY && !(LOBBY.laufend && !LOBBY.leiter)) {
    if (LOBBY.leiter) { if (LOBBY.alleBereit) window.parent.postMessage({ typ: "start" }, "*"); }
    else if (!LOBBY.ichBereit) window.parent.postMessage({ typ: "bereit" }, "*");
    return;
  }
  starte();
});
$("b-nochmal").addEventListener("click", () => { if (EINGEBETTET) zumMenue(); else starte(); });
document.addEventListener("contextmenu", (e) => e.preventDefault());

function eingabe() {
  let l = (taste.l || tstate.l ? -1 : 0) + (taste.r || tstate.r ? 1 : 0);   // + = rechts
  let b = taste.b || tstate.b;
  const gp = navigator.getGamepads ? navigator.getGamepads()[0] : null;
  if (gp) { const ax = gp.axes[0] || 0; if (Math.abs(ax) > 0.12) l = ax; if (gp.buttons[6] && gp.buttons[6].value > 0.3 || gp.buttons[1] && gp.buttons[1].pressed) b = true; }
  let g = taste.g || tstate.g;
  if (gp && gp.buttons[7] && gp.buttons[7].value > 0.1 || gp && gp.buttons[0] && gp.buttons[0].pressed) g = true;
  return { lenk: l, bremse: b, gas: g };
}

// ---------------- Ton
const ton = new Ton();
function schalteTon() { ton.stumm(!ton.aus); $("b-ton").textContent = ton.aus ? "🔇" : "🔊"; }

// ---------------- Spielzustand
let zustand = "menu";                 // menu | countdown | run | ende
let a = neuesAuto(startPose(S));
let lapDist = 0;
let imZiel = false, imZielT = 0, zielZeit = 0;   // nach dem Ziel kurz ausrollen, dann Neustart aus dem Stand
let simT = 0, sessionStart = 0, lapStart = 0, cpNext = 0, prevP = a.s;
let best = null, bestSplits = [], curSplits = [], letzte = null, runden = 0;
let ghostRec = [], ghostBest = null, recAkk = 0;
let cdKurz = false, sessionLaeuft = false, cdZeit = 0, cdLetzte = 0, ende = null, falsch = 0;

function medaille(t) {
  if (t <= MEDAILLEN.autor) return ["AUTOR", "#6ee7a0"];
  if (t <= MEDAILLEN.gold) return ["GOLD", "#ffd24a"];
  if (t <= MEDAILLEN.silber) return ["SILBER", "#d5dbe6"];
  if (t <= MEDAILLEN.bronze) return ["BRONZE", "#e0955a"];
  return ["", "#fff"];
}

function setzeTore() { S.checkpoints.forEach((_, k) => world.setzeTor(k, k < cpNext ? 1 : k === cpNext ? 2 : 0)); }

function platziere(pose) {
  a = neuesAuto(pose);
}
let letzteFahrt = false;   // Zeit ist um: die laufende Fahrt darf noch beendet werden, eine neue gibt es nicht mehr
function neustart() {
  if (letzteFahrt && zustand === "run") { toast("Zeit abgelaufen - fahr zu Ende oder tippe auf Beenden", "#ff5470", 2200); return; }
  qSperreBis = performance.now() + 3000;
  imZiel = false;
  platziere(startPose(S));
  cpNext = 0; lapDist = 0; lapStart = simT; prevP = a.s; curSplits = []; ghostRec = []; recAkk = 0; falsch = 0;
  setzeTore(); blitz();
  if (zustand === "run" || zustand === "countdown") startAmpel(true);
}
function startAmpel(kurz) {
  zustand = "countdown"; cdKurz = kurz; cdZeit = 0; cdLetzte = -1;
  $("ampel").className = "an"; for (const l of $("ampel").children) l.className = "";
}
function vollbild() {
  // Als Home-Bildschirm-App gibt es keine Browserleisten - dort kein Vollbild anfragen (kann das Bild schwarz machen)
  let standalone = false; try { standalone = navigator.standalone === true || matchMedia("(display-mode: standalone)").matches || matchMedia("(display-mode: fullscreen)").matches; } catch (_) {}
  if (standalone) return;
  try { const el = document.documentElement, f = el.requestFullscreen || el.webkitRequestFullscreen; if (f && !document.fullscreenElement) { const r = f.call(el); if (r && r.catch) r.catch(() => {}); } } catch (_) {}
}
function starte() {
  loseAlleTasten();
  qSperreBis = performance.now() + 6000;
  ton.start();
  vollbild(); SPUR.leeren();
  $("menue").classList.add("weg"); $("ende").classList.add("weg"); document.body.classList.add("im-spiel");
  platziere(startPose(S)); cpNext = 0; lapDist = 0; curSplits = []; ghostRec = []; recAkk = 0; best = null; bestSplits = []; ghostBest = null; letzte = null; runden = 0; falsch = 0;
  $("best").textContent = fmt(null); meldeBestzeit(null); zeigeGegner(); $("letzte").textContent = "--"; $("runden").textContent = "0"; $("medal").textContent = "";
  setzeTore();
  SESSION_S = ZEIT_PARAM || dauerMin * 60;
  sessionLaeuft = false; letzteFahrt = false; $("b-beenden").hidden = true; meldeFertig(false); startAmpel(false);
  simT = 0; lapStart = 0; prevP = a.s;
}
function beendeSession(schnell) {
  if (zustand === "ende") return;
  loseAlleTasten();
  zustand = "ende"; ende = performance.now(); imZiel = false; $("b-beenden").hidden = true;
  ton.ziel(); SPUR.ende();
  meldeFertig(true);
  toast(schnell ? "Fahrt beendet" : "Zeit abgelaufen", "#ff5470", 1800);
  setTimeout(() => {
    if (zustand !== "ende") return;
    const [m, c] = best != null ? medaille(best) : ["", "#fff"];
    $("e-best").textContent = fmt(best);
    $("e-medal").textContent = m || (best != null ? "Keine Medaille" : "Kein gültiger Lauf");
    $("e-medal").style.color = c;
    $("e-runden").textContent = runden;
    $("b-nochmal").textContent = EINGEBETTET ? "ZUM MENÜ" : "NOCHMAL";
    zeigeStand();
    $("ende").classList.remove("weg");
  }, schnell ? 500 : 1600);
}
// Zurueck ins Menue (im Raum: dort gibt es wieder Bereit/Start)
function zumMenue() {
  if (window.parent !== window) window.parent.postMessage({ typ: "menue" }, "*");
  loseAlleTasten();
  imZiel = false; platziere(startPose(S)); SPUR.ende();
  $("ende").classList.add("weg"); $("menue").classList.remove("weg"); document.body.classList.remove("im-spiel");
  zustand = "menu";
}
const meldeFertig = (an) => { if (window.parent !== window) window.parent.postMessage({ typ: "fertig", an }, "*"); };
let STAND = [];
function zeigeStand() {
  const box = $("e-stand"); if (!EINGEBETTET || !STAND.length) { box.hidden = true; return; }
  const esc = (t) => String(t == null ? "" : t).replace(/[<>&"]/g, "");
  // Rangliste aller Mitspielenden: beste Zeit und gueltige Laeufe (ohne Zeit ganz unten)
  const sortiert = [...STAND].sort((x, y) => (x.zeit > 0 ? x.zeit : 1e9) - (y.zeit > 0 ? y.zeit : 1e9));
  const zeile = (x, i) => `<div class="st ${x.fertig ? "fertig" : "faehrt"}"><span class="pl">${x.zeit > 0 ? i + 1 : "–"}</span>` + (x.bild ? `<img src="${esc(x.bild)}" alt="">` : `<span class="t">${esc(String(x.name).slice(0, 1))}</span>`) +
    `<span class="n">${esc(x.name)}${x.ich ? " (du)" : ""}</span><span class="r">${x.zeit > 0 ? "<b>" + fmt(x.zeit) + "</b>" : "keine Zeit"} · ${x.laeufe || 0} ${(x.laeufe || 0) === 1 ? "Lauf" : "Läufe"}${x.fertig ? "" : " · fährt noch"}</span></div>`;
  $("e-stand-liste").innerHTML = sortiert.map(zeile).join("");
  box.hidden = false;
}
$("b-beenden").addEventListener("click", () => beendeSession(true));
$("b-ende-exit").addEventListener("click", () => verlassen());

// ---------------- Runden-Logik (laeuft im Physikschritt)
function rundenLogik(dt) {
  const p = a.s;
  if (imZiel) { prevP = p; return; }
  // Ziellinie (A -> B): einmal vorwaerts ueberfahren
  if (prevP < S.zielS && p >= S.zielS) {
    {
      const f = (S.zielS - prevP) / Math.max(1e-6, p - prevP);
      const tc = simT - dt * (1 - f);
      const zeit = tc - lapStart;
      runden++; letzte = zeit; meldeLaeufe();
      $("letzte").textContent = fmt(zeit); $("runden").textContent = runden;
      const neuBest = best == null || zeit < best - 1e-4;
      if (neuBest) {
        const alt = best; best = zeit; bestSplits = curSplits.slice(); ghostBest = ghostRec.slice();
        $("best").textContent = fmt(best); meldeBestzeit(best); zeigeGegner();
        const [m, c] = medaille(best); const mt = $("medal"); mt.textContent = m; mt.style.color = c;
        toast((alt == null ? "ZIEL  " : "NEUE BESTZEIT  ") + fmt(zeit) + (alt != null ? "   " + fmtD(zeit - alt) : "") + (m ? "  ·  " + m : ""), "#ffe14d", 2400);
      } else toast("ZIEL  " + fmt(zeit) + "   " + fmtD(zeit - best), "#ffffff", 1800);
      ton.ziel();
      imZiel = true; imZielT = 0; zielZeit = zeit;
    }
  }
  // Falsche Richtung
  const richt = a.vx * S.tx[a.i] + a.vz * S.tz[a.i];
  if (richt < -3 && Math.hypot(a.vx, a.vz) > 5) falsch += dt; else falsch = Math.max(0, falsch - dt * 2);
  $("falsch").classList.toggle("an", falsch > 1.2 && zustand === "run");
  prevP = p;
}
let deltaT = 0;

// ---------------- Toast / Blitz
let toastT = 0;
function toast(text, farbe = "#fff", dauer = 1400) {
  const t = $("toast"); t.textContent = text; t.style.color = farbe; t.classList.add("an");
  clearTimeout(toastT); toastT = setTimeout(() => t.classList.remove("an"), dauer);
}
function blitz() { const b = $("blitz"); b.classList.remove("an"); void b.offsetWidth; b.classList.add("an"); }


// ---------------- Absturz-Schutz: Kontextverlust (Speicher knapp) und Fehlerhinweis auf dem Bildschirm
{
  const hinweis = (t) => { const e = $("dbg"); if (!e) return; e.style.cssText = "position:fixed;left:8px;bottom:8px;max-width:70vw;z-index:60;font:600 11px system-ui;color:#fff;background:rgba(190,30,50,.85);padding:6px 9px;border-radius:8px;pointer-events:none;display:block"; e.textContent = t; clearTimeout(hinweis.t); hinweis.t = setTimeout(() => { if (!DEBUG) e.style.display = "none"; }, 9000); };
  renderer.domElement.addEventListener("webglcontextlost", (ev) => { ev.preventDefault(); hinweis("Grafik angehalten - wird neu geladen …"); }, false);
  renderer.domElement.addEventListener("webglcontextrestored", () => { hinweis("Grafik wieder da"); setTimeout(() => location.reload(), 400); }, false);
  window.addEventListener("error", (ev) => hinweis("Fehler: " + String(ev.message || ev.error || "?").slice(0, 120)));
  window.addEventListener("unhandledrejection", (ev) => hinweis("Fehler: " + String((ev.reason && ev.reason.message) || ev.reason || "?").slice(0, 120)));
}

// ---------------- Kamera
const camTmp = {};
const cam = { yaw: a.theta, pos: new THREE.Vector3(), y: 0, schub: 0, init: false, orbit: 0 };
function kamera(dt, t) {
  const sp = Math.hypot(a.vx, a.vz), sf = Math.min(1, sp / 62);
  if (zustand === "menu") {
    cam.orbit += dt * 0.22;
    const r = 8.6, ang = cam.orbit + a.theta + 0.7;
    camera.position.set(a.x + Math.sin(ang) * r, a.y + 2.5 + Math.sin(cam.orbit * 0.7) * 0.5, a.z + Math.cos(ang) * r);
    camera.lookAt(a.x, a.y + 0.8, a.z);
    camera.fov = 48;
    const W = window.innerWidth, Hh = window.innerHeight;
    if (W / Hh > 1.3) camera.setViewOffset(W, Hh, -W * 0.2, 0, W, Hh); else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    cam.yaw = a.theta; cam.y = camera.position.y; cam.pos.copy(camera.position); cam.init = false;
    return;
  }
  if (camera.view && camera.view.enabled) { camera.clearViewOffset(); camera.updateProjectionMatrix(); }
  if (a.loop && a.loopT) {   // im Looping: Kamera hinter dem Auto, mit der Fahrbahn gedreht
    const T = a.loopT, N = a.loopN;
    const wunsch = new THREE.Vector3(a.x - T[0] * 8.6 + N[0] * 3.4, a.y - T[1] * 8.6 + N[1] * 3.4, a.z - T[2] * 8.6 + N[2] * 3.4);
    const nv = new THREE.Vector3(N[0], N[1], N[2]);
    if (!cam.loopInit) { cam.loopInit = true; cam.up = camera.up.clone(); }
    const kf = 1 - Math.exp(-13 * dt);
    camera.position.lerp(wunsch, kf); cam.up.lerp(nv, kf).normalize(); camera.up.copy(cam.up);
    camera.lookAt(a.x + T[0] * 5 + N[0], a.y + T[1] * 5 + N[1], a.z + T[2] * 5 + N[2]);
    cam.init = false; cam.yaw = a.theta;
    return;
  } else if (cam.loopInit) { cam.loopInit = false; camera.up.set(0, 1, 0); cam.init = false; }
  let ziel = a.theta;
  if (sp > 8) { const va = Math.atan2(a.vx, a.vz); let d = va - a.theta; d = Math.atan2(Math.sin(d), Math.cos(d)); ziel = a.theta + d * 0.40; }
  let d = ziel - cam.yaw; d = Math.atan2(Math.sin(d), Math.cos(d));
  cam.yaw += d * (1 - Math.exp(-(cam.init ? 7 : 40) * dt));
  const boost = a.boost > 0 ? 1 : 0;
  const dist = 8.1 + sf * 1.6 + boost * 0.9;
  const hoch = 2.25 + sf * 0.5;
  const sx = Math.sin(cam.yaw), sz = Math.cos(cam.yaw);
  const wunschY = a.y + hoch;
  if (!cam.init) { cam.y = wunschY; cam.init = true; }
  cam.y += (wunschY - cam.y) * (1 - Math.exp(-6 * dt));
  camera.position.set(a.x - sx * dist, cam.y, a.z - sz * dist);
  S.nahe(camera.position.x, camera.position.z, a.i, camTmp);
  const lim = camTmp.w / 2 + WAND_ABSTAND - 0.7;
  if (Math.abs(camTmp.lat) > lim) { const ex = Math.abs(camTmp.lat) - lim, sg = Math.sign(camTmp.lat); camera.position.x -= camTmp.rx * sg * ex; camera.position.z -= camTmp.rz * sg * ex; }
  cam.schub *= Math.exp(-5 * dt);
  const sh = (sf * sf * 0.035 + boost * 0.04 + cam.schub) * (zustand === "run" ? 1 : 0);
  if (sh > 0) camera.position.add(new THREE.Vector3((Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh, (Math.random() - 0.5) * sh));
  camera.lookAt(a.x + sx * 4.8, a.y + 1.35 + (a.luft ? a.vy * 0.04 : 0), a.z + sz * 4.8);
  const asp = camera.aspect, fb = asp < 1.2 ? Math.min(1.75, 1 + (1.2 / asp - 1) * 0.4) : 1;
  const fov = Math.min(112, (62 + 20 * sf * sf + boost * 7) * fb);
  if (Math.abs(camera.fov - fov) > 0.02) { camera.fov += (fov - camera.fov) * (1 - Math.exp(-5 * dt)); camera.updateProjectionMatrix(); }
}


// ---------------- Minikarte (Nordrichtung egal: Start zeigt immer nach rechts)
const KARTE = (() => {
  const cv = $("karte"), cx = cv.getContext("2d"), W = cv.width, H = cv.height, R = 18;
  const d0x = S.tx[2], d0z = S.tz[2], r0x = -d0z, r0z = d0x;
  const proj = (x, z) => [x * d0x + z * d0z, x * r0x + z * r0z];
  let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
  for (let i = 0; i < S.n; i += 2) { const [u, v] = proj(S.x[i], S.z[i]); x0 = Math.min(x0, u); x1 = Math.max(x1, u); y0 = Math.min(y0, v); y1 = Math.max(y1, v); }
  const sc = Math.min((W - 2 * R) / Math.max(1, x1 - x0), (H - 2 * R) / Math.max(1, y1 - y0));
  const ox = (W - (x1 - x0) * sc) / 2 - x0 * sc, oy = (H - (y1 - y0) * sc) / 2 - y0 * sc;
  const pt = (x, z) => { const [u, v] = proj(x, z); return [u * sc + ox, v * sc + oy]; };
  const bg = document.createElement("canvas"); bg.width = W; bg.height = H; const b = bg.getContext("2d");
  b.lineJoin = b.lineCap = "round";
  const bahn = () => { b.beginPath(); for (let i = 0; i < S.n; i += 2) { const [u, v] = pt(S.x[i], S.z[i]); i ? b.lineTo(u, v) : b.moveTo(u, v); } };
  bahn(); b.strokeStyle = "rgba(0,0,0,.55)"; b.lineWidth = 11; b.stroke();
  bahn(); b.strokeStyle = "rgba(235,242,255,.92)"; b.lineWidth = 6; b.stroke();
  const mk = (s, f) => { const i = Math.max(0, Math.min(S.n - 1, Math.round(s / S.ds))); const [u, v] = pt(S.x[i], S.z[i]); b.fillStyle = f; b.beginPath(); b.arc(u, v, 8, 0, 6.3); b.fill(); b.strokeStyle = "#fff"; b.lineWidth = 3; b.stroke(); };
  mk(S.startS, "#22c55e"); mk(S.zielS, "#ef4444");
  let z = 0;
  return (a) => {
    if ((z++ & 1) || !cv.offsetParent) return;
    cx.clearRect(0, 0, W, H); cx.drawImage(bg, 0, 0);
    const [u, v] = pt(a.x, a.z), hx = Math.sin(a.theta), hz = Math.cos(a.theta);
    const [dx, dy] = [hx * d0x + hz * d0z, hx * r0x + hz * r0z];
    const ang = Math.atan2(dy, dx);
    cx.save(); cx.translate(u, v); cx.rotate(ang);
    cx.fillStyle = "#ffd24a"; cx.strokeStyle = "#0a0e1a"; cx.lineWidth = 3;
    cx.beginPath(); cx.moveTo(13, 0); cx.lineTo(-9, 9); cx.lineTo(-5, 0); cx.lineTo(-9, -9); cx.closePath(); cx.stroke(); cx.fill();
    cx.restore();
  };
})();

// ---------------- Kontaktschatten unter dem Auto (damit es nicht schwebt)
const BLOB = (() => {
  const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d");
  const gr = g.createRadialGradient(64, 64, 4, 64, 64, 62); gr.addColorStop(0, "rgba(0,0,0,.95)"); gr.addColorStop(.45, "rgba(0,0,0,.6)"); gr.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat); mesh.rotation.order = "YXZ"; mesh.renderOrder = 2; mesh.frustumCulled = false;
  scene.add(mesh); return { mesh, mat, tmp: {} };
})();
function zeigeBlob() {
  const m = BLOB.mesh;
  if (a.loop) { m.visible = false; return; }
  S.nahe(a.x, a.z, a.i, BLOB.tmp);
  const gy = BLOB.tmp.y, h = Math.max(0, a.y - gy);
  m.visible = true;
  const i = a.i, i1 = Math.min(S.n - 1, i + 3), i0 = Math.max(0, i - 3);
  const sl = (S.y[i1] - S.y[i0]) / Math.max(1e-3, (i1 - i0) * S.ds);
  const tsin = Math.cos(Math.atan2(S.tx[i], S.tz[i]) - a.theta);
  m.position.set(a.x, gy + 0.06, a.z);
  m.rotation.set(-Math.PI / 2 + Math.atan(sl * (tsin >= 0 ? 1 : -1)), a.theta, 0);
  const k = 1 + h * 0.35;
  m.scale.set(3.3 * k, 6.2 * k, 1);
  BLOB.mat.opacity = Math.max(0, 0.7 / (1 + h * 0.9));
}


// ---------------- Reifenspuren (Ringpuffer aus Streifen auf dem Boden)
const SPUR = (() => {
  const MAX = 2600, pos = new Float32Array(MAX * 12), col = new Float32Array(MAX * 16), idx = new Uint32Array(MAX * 6);
  for (let k = 0; k < MAX; k++) { const v = k * 4; idx.set([v, v + 1, v + 2, v + 1, v + 3, v + 2], k * 6); }
  const geo = new THREE.BufferGeometry();
  const pa = new THREE.BufferAttribute(pos, 3), ca = new THREE.BufferAttribute(col, 4);
  geo.setAttribute("position", pa); geo.setAttribute("color", ca); geo.setIndex(new THREE.BufferAttribute(idx, 1));
  pa.setUsage(THREE.DynamicDrawUsage); ca.setUsage(THREE.DynamicDrawUsage);
  const mat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3, toneMapped: false });
  const mesh = new THREE.Mesh(geo, mat); mesh.frustumCulled = false; mesh.renderOrder = 1; scene.add(mesh);
  let k = 0; const vor = [null, null];
  return {
    leeren() { col.fill(0); ca.needsUpdate = true; vor[0] = vor[1] = null; },
    ende() { vor[0] = vor[1] = null; },
    punkt(w, x, y, z, r, g, b, al, breite) {
      const p0 = vor[w]; vor[w] = [x, y, z];
      if (!p0) return;
      const dx = x - p0[0], dz = z - p0[2], L = Math.hypot(dx, dz);
      if (L < 0.05 || L > 6) return;
      const nx = -dz / L * breite / 2, nz = dx / L * breite / 2;
      const o = k * 12, c = k * 16;
      const q = [p0[0] + nx, p0[1], p0[2] + nz, p0[0] - nx, p0[1], p0[2] - nz, x + nx, y, z + nz, x - nx, y, z - nz];
      for (let i = 0; i < 12; i++) pos[o + i] = q[i];
      for (let i = 0; i < 4; i++) { col[c + i * 4] = r; col[c + i * 4 + 1] = g; col[c + i * 4 + 2] = b; col[c + i * 4 + 3] = al; }
      pa.addUpdateRange(o, 12); ca.addUpdateRange(c, 16); pa.needsUpdate = true; ca.needsUpdate = true;
      k = (k + 1) % MAX;
    },
  };
})();
function spuren() {
  const sp = Math.hypot(a.vx, a.vz);
  if (a.luft || a.loop || zustand !== "run" || a.fl === 2 || sp < 8) { SPUR.ende(); return; }
  const slip = Math.abs(a.vR), U = S.untergrund;
  const rutsch = slip > 3 || a.driftend || (a.bremsend && sp > 25);
  const staerke = Math.min(1, Math.max((slip - 2) / 8, a.driftend ? 0.6 : 0, a.bremsend && sp > 25 ? 0.5 : 0));
  let al, f;
  if (U === "asphalt") { if (!rutsch) { SPUR.ende(); return; } al = 0.12 + 0.5 * staerke; f = [0.04, 0.04, 0.05]; }
  else { al = 0.3 + 0.35 * staerke; f = U === "eis" ? [0.35, 0.48, 0.65] : U === "sand" ? [0.42, 0.28, 0.14] : [0.14, 0.1, 0.06]; }
  const ft = Math.sin(a.theta), fz = Math.cos(a.theta), rx = -fz, rz = ft, gy = BLOB.tmp.y + 0.05;
  for (let w = 0; w < 2; w++) {
    const sg = w ? 1 : -1;
    SPUR.punkt(w, a.x - ft * 1.35 + rx * 0.95 * sg, gy, a.z - fz * 1.35 + rz * 0.95 * sg, f[0], f[1], f[2], al, 0.32);
  }
}

// ---------------- Visuelle Aktualisierung des Autos
let radLauf = 0;
const _T = new THREE.Vector3(), _N = new THREE.Vector3(), _X = new THREE.Vector3(), _M = new THREE.Matrix4();
function zeigeAuto(dt, t) {
  const sp = Math.hypot(a.vx, a.vz), sf = Math.min(1, sp / 62);
  car.gruppe.position.set(a.x, a.y, a.z);
  if (a.loop && a.loopT) {   // kopfueber in der Schleife: Auto richtet sich nach Bahn und Fahrbahnnormale
    const T = a.loopT, N = a.loopN;
    _T.set(T[0], T[1], T[2]); _N.set(N[0], N[1], N[2]); _X.crossVectors(_N, _T).normalize();
    _M.makeBasis(_X, _N, _T); car.gruppe.quaternion.setFromRotationMatrix(_M);
  } else car.gruppe.rotation.y = a.theta;
  // Nicken aus Steigung bzw. Flugbahn
  const i = a.i, n = S.n, k = 3;
  const i1 = Math.min(n - 1, i + k), i0 = Math.max(0, i - k);
  const sl = (S.y[i1] - S.y[i0]) / Math.max(1e-3, (i1 - i0) * S.ds);
  const tsin = Math.cos(Math.atan2(S.tx[i], S.tz[i]) - a.theta);
  let nick = -Math.atan(sl * (tsin >= 0 ? 1 : -1));
  if (a.luft) nick = -Math.atan2(a.vy, Math.max(8, a.vF)) * 0.9;
  if (a.loop) nick = 0;
  a.nickV += (nick - a.nickV) * (1 - Math.exp(-9 * dt));
  // Karosserie: bremsen = Nase nach unten, anfahren = Nase nach oben, Kurven = nach aussen neigen
  const gasZiel = zustand === "run" && !a.luft && !a.bremsend && a.vF < 30 ? -0.045 * (1 - a.vF / 30) : 0;
  const nickZiel = (a.bremsend ? 0.075 : 0) + gasZiel;
  car.dive = (car.dive || 0) + (nickZiel - (car.dive || 0)) * (1 - Math.exp(-7 * dt));
  car.karosse.rotation.x = a.nickV + car.dive - (a.boost > 0 ? 0.03 : 0);
  const rollZiel = a.luft ? 0 : -(a.lenk * sf * 0.15 + Math.max(-0.1, Math.min(0.1, a.vR * 0.011)));
  car.karosse.rotation.z += (rollZiel - car.karosse.rotation.z) * (1 - Math.exp(-9 * dt));
  car.karosse.position.y = 0.0;
  radLauf += a.vF * dt / 0.37;
  for (const r of car.raeder) { r.dreh.rotation.x = radLauf; if (r.vorn) r.lenk.rotation.y = -a.lenk * 0.5; }
  car.bremsMat.emissiveIntensity = a.bremsend ? 4 : 0.6;
  const b = a.boost > 0;
  for (let q = 0; q < car.flammen.length; q++) {
    const f = car.flammen[q]; f.visible = b;
    if (b) f.scale.set(1, 1, (0.7 + Math.random() * 0.7) * (q % 2 ? 1.1 : 1.7) * Math.min(1, a.boost * 3));
  }
  if (car.glow) { car.glow.material.opacity += ((b ? 0.9 : 0.28 + sf * 0.25) - car.glow.material.opacity) * (1 - Math.exp(-8 * dt)); car.glow.material.color.setHex(b ? 0xffa040 : 0xffffff); }

  // Geist
  if (ghostBest && zustand === "run") {
    const lt = (simT - lapStart) * 30, i0 = Math.floor(lt);
    const stride = 5, cnt = ghostBest.length / stride;
    if (i0 + 1 < cnt) {
      const u = lt - i0, o0 = i0 * stride, o1 = o0 + stride, g = ghostBest;
      const th0 = g[o0 + 4], th1 = g[o1 + 4]; let dth = th1 - th0; dth = Math.atan2(Math.sin(dth), Math.cos(dth));
      geist.gruppe.position.set(g[o0 + 1] + (g[o1 + 1] - g[o0 + 1]) * u, g[o0 + 2] + (g[o1 + 2] - g[o0 + 2]) * u, g[o0 + 3] + (g[o1 + 3] - g[o0 + 3]) * u);
      geist.gruppe.rotation.y = th0 + dth * u; geist.gruppe.visible = true;
      for (const r of geist.raeder) r.dreh.rotation.x = radLauf;
    } else geist.gruppe.visible = false;
  } else geist.gruppe.visible = false;
}

// ---------------- Effekte pro Frame
function effekte(dt, t) {
  const sp = Math.hypot(a.vx, a.vz);
  const ft = Math.sin(a.theta), fz = Math.cos(a.theta), rx = -fz, rz = ft;
  if (!a.luft && zustand === "run") {
    const schl = Math.abs(a.vR);
    let rate = 0;
    if (a.fl === 2 && sp > 6) rate = 28 + sp * 0.8;
    else if (schl > 3 || a.driftend) rate = Math.min(1, (schl - 2) / 9 + (a.driftend ? 0.4 : 0)) * 70;
    else if (a.bremsend && sp > 25) rate = 14;
    let m = rate * dt;
    while (m > 0 && Math.random() < m) {
      m -= 1;
      const sg = Math.random() < 0.5 ? -1 : 1;
      const px = a.x - ft * 1.4 + rx * 0.95 * sg, pz = a.z - fz * 1.4 + rz * 0.95 * sg;
      const staub = a.fl === 2;
      rauch.emit(px, a.y + 0.25, pz, a.vx * 0.25 + (Math.random() - 0.5) * 1.2, 0.7 + Math.random() * 0.8, a.vz * 0.25 + (Math.random() - 0.5) * 1.2,
        staub ? 1.4 : 1.1, staub ? 3.6 : 3.2, staub ? 0.9 : 1.1,
        staub ? 0.50 : 0.78, staub ? 0.44 : 0.78, staub ? 0.30 : 0.80, staub ? 0.55 : 0.42);
    }
  }
  if (!a.luft && zustand === "run" && a.fl < 2 && S.untergrund !== "asphalt" && sp > 10) {
    const U = S.untergrund, f = U === "eis" ? [0.93, 0.96, 1.0, 0.34] : U === "sand" ? [0.84, 0.70, 0.46, 0.38] : [0.55, 0.45, 0.32, 0.34];
    let m = (6 + sp * 0.32) * dt;
    while (m > 0 && Math.random() < m) {
      m -= 1;
      const sg = Math.random() < 0.5 ? -1 : 1;
      rauch.emit(a.x - ft * 1.5 + rx * 0.95 * sg, a.y + 0.2, a.z - fz * 1.5 + rz * 0.95 * sg, a.vx * 0.12 + (Math.random() - 0.5) * 1.6, 0.5 + Math.random() * 0.7, a.vz * 0.12 + (Math.random() - 0.5) * 1.6,
        0.8, 2.6, 0.7 + Math.random() * 0.3, f[0], f[1], f[2], f[3]);
    }
  }
  if (a.boost > 0 && zustand === "run") {
    let m = 110 * dt;
    while (m > 0 && Math.random() < m) {
      m -= 1;
      const sg = Math.random() < 0.5 ? -0.45 : 0.45;
      feuer.emit(a.x - ft * 2.5 + rx * sg, a.y + 0.55, a.z - fz * 2.5 + rz * sg, a.vx * 0.55 - ft * 7 + (Math.random() - 0.5) * 2.4, (Math.random() - 0.5) * 2, a.vz * 0.55 - fz * 7 + (Math.random() - 0.5) * 2.4,
        0.55, -0.4, 0.35 + Math.random() * 0.2, 1.0, 0.55 + Math.random() * 0.3, 0.12, 0.9);
    }
  }
  const pxr = renderer.domElement.height / (2 * Math.tan(THREE.MathUtils.degToRad(camera.fov) / 2));
  rauch.update(dt, pxr); funken.update(dt, pxr); feuer.update(dt, pxr);
}
function funkenAn(e) {
  for (let q = 0; q < 16; q++) {
    const sv = e.seite, ft = Math.sin(a.theta), fz = Math.cos(a.theta);
    funken.emit(e.x, e.y + 0.5 + Math.random() * 0.6, e.z, a.vx * 0.5 - sv * (Math.random() * 3) + (Math.random() - 0.5) * 6, 2 + Math.random() * 5, a.vz * 0.5 + (Math.random() - 0.5) * 6,
      0.22, -0.1, 0.35 + Math.random() * 0.4, 1.0, 0.72 + Math.random() * 0.25, 0.25, 1, 22);
    void ft; void fz;
  }
}

// ---------------- Geschwindigkeitslinien (2D-Overlay)
function tempoLinien(t) {
  const w = fx.width, h = fx.height;
  fxc.clearRect(0, 0, w, h);
  const sp = Math.hypot(a.vx, a.vz);
  const f = Math.max(0, (sp - 38) / 30) + (a.boost > 0 ? 0.6 : 0);
  if (f <= 0.02 || zustand === "menu") return;
  const cx = w / 2, cy = h * 0.46, R = Math.hypot(cx, cy);
  const n = Math.floor(10 + 26 * Math.min(1, f));
  fxc.lineCap = "round";
  for (let i = 0; i < n; i++) {
    const ang = Math.random() * Math.PI * 2;
    const r0 = R * (0.45 + Math.random() * 0.4), r1 = r0 + R * (0.15 + Math.random() * 0.3 * Math.min(1, f));
    fxc.strokeStyle = `rgba(255,255,255,${0.05 + Math.random() * 0.16 * Math.min(1, f)})`;
    fxc.lineWidth = 1 + Math.random() * 2.2;
    fxc.beginPath(); fxc.moveTo(cx + Math.cos(ang) * r0, cy + Math.sin(ang) * r0); fxc.lineTo(cx + Math.cos(ang) * r1, cy + Math.sin(ang) * r1); fxc.stroke();
  }
  if (a.boost > 0) {
    const g = fxc.createRadialGradient(cx, cy, R * 0.5, cx, cy, R);
    g.addColorStop(0, "rgba(255,140,40,0)"); g.addColorStop(1, `rgba(255,120,30,${0.28 * Math.min(1, a.boost * 2)})`);
    fxc.fillStyle = g; fxc.fillRect(0, 0, w, h);
  }
}

// ---------------- Hauptschleife
const H = 1 / 120;
let qSperreBis = 0;
let acc = 0, last = performance.now(), frames = 0, msSumme = 0, langsam = 0, qStufe = 0, fpsText = 0;
let eingabeJetzt = { lenk: 0, bremse: false };
function frame(now) {
  requestAnimationFrame(frame);
  let dt = (now - last) / 1000; last = now;
  if (dt > (FAST ? 0.6 : 0.1)) dt = FAST ? 0.6 : 0.1;
  if (dt <= 0) return;
  // Qualitaet anpassen
  msSumme += dt * 1000; frames++;
  if (frames >= 45) {
    const ms = msSumme / frames; frames = 0; msSumme = 0;
    if (DEBUG) { $("dbg").textContent = (1000 / ms).toFixed(0) + " fps  pr " + Q.pr.toFixed(2) + (Q.bloom ? " bloom" : "") + "  q" + qStufe; }
    if (now < qSperreBis) langsam = 0;   // Schonfrist: direkt nach dem Start wird noch Grafik geladen/kompiliert
    else if (!params.has("pr") && ms > 25 && zustand !== "menu" || (ms > 40 && zustand === "menu")) langsam++; else langsam = Math.max(0, langsam - 1);
    if (langsam >= 2 && qStufe < 4) {
      langsam = 0; qStufe++;
      if (qStufe === 1) { Q.pr = Math.max(0.75, Q.pr * 0.8); }
      else if (qStufe === 2) { Q.bloom = false; }
      else if (qStufe === 3) { Q.pr = Math.max(0.6, Q.pr * 0.8); }   // Schatten bleiben an: Abschalten erzwingt ein Neukompilieren aller Shader (Gefahr fuer schwarzen Bildschirm)
      groesse();
    }
  }
  if (zustand === "countdown") {
    cdZeit += dt;
    const schritt_ = cdKurz ? 0.55 : 0.8, vor = cdKurz ? 0.1 : 0.45;
    const an = Math.max(0, Math.min(3, Math.floor((cdZeit - vor) / schritt_) + 1));
    if (an !== cdLetzte) {
      cdLetzte = an;
      const ls = $("ampel").children;
      for (let k = 0; k < 3; k++) ls[k].className = k < an ? "rot" : "";
      $("ampel").className = "an";
      if (an > 0) ton.beep(false);
    }
    if (cdZeit >= vor + 3 * schritt_) {
      zustand = "run";
      if (!sessionLaeuft) { sessionLaeuft = true; sessionStart = simT; }
      lapStart = simT;
      const ls = $("ampel").children; for (let k = 0; k < 3; k++) ls[k].className = "gruen";
      $("ampel").className = "an los"; ton.beep(true);
      setTimeout(() => { if (zustand === "run") $("ampel").className = ""; }, 750);
    }
  }
  acc += dt;
  if (window.__halt) acc = 0;
  let steps = 0;
  while (acc >= H && steps < (FAST ? 80 : 14)) {
    acc -= H; steps++;
    const lauf = zustand === "run" || zustand === "ende";
    if (zustand === "run") {
      simT += H;
      eingabeJetzt = imZiel ? { lenk: 0, bremse: true, gas: false } : BOT ? botEingabe(a, S, { aQuer: 30 }) : eingabe();
    } else if (zustand === "ende") eingabeJetzt = { lenk: 0, bremse: true };
    else eingabeJetzt = { lenk: 0, bremse: true, gas: false };
    if (lauf) {
      const ev = schritt(a, eingabeJetzt, H, S);
      for (const e of ev) {
        if (e.t === "wand") { ton.wand(e.staerke); funkenAn(e); cam.schub += Math.min(0.4, e.staerke * 0.02); if (navigator.vibrate && e.staerke > 8) navigator.vibrate(30); }
        else if (e.t === "boost") { ton.boost(); cam.schub += 0.1; }
        else if (e.t === "looping") { toast("LOOPING!", "#7df9ff", 900); }
        else if (e.t === "loopzulangsam") { ton.wand(Math.min(14, e.staerke)); toast("Zu langsam für den Looping – über " + Math.ceil(e.vmin * 3.6) + " km/h nötig", "#ff8a8a", 1800); }
        else if (e.t === "landung") { ton.landung(e.staerke); cam.schub += Math.min(0.5, e.staerke * 0.025); for (let q = 0; q < 14; q++) rauch.emit(a.x + (Math.random() - 0.5) * 3, a.y + 0.2, a.z + (Math.random() - 0.5) * 3, (Math.random() - 0.5) * 5, 1 + Math.random() * 2, (Math.random() - 0.5) * 5, 1.4, 3, 0.8, 0.7, 0.68, 0.62, 0.4); }
      }
      if (zustand === "run") {
        rundenLogik(H);
        if (imZiel) { imZielT += H; if (imZielT > 1.9) { imZiel = false; if (letzteFahrt) beendeSession(); else neustart(); } }
        recAkk += H;
        if (!imZiel && recAkk >= 1 / 30) { recAkk -= 1 / 30; ghostRec.push(0, a.x, a.y, a.z, a.theta); }
        if (!letzteFahrt && simT - sessionStart >= SESSION_S) {
          letzteFahrt = true;
          if (!imZiel) { toast("Zeit abgelaufen - letzte Fahrt zu Ende fahren", "#ff5470", 2600); $("b-beenden").hidden = false; }
        }
      }
    }
  }
  if (acc > H * 2 && !FAST) acc = 0; if (FAST && acc > H * 4) acc = 0;

  // HUD
  const rest = Math.max(0, SESSION_S - (simT - sessionStart));
  if (zustand === "run" || zustand === "ende") {
    $("rest").textContent = Math.floor(rest / 60) + ":" + String(Math.floor(rest % 60)).padStart(2, "0");
    $("lap").textContent = fmt(imZiel ? zielZeit : Math.max(0, simT - lapStart));
  } else if (zustand === "countdown") { const rs = sessionLaeuft ? rest : SESSION_S; $("rest").textContent = Math.floor(rs / 60) + ":" + String(Math.floor(rs % 60)).padStart(2, "0"); $("lap").textContent = fmt(0); }
  const kmh = Math.round(Math.hypot(a.vx, a.vz) * 3.6);
  $("kmh").textContent = kmh;
  $("boostbar").firstElementChild.style.transform = `scaleX(${Math.min(1, a.boost / P.BOOST_ZEIT)})`;
  $("rest").classList.toggle("knapp", rest < 30 && zustand === "run");

  zeigeAuto(dt, now / 1000); zeigeBlob(); spuren(); KARTE(a);
  world.folge(a.x, a.y, a.z);
  world.boostAnim(now / 1000);
  world.tick(now / 1000, camera.position);
  kamera(dt, now / 1000);
  world.himmel.position.copy(camera.position);
  world.himmel.material.uniforms.time.value = now / 1000;
  effekte(dt, now / 1000);
  tempoLinien(now / 1000);

  // Ton
  const sp = Math.hypot(a.vx, a.vz);
  if (zustand === "menu") ton.setze(0, 0.05, 0, false);
  else {
    const gang = Math.min(5, Math.floor(sp / 13.5)), rpm = Math.min(1, (sp - gang * 13.5) / 13.5 * 0.85 + 0.15 + (zustand === "countdown" ? 0.25 : 0));
    ton.setze(Math.min(1, sp / 62), a.luft ? rpm + 0.2 : rpm, a.vR, a.boost > 0);
  }

  if (Q.bloom) composer.render(); else { renderer.render(scene, camera); }
}

// Test-/Debug-Zugriff
window.__tm = { S, geist, get a() { return a; }, camera, renderer, scene, world, starte, neustart, get zustand() { return zustand; }, set zustand(v) { zustand = v; }, Q, groesse,
  setzeAuto(s, lat = 0, v = 0) {
    const i = Math.max(0, Math.min(S.n - 1, Math.round(s / S.ds))), rx = -S.tz[i], rz = S.tx[i];
    a = neuesAuto({ x: S.x[i] + rx * lat, z: S.z[i] + rz * lat, y: S.y[i], theta: Math.atan2(S.tx[i], S.tz[i]), i });
    a.s = s; a.vx = S.tx[i] * v; a.vz = S.tz[i] * v; prevP = a.s; cam.init = false;
  },
  get simT() { return simT; }, get best() { return best; }, get runden() { return runden; }, get cpNext() { return cpNext; } };

$("lade").classList.add("weg");
requestAnimationFrame(frame);
if (params.has("auto")) starte();
if (BOT) { document.body.classList.add("bot"); }
