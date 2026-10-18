// Ton: alles mit WebAudio erzeugt (kein Audio-Datei-Download).
export class Ton {
  constructor() { this.ctx = null; this.aus = false; }
  start() {
    if (this.ctx) { if (this.ctx.state === "suspended") this.ctx.resume(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = this.ctx = new AC();
    this.master = c.createGain(); this.master.gain.value = this.aus ? 0 : 0.55; this.master.connect(c.destination);
    // Motor
    this.mot = c.createGain(); this.mot.gain.value = 0;
    this.lp = c.createBiquadFilter(); this.lp.type = "lowpass"; this.lp.frequency.value = 900; this.lp.Q.value = 3;
    this.o1 = c.createOscillator(); this.o1.type = "sawtooth";
    this.o2 = c.createOscillator(); this.o2.type = "square";
    const g2 = c.createGain(); g2.gain.value = 0.35;
    this.o1.connect(this.lp); this.o2.connect(g2); g2.connect(this.lp); this.lp.connect(this.mot); this.mot.connect(this.master);
    this.o1.start(); this.o2.start();
    // Rauschen: Wind + Reifen
    const buf = c.createBuffer(1, c.sampleRate * 2, c.sampleRate); const d = buf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.rb = buf;
    const mk = (freq, q, type = "bandpass") => {
      const s = c.createBufferSource(); s.buffer = buf; s.loop = true;
      const f = c.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
      const g = c.createGain(); g.gain.value = 0; s.connect(f); f.connect(g); g.connect(this.master); s.start();
      return { f, g };
    };
    this.wind = mk(600, 0.7); this.squeal = mk(2600, 6);
  }
  setze(speedFrac, rpm, schlupf, boost) {
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    const f = 48 + rpm * 150;
    this.o1.frequency.setTargetAtTime(f, t, 0.03); this.o2.frequency.setTargetAtTime(f * 0.5, t, 0.03);
    this.lp.frequency.setTargetAtTime(500 + rpm * 1800 + (boost ? 700 : 0), t, 0.05);
    this.mot.gain.setTargetAtTime(0.10 + 0.10 * rpm + (boost ? 0.06 : 0), t, 0.05);
    this.wind.g.gain.setTargetAtTime(Math.min(0.30, speedFrac * speedFrac * 0.35), t, 0.1);
    this.wind.f.frequency.setTargetAtTime(400 + speedFrac * 1400, t, 0.1);
    this.squeal.g.gain.setTargetAtTime(Math.min(0.22, Math.max(0, (Math.abs(schlupf) - 2.5) * 0.04)), t, 0.04);
    this.squeal.f.frequency.setTargetAtTime(2200 + Math.min(1, Math.abs(schlupf) / 15) * 900, t, 0.1);
  }
  ton(freq, dauer = 0.12, typ = "sine", lautst = 0.25, ziel = null) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    const o = c.createOscillator(); o.type = typ; o.frequency.setValueAtTime(freq, t); if (ziel) o.frequency.exponentialRampToValueAtTime(ziel, t + dauer);
    const g = c.createGain(); g.gain.setValueAtTime(lautst, t); g.gain.exponentialRampToValueAtTime(0.001, t + dauer);
    o.connect(g); g.connect(this.master); o.start(t); o.stop(t + dauer + 0.02);
  }
  rausch(dauer = 0.3, freq = 800, lautst = 0.3, ziel = null) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime;
    const s = c.createBufferSource(); s.buffer = this.rb;
    const f = c.createBiquadFilter(); f.type = "bandpass"; f.Q.value = 0.8; f.frequency.setValueAtTime(freq, t); if (ziel) f.frequency.exponentialRampToValueAtTime(ziel, t + dauer);
    const g = c.createGain(); g.gain.setValueAtTime(lautst, t); g.gain.exponentialRampToValueAtTime(0.001, t + dauer);
    s.connect(f); f.connect(g); g.connect(this.master); s.start(t); s.stop(t + dauer + 0.05);
  }
  beep(hoch = false) { this.ton(hoch ? 1175 : 660, hoch ? 0.45 : 0.14, "square", 0.16); }
  cp() { this.ton(880, 0.1, "sine", 0.22); setTimeout(() => this.ton(1320, 0.16, "sine", 0.22), 90); }
  boost() { this.rausch(0.6, 400, 0.35, 3000); this.ton(180, 0.5, "sawtooth", 0.12, 520); }
  wand(staerke) { const l = Math.min(0.5, 0.1 + staerke * 0.02); this.rausch(0.25, 300, l); this.ton(90, 0.18, "square", l * 0.6, 40); }
  landung(s) { const l = Math.min(0.5, 0.1 + s * 0.02); this.ton(70, 0.25, "sine", l, 35); this.rausch(0.2, 500, l * 0.6); }
  ziel() { [660, 880, 1100, 1320].forEach((f, i) => setTimeout(() => this.ton(f, 0.18, "triangle", 0.25), i * 90)); }
  stumm(an) { this.aus = an; if (this.master) this.master.gain.value = an ? 0 : 0.55; }
}
