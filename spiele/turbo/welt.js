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


// ---------- Themen: Farben, Licht, Untergrund (alle Strecken teilen sich denselben Weltbau)
const THEMEN = {
  tag: {
    himmel: { hor: [0.74, 0.85, 0.97], zen: [0.16, 0.40, 0.86], sonne: [1.0, 0.80, 0.55], boden: [0.34, 0.42, 0.28], nacht: false, wolken: 0.9 },
    nebel: { c: [0.71, 0.82, 0.93], von: 240, bis: 1250 },
    hemi: [0xbcd8ff, 0x6f8a4e, 1.0], sonne: { farbe: 0xfff0d8, st: 3.1, dir: [-0.55, 0.62, 0.45] },
    env: 0.55, bloom: 0.5, belichtung: 1.0,
    boden: { basis: "#7fae4a", hue: [85, 110], sat: 45, tint: 0xa6d078 },
    gelaende: { r: 0.55, g: 0.80, b: 0.45, fels: [0.62, 0.60, 0.56], hill: 95, schnee: false },
    strasse: { basis: "#3b3e46", tint: 0xffffff, linie: "rgba(240,240,240,0.92)", spur: 0.10, rau: 0.82 },
    kerb: ["#d8232a", "#e6e6e6"], bande: ["#d8232a", "#ececec"], banner: ["#ff3d6e", "#ff9a1f", "#ffd400"],
    berge: { form: "kegel", unten: [0.36, 0.46, 0.38], mitte: [0.50, 0.50, 0.52], oben: [0.95, 0.95, 0.95], hoeheMin: 140, hoeheVar: 200 },
    deko: "wald", flutlicht: false, schnee: false,
  },
  wueste: {
    himmel: { hor: [0.98, 0.82, 0.60], zen: [0.30, 0.52, 0.86], sonne: [1.0, 0.72, 0.40], boden: [0.80, 0.62, 0.40], nacht: false, wolken: 0.25 },
    nebel: { c: [0.93, 0.78, 0.60], von: 200, bis: 1150 },
    hemi: [0xffe2b8, 0xb07a4a, 1.0], sonne: { farbe: 0xffe2b0, st: 3.5, dir: [-0.6, 0.55, 0.4] },
    env: 0.5, bloom: 0.45, belichtung: 1.02,
    boden: { basis: "#d6a463", hue: [28, 40], sat: 55, tint: 0xf2cf98 },
    gelaende: { r: 0.88, g: 0.67, b: 0.42, fels: [0.70, 0.40, 0.26], hill: 55, schnee: false },
    strasse: { basis: "#a8794a", tint: 0xffe2c4, linie: "rgba(250,236,200,0.55)", spur: 0.20, rau: 0.95 },
    kerb: ["#e8731a", "#f1e6d2"], bande: ["#e8731a", "#f1e6d2"], banner: ["#ff7a1a", "#ffb02e", "#ffe14d"],
    berge: { form: "mesa", unten: [0.58, 0.31, 0.20], mitte: [0.74, 0.46, 0.28], oben: [0.86, 0.62, 0.40], hoeheMin: 90, hoeheVar: 120 },
    deko: "wueste", flutlicht: false, schnee: false,
  },
  herbst: {
    himmel: { hor: [0.86, 0.80, 0.70], zen: [0.40, 0.55, 0.78], sonne: [1.0, 0.70, 0.40], boden: [0.45, 0.33, 0.20], nacht: false, wolken: 0.8 },
    nebel: { c: [0.80, 0.74, 0.66], von: 200, bis: 1000 },
    hemi: [0xffe3c2, 0x7a5a3a, 1.0], sonne: { farbe: 0xffd9a8, st: 2.8, dir: [-0.7, 0.38, 0.4] },
    env: 0.5, bloom: 0.55, belichtung: 1.0,
    boden: { basis: "#8a6a35", hue: [25, 45], sat: 50, tint: 0xd9b070 },
    gelaende: { r: 0.62, g: 0.50, b: 0.30, fels: [0.5, 0.42, 0.35], hill: 85, schnee: false },
    strasse: { basis: "#6b5a47", tint: 0xffe8d0, linie: "rgba(240,225,200,0.5)", spur: 0.22, rau: 0.95 },
    kerb: ["#c2461e", "#f0e3cf"], bande: ["#8a5a2c", "#e9dcc3"], banner: ["#d9531e", "#f2a03d", "#ffd166"],
    berge: { form: "kegel", unten: [0.35, 0.28, 0.20], mitte: [0.55, 0.40, 0.28], oben: [0.75, 0.62, 0.50], hoeheMin: 120, hoeheVar: 180 },
    deko: "herbst", flutlicht: false, schnee: false,
  },
  schnee: {
    himmel: { hor: [0.86, 0.91, 0.97], zen: [0.42, 0.60, 0.90], sonne: [1.0, 0.94, 0.86], boden: [0.90, 0.94, 1.0], nacht: false, wolken: 1.0 },
    nebel: { c: [0.86, 0.91, 0.97], von: 150, bis: 900 },
    hemi: [0xdfeaff, 0xdfe6f2, 1.1], sonne: { farbe: 0xfff4e6, st: 2.5, dir: [-0.45, 0.55, 0.5] },
    env: 0.7, bloom: 0.5, belichtung: 0.98,
    boden: { basis: "#eef3fb", hue: [205, 225], sat: 25, tint: 0xf4f8ff },
    gelaende: { r: 0.93, g: 0.96, b: 1.0, fels: [0.55, 0.58, 0.64], hill: 110, schnee: true },
    strasse: { basis: "#575d6a", tint: 0xe4ecf8, linie: "rgba(240,246,255,0.9)", spur: 0.16, rau: 0.35 },
    kerb: ["#2f7fe0", "#f1f6ff"], bande: ["#2f7fe0", "#eef3fb"], banner: ["#2aa3ff", "#5be0ff", "#a8f0ff"],
    berge: { form: "kegel", unten: [0.42, 0.48, 0.58], mitte: [0.80, 0.83, 0.90], oben: [1.0, 1.0, 1.0], hoeheMin: 200, hoeheVar: 220 },
    deko: "schnee", flutlicht: false, schnee: true,
  },
  nacht: {
    himmel: { hor: [0.07, 0.09, 0.20], zen: [0.008, 0.012, 0.05], sonne: [0.55, 0.65, 1.0], boden: [0.03, 0.05, 0.08], nacht: true, wolken: 0.0 },
    nebel: { c: [0.035, 0.045, 0.10], von: 80, bis: 760 },
    hemi: [0x5a70b0, 0x252c42, 1.2], sonne: { farbe: 0x9db8ff, st: 1.7, dir: [-0.5, 0.6, 0.45] },
    env: 0.22, bloom: 0.95, belichtung: 1.15,
    boden: { basis: "#1e3a2b", hue: [130, 160], sat: 30, tint: 0x6a8a74 },
    gelaende: { r: 0.15, g: 0.27, b: 0.20, fels: [0.2, 0.22, 0.3], hill: 40, schnee: false },
    strasse: { basis: "#2c2f38", tint: 0xffffff, linie: "rgba(240,240,240,0.9)", spur: 0.10, rau: 0.55 },
    kerb: ["#ff2d95", "#e6e6e6"], bande: ["#10d8ff", "#1c2130"], banner: ["#ff2d95", "#a02dff", "#10d8ff"],
    berge: { form: "kegel", unten: [0.05, 0.07, 0.13], mitte: [0.07, 0.09, 0.17], oben: [0.12, 0.15, 0.26], hoeheMin: 120, hoeheVar: 160 },
    deko: "stadt", flutlicht: true, schnee: false,
  },
};

// ---------- Themen-Texturen
function texAsphalt(t) {
  // u quer ueber die Fahrbahn, v laengs (eine Kachel = 24 m)
  return canvasTex(512, 1024, (ctx, w, h) => {
    ctx.fillStyle = t.basis; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 40; i++) { ctx.fillStyle = `rgba(${Math.random() > 0.5 ? "255,255,255" : "0,0,0"},0.025)`; ctx.fillRect(0, Math.random() * h, w, 6 + Math.random() * 40); }
    rauschen(ctx, w, h, 22000, 0.22);
    // dunkle Fahrspur (Gummiabrieb bzw. Reifenspuren)
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(0.22, `rgba(0,0,0,${t.spur})`); g.addColorStop(0.3, "rgba(0,0,0,0)");
    g.addColorStop(0.7, "rgba(0,0,0,0)"); g.addColorStop(0.78, `rgba(0,0,0,${t.spur})`); g.addColorStop(1, "rgba(0,0,0,0)");
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    // Randlinien
    ctx.fillStyle = t.linie;
    ctx.fillRect(w * 0.025, 0, w * 0.018, h); ctx.fillRect(w * 0.957, 0, w * 0.018, h);
    // gestrichelte Mittellinie
    ctx.fillRect(w * 0.495, h * 0.05, w * 0.012, h * 0.4);
    rauschen(ctx, w, h, 3000, 0.4);
  });
}
function texKerb(farben) {
  return canvasTex(64, 128, (ctx, w, h) => {
    ctx.fillStyle = farben[1]; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = farben[0]; ctx.fillRect(0, 0, w, h / 2);
    rauschen(ctx, w, h, 600, 0.3);
  });
}
function texBande(farben) {
  return canvasTex(256, 64, (ctx, w, h) => {
    ctx.fillStyle = farben[1]; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = farben[0]; ctx.fillRect(0, 0, w / 2, h);
    ctx.fillStyle = "rgba(0,0,0,0.10)"; ctx.fillRect(0, h * 0.82, w, h * 0.18);
    rauschen(ctx, w, h, 900, 0.3);
  });
}
function texGras(b) {
  return canvasTex(256, 256, (ctx, w, h) => {
    ctx.fillStyle = b.basis; ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 5000; i++) {
      const l = 40 + Math.random() * 30;
      ctx.fillStyle = `hsla(${b.hue[0] + Math.random() * (b.hue[1] - b.hue[0])},${b.sat}%,${l}%,0.35)`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 1 + Math.random() * 3, 2 + Math.random() * 5);
    }
  }, { aniso: 4 });
}
// Schilder
function texZahl(text, farbe = "#d8232a") {
  return canvasTex(128, 96, (ctx, w, h) => {
    ctx.fillStyle = "#f6f6f6"; ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = farbe; ctx.lineWidth = 9; ctx.strokeRect(5, 5, w - 10, h - 10);
    ctx.fillStyle = "#111"; ctx.font = "900 56px system-ui, Arial Black, sans-serif"; ctx.textAlign = "center"; ctx.textBaseline = "middle";
    ctx.fillText(text, w / 2, h / 2 + 3);
  }, { repeat: false, aniso: 4 });
}
function texPfeil(farbe) {
  return canvasTex(128, 64, (ctx, w, h) => {
    ctx.fillStyle = "#f4f4f4"; ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = farbe;
    for (const x0 of [14, 62]) { ctx.beginPath(); ctx.moveTo(x0, 6); ctx.lineTo(x0 + 26, 6); ctx.lineTo(x0 + 50, h / 2); ctx.lineTo(x0 + 26, h - 6); ctx.lineTo(x0, h - 6); ctx.lineTo(x0 + 24, h / 2); ctx.closePath(); ctx.fill(); }
  }, { repeat: false, aniso: 4 });
}
function texFenster() {
  return canvasTex(128, 256, (ctx, w, h) => {
    ctx.fillStyle = "#0a0d16"; ctx.fillRect(0, 0, w, h);
    for (let y = 6; y < h - 6; y += 14) for (let x = 6; x < w - 6; x += 12) {
      const r = Math.random();
      if (r < 0.38) { ctx.fillStyle = r < 0.26 ? "#ffd98a" : r < 0.33 ? "#9fd8ff" : "#ff8ad8"; ctx.fillRect(x, y, 7, 8); }
    }
  }, { aniso: 4 });
}
function texGlow(rgb) {
  const c = document.createElement("canvas"); c.width = c.height = 128;
  const x = c.getContext("2d");
  const g = x.createRadialGradient(64, 64, 2, 64, 64, 64);
  g.addColorStop(0, `rgba(${rgb},1)`); g.addColorStop(0.35, `rgba(${rgb},0.45)`); g.addColorStop(1, `rgba(${rgb},0)`);
  x.fillStyle = g; x.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
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
function texBanner(text, sub, f = ["#ff3d6e", "#ff9a1f", "#ffd400"]) {
  return canvasTex(1024, 160, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, 0);
    g.addColorStop(0, f[0]); g.addColorStop(0.5, f[1]); g.addColorStop(1, f[2]);
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
function baueHimmel(sunDir, th = THEMEN.tag.himmel) {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, depthTest: false, fog: false,
    uniforms: {
      sunDir: { value: sunDir.clone() }, time: { value: 0 },
      hor: { value: new THREE.Vector3(...th.hor) }, zen: { value: new THREE.Vector3(...th.zen) },
      sunC: { value: new THREE.Vector3(...th.sonne) }, bod: { value: new THREE.Vector3(...th.boden) },
      nacht: { value: th.nacht ? 1 : 0 }, wolken: { value: th.wolken },
    },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: `
      uniform vec3 sunDir; uniform float time; uniform vec3 hor; uniform vec3 zen; uniform vec3 sunC; uniform vec3 bod; uniform float nacht; uniform float wolken; varying vec3 vDir;
      float h(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453); }
      float n(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.-2.*f); return mix(mix(h(i),h(i+vec2(1,0)),f.x), mix(h(i+vec2(0,1)),h(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float s=0., a=.5; for(int i=0;i<4;i++){ s+=a*n(p); p*=2.02; a*=.5; } return s; }
      void main(){
        vec3 d = normalize(vDir);
        float y = max(d.y, 0.0);
        vec3 col = mix(hor, zen, pow(y, 0.5));
        vec3 sd3 = normalize(sunDir);
        float sd = max(dot(d, sd3), 0.0);
        if (nacht < 0.5) {
          col += sunC * vec3(1.0,0.80,0.55) * pow(sd, 6.0) * 0.30;
          col += vec3(1.0,0.92,0.75) * pow(sd, 700.0) * 6.0;
        } else {
          // Mond und Sterne
          col += sunC * pow(sd, 18.0) * 0.10;
          col += vec3(0.85,0.9,1.0) * smoothstep(0.9993, 0.9998, sd) * 3.0;
          if (d.y > 0.02) {
            vec2 sp = d.xz / (d.y + 0.3) * 60.0;
            float st = h(floor(sp));
            float tw = 0.6 + 0.4 * sin(time * 2.0 + st * 40.0);
            col += vec3(0.8,0.85,1.0) * step(0.985, st) * tw * smoothstep(0.02, 0.3, d.y) * 1.3;
          }
          // Lichtglocke der Stadt am Horizont
          col += vec3(0.30,0.14,0.34) * pow(1.0 - y, 6.0) * 0.55;
        }
        if (d.y > 0.0 && wolken > 0.01) {
          vec2 p = d.xz / (d.y + 0.22) * 1.4 + vec2(time*0.006, 0.0);
          float c = smoothstep(0.50, 0.82, fbm(p*1.2));
          vec3 cc = mix(vec3(0.80,0.84,0.92), vec3(1.0,0.98,0.95), clamp(sd*1.2,0.,1.));
          col = mix(col, cc, c * smoothstep(0.0, 0.22, d.y) * 0.9 * wolken);
        }
        col = mix(col, bod, smoothstep(0.0, -0.3, d.y));
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
  const pos = new Float32Array(n * m * 3), uv = new Float32Array(n * m * 2);
  for (let k = 0; k < n; k++) {
    const i = k;
    const rx = S.RXA[i], rz = S.RZA[i], nx = S.NX[i], ny = S.NY[i], nz = S.NZ[i];
    for (let j = 0; j < m; j++) {
      const [lat, y] = cols[j](i);
      const o = (k * m + j);
      pos[o * 3] = S.x[i] + rx * lat + nx * y; pos[o * 3 + 1] = S.y[i] + ny * y; pos[o * 3 + 2] = S.z[i] + rz * lat + nz * y;
      uv[o * 2] = uMode === "lat" ? lat * uk : j * uk; uv[o * 2 + 1] = k * S.ds * vk;
    }
  }
  const idx = [];
  for (let k = 0; k < n - 1; k++) for (let j = 0; j < m - 1; j++) {
    const a = k * m + j, b = k * m + j + 1, c = (k + 1) * m + j, d = (k + 1) * m + j + 1;
    if (seitenwechsel) idx.push(a, c, b, b, c, d); else idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return g;
}


// ---------- Geometrie zusammenfassen (viele kleine Teile -> ein Zeichenaufruf)
function fuse(list) {
  const pos = [], nor = [], uv = [], idx = [];
  let off = 0;
  for (const g of list) {
    const p = g.attributes.position, n = g.attributes.normal, u = g.attributes.uv;
    for (let i = 0; i < p.count; i++) {
      pos.push(p.getX(i), p.getY(i), p.getZ(i)); nor.push(n.getX(i), n.getY(i), n.getZ(i)); uv.push(u ? u.getX(i) : 0, u ? u.getY(i) : 0);
    }
    if (g.index) for (let k = 0; k < g.index.count; k++) idx.push(g.index.getX(k) + off); else for (let i = 0; i < p.count; i++) idx.push(i + off);
    off += p.count;
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("normal", new THREE.Float32BufferAttribute(nor, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  return g;
}
// Instanzen: liste = [{x,y,z,s,ry,sy,col}]
function instanziere(geo, mat, liste, { schatten = true } = {}) {
  const m = new THREE.InstancedMesh(geo, mat, Math.max(1, liste.length));
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sv = new THREE.Vector3(), pv = new THREE.Vector3(), c = new THREE.Color();
  const up = new THREE.Vector3(0, 1, 0);
  liste.forEach((o, k) => {
    q.setFromAxisAngle(up, o.ry || 0); const s = o.s || 1;
    sv.set(s, (o.sy || 1) * s, s); pv.set(o.x, o.y, o.z);
    m4.compose(pv, q, sv); m.setMatrixAt(k, m4);
    if (o.col != null) { c.set(o.col); m.setColorAt(k, c); }
  });
  m.count = liste.length;
  m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true;
  m.castShadow = schatten; m.receiveShadow = false; m.frustumCulled = false;
  return m;
}

export function baueWelt(S, opt = {}) {
  const T = THEMEN[S.def.thema] || THEMEN.tag;
  seed = 12345 + S.def.id.length * 977;
  const scene = new THREE.Scene();
  const sunDir = new THREE.Vector3(...T.sonne.dir).normalize();
  const hor = new THREE.Color().setRGB(...T.himmel.hor, THREE.LinearSRGBColorSpace);
  scene.background = hor.clone();
  scene.fog = new THREE.Fog(new THREE.Color().setRGB(...T.nebel.c, THREE.LinearSRGBColorSpace), T.nebel.von, T.nebel.bis);

  const himmel = baueHimmel(sunDir, T.himmel);
  scene.add(himmel);

  // Ausdehnung der Strecke
  let minX = 1e9, maxX = -1e9, minZ = 1e9, maxZ = -1e9;
  for (let i = 0; i < S.n; i++) { minX = Math.min(minX, S.x[i]); maxX = Math.max(maxX, S.x[i]); minZ = Math.min(minZ, S.z[i]); maxZ = Math.max(maxZ, S.z[i]); }
  const cx = (minX + maxX) / 2, cz = (minZ + maxZ) / 2, ext = Math.max(maxX - minX, maxZ - minZ);

  // Lichter
  const hemi = new THREE.HemisphereLight(T.hemi[0], T.hemi[1], T.hemi[2]);
  scene.add(hemi);
  const sonne = new THREE.DirectionalLight(T.sonne.farbe, T.sonne.st);
  sonne.castShadow = true;
  const sm = opt.schatten || 2048;
  sonne.shadow.mapSize.set(sm, sm);
  const sc = sonne.shadow.camera; sc.left = -42; sc.right = 42; sc.top = 42; sc.bottom = -42; sc.near = 1; sc.far = 260;
  sonne.shadow.bias = -0.0004; sonne.shadow.normalBias = 0.05;
  scene.add(sonne); scene.add(sonne.target);

  const gras = texGras(T.boden); gras.repeat.set(1, 1);
  const matGras = new THREE.MeshStandardMaterial({ map: gras, color: T.boden.tint, roughness: 1, metalness: 0 });

  // --- Fahrbahn
  const asph = texAsphalt(T.strasse);
  const matStrasse = new THREE.MeshStandardMaterial({ map: asph, color: T.strasse.tint, roughness: T.strasse.rau, metalness: 0.0, envMapIntensity: T.schnee ? 0.6 : 0.35, side: THREE.DoubleSide });
  const strasse = new THREE.Mesh(sweep(S, [(i) => [-S.w[i] / 2, 0], (i) => [S.w[i] / 2, 0]], { uMode: "col", vk: 1 / 24 }), matStrasse);
  strasse.receiveShadow = true; scene.add(strasse);

  // --- Kerbs
  const matKerb = new THREE.MeshStandardMaterial({ map: texKerb(T.kerb), roughness: 0.7, side: THREE.DoubleSide });
  for (const sg of [-1, 1]) {
    const cols = sg > 0
      ? [(i) => [S.w[i] / 2, 0.02], (i) => [S.w[i] / 2 + KERB, 0.02]]
      : [(i) => [-S.w[i] / 2 - KERB, 0.02], (i) => [-S.w[i] / 2, 0.02]];
    const m = new THREE.Mesh(sweep(S, cols, { uMode: "col", vk: 1 / 4 }), matKerb);
    m.receiveShadow = true; scene.add(m);
  }

  // --- Gras-/Sand-/Schneestreifen + Boeschung (fuehrt auf Gelaendehoehe hinunter)
  const FALL = 1.7;
  const bk = (sg) => {
    const dk = (i) => S.w[i] / 2 + KERB;
    const dw = (i) => S.w[i] / 2 + WAND_ABSTAND;
    const dh = (i) => dw(i) + 1.6;
    const ds_ = (i) => dh(i) + 2.6;
    const ls = (i) => S.loopIdx[i] >= 0;     // in der Schleife gibt es keinen Grasstreifen
    const fl = (fn) => (i) => (ls(i) ? [sg * dk(i), 0.0] : fn(i));
    const cols = [
      (i) => [sg * dk(i), 0.0], fl((i) => [sg * dw(i), 0.0]), fl((i) => [sg * dh(i), 0.0]),
      fl((i) => [sg * (dh(i) + (ds_(i) - dh(i)) * 0.5), -FALL * 0.7]), fl((i) => [sg * ds_(i), -FALL]),
    ];
    const m = new THREE.Mesh(sweep(S, sg > 0 ? cols : cols.slice().reverse(), { uk: 1 / 6, vk: 1 / 6 }), matGras);
    m.receiveShadow = true; scene.add(m);
  };
  bk(1); bk(-1);

  // --- Banden
  const bandeT = texBande(T.bande);
  const matBande = new THREE.MeshStandardMaterial({ map: bandeT, roughness: 0.75, side: THREE.DoubleSide, emissive: T.flutlicht ? 0xffffff : 0x000000, emissiveMap: T.flutlicht ? bandeT : null, emissiveIntensity: T.flutlicht ? 0.55 : 0 });
  const matBandeOben = new THREE.MeshStandardMaterial({ color: T.flutlicht ? 0x39425a : 0xcfd2d8, roughness: 0.8, side: THREE.DoubleSide });
  for (const sg of [-1, 1]) {
    const dw = (i) => sg * (S.w[i] / 2 + (S.loopIdx[i] >= 0 ? KERB + 0.25 : WAND_ABSTAND));
    const dw2 = (i) => sg * (S.w[i] / 2 + (S.loopIdx[i] >= 0 ? KERB + 0.55 : WAND_ABSTAND + 0.7));
    const innen = new THREE.Mesh(sweep(S, [(i) => [dw(i), 0], (i) => [dw(i), 1.05]], { uMode: "col", vk: 1 / 12 }), matBande);
    const oben = new THREE.Mesh(sweep(S, [(i) => [dw(i), 1.05], (i) => [dw2(i), 1.05]], { uMode: "col", vk: 1 / 12 }), matBandeOben);
    const aussen = new THREE.Mesh(sweep(S, [(i) => [dw2(i), 1.05], (i) => [dw2(i), 0]], { uMode: "col", vk: 1 / 12 }), matBandeOben);
    for (const m of [innen, oben, aussen]) { m.castShadow = true; m.receiveShadow = true; scene.add(m); }
  }

  // --- Looping: Stuetzwaende hinter dem aufsteigenden und absteigenden Teil
  for (const L of S.loops) {
    const matS = new THREE.MeshStandardMaterial({ color: T.flutlicht ? 0x39425a : 0xc8ccd6, roughness: 0.7, metalness: 0.2 });
    for (const [q, sg] of [[0.25, 1], [0.75, -1]]) {
      const i = Math.round(L.i0 + (L.i1 - L.i0) * q);
      const y0 = S.y[L.i0] - 0.6, h = S.y[i] - y0 - 0.7;
      const m = new THREE.Mesh(new THREE.BoxGeometry(S.w[i] + 3.2, h, 1.3), matS);
      m.position.set(S.x[i] + L.fx * sg * 1.1, y0 + h / 2, S.z[i] + L.fz * sg * 1.1);
      m.rotation.y = Math.atan2(L.fx, L.fz); m.castShadow = true; m.receiveShadow = true; scene.add(m);
    }
  }

  // --- Start-/Zielstreifen und Boost-Felder
  const matZiel = new THREE.MeshStandardMaterial({ map: texZiel(), roughness: 0.8 });
  for (const sPad of [S.startS, S.zielS]) {
    const zm = bauePad(S, sPad, 2.2, (i) => S.w[i] / 2, matZiel, 0.035, 1, 8);
    zm.receiveShadow = true; scene.add(zm);
  }
  const boostTex = texBoost();
  const matBoost = new THREE.MeshStandardMaterial({ map: boostTex, emissive: 0xffffff, emissiveMap: boostTex, emissiveIntensity: 1.6, roughness: 0.4 });
  for (const b of S.boosts) {
    const m = bauePad(S, b.s, 4.2, () => 3.2, matBoost, 0.04, 1, 2, b.lat);
    scene.add(m);
  }

  // --- Gelaende (folgt dem Hang der Strecke, geht weiter weg in Huegel ueber)
  const TER = Math.max(1500, ext + 900), SEG = Math.min(240, Math.round(TER / 8));
  const tg = new THREE.PlaneGeometry(TER, TER, SEG, SEG); tg.rotateX(-Math.PI / 2);
  const tp = tg.attributes.position, cols = new Float32Array(tp.count * 3);
  const gl = {};
  const hoeheAn = (x, z) => {
    S.gelaende(x, z, 170, gl);
    const kl = (vnoise(x * 0.025, z * 0.025) - 0.5) * 5 * smooth(30, 100, gl.d);
    const hill = Math.max(0, fbm(x * 0.0035 + 3, z * 0.0035 + 7) - 0.32) * T.gelaende.hill;
    const fern = GROUND + hill + kl + 1.2;
    if (!gl.treffer) return fern;
    const nah = gl.y - 1.0;
    const m = smooth(35, 150, gl.d);
    return nah + (fern - nah) * m;
  };
  const G = T.gelaende;
  for (let i = 0; i < tp.count; i++) {
    const x = tp.getX(i) + cx, z = tp.getZ(i) + cz;
    const h = hoeheAn(x, z);
    tp.setXYZ(i, x, h, z);
    const rel = h - GROUND;
    const v = fbm(x * 0.05, z * 0.05, 3);
    let r = G.r + (v - 0.5) * 0.35 * G.r, g = G.g + (v - 0.5) * 0.3 * G.g, b = G.b;
    const felsAb = G.schnee ? 55 : 28;
    if (rel > felsAb) { const t = Math.min(1, (rel - felsAb) / 30); r = r * (1 - t) + G.fels[0] * t; g = g * (1 - t) + G.fels[1] * t; b = b * (1 - t) + G.fels[2] * t; }
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
    const B = T.berge, pos = [], col = [];
    const N = 26;
    for (let k = 0; k < N; k++) {
      const ang = (k / N) * Math.PI * 2 + rnd() * 0.2;
      const rad = ext * 0.5 + 640 + rnd() * 260;
      const hh = B.hoeheMin + rnd() * B.hoeheVar, br = 150 + rnd() * 120;
      const geo = B.form === "mesa" ? new THREE.CylinderGeometry(br * 0.5, br, hh, 8, 3, true) : new THREE.ConeGeometry(br, hh, 7, 3, true);
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
        const c = t > 0.72 ? B.oben : t > 0.45 ? B.mitte : B.unten;
        col.push(c[0], c[1], c[2]); pos.push(q.getX(i), q.getY(i), q.getZ(i));
      }
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    g.setAttribute("color", new THREE.Float32BufferAttribute(col, 3));
    g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true }));
    scene.add(m);
  }

  // --- Umgebung je nach Thema
  const streu = (maxVersuche, ok) => {
    const out = []; let tries = 0;
    while (tries++ < maxVersuche) {
      const x = cx + (rnd() - 0.5) * (ext + 700), z = cz + (rnd() - 0.5) * (ext + 700);
      const r = ok(x, z); if (r) out.push(r);
    }
    return out;
  };
  const nadelInst = (anzahl, farbeFn, abst = 26) => {
    // Nadelbaeume (Stamm + zwei Kegel)
    const trunk = new THREE.CylinderGeometry(0.22, 0.34, 2.4, 5); trunk.translate(0, 1.2, 0);
    const kegel1 = new THREE.ConeGeometry(1.9, 3.8, 7); kegel1.translate(0, 4.0, 0);
    const kegel2 = new THREE.ConeGeometry(1.4, 3.0, 7); kegel2.translate(0, 6.0, 0);
    const liste = streu(60000, (x, z) => {
      const dist = S.abstand(x, z, 60);
      if (dist < abst) return null;
      const wald = fbm(x * 0.006 + 11, z * 0.006 + 5);
      if (rnd() > smooth(0.38, 0.62, wald) * 0.9 + (dist < 70 ? 0.12 : 0)) return null;
      const s = 0.8 + rnd() * 0.9;
      return { x, y: hoeheAn(x, z) - 0.2, z, s, sy: 0.9 + rnd() * 0.5, ry: rnd() * 6.28, col: farbeFn() };
    }).slice(0, anzahl);
    const k12 = fuse([kegel1, kegel2]);
    const iS = instanziere(trunk, new THREE.MeshLambertMaterial({ color: 0x6b4a2f }), liste.map((o) => ({ ...o, col: null })));
    const iK = instanziere(k12, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), liste);
    scene.add(iS, iK);
  };
  const laubInst = (anzahl, farbeFn) => {
    const trunk = new THREE.CylinderGeometry(0.22, 0.34, 2.4, 5); trunk.translate(0, 1.2, 0);
    const kugel = new THREE.IcosahedronGeometry(2.1, 0); kugel.translate(0, 4.2, 0);
    const liste = streu(60000, (x, z) => {
      const dist = S.abstand(x, z, 60);
      if (dist < 26) return null;
      const wald = fbm(x * 0.006 + 11, z * 0.006 + 5);
      if (rnd() > smooth(0.38, 0.62, wald) * 0.9 + (dist < 70 ? 0.12 : 0)) return null;
      const s = 0.8 + rnd() * 0.9;
      return { x, y: hoeheAn(x, z) - 0.2, z, s, sy: 0.9 + rnd() * 0.5, ry: rnd() * 6.28, col: farbeFn() };
    }).slice(0, anzahl);
    scene.add(instanziere(trunk, new THREE.MeshLambertMaterial({ color: 0x6b4a2f }), liste.map((o) => ({ ...o, col: null }))));
    scene.add(instanziere(kugel, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), liste));
  };
  const felsenInst = (anzahl, farbe, abst = 20, skal = 1) => {
    const g = new THREE.IcosahedronGeometry(1.4, 0); g.scale(1, 0.62, 0.9);
    const liste = streu(30000, (x, z) => {
      const dist = S.abstand(x, z, 60);
      if (dist < abst) return null;
      const s = (0.6 + rnd() * rnd() * 3.4) * skal;
      return { x, y: hoeheAn(x, z) + 0.1 * s, z, s, sy: 0.7 + rnd() * 0.8, ry: rnd() * 6.28, col: farbe[Math.floor(rnd() * farbe.length)] };
    }).slice(0, anzahl);
    scene.add(instanziere(g, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), liste));
  };
  const col = (h, s, l) => new THREE.Color().setHSL(h, s, l).getHex();

  if (T.deko === "wald") {
    nadelInst(900, () => col(0.36 + rnd() * 0.06, 0.55, 0.2 + rnd() * 0.08));
    laubInst(450, () => col(0.24 + rnd() * 0.1, 0.5, 0.33 + rnd() * 0.12));
  } else if (T.deko === "herbst") {
    nadelInst(260, () => col(0.36 + rnd() * 0.05, 0.45, 0.16 + rnd() * 0.06));
    laubInst(1000, () => col(0.015 + rnd() * 0.12, 0.7 + rnd() * 0.2, 0.36 + rnd() * 0.16));
    felsenInst(80, [0x7a6a58, 0x8b7a66], 22, 1.1);
  } else if (T.deko === "schnee") {
    nadelInst(1100, () => col(0.42 + rnd() * 0.08, 0.18, 0.74 + rnd() * 0.14), 24);
    felsenInst(160, [0x7d838f, 0x969ba6, 0x6a707c], 22, 1.3);
  } else if (T.deko === "wueste") {
    // Kakteen
    const kaktus = fuse([
      (() => { const g = new THREE.CylinderGeometry(0.34, 0.4, 5, 7); g.translate(0, 2.5, 0); return g; })(),
      (() => { const g = new THREE.CylinderGeometry(0.2, 0.2, 1.3, 6); g.rotateZ(Math.PI / 2); g.translate(0.85, 2.5, 0); return g; })(),
      (() => { const g = new THREE.CylinderGeometry(0.2, 0.2, 1.6, 6); g.translate(1.45, 3.2, 0); return g; })(),
      (() => { const g = new THREE.CylinderGeometry(0.2, 0.2, 1.1, 6); g.rotateZ(Math.PI / 2); g.translate(-0.7, 3.2, 0); return g; })(),
      (() => { const g = new THREE.CylinderGeometry(0.2, 0.2, 1.2, 6); g.translate(-1.2, 3.8, 0); return g; })(),
    ]);
    const lk = streu(20000, (x, z) => {
      const dist = S.abstand(x, z, 60);
      if (dist < 20) return null;
      if (rnd() > 0.02 + (fbm(x * 0.01, z * 0.01) > 0.5 ? 0.5 : 0.04)) return null;
      const s = 0.7 + rnd() * 0.8;
      return { x, y: hoeheAn(x, z) - 0.1, z, s, sy: 0.8 + rnd() * 0.5, ry: rnd() * 6.28, col: col(0.30 + rnd() * 0.06, 0.45, 0.28 + rnd() * 0.08) };
    }).slice(0, 220);
    scene.add(instanziere(kaktus, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), lk));
    felsenInst(260, [0xa8643a, 0xc07a4a, 0x8d5632], 18, 1.5);
    // trockene Struppen
    const busch = new THREE.IcosahedronGeometry(1.1, 0); busch.scale(1, 0.55, 1);
    const lb = streu(20000, (x, z) => {
      const dist = S.abstand(x, z, 40);
      if (dist < 14) return null;
      const s = 0.5 + rnd() * 1.0;
      return { x, y: hoeheAn(x, z) + 0.2, z, s, sy: 0.8 + rnd() * 0.4, ry: rnd() * 6.28, col: col(0.10 + rnd() * 0.05, 0.4, 0.38 + rnd() * 0.1) };
    }).slice(0, 380);
    scene.add(instanziere(busch, new THREE.MeshLambertMaterial({ color: 0xffffff, flatShading: true }), lb, { schatten: false }));
  } else if (T.deko === "stadt") {
    nadelInst(260, () => col(0.38, 0.35, 0.09 + rnd() * 0.05), 26);
    // Hochhaeuser mit leuchtenden Fenstern
    const fenster = texFenster();
    const matHaus = new THREE.MeshStandardMaterial({ map: fenster, emissiveMap: fenster, emissive: 0xffffff, emissiveIntensity: 1.25, roughness: 0.8, color: 0x8a94b0 });
    const teile = [];
    const orte = streu(8000, (x, z) => {
      const dist = S.abstand(x, z, 140);
      if (dist < 90) return null;
      return { x, z };
    }).slice(0, 130);
    for (const o of orte) {
      const w = 16 + rnd() * 26, d = 16 + rnd() * 26, h = 25 + rnd() * rnd() * 130;
      const g = new THREE.BoxGeometry(w, h, d);
      const uv = g.attributes.uv;
      for (let k = 0; k < uv.count; k++) uv.setXY(k, uv.getX(k) * (w + d) / 26, uv.getY(k) * h / 30);
      g.translate(o.x, hoeheAn(o.x, o.z) + h / 2 - 1, o.z);
      teile.push(g);
    }
    if (teile.length) scene.add(new THREE.Mesh(fuse(teile), matHaus));
  }

  // --- Eckenerkennung (fuer Reifenstapel, Pfeile, Bremstafeln)
  const ecken = [];
  {
    let i = 2;
    while (i < S.n - 3) {
      if (Math.abs(S.kr[i]) > 1 / 80) {
        const a = i; let peak = 0, sum = 0, ruhe = 0;
        while (i < S.n - 3 && ruhe < 8) {
          const k = Math.abs(S.kr[i]);
          if (k < 1 / 130) ruhe++; else ruhe = 0;
          peak = Math.max(peak, k); sum += S.kr[i]; i++;
        }
        const b = i - ruhe;
        if (b - a >= 4) ecken.push({ a, b, peak, sg: -Math.sign(sum) || 1 });
      } else i++;
    }
  }
  S.ecken = ecken;

  // Reifenstapel an der Aussenseite enger Kurven
  {
    const tire = new THREE.CylinderGeometry(0.55, 0.55, 0.5, 10);
    const farben = [0xf4f4f4, 0xd8232a, 0x2a6ee0, 0x16181d];
    const liste = [];
    for (const e of ecken) {
      if (e.peak < 1 / 60) continue;
      for (let i = e.a - 5; i <= e.b + 5; i += 3) {
        if (i < 6 || i > S.n - 6) continue;
        const lat = e.sg * (S.w[i] / 2 + WAND_ABSTAND + 0.7 + 0.8);
        const x = S.x[i] - S.tz[i] * lat, z = S.z[i] + S.tx[i] * lat;
        const hoch = e.peak > 1 / 35 ? 3 : 2;
        const f = farben[(i / 3 | 0) % 4];
        for (let k = 0; k < hoch; k++) liste.push({ x, y: S.y[i] + 0.25 + k * 0.5, z, s: 1, ry: 0, col: f });
      }
    }
    if (liste.length) scene.add(instanziere(tire, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9 }), liste));
  }
  // Kurvenpfeile (Chevrons) an sehr engen Kurven
  {
    const tex = texPfeil(T.flutlicht ? "#ff2d95" : "#d8232a");
    const mat = new THREE.MeshBasicMaterial({ map: tex, side: THREE.DoubleSide, toneMapped: false, fog: true });
    const geo = new THREE.PlaneGeometry(3.4, 1.7);
    for (const e of ecken) {
      if (e.peak < 1 / 36) continue;
      for (let i = e.a; i <= e.b; i += 4) {
        const lat = e.sg * (S.w[i] / 2 + WAND_ABSTAND + 0.7 + 0.8);
        const m = new THREE.Mesh(geo, mat);
        m.position.set(S.x[i] - S.tz[i] * lat, S.y[i] + 2.1, S.z[i] + S.tx[i] * lat);
        const rx = -S.tz[i], rz = S.tx[i];
        m.rotation.y = Math.atan2(-e.sg * rx, -e.sg * rz);
        m.scale.x = -e.sg;
        scene.add(m);
      }
    }
  }
  // Bremstafeln 150 / 100 / 50 vor Haarnadeln
  {
    const geo = new THREE.PlaneGeometry(1.8, 1.35);
    const pfosten = new THREE.BoxGeometry(0.12, 2.4, 0.12); pfosten.translate(0, 1.2, 0);
    const matP = new THREE.MeshStandardMaterial({ color: 0x777c88, roughness: 0.6 });
    const mats = {};
    for (const e of ecken) {
      if (e.peak < 1 / 42) continue;
      for (const dist of [150, 100, 50]) {
        const s = e.a * S.ds - dist;
        if (s < S.startS + 15) continue;
        const i = Math.round(s / S.ds);
        const lat = e.sg * (S.w[i] / 2 + WAND_ABSTAND + 2.0);
        const px = S.x[i] - S.tz[i] * lat, pz = S.z[i] + S.tx[i] * lat;
        const ry = Math.atan2(-S.tx[i], -S.tz[i]);
        mats[dist] = mats[dist] || new THREE.MeshBasicMaterial({ map: texZahl(String(dist)), side: THREE.DoubleSide, toneMapped: false });
        const m = new THREE.Mesh(geo, mats[dist]); m.position.set(px, S.y[i] + 2.6, pz); m.rotation.y = ry; scene.add(m);
        const p = new THREE.Mesh(pfosten, matP); p.position.set(px, S.y[i], pz); scene.add(p);
      }
    }
  }

  // --- Werbebanden an der Aussenseite der Banden
  {
    const wt = texWerbung();
    const matW = new THREE.MeshStandardMaterial({ map: wt, roughness: 0.5, emissive: 0xffffff, emissiveMap: wt, emissiveIntensity: T.flutlicht ? 0.9 : 0.35, side: THREE.DoubleSide });
    const plane = new THREE.PlaneGeometry(9, 1.8);
    const gruppe = new THREE.Group();
    let k = 0;
    for (let s = 40; s < S.laenge - 20; s += 62) {
      const i = Math.min(S.n - 1, Math.round(s / S.ds));
      const sg = (k % 2) ? 1 : -1;
      const lat = sg * (S.w[i] / 2 + WAND_ABSTAND + 0.8);
      if (S.loops.some((l) => i >= l.i0 - 14 && i <= l.i1 + 14)) { k++; continue; }
      // nicht dort, wo schon Reifenstapel stehen
      if (ecken.some((e) => e.peak > 1 / 60 && i >= e.a - 6 && i <= e.b + 6 && e.sg === sg)) { k++; continue; }
      const geo = plane.clone();
      const uvA = geo.attributes.uv; const idx = k % 5;
      for (let u = 0; u < uvA.count; u++) uvA.setY(u, (4 - idx + uvA.getY(u)) / 5);
      const m = new THREE.Mesh(geo, matW);
      m.position.set(S.x[i] - S.tz[i] * lat, S.y[i] + 1.05 + 0.9, S.z[i] + S.tx[i] * lat);
      m.rotation.y = Math.atan2(S.tx[i], S.tz[i]) + (sg > 0 ? Math.PI / 2 : -Math.PI / 2);
      m.castShadow = false; gruppe.add(m);
      k++;
    }
    scene.add(gruppe);
  }

  // --- Tribuenen (nur wo Platz ist)
  const platzFrei = (s, sg) => {
    const i0 = Math.max(0, Math.min(S.n - 1, Math.round(s / S.ds)));
    const th = Math.atan2(S.tx[i0], S.tz[i0]);
    for (const along of [-27, -9, 9, 27]) for (const q of [12, 22, 34]) {
      const lat = sg * (S.w[i0] / 2 + WAND_ABSTAND + q);
      const x = S.x[i0] - S.tz[i0] * lat + Math.sin(th) * along, z = S.z[i0] + S.tx[i0] * lat + Math.cos(th) * along;
      if (S.abstand(x, z, 40) < S.w[i0] / 2 + WAND_ABSTAND + 6) return false;
    }
    return true;
  };
  const tribuene = (sPos, sg) => {
    if (!platzFrei(sPos, sg)) return;
    const i0 = Math.round(sPos / S.ds);
    const rx = -S.tz[i0], rz = S.tx[i0];
    const lat = sg * (S.w[i0] / 2 + WAND_ABSTAND + 5);
    const g = new THREE.Group();
    const th = Math.atan2(S.tx[i0], S.tz[i0]);
    const matB = new THREE.MeshStandardMaterial({ color: 0xdadde4, roughness: 0.9 });
    const matSitz = new THREE.MeshStandardMaterial({ color: T.flutlicht ? 0xff2d95 : 0x2a64d4, roughness: 0.8 });
    for (let r = 0; r < 5; r++) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(5, 1.0, 54), matB);
      st.position.set(r * 1.7 + 2.5, 0.5 + r * 1.0, 0); st.castShadow = true; st.receiveShadow = true; g.add(st);
      const sit = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 54), matSitz);
      sit.position.set(r * 1.7 + 0.2, 1.1 + r * 1.0, 0); g.add(sit);
    }
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
    if (T.flutlicht) {
      const leuchte = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.3, 54), new THREE.MeshBasicMaterial({ color: new THREE.Color(4, 3.6, 3), toneMapped: false }));
      leuchte.position.set(0.3, 8.6, 0); g.add(leuchte);
    }
    g.position.set(S.x[i0] + rx * lat, S.y[i0] - 0.2, S.z[i0] + rz * lat);
    g.rotation.y = sg > 0 ? th + Math.PI : th;
    scene.add(g);
  };
  for (const t of S.def.tribuenen || []) tribuene(t.s < 0 ? S.zielS + t.s : t.s, t.seite);

  // --- Fussgaengerbruecken
  for (const sB of S.def.bruecken || []) {
    const i = Math.round(sB / S.ds);
    const spann = S.w[i] + 2 * (WAND_ABSTAND + 0.7) + 8;
    const g = new THREE.Group();
    const matBr = new THREE.MeshStandardMaterial({ color: T.flutlicht ? 0x39425a : 0xd8dbe2, roughness: 0.6, metalness: 0.2 });
    const deck = new THREE.Mesh(new THREE.BoxGeometry(spann, 1.0, 3.2), matBr); deck.position.set(0, 8.6, 0); deck.castShadow = true; g.add(deck);
    for (const sg of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(1.3, 8.6, 1.3), matBr); p.position.set(sg * (spann / 2 - 0.8), 4.3, 0); p.castShadow = true; g.add(p);
      const gel = new THREE.Mesh(new THREE.BoxGeometry(spann, 0.12, 0.12), matBr); gel.position.set(0, 9.7, sg * 1.5); g.add(gel);
    }
    const bt = texBanner("TURBO", "ZEITJAGD", T.banner);
    for (const ry of [0, Math.PI]) {
      const bn = new THREE.Mesh(new THREE.PlaneGeometry(spann - 2.6, 1.5), new THREE.MeshBasicMaterial({ map: bt, side: THREE.FrontSide, toneMapped: false }));
      bn.position.set(0, 8.6, ry ? -1.62 : 1.62); bn.rotation.y = ry; g.add(bn);
    }
    if (T.flutlicht) {
      const lm = new THREE.Mesh(new THREE.BoxGeometry(spann - 3, 0.15, 0.15), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.5, 3.5, 4.5), toneMapped: false }));
      lm.position.set(0, 8.0, 0); g.add(lm);
    }
    g.position.set(S.x[i], S.y[i], S.z[i]); g.rotation.y = Math.atan2(S.tx[i], S.tz[i]);
    scene.add(g);
  }

  // --- Flutlicht (Nacht): Masten, Lampenkoepfe, Lichtpfuetzen auf der Strecke
  if (T.flutlicht) {
    const mastG = new THREE.CylinderGeometry(0.22, 0.34, 22, 6); mastG.translate(0, 11, 0);
    const kopfG = new THREE.BoxGeometry(4.6, 0.8, 0.7);
    const matMast = new THREE.MeshStandardMaterial({ color: 0x4a5064, roughness: 0.6, metalness: 0.4 });
    const matKopf = new THREE.MeshBasicMaterial({ color: new THREE.Color(6, 5.4, 4.2), toneMapped: false });
    const masten = [], koepfe = [], pfuetzen = [];
    let k = 0;
    for (let s = 70; s < S.laenge - 40; s += 56, k++) {
      const i = Math.round(s / S.ds);
      const sg = k % 2 ? 1 : -1;
      if (S.loops.some((l) => i >= l.i0 - 14 && i <= l.i1 + 14)) continue;
      // Mast nicht in eine Nachbarstrecke stellen
      const lat = sg * (S.w[i] / 2 + WAND_ABSTAND + 4.5);
      const mx = S.x[i] - S.tz[i] * lat, mz = S.z[i] + S.tx[i] * lat;
      if (S.abstand(mx, mz, 40) < S.w[i] / 2 + WAND_ABSTAND + 3) continue;
      const th = Math.atan2(S.tx[i], S.tz[i]);
      masten.push({ x: mx, y: S.y[i] - 0.3, z: mz, s: 1, ry: 0 });
      const rx = -S.tz[i] * -sg * 2.2, rz = S.tx[i] * -sg * 2.2;   // Kopf ragt zur Strecke hin
      koepfe.push({ x: mx + rx, y: S.y[i] + 21.8, z: mz + rz, s: 1, ry: th });
      pfuetzen.push({ s, hw: S.w[i] / 2 + WAND_ABSTAND + 1.2 });
    }
    scene.add(instanziere(mastG, matMast, masten), instanziere(kopfG, matKopf, koepfe, { schatten: false }));
    // alle Pfuetzen in einem Mesh
    const pos = [], uv = [], idx = [];
    for (const p of pfuetzen) padDaten(S, p.s, 64, () => p.hw, 0.07, 1, 1, 0, pos, uv, idx);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
    pg.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
    pg.setIndex(idx);
    const matPf = new THREE.MeshBasicMaterial({ map: texGlow("255,226,170"), transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false });
    const pm = new THREE.Mesh(pg, matPf); pm.renderOrder = 2; scene.add(pm);
  }

  // --- Start-Bogen, Ziel-Bogen und Endmauern
  const tore = [];
  const setzeTor = () => {};
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
    if (texte) {
      const banner = new THREE.Mesh(new THREE.PlaneGeometry(w * 2 - 0.4, gross ? 2.3 : 0.9), new THREE.MeshBasicMaterial({ map: texte, side: THREE.DoubleSide, toneMapped: false }));
      banner.position.set(0, hoehe - (gross ? 1.3 : 0.25), 0.4); g.add(banner);
      const b2 = banner.clone(); b2.position.z = -0.4; b2.rotation.y = Math.PI; g.add(b2);
    }
    g.position.set(S.x[i], S.y[i], S.z[i]);
    g.rotation.y = Math.atan2(S.tx[i], S.tz[i]);
    scene.add(g);
    return g;
  }
  const startBogen = bogen(Math.round(S.startS / S.ds), 0, 9.5, 0xffffff, texBanner("START", "TROLLHOUSE TURBO", T.banner), true);
  const zielBogen = bogen(Math.round(S.zielS / S.ds), 0, 9.5, 0xffffff, texBanner("ZIEL", "TROLLHOUSE TURBO", T.banner), true);
  {
    const matM = new THREE.MeshStandardMaterial({ map: bandeT, roughness: 0.75 });
    for (const [i, vz] of [[0, -1], [S.n - 1, 1]]) {
      const br = S.w[i] + 2 * (WAND_ABSTAND + 0.7);
      const m = new THREE.Mesh(new THREE.BoxGeometry(br, 2.4, 1.6), matM);
      m.position.set(S.x[i] + S.tx[i] * vz * 0.8, S.y[i] + 1.2, S.z[i] + S.tz[i] * vz * 0.8);
      m.rotation.y = Math.atan2(S.tx[i], S.tz[i]); m.castShadow = true; m.receiveShadow = true; scene.add(m);
    }
  }

  // --- Schneefall (Schnee-Thema): Flocken rund um die Kamera
  let schneePunkte = null, flocken = null;
  if (T.schnee) {
    const N = 900;
    flocken = new Float32Array(N * 3);
    for (let i = 0; i < N; i++) { flocken[i * 3] = (Math.random() - 0.5) * 70; flocken[i * 3 + 1] = Math.random() * 32; flocken[i * 3 + 2] = (Math.random() - 0.5) * 70; }
    const sg = new THREE.BufferGeometry();
    sg.setAttribute("position", new THREE.BufferAttribute(new Float32Array(N * 3), 3));
    schneePunkte = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xffffff, size: 0.22, transparent: true, opacity: 0.85, depthWrite: false, sizeAttenuation: true }));
    schneePunkte.frustumCulled = false; scene.add(schneePunkte);
  }
  let tAlt = 0;
  const tick = (t, camPos) => {
    const dt = Math.min(0.1, t - tAlt); tAlt = t;
    if (!schneePunkte) return;
    const p = schneePunkte.geometry.attributes.position.array;
    for (let i = 0; i < flocken.length; i += 3) {
      flocken[i] += Math.sin(t * 0.7 + i) * 0.4 * dt; flocken[i + 1] -= (2.4 + (i % 7) * 0.15) * dt;
      if (flocken[i + 1] < 0) flocken[i + 1] += 32;
      p[i] = camPos.x + ((((flocken[i] + 35) % 70) + 70) % 70 - 35);
      p[i + 1] = camPos.y - 8 + flocken[i + 1];
      p[i + 2] = camPos.z + ((((flocken[i + 2] + 35) % 70) + 70) % 70 - 35);
    }
    schneePunkte.geometry.attributes.position.needsUpdate = true;
  };

  // Schatten folgt dem Auto
  function folge(x, y, z) {
    sonne.target.position.set(x, y, z);
    sonne.position.set(x + sunDir.x * 110, y + sunDir.y * 110, z + sunDir.z * 110);
  }
  const boostAnim = (t) => { boostTex.offset.y = -t * 1.2; };

  return { scene, himmel, sonne, hemi, folge, sunDir, setzeTor, tore, boostAnim, hor, startBogen, zielBogen, hoeheAn, thema: T, tick };
}

// Flaches Stueck entlang der Strecke (Boost-Feld, Zielstreifen, Lichtpfuetze)
function padDaten(S, s, laenge, halbFn, yOff, uRep, vRep, lat0, pos, uv, idx) {
  const n = S.n;
  const i0 = Math.round((s - laenge / 2) / S.ds), i1 = Math.round((s + laenge / 2) / S.ds);
  const cnt = Math.max(1, i1 - i0);
  const base = pos.length / 3;
  for (let k = 0; k <= cnt; k++) {
    const i = Math.max(0, Math.min(n - 1, i0 + k));
    const rx = -S.tz[i], rz = S.tx[i];
    const hw = halbFn(i);
    for (const sg of [-1, 1]) {
      const l = lat0 + sg * hw;
      pos.push(S.x[i] + rx * l, S.y[i] + yOff, S.z[i] + rz * l);
      uv.push(sg > 0 ? uRep : 0, (k / cnt) * vRep);
    }
  }
  for (let k = 0; k < cnt; k++) { const a = base + k * 2, b = a + 1, c = a + 2, d = a + 3; idx.push(a, b, c, b, d, c); }
}
function bauePad(S, s, laenge, halbFn, mat, yOff, uRep, vRep, lat0 = 0) {
  const pos = [], uv = [], idx = [];
  padDaten(S, s, laenge, halbFn, yOff, uRep, vRep, lat0, pos, uv, idx);
  const g = new THREE.BufferGeometry();
  g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute("uv", new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals();
  return new THREE.Mesh(g, mat);
}

export { baueHimmel, THEMEN };
