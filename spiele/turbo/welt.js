// Die 3D-Welt: Himmel, Gelaende, Strecke, Banden, Baeume, Berge, Tribuene, Tore.
import * as THREE from "three";
import { KERB, GRAS, WAND_ABSTAND } from "./strecke.js";

const GROUND = -0.5;
const smooth = (a, b, x) => { const t = Math.max(0, Math.min(1, (x - a) / (b - a))); return t * t * (3 - 2 * t); };

// ---------- Rauschen
function hash(ix, iz) {
  let h = Math.imul(ix, 374761393) + Math.imul(iz, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967295;
}
function vnoise(x, z) {
  const ix = Math.floor(x), iz = Math.floor(z), fx = x - ix, fz = z - iz;
  const u = fx * fx * (3 - 2 * fx), v = fz * fz * (3 - 2 * fz);
  const a = hash(ix, iz), b = hash(ix + 1, iz), c = hash(ix, iz + 1), d = hash(ix + 1, iz + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
function fbm(x, z, o = 4) { let s = 0, a = 0.5; for (let i = 0; i < o; i++) { s += a * vnoise(x, z); x *= 2.03; z *= 2.03; a *= 0.5; } return s; }
let seed = 12345;
const rnd = () => { seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0; return seed / 4294967296; };

// ---------- Texturen (zur Laufzeit gezeichnet, keine Bilddateien noetig)
function canvasTex(w, h, zeichne, opt = {}) {
  const c = document.createElement("canvas"); c.width = w; c.height = h;
  zeichne(c.getContext("2d"), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = opt.repeat === false ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
  t.anisotropy = opt.aniso || 8;
  return t;
}
function rauschen(ctx, w, h, n, amp) {
  for (let i = 0; i < n; i++) {
    const v = (Math.random() - 0.5) * amp;
    ctx.fillStyle = v > 0 ? `rgba(255,255,255,${v})` : `rgba(0,0,0,${-v})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 2, 1 + Math.random() * 2);
  }
}

function texAsphalt() {
  // u quer ueber die Fahrbahn, v laengs (eine Kachel = 24 m)
  return canvasTex(512, 1024, (ctx, w, h) => {
    ctx.fillStyle = "#3b3e46"; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { ctx.fillStyle = `rgba(${Math.random() > 0.5 ? "255,255,255" : "0,0,0"},0.025)`; ctx.fillRect(0, Math.random() * h, w, 6 + Math.random() * 40); }
    rauschen(ctx, w, h, 22000, 0.22);
    // dunkle Fahrspur (Gummiabrieb)
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.22, "rgba(0,0,0,0.10)"); g.addColorStop(0.3, "rgba(0,0,0,0)");
    g.addColorStop(0.7, "rgba(0,0,0,0)"); g.addColorStop(0.78, "rgba(0,0,0,0.10)"); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // Randlinien
    ctx.fillStyle = "rgba(240,240,240,0.92)";
    ctx.fillRect(w * 0.025, 0, w * 0.018, h); ctx.fillRect(w * 0.957, 0, w * 0.018, h);
    // gestrichelte Mittellinie
    ctx.fillStyle = "rgba(250,250,250,0.85)";
    ctx.fillRect(w * 0.495, h * 0.05, w * 0.012, h * 0.4);
    rauschen(ctx, w, h, 3000, 0.4);
  });
}
function texKerb() {
  return canvasTex(64, 128, (ctx, w, h) => {
    ctx.fillStyle = "#e6e6e6"; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#d8232a"; ctx.fillRect(0, 0, w, h / 2);
    rauschen(ctx, w, h, 600, 0.3);
  });
}
function texBande() {
  return canvasTex(256, 64, (ctx, w, h) => {
    ctx.fillStyle = "#ececec"; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "#d8232a"; ctx.fillRect(0, 0, w / 2, h);
    ctx.fillStyle = "rgba(0,0,0,0.10)"; ctx.fillRect(0, h * 0.82, w, h * 0.18);
    rauschen(ctx, w, h, 900, 0.3);
  });
}
function texGras() {
  return canvasTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = "#7fae4a"; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 5000; i++) {
      const l = 40 + Math.random() * 30;
      ctx.fillStyle = `hsla(${85 + Math.random() * 25},45%,${l}%,0.35)`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 2 + Math.random() * 5);
    }
  }, { aniso: 4 });
}
function texBoost() {
  return canvasTex(128, 256, (ctx, w, h) => {
    ctx.fillStyle = "#06222b"; ctx.fillRect(0, 0, w, h);
    for (let k = 0; k < 3; k++) {
      const y0 = 30 + k * 78;
      const g = ctx.createLinearGradient(0, y0, 0, y0 + 60);
      g.addColorStop(0, "#00f5ff"); g.addColorStop(1, "#ffd400");
      ctx.fillStyle = g;
      ctx.beginPath(); ctx.moveTo(w / 2, y0); ctx.lineTo(w * 0.9, y0 + 36); ctx.lineTo(w * 0.9, y0 + 62); ctx.lineTo(w / 2, y0 + 30); ctx.lineTo(w * 0.1, y0 + 62); ctx.lineTo(w * 0.1, y0 + 36); ctx.closePath(); ctx.fill();
    }
    ctx.strokeStyle = "#00f5ff"; ctx.lineWidth = 6; ctx.strokeRect(3, 3, w - 6, h - 6);
  }, { aniso: 4 });
}
function texZiel() {
  return canvasTex(256, 64, (ctx, w, h) => {
    const q = 16;
    for (let y = 0; y < h / q; y++) for (let x = 0; x < w / q; x++) { ctx.fillStyle = (x + y) % 2 ? "#111" : "#f4f4f4"; ctx.fillRect(x * q, y * q, q, q); }
  }, { aniso: 4 });
}
function texBanner(text, sub) {
  return canvasTex(1024, 160, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, "#ff3d6e"); g.addColorStop(0.5, "#ff9a1f"); g.addColorStop(1, "#ffd400");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = "rgba(0,0,0,0.18)";
    for (let i = -2; i < 14; i++) { ctx.beginPath(); ctx.moveTo(i * 90, 0); ctx.lineTo(i * 90 + 45, 0); ctx.lineTo(i * 90 + 15, h); ctx.lineTo(i * 90 - 30, h); ctx.fill(); }
    ctx.fillStyle = "#fff"; ctx.font = "italic 900 104px system-ui, Arial Black, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.shadowColor = "rgba(0,0,0,0.45)"; ctx.shadowBlur = 8; ctx.shadowOffsetY = 4;
    ctx.fillText(text, w / 2, h / 2 + 4);
    if (sub) { ctx.shadowBlur = 0; ctx.shadowOffsetY = 0; ctx.font = "800 34px system-ui, sans-serif"; ctx.fillStyle = "rgba(0,0,0,0.65)"; ctx.fillText(sub, w / 2, h - 18); }
  }, { repeat: false });
}
function texWerbung() {
  const namen = ["TROLLHOUSE", "TURBO", "ZEITJAGD", "FREUNDE", "NITRO"];
  const farben = [["#12c2e9", "#6a11cb"], ["#ff512f", "#f09819"], ["#11998e", "#38ef7d"], ["#ee0979", "#ff6a00"], ["#4776e6", "#8e54e9"]];
  return canvasTex(1024, 5 * 96, (ctx, w, h) => {
    namen.forEach((nm, i) => {
      const g = ctx.createLinearGradient(0, 0, w, 0); g.addColorStop(0, farben[i][0]); g.addColorStop(1, farben[i][1]);
      ctx.fillStyle = g; ctx.fillRect(0, i * 96, w, 96);
      ctx.fillStyle = "#fff"; ctx.font = "italic 900 64px system-ui, Arial Black, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
      ctx.fillText(nm, w / 2, i * 96 + 52);
      ctx.fillStyle = "rgba(255,255,255,0.5)"; ctx.fillRect(0, i * 96, w, 4);
    });
  }, { repeat: false });
}

// ---------- Himmel
const HORIZONT = [0.74, 0.85, 0.97];
function baueHimmel(sunDir) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    uniforms: { sunDir: { value: sunDir.clone() }, time: { value: 0 } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `
      uniform vec3 sunDir; uniform float time; varying vec3 vDir;
      float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<4;i++){ s+=a*n(p); p*=2.02; a*=.5; } return s; }
      void main(){
        vec3 d = normalize(vDir);
        float y = max(d.y, 0.0);
        vec3 hor = vec3(${HORIZONT.join(",")});
        vec3 zen = vec3(0.16,0.40,0.86);
        vec3 col = mix(hor, zen, pow(y, 0.5));
        vec3 sd3 = normalize(sunDir);
        float sd = max(dot(d, sd3), 0.0);
        col += vec3(1.0,0.80,0.55) * pow(sd, 6.0) * 0.30;
        col += vec3(1.0,0.92,0.75) * pow(sd, 700.0) * 6.0;
        if (d.y > 0.0) {
          vec2 p = d.xz / (d.y + 0.22) * 1.4 + vec2(time*0.006, 0.0);
          float c = smoothstep(0.50, 0.82, fbm(p*1.2));
          vec3 cc = mix(vec3(0.80,0.84,0.92), vec3(1.0,0.98,0.95), clamp(sd*1.2,0.,1.));
          col = mix(col, cc, c * smoothstep(0.0, 0.22, d.y) * 0.9);
        }
        col = mix(col, vec3(0.34,0.42,0.28), smoothstep(0.0, -0.3, d.y));
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const m = new THREE.Mesh(new THREE.SphereGeometry(1000, 32, 16), mat);
  m.renderOrder = -10; m.frustumCulled = false;
  return m;
}

// ---------- Hilfsfunktion: Band entlang der Strecke (Spalten: i -> [lat, dy])
function sweep(S, cols, { uk = 1, vk = 1 / 8, uMode = "lat", seitenwechsel = false } = {}) {
  const n = S.n, m = cols.length;
  const pos = new Float32Array((n + 1) * m * 3), uv = new Float32Array((n + 1) * m * 2);
  for (let k = 0; k <= n; k++) {
    const i = k % n;
    const rx = -S.tz[i], rz = S.tx[i];
    for (let j = 0; j < m; j++) {
      const [lat, y] = cols[j](i);
      const o = (k * m + j);
      pos[o * 3] = S.x[i] + rx * lat; pos[o * 3 + 1] = S.y[i] + y; pos[o * 3 + 2] = S.z[i] + rz * lat;
      uv[o * 2] = uMode === "lat" ? lat * uk : j * uk; uv[o * 2 + 1] = k * S.ds * vk;
    }
  }
  const idx = [];
  for (let k = 0; k < n; k++) for (let j = 0; j < m - 1; j++) {
    const a = k * m + j, b = k * m + j + 1, c = (k + 1) * m + j, d = (k + 1) * m + j + 1;
    if (seitenwechsel) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}

export function baueWelt(S, opt = {}) {
  const scene = new THREE.Scene();
  const sunDir = new THREE.Vector3(-0.55, 0.62, 0.45).normalize();
  const hor = new THREE.Color().setRGB(...HORIZONT, THREE.LinearSRGBColorSpace);
  scene.background = hor.clone();
  scene.fog = new THREE.Fog(hor.clone().multiplyScalar(0.96), 240, 1250);

  const himmel = baueHimmel(sunDir);
  scene.add(himmel);

  // Lichter
  const hemi = new THREE.HemisphereLight(0xbcd8ff, 0x6f8a4e, 1.0);
  scene.add(hemi);
  const sonne = new THREE.DirectionalLight(0xfff0d8, 3.1);
  sonne.castShadow = true;
  const sm = opt.schatten || 2048;
  sonne.shadow.mapSize.set(sm, sm);
  const sc = sonne.shadow.camera; sc.left = -42; sc.right = 42; sc.top = 42; sc.bottom = -42; sc.near = 1; sc.far = 260;
  sonne.shadow.bias = -0.0004; sonne.shadow.normalBias = 0.05;
  scene.add(sonne); scene.add(sonne.target);

  const gras = texGras(); gras.repeat.set(1, 1);
  const matGras = new THREE.MeshStandardMaterial({ map: gras, color: 0xa6d078, roughness: 1, metalness: 0 });

  // --- Fahrbahn
  const asph = texAsphalt();
  const matStrasse = new THREE.MeshStandardMaterial({ map: asph, roughness: 0.82, metalness: 0.0, envMapIntensity: 0.35 });
  const strasse = new THREE.Mesh(sweep(S, [(i) => [-S.w[i] / 2, 0], (i) => [S.w[i] / 2, 0]], { uMode: "col", vk: 1 / 24 }), matStrasse);
  strasse.receiveShadow = true; scene.add(strasse);

  // --- Kerbs
  const kerbT = texKerb();
  const matKerb = new THREE.MeshStandardMaterial({ map: kerbT, roughness: 0.7 });
  for (const sg of [-1, 1]) {
    const cols = sg > 0
      ? [(i) => [S.w[i] / 2, 0.02], (i) => [S.w[i] / 2 + KERB, 0.02]]
      : [(i) => [-S.w[i] / 2 - KERB, 0.02], (i) => [-S.w[i] / 2, 0.02]];
    const m = new THREE.Mesh(sweep(S, cols, { uMode: "col", vk: 1 / 4 }), matKerb);
    m.receiveShadow = true; scene.add(m);
  }

  // --- Gras-Streifen + Boeschung (fuehrt hinunter auf Gelaendehoehe)
  const bk = (sg) => {
    const dk = (i) => S.w[i] / 2 + KERB;
    const dw = (i) => S.w[i] / 2 + WAND_ABSTAND;
    const dh = (i) => dw(i) + 1.6;
    const fall = (i) => Math.max(0.2, S.y[i] - GROUND);
    const ds_ = (i) => dh(i) + Math.max(2.5, fall(i) * 2.2);
    const cols = [
      (i) => [sg * dk(i), 0.0], (i) => [sg * dw(i), 0.0], (i) => [sg * dh(i), 0.0],
      (i) => [sg * (dh(i) + (ds_(i) - dh(i)) * 0.5), -fall(i) * 0.7], (i) => [sg * ds_(i), -fall(i)],
    ];
    const m = new THREE.Mesh(sweep(S, sg > 0 ? cols : cols.slice().reverse(), { uk: 1 / 6, vk: 1 / 6 }), matGras);
    m.receiveShadow = true; scene.add(m);
  };
  bk(1); bk(-1);

  // --- Banden (Betonwand mit rot/weiss)
  const bandeT = texBande();
  const matBande = new THREE.MeshStandardMaterial({ map: bandeT, roughness: 0.75, side: THREE.DoubleSide });
  const matBandeOben = new THREE.MeshStandardMaterial({ color: 0xcfd2d8, roughness: 0.8, side: THREE.DoubleSide });
  for (const sg of [-1, 1]) {
    const dw = (i) => sg * (S.w[i] / 2 + WAND_ABSTAND);
    const dw2 = (i) => sg * (S.w[i] / 2 + WAND_ABSTAND + 0.7);
    const innen = new THREE.Mesh(sweep(S, [(i) => [dw(i), 0], (i) => [dw(i), 1.05]], { uMode: "col", vk: 1 / 12 }), matBande);
    const oben = new THREE.Mesh(sweep(S, [(i) => [dw(i), 1.05], (i) => [dw2(i), 1.05]], { uMode: "col", vk: 1 / 12 }), matBandeOben);
    const aussen = new THREE.Mesh(sweep(S, [(i) => [dw2(i), 1.05], (i) => [dw2(i), 0]], { uMode: "col", vk: 1 / 12 }), matBandeOben);
    for (const m of [innen, oben, aussen]) { m.castShadow = true; m.receiveShadow = true; scene.add(m); }
  }

  // --- Start-/Zielstreifen und Boost-Felder
  const matZiel = new THREE.MeshStandardMaterial({ map: texZiel(), roughness: 0.8 });
  const zielG = sweep(S, [(i) => [-S.w[i] / 2, 0.025], (i) => [S.w[i] / 2, 0.025]], { uMode: "col", vk: 1 / 24 });
  // nur wenige Stuetzpunkte um s=0 verwenden -> eigener Streifen
  const zielMesh = bauePad(S, 0, 2.2, (i) => S.w[i] / 2, matZiel, 0.035, 1, 8);
  zielMesh.receiveShadow = true; scene.add(zielMesh); void zielG;
  const boostTex = texBoost();
  const matBoost = new THREE.MeshStandardMaterial({ map: boostTex, emissive: 0xffffff, emissiveMap: boostTex, emissiveIntensity: 1.6, roughness: 0.4 });
  const boostMeshes = [];
  for (const b of S.boosts) {
    const m = bauePad(S, b.s, 4.2, () => 3.2, matBoost, 0.04, 1, 2, b.lat);
    scene.add(m); boostMeshes.push(m);
  }

  // --- Gelaende
  const TER = 1500, SEG = 190;
  const tg = new THREE.PlaneGeometry(TER, TER, SEG, SEG); tg.rotateX(-Math.PI / 2);
  const tp = tg.attributes.position, cols = new Float32Array(tp.count * 3);
  const cx = 100, cz = 150;
  const hoeheAn = (x, z) => {
    const dist = S.abstand(x, z, 120);
    const mask = smooth(34, 115, dist);
    const hill = Math.max(0, fbm(x * 0.0035 + 3, z * 0.0035 + 7) - 0.32) * 95;
    const kl = (vnoise(x * 0.025, z * 0.025) - 0.5) * 5;
    return GROUND + mask * (hill + kl + 1.2);
  };
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i) + cx, z = tp.getZ(i) + cz;
    const h = hoeheAn(x, z);
    tp.setXYZ(i, x, h, z);
    const rel = h - GROUND;
    const v = fbm(x * 0.05, z * 0.05, 3);
    let r = 0.55 + (v - 0.5) * 0.35, g = 0.80 + (v - 0.5) * 0.3, b = 0.45;
    if (rel > 28) { const t = Math.min(1, (rel - 28) / 30); r = r * (1 - t) + 0.62 * t; g = g * (1 - t) + 0.60 * t; b = b * (1 - t) + 0.56 * t; }
    cols[i * 3] = r; cols[i * 3 + 1] = g; cols[i * 3 + 2] = b;
  }
  tg.setAttribute("color", new THREE.BufferAttribute(cols, 3));
  const uvs = tg.attributes.uv; for (let i = 0; i < uvs.count; i++) uvs.setXY(i, tp.getX(i) / 14, tp.getZ(i) / 14);
  tg.computeVertexNormals();
  const matTer = new THREE.MeshStandardMaterial({ map: gras, vertexColors: true, roughness: 1, metalness: 0 });
  const gelaende = new THREE.Mesh(tg, matTer);
  gelaende.receiveShadow = true; scene.add(gelaende);

  // --- Berge am Horizont
  {
    const pos = [], col = [];
    const N = 26;
    for (let k = 0; k < N; k++) {
      const ang = (k / N) * Math.PI * 2 + rnd() * 0.2;
      const rad = 760 + rnd() * 260;
      const hh = 140 + rnd() * 200, br = 150 + rnd() * 120;
      const geo = new THREE.ConeGeometry(br, hh, 7, 3, true);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) {
        const t = (p.getY(i) + hh / 2) / hh;
        const j = (vnoise(p.getX(i) * 0.02 + k * 9, p.getZ(i) * 0.02) - 0.5) * 55 * (1 - t);
        p.setX(i, p.getX(i) + j); p.setZ(i, p.getZ(i) - j * 0.6); p.setY(i, p.getY(i) + (rnd() - 0.5) * 6 * (1 - t));
      }
      geo.translate(cx + Math.cos(ang) * rad, hh / 2 - 30, cz + Math.sin(ang) * rad);
      const ng = geo.toNonIndexed(); const q = ng.attributes.position;
      for (let i = 0; i < q.count; i++) {
        const t = (q.getY(i) + 30) / hh;
        let r = 0.36, g = 0.46, b = 0.38;
        if (t > 0.72) { r = g = b = 0.95; } else if (t > 0.45) { r = 0.50; g = 0.50; b = 0.52; }
        col.push(r, g, b); pos.push(q.getX(i), q.getY(i), q.getZ(i));
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    scene.add(m);
  }

  // --- Baeume (instanziert)
  {
    const trunk = new THREE.CylinderGeometry(0.22, 0.34, 2.4, 5); trunk.translate(0, 1.2, 0);
    const kegel1 = new THREE.ConeGeometry(1.9, 3.8, 7); kegel1.translate(0, 4.0, 0);
    const kegel2 = new THREE.ConeGeometry(1.4, 3.0, 7); kegel2.translate(0, 6.0, 0);
    const kugel = new THREE.IcosahedronGeometry(2.1, 0); kugel.translate(0, 4.2, 0);
    const matStamm = new THREE.MeshLambertMaterial({ color: 0x6b4a2f });
    const matNadel = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    const matLaub = new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true });
    const NADEL = 900, LAUB = 450;
    const iStamm = new THREE.InstancedMesh(trunk, matStamm, NADEL + LAUB);
    const iK1 = new THREE.InstancedMesh(kegel1, matNadel, NADEL), iK2 = new THREE.InstancedMesh(kegel2, matNadel, NADEL);
    const iLaub = new THREE.InstancedMesh(kugel, matLaub, LAUB);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3(), c = new THREE.Color();
    let nn = 0, nl = 0, tries = 0;
    while ((nn < NADEL || nl < LAUB) && tries < 40000) {
      tries++;
      const x = cx + (rnd() - 0.5) * 900, z = cz + (rnd() - 0.5) * 900;
      const dist = S.abstand(x, z, 60);
      if (dist < 26) continue;
      const wald = fbm(x * 0.006 + 11, z * 0.006 + 5);
      if (rnd() > smooth(0.38, 0.62, wald) * 0.9 + (dist < 70 ? 0.12 : 0)) continue;
      const y = hoeheAn(x, z);
      const s = 0.8 + rnd() * 0.9;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rnd() * 6.28);
      sv.set(s, s * (0.9 + rnd() * 0.5), s); pv.set(x, y - 0.2, z);
      m4.compose(pv, q, sv);
      const laub = wald < 0.5 && nl < LAUB || nn >= NADEL;
      if (laub && nl < LAUB) {
        iLaub.setMatrixAt(nl, m4); c.setHSL(0.24 + rnd() * 0.1, 0.5, 0.33 + rnd() * 0.12); iLaub.setColorAt(nl, c);
        iStamm.setMatrixAt(NADEL + nl, m4); nl++;
      } else if (nn < NADEL) {
        iK1.setMatrixAt(nn, m4); iK2.setMatrixAt(nn, m4);
        c.setHSL(0.36 + rnd() * 0.06, 0.55, 0.2 + rnd() * 0.08); iK1.setColorAt(nn, c); iK2.setColorAt(nn, c);
        iStamm.setMatrixAt(nn, m4); nn++;
      }
    }
    iK1.count = nn; iK2.count = nn; iLaub.count = nl;
    // Staemme: Nadelbaeume 0..nn, Laub NADEL..NADEL+nl -> zusammenlegen
    iStamm.count = NADEL + nl;
    for (const m of [iStamm, iK1, iK2, iLaub]) { m.castShadow = true; m.receiveShadow = false; m.frustumCulled = false; m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; scene.add(m); }
    // ungenutzte Stamm-Plaetze zwischen nn und NADEL verstecken
    const nullM = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = nn; i < NADEL; i++) iStamm.setMatrixAt(i, nullM);
  }

  // --- Werbebanden an der Aussenseite der Banden
  {
    const wt = texWerbung();
    const matW = new THREE.MeshStandardMaterial({ map: wt, roughness: 0.5, emissive: 0xffffff, emissiveMap: wt, emissiveIntensity: 0.35, side: THREE.DoubleSide });
    const plane = new THREE.PlaneGeometry(9, 1.8);
    const gruppe = new THREE.Group();
    let k = 0;
    for (let s = 40; s < S.laenge; s += 62) {
      const i = Math.round(s / S.ds) % S.n;
      const sg = (k % 2) ? 1 : -1;
      const lat = sg * (S.w[i] / 2 + WAND_ABSTAND + 0.8);
      const geo = plane.clone();
      const uvA = geo.attributes.uv; const idx = k % 5;
      for (let u = 0; u < uvA.count; u++) uvA.setY(u, (4 - idx + uvA.getY(u)) / 5);
      const m = new THREE.Mesh(geo, matW);
      m.position.set(S.x[i] - S.tz[i] * lat, S.y[i] + 1.05 + 0.9, S.z[i] + S.tx[i] * lat);
      m.rotation.y = Math.atan2(S.tx[i], S.tz[i]) + (sg > 0 ? Math.PI / 2 : -Math.PI / 2);
      m.castShadow = false; gruppe.add(m);
      // Stuetzen
      k++;
    }
    scene.add(gruppe);
  }

  // --- Tribuene an der Start-/Zielgeraden
  {
    const i0 = Math.round(18 / S.ds);
    const rx = -S.tz[i0], rz = S.tx[i0];
    const lat = S.w[i0] / 2 + WAND_ABSTAND + 5;
    const g = new THREE.Group();
    const th = Math.atan2(S.tx[i0], S.tz[i0]);
    const matB = new THREE.MeshStandardMaterial({ color: 0xdadde4, roughness: 0.9 });
    const matSitz = new THREE.MeshStandardMaterial({ color: 0x2a64d4, roughness: 0.8 });
    for (let r = 0; r < 5; r++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(5, 1.0, 54), matB);
      st.position.set(r * 1.7 + 2.5, 0.5 + r * 1.0, 0); st.castShadow = true; st.receiveShadow = true; g.add(st);
      const sit = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 54), matSitz);
      sit.position.set(r * 1.7 + 0.2, 1.1 + r * 1.0, 0); g.add(sit);
    }
    // Publikum
    const farben = [0xff4d4d, 0xffd23f, 0x3fa7ff, 0xffffff, 0x4dd16a, 0xff8c42, 0xb26bff];
    const leute = new THREE.InstancedMesh(new THREE.BoxGeometry(0.45, 0.9, 0.45), new THREE.MeshLambertMaterial({ color: 0xffffff }), 5 * 70);
    const mm = new THREE.Matrix4(), cc = new THREE.Color(); let q = 0;
    for (let r = 0; r < 5; r++) for (let k = 0; k < 70; k++) {
      mm.makeTranslation(r * 1.7 + 0.35 + rnd() * 0.5, 1.55 + r * 1.0 + rnd() * 0.12, -26 + k * 0.77 + rnd() * 0.3);
      leute.setMatrixAt(q, mm); cc.setHex(farben[Math.floor(rnd() * farben.length)]); leute.setColorAt(q, cc); q++;
    }
    leute.castShadow = true; g.add(leute);
    const dach = new THREE.Mesh(new THREE.BoxGeometry(11, 0.3, 56), new THREE.MeshStandardMaterial({ color: 0xf5f5f7, roughness: 0.6 }));
    dach.position.set(5.2, 9.0, 0); dach.castShadow = true; g.add(dach);
    for (const zz of [-26, 26]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.4, 9, 0.4), matB); p.position.set(0.2, 4.5, zz); g.add(p); }
    // Platzierung rechts der Strecke; lokales +x zeigt nach aussen
    g.position.set(S.x[i0] + rx * lat, S.y[i0] + GROUND * 0 - 0.2, S.z[i0] + rz * lat);
    g.rotation.y = th + Math.PI;     // lokales +x zeigt nach rechts/aussen, lokales z liegt entlang der Strecke
    // lokales +x muss nach aussen (= rechts) zeigen: rechts = (-tz, tx) -> bei rotation.y=th-pi/2 ist lokal x = (cos(th-pi/2),..)
    scene.add(g);
  }

  // --- Start-Bogen und Checkpoint-Tore
  const tore = [];
  function bogen(i, breite, hoehe, farbe, texte, gross) {
    const g = new THREE.Group();
    const w = S.w[i] / 2 + 1.6;
    const mat = new THREE.MeshStandardMaterial({ color: farbe, emissive: farbe, emissiveIntensity: 1.1, roughness: 0.4, metalness: 0.4 });
    for (const sg of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.7, hoehe, 0.7), gross ? new THREE.MeshStandardMaterial({ color: 0x20242e, roughness: 0.5 }) : mat);
      p.position.set(sg * w, hoehe / 2, 0); p.castShadow = true; g.add(p);
    }
    const balken = new THREE.Mesh(new THREE.BoxGeometry(w * 2 + 0.7, gross ? 2.6 : 0.5, 0.7), gross ? new THREE.MeshStandardMaterial({ color: 0x20242e, roughness: 0.5 }) : mat);
    balken.position.set(0, hoehe - (gross ? 1.3 : 0.25), 0); balken.castShadow = true; g.add(balken);
    let banner = null;
    if (texte) {
      banner = new THREE.Mesh(new THREE.PlaneGeometry(w * 2 - 0.4, gross ? 2.3 : 0.9), new THREE.MeshBasicMaterial({ map: texte, side: THREE.DoubleSide, toneMapped: false }));
      banner.position.set(0, hoehe - (gross ? 1.3 : 0.25), 0.4); g.add(banner);
      const b2 = banner.clone(); b2.position.z = -0.4; b2.rotation.y = Math.PI; g.add(b2);
    }
    if (!gross) {
      // leuchtender Vorhang
      const vh = new THREE.Mesh(new THREE.PlaneGeometry(w * 2, hoehe - 0.5), new THREE.MeshBasicMaterial({ color: farbe, transparent: true, opacity: 0.10, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
      vh.position.set(0, (hoehe - 0.5) / 2, 0); g.add(vh);
      g.userData.vorhang = vh;
    }
    g.userData.mat = mat;
    g.position.set(S.x[i], S.y[i], S.z[i]);
    g.rotation.y = Math.atan2(S.tx[i], S.tz[i]);
    scene.add(g);
    return g;
  }
  const startBogen = bogen(0, 0, 9.5, 0xffffff, texBanner("START · ZIEL", "TROLLHOUSE TURBO"), true);
  S.checkpoints.forEach((p, k) => {
    const i = Math.round(p * S.n) % S.n;
    tore.push(bogen(i, 0, 6.2, 0x00e5ff, texBanner("CP " + (k + 1), ""), false));
  });
  const setzeTor = (k, status) => {   // 0 = offen, 1 = gruen (geschafft), 2 = aktuell naechstes
    const g = tore[k]; if (!g) return;
    const col = status === 1 ? 0x35ff7a : status === 2 ? 0xffe14d : 0x00e5ff;
    g.userData.mat.color.setHex(col); g.userData.mat.emissive.setHex(col);
    if (g.userData.vorhang) g.userData.vorhang.material.color.setHex(col);
  };

  // Schatten folgt dem Auto
  function folge(x, y, z) {
    sonne.target.position.set(x, y, z);
    sonne.position.set(x + sunDir.x * 110, y + sunDir.y * 110, z + sunDir.z * 110);
  }
  const boostAnim = (t) => { boostTex.offset.y = -t * 1.2; };

  return { scene, himmel, sonne, hemi, folge, sunDir, setzeTor, tore, boostAnim, hor, startBogen, hoeheAn };
}

// Flaches Stueck entlang der Strecke (Boost-Feld, Zielstreifen)
function bauePad(S, s, laenge, halbFn, mat, yOff, uRep, vRep, lat0 = 0) {
  const n = S.n;
  const i0 = Math.round((s - laenge / 2) / S.ds), i1 = Math.round((s + laenge / 2) / S.ds);
  const pos = [], uv = [], idx = [];
  const cnt = Math.max(1, i1 - i0);
  for (let k = 0; k <= cnt; k++) {
    const i = ((i0 + k) % n + n) % n;
    const rx = -S.tz[i], rz = S.tx[i];
    const hw = halbFn(i);
    for (const sg of [-1, 1]) {
      const l = lat0 + sg * hw;
      pos.push(S.x[i] + rx * l, S.y[i] + yOff, S.z[i] + rz * l);
      uv.push(sg > 0 ? uRep : 0, (k / cnt) * vRep);
    }
  }
  for (let k = 0; k < cnt; k++) { const a = k * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, b, c, b, d, c); }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

export { baueHimmel, HORIZONT };
