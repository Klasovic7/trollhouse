// Partikel: Reifenqualm, Funken, Boost-Feuer. Ein Points-Objekt pro Art.
import * as THREE from "three";

export class Partikel {
  constructor(max, { additiv = false } = {}) {
    this.max = max; this.next = 0;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3);
    this.size = new Float32Array(max); this.alpha = new Float32Array(max); this.col = new Float32Array(max * 3);
    this.alter = new Float32Array(max).fill(99); this.leben = new Float32Array(max).fill(1);
    this.wachs = new Float32Array(max); this.s0 = new Float32Array(max); this.a0 = new Float32Array(max);
    this.grav = new Float32Array(max);
    const g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("size", new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("alpha", new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute("col", new THREE.BufferAttribute(this.col, 3).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: additiv ? THREE.AdditiveBlending : THREE.NormalBlending, fog: false,
      uniforms: { uScale: { value: 600 } },
      vertexShader: `attribute float size; attribute float alpha; attribute vec3 col; varying float vA; varying vec3 vC; uniform float uScale;
        void main(){ vA = alpha; vC = col; vec4 mv = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*mv; gl_PointSize = size*uScale/max(-mv.z,0.5); }`,
      fragmentShader: `varying float vA; varying vec3 vC;
        void main(){ float d = length(gl_PointCoord-0.5)*2.0; float a = smoothstep(1.0,0.15,d)*vA; if(a<0.004) discard; gl_FragColor = vec4(vC, a); }`,
    });
    this.punkte = new THREE.Points(g, this.material);
    this.punkte.frustumCulled = false;
    this.geo = g;
    // Schatten/Beleuchtung: keine
    for (let i = 0; i < max; i++) this.pos[i * 3 + 1] = -1000;
  }
  emit(x, y, z, vx, vy, vz, size, wachs, leben, r, g, b, a, grav = 0) {
    const i = this.next; this.next = (this.next + 1) % this.max;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.s0[i] = size; this.wachs[i] = wachs; this.leben[i] = leben; this.alter[i] = 0; this.a0[i] = a; this.grav[i] = grav;
    this.col[i * 3] = r; this.col[i * 3 + 1] = g; this.col[i * 3 + 2] = b;
    this.size[i] = size; this.alpha[i] = a;
  }
  update(dt, pixelPerRad) {
    if (pixelPerRad) this.material.uniforms.uScale.value = pixelPerRad;
    for (let i = 0; i < this.max; i++) {
      if (this.alter[i] >= this.leben[i]) { if (this.alpha[i] !== 0) { this.alpha[i] = 0; } continue; }
      this.alter[i] += dt;
      const t = this.alter[i] / this.leben[i];
      if (t >= 1) { this.alpha[i] = 0; continue; }
      this.vel[i * 3 + 1] -= this.grav[i] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      const d = Math.exp(-1.6 * dt);
      this.vel[i * 3] *= d; this.vel[i * 3 + 2] *= d; if (!this.grav[i]) this.vel[i * 3 + 1] *= d;
      this.size[i] = this.s0[i] + this.wachs[i] * t;
      this.alpha[i] = this.a0[i] * (1 - t) * (1 - t * 0.3) * Math.min(1, t * 12);
    }
    this.geo.attributes.position.needsUpdate = true; this.geo.attributes.size.needsUpdate = true;
    this.geo.attributes.alpha.needsUpdate = true; this.geo.attributes.col.needsUpdate = true;
  }
}
