// Das Auto: Low-Poly-Sportwagen, komplett aus Code gebaut (keine Modell-Datei).
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

function glowTex(rgb) {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(64, 64, 4, 64, 64, 64);
  g.addColorStop(0, `rgba(${rgb},0.95)`); g.addColorStop(0.5, `rgba(${rgb},0.30)`); g.addColorStop(1, `rgba(${rgb},0)`);
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

function extrudeProfil(punkte, tiefe, bevel = 0.13) {
  const sh = new THREE.Shape();
  punkte.forEach(([x, y], i) => (i ? sh.lineTo(x, y) : sh.moveTo(x, y)));
  sh.closePath();
  const g = new THREE.ExtrudeGeometry(sh, { depth: tiefe, bevelEnabled: true, bevelSize: bevel, bevelThickness: bevel, bevelSegments: 4, curveSegments: 4 });
  g.translate(0, 0, -tiefe / 2);
  g.rotateY(-Math.PI / 2);    // Laenge (x) -> z, vorne = +z
  return g;
}

export function baueAuto(farbe = 0xff3b30, { geist = false } = {}) {
  const gruppe = new THREE.Group();     // Position + Kurs
  const karosse = new THREE.Group();    // Neigung (Nicken/Rollen) kommt hierher
  gruppe.add(karosse);
  const proz = new THREE.Group();       // der aus Code gebaute Notfall-Wagen (bis ein Modell geladen ist)
  karosse.add(proz);

  const lack = new THREE.MeshStandardMaterial({ color: farbe, roughness: 0.28, metalness: 0.55, envMapIntensity: 1.25 });
  const glas = new THREE.MeshStandardMaterial({ color: 0x0b1626, roughness: 0.08, metalness: 0.9, envMapIntensity: 1.6 });
  const schwarz = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.6, metalness: 0.2 });
  const chrom = new THREE.MeshStandardMaterial({ color: 0xdfe3ea, roughness: 0.2, metalness: 1, envMapIntensity: 1.3 });
  if (geist) { for (const m of [lack, glas, schwarz, chrom]) { m.transparent = true; m.opacity = 0.42; m.depthWrite = false; } lack.emissive = new THREE.Color(0x2fc8ff); lack.emissiveIntensity = 0.9; }

  const koerper = new THREE.Mesh(extrudeProfil([
    [-2.2, 0.28], [-2.26, 0.56], [-2.06, 0.82], [-1.2, 0.87], [-0.9, 0.9], [0.7, 0.9], [1.5, 0.74], [2.08, 0.6], [2.26, 0.42], [2.16, 0.28],
  ], 1.78), lack);
  koerper.castShadow = !geist; proz.add(koerper);

  const kabine = new THREE.Mesh(extrudeProfil([[-1.05, 0.88], [-0.55, 1.28], [0.35, 1.3], [0.88, 0.9]], 1.5, 0.05), glas);
  kabine.castShadow = !geist; proz.add(kabine);
  const dach = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.07, 1.0), lack);
  dach.position.set(0, 1.325, -0.12); proz.add(dach);

  // Streifen
  if (!geist) {
    const streifenMat = new THREE.MeshStandardMaterial({ color: 0xf6f6f8, roughness: 0.4, metalness: 0.2 });
    for (const sx of [-0.2, 0.2]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 1.25), streifenMat); h.position.set(sx, 0.775, 1.38); h.rotation.x = 0.17; proz.add(h);
      const k = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 1.1), streifenMat); k.position.set(sx, 0.875, -1.5); k.rotation.x = -0.05; proz.add(k);
    }
  }

  const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.06, 0.55), schwarz); splitter.position.set(0, 0.24, 2.18); proz.add(splitter);
  const diffusor = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 0.4), schwarz); diffusor.position.set(0, 0.28, -2.15); proz.add(diffusor);
  const fluegel = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.07, 0.5), schwarz); fluegel.position.set(0, 1.18, -2.1); fluegel.castShadow = !geist; proz.add(fluegel);
  for (const sx of [-0.62, 0.62]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.3, 0.2), schwarz); st.position.set(sx, 1.02, -2.05); proz.add(st); }
  for (const sx of [-0.95, 0.95]) { const ep = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.6), lack); ep.position.set(sx, 1.18, -2.1); proz.add(ep); }
  // Seitenschweller
  for (const sx of [-0.93, 0.93]) { const sk = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 2.2), schwarz); sk.position.set(sx, 0.33, 0); proz.add(sk); }

  // Lichter
  const scheinMat = new THREE.MeshBasicMaterial({ color: 0xfff6d8, toneMapped: false });
  const bremsMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1010, emissiveIntensity: 0.6, roughness: 0.4 });
  if (!geist) {
    for (const sx of [-0.66, 0.66]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.06), scheinMat); l.position.set(sx, 0.58, 2.26); l.rotation.x = -0.2; proz.add(l); }
    const bl = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.06), bremsMat); bl.position.set(0, 0.78, -2.3); proz.add(bl);
  }

  // Raeder
  const raeder = [];
  const reifenMat = new THREE.MeshStandardMaterial({ color: 0x101114, roughness: 0.9 });
  if (geist) { reifenMat.transparent = true; reifenMat.opacity = 0.32; reifenMat.depthWrite = false; }
  const felgeMat = new THREE.MeshStandardMaterial({ color: 0xf2c200, roughness: 0.3, metalness: 0.8 });
  if (geist) { felgeMat.transparent = true; felgeMat.opacity = 0.32; felgeMat.depthWrite = false; }
  const reifenG = new THREE.CylinderGeometry(0.37, 0.37, 0.3, 20); reifenG.rotateZ(Math.PI / 2);
  const felgeG = new THREE.CylinderGeometry(0.24, 0.24, 0.32, 10); felgeG.rotateZ(Math.PI / 2);
  const nabeG = new THREE.CylinderGeometry(0.07, 0.07, 0.34, 8); nabeG.rotateZ(Math.PI / 2);
  const speicheG = new THREE.BoxGeometry(0.33, 0.05, 0.4);
  for (const [px, pz, vorn] of [[-0.98, 1.4, true], [0.98, 1.4, true], [-0.98, -1.4, false], [0.98, -1.4, false]]) {
    const lenk = new THREE.Group(); lenk.position.set(px, 0.37, pz);
    const dreh = new THREE.Group(); lenk.add(dreh);
    const r = new THREE.Mesh(reifenG, reifenMat); r.castShadow = !geist; dreh.add(r);
    const f = new THREE.Mesh(felgeG, felgeMat); dreh.add(f);
    dreh.add(new THREE.Mesh(nabeG, chrom));
    for (let k = 0; k < 5; k++) { const sp = new THREE.Mesh(speicheG, chrom); sp.rotation.x = (k / 5) * Math.PI; sp.scale.set(1, 1, 0.5); sp.position.x = px > 0 ? 0.01 : -0.01; dreh.add(sp); }
    proz.add(lenk);
    raeder.push({ lenk, dreh, vorn });
  }

  // Flammen und Leuchten
  const flammen = [];
  const flammeMat = new THREE.MeshBasicMaterial({ color: 0xff9a2a, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  const flammeKern = new THREE.MeshBasicMaterial({ color: 0xfff2b0, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
  for (const sx of [-0.45, 0.45]) {
    const g = new THREE.ConeGeometry(0.2, 1.0, 8); g.rotateX(-Math.PI / 2); g.translate(0, 0, -0.5);   // Spitze nach hinten
    const aussen = new THREE.Mesh(g, flammeMat); aussen.position.set(sx, 0.5, -2.3); aussen.scale.set(1, 1, 0.01); aussen.visible = false;
    const g2 = new THREE.ConeGeometry(0.1, 0.7, 8); g2.rotateX(-Math.PI / 2); g2.translate(0, 0, -0.35);
    const kern = new THREE.Mesh(g2, flammeKern); kern.position.copy(aussen.position); kern.scale.set(1, 1, 0.01); kern.visible = false;
    karosse.add(aussen); karosse.add(kern); flammen.push(aussen, kern);
  }
  let glow = null;
  if (!geist) {
    glow = new THREE.Mesh(new THREE.PlaneGeometry(3.6, 6.2), new THREE.MeshBasicMaterial({ map: glowTex("0,200,255"), transparent: true, opacity: 0.0, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false }));
    glow.rotation.x = -Math.PI / 2; glow.position.y = 0.06; gruppe.add(glow);
  }
  return { gruppe, karosse, proz, raeder, bremsMat, flammen, glow, lack, geist };
}


// ---------------------------------------------------------------------------
//  Modell (Kenney Car Kit, CC0): race-future.
//  Das Auto aus Code bleibt als Rueckfall sichtbar, bis (oder falls nicht) das Modell geladen ist.
// ---------------------------------------------------------------------------
export const MODELLE = [
  { id: "race-future", name: "Rennwagen", icon: "\u{1F3CE}\uFE0F", skala: 1.6, brems: { x: 0.42, y: 0.5, w: 0.3 } },
];
const quellen = {};
function ladeQuelle(id) {
  return (quellen[id] ??= new GLTFLoader().loadAsync(new URL(`./modelle/${id}.glb`, import.meta.url).href).then((g) => g.scene));
}

export async function ladeModell(auto, id) {
  const cfg = MODELLE.find((m) => m.id === id) || MODELLE[0];
  let quelle;
  try { quelle = await ladeQuelle(cfg.id); } catch (e) { delete quellen[cfg.id]; return false; }
  if (auto.modell) { auto.karosse.remove(auto.modell); auto.modell = null; }
  const geist = auto.geist;
  const m = quelle.clone(true);
  m.traverse((o) => {
    if (!o.isMesh) return;
    o.material = o.material.clone();
    o.castShadow = !geist; o.receiveShadow = false;
    o.material.envMapIntensity = 0.7;
    if (geist) { Object.assign(o.material, { transparent: true, opacity: 0.4, depthWrite: false }); o.material.emissive = new THREE.Color(0x2fc8ff); o.material.emissiveIntensity = 0.5; }
  });
  // Raeder: jedes Rad bekommt ein Lenk- und ein Drehgelenk (Achse = Radmitte)
  const neueRaeder = [];
  for (const rad of m.children.filter((c) => c.name.startsWith("wheel-"))) {
    const lenk = new THREE.Group(), dreh = new THREE.Group();
    lenk.position.copy(rad.position); rad.position.set(0, 0, 0);
    m.remove(rad); dreh.add(rad); lenk.add(dreh); m.add(lenk);
    neueRaeder.push({ lenk, dreh, vorn: rad.name.includes("front") });
  }
  const huelle = new THREE.Group(); huelle.scale.setScalar(cfg.skala); huelle.add(m);
  huelle.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(huelle);
  auto.proz.visible = false;
  auto.karosse.add(huelle); auto.modell = huelle;
  auto.raeder.length = 0; auto.raeder.push(...neueRaeder);
  // Flammen hinten am Heck
  for (let i = 0; i < auto.flammen.length; i += 2) {
    const sx = i === 0 ? -0.4 : 0.4;
    auto.flammen[i].position.set(sx, 0.55, box.min.z + 0.1);
    auto.flammen[i + 1].position.copy(auto.flammen[i].position);
  }
  // Bremslicht (leuchtet, wenn gebremst wird)
  if (auto.bremsBalken) { auto.karosse.remove(auto.bremsBalken); }
  if (!geist) {
    const bl = new THREE.Group();
    for (const sx of [-1, 1]) {
      const l = new THREE.Mesh(new THREE.BoxGeometry(cfg.brems.w, 0.1, 0.05), auto.bremsMat);
      l.position.set(sx * cfg.brems.x, cfg.brems.y, box.min.z - 0.01); bl.add(l);
    }
    auto.karosse.add(bl); auto.bremsBalken = bl;
  }
  return true;
}
