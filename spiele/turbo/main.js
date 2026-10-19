// Trollhouse Turbo - Zeitjagd-Prototyp
import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/addons/postprocessing/OutputPass.js";
import { baueStrecke, startPose, WAND_ABSTAND, STRECKEN, streckeNachId } from "./strecke.js";
import { neuesAuto, schritt, P } from "./physik.js";
import { botEingabe } from "./bot.js";
import { baueWelt, baueHimmel } from "./welt.js";
import { baueAuto } from "./auto.js";
import { Partikel } from "./effekte.js";
import { Ton } from "./ton.js";

const $ = (id) => document.getElementById(id);
const params = new URLSearchParams(location.search);
const BOT = params.has("bot");
const DEBUG = params.has("debug");
const FAST = params.has("fast");
const SESSION_S = Number(params.get("zeit")) || 300;
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
  if (e.code === "KeyR" || e.code === "Enter") { if (zustand === "run" || zustand === "countdown") neustart(); else if (zustand === "menu") starte(); else if (zustand === "ende") starte(); }
  if (e.code === "KeyM") schalteTon();
});
window.addEventListener("keyup", (e) => { if (keyMap[e.code]) taste[keyMap[e.code]] = false; });
function binde(id, key) {
  const el = $(id);
  const an = (e) => { tstate[key] = true; el.classList.add("an"); e.preventDefault(); try { el.setPointerCapture(e.pointerId); } catch (_) {} };
  const aus = (e) => { tstate[key] = false; el.classList.remove("an"); e.preventDefault(); };
  el.addEventListener("pointerdown", an); el.addEventListener("pointerup", aus); el.addEventListener("pointercancel", aus); el.addEventListener("lostpointercapture", aus);
  el.addEventListener("contextmenu", (e) => e.preventDefault());
}
binde("t-l", "l"); binde("t-r", "r"); binde("t-b", "b"); binde("t-g", "g");
$("b-restart").addEventListener("click", () => neustart());
$("b-ton").addEventListener("click", () => schalteTon());
const verlassen = () => { if (window.parent !== window) window.parent.postMessage({ typ: "turbo-verlassen" }, "*"); else history.back(); };
$("b-exit").addEventListener("click", verlassen); $("b-quer-zurueck").addEventListener("click", verlassen);
window.addEventListener("message", (e) => {
  const d = e.data || {};
  if (d.typ === "gegner" && Array.isArray(d.liste)) {
    const box = $("gegner");
    box.innerHTML = (d.liste = d.liste.filter((g) => !g.strecke || g.strecke === S.id)).length ? d.liste.slice(0, 5).map((g, i) => `<div class="z"><span>${i + 1}. ${String(g.name || "?").replace(/[<>&]/g, "")}</span><i>${fmt(g.zeit)}</i></div>`).join("") : '<div class="leer">noch keine Zeiten</div>';
  }
});
const meldeBestzeit = (z) => { if (window.parent !== window) window.parent.postMessage({ typ: "bestzeit", zeit: z, strecke: S.id }, "*"); };
{
  const wahl = $("strecken");
  STRECKEN.forEach((t) => {
    const b = document.createElement("button"); b.type = "button"; b.className = "sw" + (t.id === S.id ? " an" : "");
    b.innerHTML = "<b>" + ({ tag: "☀️", wueste: "🏜️", schnee: "❄️", nacht: "🌙", herbst: "🍂" }[t.thema] || "") + " " + t.name + "</b><small>" + t.kurz + "</small>";
    b.addEventListener("click", () => {
      if (t.id === S.id) return;
      try { localStorage.setItem("tt_strecke", t.id); } catch (_) {}
      const u = new URL(location.href); u.searchParams.set("strecke", t.id); location.replace(u.toString());
    });
    wahl.appendChild(b);
  });
}
$("b-start").addEventListener("click", () => starte());
$("b-nochmal").addEventListener("click", () => starte());
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
const REKORD_KEY = "tt_rekord_v2_" + S.id;
let rekord = (() => { try { return parseFloat(localStorage.getItem(REKORD_KEY)) || (S.id === "tal" ? parseFloat(localStorage.getItem("tt_rekord_v1")) : 0) || null; } catch (_) { return null; } })();
if (rekord > 0) $("rekord").textContent = fmt(rekord);

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
function neustart() {
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
function starte() {
  ton.start();
  try { const el = document.documentElement, f = el.requestFullscreen || el.webkitRequestFullscreen; if (f && !document.fullscreenElement) { const r = f.call(el); if (r && r.catch) r.catch(() => {}); } } catch (_) {}
  $("menue").classList.add("weg"); $("ende").classList.add("weg"); document.body.classList.add("im-spiel");
  platziere(startPose(S)); cpNext = 0; lapDist = 0; curSplits = []; ghostRec = []; recAkk = 0; best = null; bestSplits = []; ghostBest = null; letzte = null; runden = 0; falsch = 0;
  $("best").textContent = fmt(null); meldeBestzeit(null); $("letzte").textContent = "--"; $("runden").textContent = "0"; $("medal").textContent = "";
  setzeTore();
  sessionLaeuft = false; startAmpel(false);
  simT = 0; lapStart = 0; prevP = a.s;
}
function beendeSession() {
  zustand = "ende"; ende = performance.now();
  ton.ziel();
  toast("Zeit abgelaufen", "#ff5470", 1800);
  setTimeout(() => {
    const [m, c] = best != null ? medaille(best) : ["", "#fff"];
    $("e-best").textContent = fmt(best);
    $("e-medal").textContent = m || (best != null ? "Keine Medaille" : "Kein gültiger Lauf");
    $("e-medal").style.color = c;
    $("e-runden").textContent = runden;
    let neu = false;
    if (best != null && (rekord == null || best < rekord)) { rekord = best; neu = true; try { localStorage.setItem(REKORD_KEY, String(best)); } catch (_) {} }
    $("e-rekord").textContent = rekord != null ? fmt(rekord) + (neu ? "  (neu!)" : "") : "--";
    $("ende").classList.remove("weg");
  }, 1600);
}

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
      runden++; letzte = zeit;
      $("letzte").textContent = fmt(zeit); $("runden").textContent = runden;
      const neuBest = best == null || zeit < best - 1e-4;
      if (neuBest) {
        const alt = best; best = zeit; bestSplits = curSplits.slice(); ghostBest = ghostRec.slice();
        $("best").textContent = fmt(best); meldeBestzeit(best);
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
  const dist = 7.8 + sf * 1.6 + boost * 0.9;
  const hoch = 3.0 + sf * 0.6;
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
  camera.lookAt(a.x + sx * 4.6, a.y + 1.1 + (a.luft ? a.vy * 0.04 : 0), a.z + sz * 4.6);
  const asp = camera.aspect, fb = asp < 1.2 ? Math.min(1.75, 1 + (1.2 / asp - 1) * 0.4) : 1;
  const fov = Math.min(112, (62 + 20 * sf * sf + boost * 7) * fb);
  if (Math.abs(camera.fov - fov) > 0.02) { camera.fov += (fov - camera.fov) * (1 - Math.exp(-5 * dt)); camera.updateProjectionMatrix(); }
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
  const beschl = a.bremsend ? 0.035 : 0;
  car.karosse.rotation.x = a.nickV + beschl - (a.boost > 0 ? 0.03 : 0);
  car.karosse.rotation.z += (a.lenk * sf * 0.075 - car.karosse.rotation.z) * (1 - Math.exp(-10 * dt));
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
    if (!params.has("pr") && ms > 25 && zustand !== "menu" || (ms > 40 && zustand === "menu")) langsam++; else langsam = Math.max(0, langsam - 1);
    if (langsam >= 2 && qStufe < 4) {
      langsam = 0; qStufe++;
      if (qStufe === 1) { Q.pr = Math.max(0.75, Q.pr * 0.8); }
      else if (qStufe === 2) { Q.bloom = false; }
      else if (qStufe === 3) { Q.pr = Math.max(0.6, Q.pr * 0.8); renderer.shadowMap.enabled = false; world.sonne.castShadow = false; scene.traverse((o) => { if (o.material) o.material.needsUpdate = true; }); }
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
        if (imZiel) { imZielT += H; if (imZielT > 1.9) { imZiel = false; neustart(); } }
        recAkk += H;
        if (!imZiel && recAkk >= 1 / 30) { recAkk -= 1 / 30; ghostRec.push(0, a.x, a.y, a.z, a.theta); }
        if (simT - sessionStart >= SESSION_S) { beendeSession(); }
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

  zeigeAuto(dt, now / 1000);
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
