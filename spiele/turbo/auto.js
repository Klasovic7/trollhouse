// Das Auto: Low-Poly-Sportwagen, komplett aus Code gebaut (keine Modell-Datei).
import * as THREE from "three";

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

  const lack = new THREE.MeshStandardMaterial({ color: farbe, roughness: 0.28, metalness: 0.55, envMapIntensity: 1.25 });
  const glas = new THREE.MeshStandardMaterial({ color: 0x0b1626, roughness: 0.08, metalness: 0.9, envMapIntensity: 1.6 });
  const schwarz = new THREE.MeshStandardMaterial({ color: 0x15171c, roughness: 0.6, metalness: 0.2 });
  const chrom = new THREE.MeshStandardMaterial({ color: 0xdfe3ea, roughness: 0.2, metalness: 1, envMapIntensity: 1.3 });
  if (geist) { for (const m of [lack, glas, schwarz, chrom]) { m.transparent = true; m.opacity = 0.42; m.depthWrite = false; } lack.emissive = new THREE.Color(0x2fc8ff); lack.emissiveIntensity = 0.9; }

  const koerper = new THREE.Mesh(extrudeProfil([
    [-2.2, 0.28], [-2.26, 0.56], [-2.06, 0.82], [-1.2, 0.87], [-0.9, 0.9], [0.7, 0.9], [1.5, 0.74], [2.08, 0.6], [2.26, 0.42], [2.16, 0.28],
  ], 1.78), lack);
  koerper.castShadow = !geist; karosse.add(koerper);

  const kabine = new THREE.Mesh(extrudeProfil([[-1.05, 0.88], [-0.55, 1.28], [0.35, 1.3], [0.88, 0.9]], 1.5, 0.05), glas);
  kabine.castShadow = !geist; karosse.add(kabine);
  const dach = new THREE.Mesh(new THREE.BoxGeometry(1.46, 0.07, 1.0), lack);
  dach.position.set(0, 1.325, -0.12); karosse.add(dach);

  // Streifen
  if (!geist) {
    const streifenMat = new THREE.MeshStandardMaterial({ color: 0xf6f6f8, roughness: 0.4, metalness: 0.2 });
    for (const sx of [-0.2, 0.2]) {
      const h = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 1.25), streifenMat); h.position.set(sx, 0.775, 1.38); h.rotation.x = 0.17; karosse.add(h);
      const k = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.02, 1.1), streifenMat); k.position.set(sx, 0.875, -1.5); k.rotation.x = -0.05; karosse.add(k);
    }
  }

  const splitter = new THREE.Mesh(new THREE.BoxGeometry(1.95, 0.06, 0.55), schwarz); splitter.position.set(0, 0.24, 2.18); karosse.add(splitter);
  const diffusor = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.1, 0.4), schwarz); diffusor.position.set(0, 0.28, -2.15); karosse.add(diffusor);
  const fluegel = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.07, 0.5), schwarz); fluegel.position.set(0, 1.18, -2.1); fluegel.castShadow = !geist; karosse.add(fluegel);
  for (const sx of [-0.62, 0.62]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.3, 0.2), schwarz); st.position.set(sx, 1.02, -2.05); karosse.add(st); }
  for (const sx of [-0.95, 0.95]) { const ep = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.22, 0.6), lack); ep.position.set(sx, 1.18, -2.1); karosse.add(ep); }
  // Seitenschweller
  for (const sx of [-0.93, 0.93]) { const sk = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 2.2), schwarz); sk.position.set(sx, 0.33, 0); karosse.add(sk); }

  // Lichter
  const scheinMat = new THREE.MeshBasicMaterial({ color: 0xfff6d8, toneMapped: false });
  const bremsMat = new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1010, emissiveIntensity: 0.6, roughness: 0.4 });
  if (!geist) {
    for (const sx of [-0.66, 0.66]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.1, 0.06), scheinMat); l.position.set(sx, 0.58, 2.26); l.rotation.x = -0.2; karosse.add(l); }
    const bl = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.1, 0.06), bremsMat); bl.position.set(0, 0.78, -2.3); karosse.add(bl);
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
    karosse.add(lenk);
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
  return { gruppe, karosse, raeder, bremsMat, flammen, glow, lack };
}
