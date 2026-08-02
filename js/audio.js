// HYD.Audio — procedural WebAudio: two composed soundtracks (menu + gameplay),
// city ambience bed, and SFX. No external audio files.
(function () {
  const HYD = window.HYD = window.HYD || {};

  // semitone offsets from A2 (110Hz): 0=Sa, 2=Re, 4=Ga, 5=Ma, 7=Pa, 9=Dha, 11=Ni, 12=Sa'
  const A = {
    ctx: null, master: null, sfxGain: null, musicGain: null, ambGain: null,
    musicOn: true, sfxOn: true,
    scheduler: null, nextNote: 0, step: 0, track: "menu", bpm: 74,
    ambSource: null, cityTimer: null,
    lastFoot: 0, lastHonk: 0,

    freq(semi) { return 110 * Math.pow(2, semi / 12); },

    init() {
      if (this.ctx) {
        if (this.ctx.state === "suspended") this.ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.95;
      this.master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.sfxGain.gain.value = this.sfxOn ? 0.9 : 0;
      this.sfxGain.connect(this.master);
      this.musicGain = this.ctx.createGain();
      this.musicGain.gain.value = this.musicOn ? 0.42 : 0;
      this.musicGain.connect(this.master);
      this.ambGain = this.ctx.createGain();
      this.ambGain.gain.value = 0.16;
      this.ambGain.connect(this.master);
      this.nextNote = this.ctx.currentTime + 0.12;
      this.startAmbience();
    },

    // call on every user gesture — creates/resumes context and starts the soundtrack
    ensure() {
      this.init();
      this.startMusic();
    },

    setEnabled(music, sfx) {
      this.musicOn = !!music;
      this.sfxOn = !!sfx;
      if (this.musicGain) this.musicGain.gain.value = this.musicOn ? 0.42 : 0;
      if (this.sfxGain) this.sfxGain.gain.value = this.sfxOn ? 0.9 : 0;
    },

    // ---------------- primitives ----------------
    _noise(dur, vol, filterFreq, type = "lowpass", out, delay = 0) {
      if (!this.ctx) return;
      if (!out && !this.sfxOn) return;
      const ctx = this.ctx;
      const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
      const src = ctx.createBufferSource(); src.buffer = buf;
      const filt = ctx.createBiquadFilter(); filt.type = type; filt.frequency.value = filterFreq;
      const g = ctx.createGain(); g.gain.value = vol;
      src.connect(filt); filt.connect(g); g.connect(out || this.sfxGain);
      src.start(ctx.currentTime + delay);
    },

    _tone(freq, dur, vol, type = "square", slide = 0, delay = 0, out) {
      if (!this.ctx) return;
      if (!out && !this.sfxOn) return;
      const ctx = this.ctx;
      const t = ctx.currentTime + delay;
      const o = ctx.createOscillator(); o.type = type; o.frequency.setValueAtTime(freq, t);
      if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(30, freq + slide), t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(vol, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(out || this.sfxGain);
      o.start(t); o.stop(t + dur + 0.03);
    },

    // ---------------- SFX ----------------
    gun(weapon) {
      if (weapon === "ak") {
        this._noise(0.09, 0.65, 2600);
        this._tone(120, 0.08, 0.32, "square", -60);
      } else {
        this._noise(0.16, 0.8, 1800);
        this._tone(180, 0.12, 0.38, "square", -100);
      }
    },
    enemyGun() { this._noise(0.12, 0.25, 1400); this._tone(140, 0.1, 0.13, "sawtooth", -70); },
    reload() { this._tone(500, 0.05, 0.22, "square"); setTimeout(() => this._tone(420, 0.06, 0.22, "square"), 90); },
    empty() { this._tone(900, 0.03, 0.16, "square"); },
    hit() { this._tone(1300, 0.04, 0.3, "sine"); },
    kill() { this._tone(660, 0.08, 0.32, "triangle"); this._tone(880, 0.1, 0.24, "triangle", 0, 0.06); },
    hurt() { this._tone(220, 0.18, 0.38, "sawtooth", -90); this._noise(0.12, 0.28, 700); },
    foot() {
      const now = performance.now();
      if (now - this.lastFoot < 150) return;
      this.lastFoot = now;
      this._noise(0.045, 0.1, 420);
    },
    jump() { this._tone(140, 0.14, 0.22, "sine", 70); },
    land() { this._noise(0.07, 0.2, 300); },
    pickup() { this._tone(520, 0.07, 0.28, "triangle"); this._tone(780, 0.09, 0.22, "triangle", 0, 0.07); },
    coin() { this._tone(900, 0.06, 0.24, "sine"); this._tone(1350, 0.1, 0.2, "sine", 0, 0.06); },
    ui() { this._tone(640, 0.05, 0.18, "sine"); },
    banner() { this._tone(392, 0.12, 0.24, "triangle"); this._tone(523, 0.16, 0.24, "triangle", 0, 0.1); this._tone(659, 0.2, 0.2, "triangle", 0, 0.2); },
    explode() {
      this._noise(0.55, 0.95, 900);
      this._tone(90, 0.5, 0.55, "sine", -60);
      this._tone(55, 0.7, 0.5, "sawtooth", -30);
    },
    autoHorn() {
      if (!this.ctx) return;
      const now = performance.now();
      if (now - this.lastHonk < 1600) return;
      this.lastHonk = now;
      this._tone(1170, 0.14, 0.11, "square");
      this._tone(880, 0.2, 0.11, "square", 0, 0.12);
    },
    chaiSizzle() { this._noise(0.5, 0.14, 3000, "bandpass"); },
    whistle() { this._tone(2350, 0.18, 0.24, "square"); },
    bird() {
      this._tone(2600, 0.07, 0.1, "sine", 400, 0, this.ambGain);
      this._tone(3100, 0.06, 0.09, "sine", -300, 0.1, this.ambGain);
    },
    error() { this._tone(300, 0.12, 0.22, "square", -80); },

    // ---------------- city ambience ----------------
    startAmbience() {
      if (!this.ctx || this.ambSource) return;
      const ctx = this.ctx;
      const len = ctx.sampleRate * 3;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        last = (last + (Math.random() * 2 - 1) * 0.02) * 0.999;
        d[i] = last * 2.2;
      }
      const src = ctx.createBufferSource();
      src.buffer = buf; src.loop = true;
      const lp = ctx.createBiquadFilter(); lp.type = "lowpass"; lp.frequency.value = 480;
      const g = ctx.createGain(); g.gain.value = 0.7;
      src.connect(lp); lp.connect(g); g.connect(this.ambGain);
      src.start();
      this.ambSource = src;
      this.cityTimer = setInterval(() => {
        if (!this.ctx || this.ctx.state !== "running") return;
        const r = Math.random();
        if (r < 0.28) this.autoHorn();
        else if (r < 0.42) this.chaiSizzle();
        else if (r < 0.6) this.bird();
        else if (r < 0.68) this.whistle();
      }, 4200);
    },

    // ---------------- soundtracks ----------------
    startMusic(track) {
      this.init();
      if (!this.ctx || this.scheduler) return;
      this.track = track || this.track;
      this.step = 0;
      this.nextNote = this.ctx.currentTime + 0.12;
      const def = this.tracks[this.track] || this.tracks.game;
      this.bpm = def.bpm;
      this.spb = 60 / this.bpm / 4; // 16th notes
      this.scheduler = setInterval(() => this._tick(), 90);
    },

    tracks: {
      menu: {
        bpm: 74,
        mel: [0, 7, 9, 11, 9, 7, 5, 2, 0, 2, 5, 7, 5, 2, -1, -1],
        drone: [0, 7],
        drums: { dha: [0, 8], tin: [4, 12] },
        leadVol: 0.12, droneVol: 0.08, drumVol: 0.22
      },
      game: {
        bpm: 112,
        mel: [0, 2, 4, 5, 7, 9, 7, 5, 4, 5, 4, 2, 0, 2, 4, 5],
        drone: [0, 7, 12],
        drums: { dha: [0, 4, 8, 12], tin: [2, 6, 10, 14], ke: [3, 7, 11, 15] },
        leadVol: 0.13, droneVol: 0.09, drumVol: 0.26
      }
    },

    _tick() {
      if (!this.ctx || !this.musicOn) return;
      while (this.nextNote < this.ctx.currentTime + 0.4) {
        this._scheduleStep(this.step, this.nextNote);
        this.nextNote += this.spb;
        this.step++;
      }
    },

    _scheduleStep(step, t) {
      const def = this.tracks[this.track] || this.tracks.game;
      const s = step % 16;
      // tanpura drone (Sa + Pa, octave every 4th bar)
      const droneNotes = [0, 7];
      for (const dn of droneNotes) {
        const oct = s === 0 ? 12 : 0;
        this._musicTone(this.freq(dn + oct), this.spb * 1.8, def.droneVol, "triangle", t);
      }
      // melodic lead
      const note = def.mel[s];
      if (note >= 0) {
        this._musicTone(this.freq(note + 12), this.spb * 1.6, def.leadVol, "sine", t);
        this._musicTone(this.freq(note + 12) * 2, this.spb * 1.4, def.leadVol * 0.28, "sine", t);
      }
      // drums
      if (def.drums.dha.includes(s)) this._drum(t, "dha", def.drumVol);
      if (def.drums.tin.includes(s)) this._drum(t, "tin", def.drumVol * 0.8);
      if (def.drums.ke && def.drums.ke.includes(s)) this._drum(t, "ke", def.drumVol * 0.55);
    },

    _musicTone(freq, dur, vol, type, t) {
      if (!this.ctx) return;
      const ctx = this.ctx;
      const o = ctx.createOscillator(); o.type = type; o.frequency.value = freq;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, vol), t + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(this.musicGain);
      o.start(t); o.stop(t + dur + 0.04);
    },

    _drum(t, kind, vol) {
      if (!this.ctx) return;
      const ctx = this.ctx;
      if (kind === "dha") {
        const o = ctx.createOscillator(); o.type = "sine"; o.frequency.setValueAtTime(180, t);
        o.frequency.exponentialRampToValueAtTime(55, t + 0.14);
        const g = ctx.createGain();
        g.gain.setValueAtTime(vol, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
        o.connect(g); g.connect(this.musicGain);
        o.start(t); o.stop(t + 0.2);
        this._noise(0.09, vol * 0.6, 2600, "lowpass", this.musicGain, 0);
        // slight ambience offset due to delay param — schedule noise at t
      } else if (kind === "tin") {
        this._tone(1800, 0.05, vol * 0.7, "square", 0, 0, this.musicGain);
      } else {
        this._noise(0.04, vol * 0.8, 4200, "highpass", this.musicGain, 0);
      }
    },

    stopMusic() {
      if (this.scheduler) { clearInterval(this.scheduler); this.scheduler = null; }
    },

    switchTrack(track) {
      if (!this.ctx) return;
      this.stopMusic();
      this.step = 0;
      this.nextNote = this.ctx.currentTime + 0.1;
      this.track = track;
      const def = this.tracks[track] || this.tracks.game;
      this.bpm = def.bpm;
      this.spb = 60 / this.bpm / 4;
      this.scheduler = setInterval(() => this._tick(), 90);
    }
  };

  HYD.Audio = A;
})();
