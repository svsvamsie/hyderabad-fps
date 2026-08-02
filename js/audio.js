// HYD.Audio — procedural WebAudio: SFX + a light ambient Hyderabadi-ish loop.
(function () {
  const HYD = window.HYD = window.HYD || {};

  const A = {
    ctx: null, master: null, sfxGain: null, musicGain: null,
    musicOn: true, sfxOn: true, musicTimer: null, step: 0,
    lastFoot: 0, lastHonk: 0,

    init() {
      if (this.ctx) { if (this.ctx.state === "suspended") this.ctx.resume(); return; }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.9;
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = 0.8;
      this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = 0.16;
      this.musicGain.connect(this.master);
    },

    setEnabled(music, sfx) {
      this.musicOn = music; this.sfxOn = sfx;
      if (this.musicGain) this.musicGain.gain.value = music ? 0.16 : 0;
      if (this.sfxGain) this.sfxGain.gain.value = sfx ? 0.8 : 0;
    },

    // ---- primitives ----
    _noise(dur, vol, filterFreq, type = "lowpass") {
      if (!this.ctx || !this.sfxOn) return;
      const ctx = this.ctx;
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const filt = ctx.createBiquadFilter(); filt.type = type; filt.frequency.value = filterFreq;
      const g = ctx.createGain(); g.gain.value = vol;
      src.connect(filt); filt.connect(g); g.connect(this.sfxGain);
      src.start();
    },

    _tone(freq, dur, vol, type = "square", slide = 0, delay = 0) {
      if (!this.ctx || !this.sfxOn) return;
      const ctx = this.ctx;
      const t = ctx.currentTime + delay;
      const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.sfxGain);
      o.start(t); o.stop(t + dur + 0.02);
    },

    // ---- SFX ----
    gun(weapon) {
      if (weapon === "ak") {
        this._noise(0.09, 0.55, 2600);
        this._tone(120, 0.08, 0.3, "square", -60);
      } else {
        this._noise(0.16, 0.7, 1800);
        this._tone(180, 0.12, 0.35, "square", -100);
      }
    },
    enemyGun() { this._noise(0.12, 0.22, 1400); this._tone(140, 0.1, 0.12, "sawtooth", -70); },
    reload() { this._tone(500, 0.05, 0.2, "square"); setTimeout(() => this._tone(420, 0.06, 0.2, "square"), 90); },
    empty() { this._tone(900, 0.03, 0.15, "square"); },
    hit() { this._tone(1300, 0.04, 0.28, "sine"); },
    kill() { this._tone(660, 0.08, 0.3, "triangle"); this._tone(880, 0.1, 0.22, "triangle", 0, 0.06); },
    hurt() { this._tone(220, 0.18, 0.35, "sawtooth", -90); this._noise(0.12, 0.25, 700); },
    foot() {
      const now = performance.now();
      if (now - this.lastFoot < 150) return;
      this.lastFoot = now;
      this._noise(0.045, 0.09, 420);
    },
    jump() { this._tone(140, 0.14, 0.2, "sine", 70); },
    land() { this._noise(0.07, 0.18, 300); },
    pickup() { this._tone(520, 0.07, 0.25, "triangle"); this._tone(780, 0.09, 0.2, "triangle", 0, 0.07); },
    coin() { this._tone(900, 0.06, 0.22, "sine"); this._tone(1350, 0.1, 0.18, "sine", 0, 0.06); },
    ui() { this._tone(640, 0.05, 0.16, "sine"); },
    banner() { this._tone(392, 0.12, 0.22, "triangle"); this._tone(523, 0.16, 0.22, "triangle", 0, 0.1); },
    explode() {
      this._noise(0.55, 0.9, 900);
      this._tone(90, 0.5, 0.5, "sine", -60);
      this._tone(55, 0.7, 0.45, "sawtooth", -30);
    },
    autoHorn() {
      if (!this.ctx) return;
      const now = performance.now();
      if (now - this.lastHonk < 1800) return;
      this.lastHonk = now;
      this._tone(1170, 0.14, 0.1, "square", 0);
      this._tone(880, 0.2, 0.1, "square", 0, 0.12);
    },
    chaiSizzle() { this._noise(0.5, 0.12, 3000, "bandpass"); },
    whistle() { this._tone(2350, 0.18, 0.22, "square"); },
    error() { this._tone(300, 0.12, 0.2, "square", -80); },

    // ---- ambient music loop (drone + tabla-ish pattern) ----
    startMusic() {
      if (!this.ctx || this.musicTimer) return;
      this.step = 0;
      const bpm = 84;
      const spb = 60 / bpm;
      const tick = () => {
        if (!this.musicOn || !this.ctx) return;
        const t = this.ctx.currentTime;
        const s = this.step % 16;
        // tanpura-ish drone: Sa-Pa-Sa-Ma on each beat
        const drone = [110, 110, 110, 110, 82.4, 110, 110, 110, 110, 110, 110, 82.4, 110, 110, 110, 110][s];
        if (s % 2 === 0) this._musicTone(drone, 0.9, 0.05, "triangle");
        // tabla-like strokes
        if (s === 0 || s === 3 || s === 7 || s === 10 || s === 12 || s === 15) this._musicHit(180, 0.12, 0.16, "square", 0.1);
        if (s === 4 || s === 11) this._musicHit(90, 0.2, 0.2, "sine", 0.08);
        if (s === 8) { this._musicHit(240, 0.1, 0.12, "square", 0.12); this._musicHit(160, 0.08, 0.1, "square", 0.04); }
        this.step++;
      };
      tick();
      this.musicTimer = setInterval(tick, spb * 500);
    },

    _musicTone(freq, dur, vol, type) {
      if (!this.ctx) return;
      const ctx = this.ctx, t = ctx.currentTime;
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + 0.04);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.musicGain);
      o.start(t); o.stop(t + dur + 0.05);
    },

    _musicHit(freq, dur, vol, type, delay) {
      if (!this.ctx) return;
      const ctx = this.ctx, t = ctx.currentTime + delay;
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.musicGain);
      o.start(t); o.stop(t + dur + 0.02);
      this._noise(0.03, 0.05, 3000, "highpass");
    },

    stopMusic() {
      if (this.musicTimer) { clearInterval(this.musicTimer); this.musicTimer = null; }
    }
  };

  HYD.Audio = A;
})();
