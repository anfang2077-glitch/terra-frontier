/* ============================================================
   Terra Frontier — procedural soundscape & chiptune ambience
   ============================================================ */
(function () {
  'use strict';
  const TF = window.TF;
  const U = TF.util;

  class AudioSys {
    constructor() {
      this.ctx = null;
      this.master = null;
      this.sfxBus = null;
      this.musicBus = null;
      this.rainBus = null;
      this.ready = false;
      this.muted = !!U.storageGet('tf_muted', false);
      this.musicTimer = null;
      this.musicMode = 'day';
      this.musicPlaying = false;
      this.rainAmount = 0;
      this._noise = null;
      this._lastGroan = 0;
    }

    init() {
      if (this.ctx) {
        if (this.ctx.state === 'suspended') this.ctx.resume();
        return;
      }
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      try {
        this.ctx = new AC();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.muted ? 0 : 0.55;
        this.master.connect(this.ctx.destination);

        this.sfxBus = this.ctx.createGain();
        this.sfxBus.gain.value = 0.75;
        this.sfxBus.connect(this.master);

        this.musicBus = this.ctx.createGain();
        this.musicBus.gain.value = 0.28;
        this.musicBus.connect(this.master);

        this.rainBus = this.ctx.createGain();
        this.rainBus.gain.value = 0;
        this.rainBus.connect(this.master);

        this._buildNoise();
        this._buildRain();
        this.ready = true;
        if (this.ctx.state === 'suspended') this.ctx.resume();
      } catch (err) {
        console.warn('Audio initialization failed', err);
      }
    }

    _buildNoise() {
      const len = this.ctx.sampleRate * 1.2;
      const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      let last = 0;
      for (let i = 0; i < len; i++) {
        const white = Math.random() * 2 - 1;
        last = last * 0.76 + white * 0.24;
        data[i] = last;
      }
      this._noise = buf;
    }

    _buildRain() {
      if (!this._noise) return;
      const src = this.ctx.createBufferSource();
      src.buffer = this._noise;
      src.loop = true;
      const hp = this.ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 380;
      const lp = this.ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 2400;
      const gain = this.ctx.createGain();
      gain.gain.value = 0.28;
      src.connect(hp);
      hp.connect(lp);
      lp.connect(gain);
      gain.connect(this.rainBus);
      src.start();
      this.rainGain = gain;
    }

    setMuted(m) {
      this.muted = m;
      U.storageSet('tf_muted', m);
      if (this.master) {
        this.master.gain.cancelScheduledValues(this.ctx.currentTime);
        this.master.gain.linearRampToValueAtTime(m ? 0 : 0.55, this.ctx.currentTime + 0.12);
      }
      return m;
    }
    toggleMute() { return this.setMuted(!this.muted); }

    _now() { return this.ctx ? this.ctx.currentTime : 0; }

    tone({ freq = 440, endFreq = null, dur = 0.15, type = 'sine', vol = 0.2, attack = 0.005, delay = 0, bus = null, detune = 0 }) {
      if (!this.ready || this.muted) return;
      const t0 = this._now() + delay;
      const osc = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freq, t0);
      if (endFreq != null) osc.frequency.exponentialRampToValueAtTime(Math.max(20, endFreq), t0 + dur);
      if (detune) osc.detune.value = detune;
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + attack);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      osc.connect(g);
      g.connect(bus || this.sfxBus);
      osc.start(t0);
      osc.stop(t0 + dur + 0.02);
    }

    noise({ dur = 0.12, vol = 0.2, freq = 1000, q = 0.7, type = 'lowpass', endFreq = null, delay = 0 }) {
      if (!this.ready || this.muted) return;
      const t0 = this._now() + delay;
      const src = this.ctx.createBufferSource();
      src.buffer = this._noise;
      src.playbackRate.value = 0.8 + Math.random() * 0.4;
      const filter = this.ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.setValueAtTime(freq, t0);
      if (endFreq != null) filter.frequency.exponentialRampToValueAtTime(Math.max(40, endFreq), t0 + dur);
      filter.Q.value = q;
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, t0);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, vol), t0 + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      src.connect(filter);
      filter.connect(g);
      g.connect(this.sfxBus);
      src.start(t0);
      src.stop(t0 + dur + 0.03);
    }

    // ---- UI / gameplay sfx ------------------------------------------------
    click() { this.tone({ freq: 620, endFreq: 720, dur: 0.05, type: 'triangle', vol: 0.1 }); }

    dig(material = 'dirt') {
      if (!this.ready) return;
      const pitch = material === 'stone' ? 118 : material === 'ore' ? 156 : material === 'wood' ? 210 : 170;
      this.noise({ dur: 0.055, vol: 0.13, freq: 960 + Math.random() * 420, type: 'lowpass', endFreq: 330 });
      this.tone({ freq: pitch, endFreq: pitch * 0.7, dur: 0.07, type: 'triangle', vol: 0.045 });
    }

    breakBlock(material = 'dirt') {
      if (!this.ready) return;
      this.noise({ dur: material === 'stone' ? 0.22 : 0.16, vol: 0.24, freq: material === 'stone' ? 1700 : 1100, type: 'lowpass', endFreq: 190 });
      this.tone({ freq: material === 'stone' ? 150 : 110, endFreq: 55, dur: 0.16, type: 'triangle', vol: 0.12 });
      if (material === 'ore') this.tone({ freq: 920, endFreq: 1320, dur: 0.18, type: 'sine', vol: 0.06, delay: 0.02 });
    }

    place() {
      this.noise({ dur: 0.08, vol: 0.18, freq: 640, type: 'lowpass', endFreq: 260 });
      this.tone({ freq: 170, endFreq: 110, dur: 0.09, type: 'triangle', vol: 0.07 });
    }

    pickup() {
      this.tone({ freq: 780, endFreq: 1180, dur: 0.07, type: 'square', vol: 0.045 });
      this.tone({ freq: 1180, endFreq: 1560, dur: 0.06, type: 'sine', vol: 0.035, delay: 0.055 });
    }

    craft() {
      this.tone({ freq: 520, endFreq: 660, dur: 0.1, type: 'triangle', vol: 0.11 });
      this.tone({ freq: 780, endFreq: 990, dur: 0.13, type: 'sine', vol: 0.08, delay: 0.09 });
      this.noise({ dur: 0.07, vol: 0.05, freq: 3000, type: 'highpass' });
    }

    error() { this.tone({ freq: 180, endFreq: 120, dur: 0.16, type: 'square', vol: 0.05 }); }
    jump() { this.tone({ freq: 280, endFreq: 480, dur: 0.09, type: 'triangle', vol: 0.05 }); }
    land() { this.noise({ dur: 0.08, vol: 0.11, freq: 330, type: 'lowpass' }); }

    swing() {
      this.noise({ dur: 0.14, vol: 0.13, freq: 2000, q: 1.2, type: 'bandpass', endFreq: 700 });
    }
    stab() {
      this.noise({ dur: 0.1, vol: 0.08, freq: 2400, type: 'bandpass', endFreq: 1000 });
    }
    bow() {
      this.tone({ freq: 320, endFreq: 180, dur: 0.1, type: 'triangle', vol: 0.06 });
      this.noise({ dur: 0.11, vol: 0.08, freq: 1800, type: 'highpass' });
    }
    magic() {
      this.tone({ freq: 520, endFreq: 900, dur: 0.24, type: 'sine', vol: 0.09 });
      this.tone({ freq: 800, endFreq: 1300, dur: 0.2, type: 'triangle', vol: 0.04, delay: 0.03 });
    }
    hit() {
      this.noise({ dur: 0.1, vol: 0.24, freq: 800, type: 'lowpass', endFreq: 160 });
      this.tone({ freq: 120, endFreq: 60, dur: 0.12, type: 'square', vol: 0.09 });
    }
    hurt() {
      this.tone({ freq: 330, endFreq: 122, dur: 0.28, type: 'sawtooth', vol: 0.08 });
      this.noise({ dur: 0.14, vol: 0.1, freq: 420, type: 'lowpass' });
    }
    death() {
      this.tone({ freq: 220, endFreq: 55, dur: 1.1, type: 'sawtooth', vol: 0.1 });
      this.tone({ freq: 110, endFreq: 40, dur: 1.4, type: 'triangle', vol: 0.12 });
      this.noise({ dur: 0.7, vol: 0.08, freq: 300, type: 'lowpass', endFreq: 80 });
    }
    enemyDie() {
      this.tone({ freq: 240, endFreq: 60, dur: 0.24, type: 'square', vol: 0.06 });
      this.noise({ dur: 0.22, vol: 0.12, freq: 700, type: 'lowpass', endFreq: 140 });
    }

    door(open) {
      this.tone({ freq: open ? 220 : 380, endFreq: open ? 380 : 220, dur: 0.3, type: 'sawtooth', vol: 0.025 });
      this.noise({ dur: 0.22, vol: 0.03, freq: 500, type: 'bandpass' });
    }

    talk() {
      this.tone({ freq: 300, endFreq: 340, dur: 0.07, type: 'square', vol: 0.03 });
      this.tone({ freq: 380, endFreq: 420, dur: 0.07, type: 'square', vol: 0.025, delay: 0.07 });
    }

    heal() {
      [523, 659, 784].forEach((f, i) => this.tone({ freq: f, dur: 0.22, type: 'sine', vol: 0.07, delay: i * 0.08 }));
    }

    save() {
      this.tone({ freq: 440, dur: 0.1, type: 'sine', vol: 0.06 });
      this.tone({ freq: 660, dur: 0.16, type: 'sine', vol: 0.05, delay: 0.08 });
    }

    levelUp() {
      this.tone({ freq: 392, dur: 0.14, type: 'triangle', vol: 0.08 });
      this.tone({ freq: 523, dur: 0.16, type: 'triangle', vol: 0.08, delay: 0.12 });
      this.tone({ freq: 784, dur: 0.3, type: 'sine', vol: 0.07, delay: 0.26 });
    }

    groan() {
      if (!this.ready) return;
      const now = this.ctx.currentTime;
      if (now - this._lastGroan < 4.5) return;
      this._lastGroan = now;
      const base = 70 + Math.random() * 28;
      this.tone({ freq: base, endFreq: base * 0.65, dur: 1.1, type: 'sawtooth', vol: 0.022 });
      this.tone({ freq: base * 1.5, endFreq: base * 0.9, dur: 0.9, type: 'triangle', vol: 0.015 });
    }

    dash() { this.noise({ dur: 0.12, vol: 0.07, freq: 700, type: 'bandpass' }); }

    // ---- ambience ---------------------------------------------------------
    setRain(amount) {
      this.rainAmount = amount;
      if (!this.ready || !this.rainBus) return;
      const target = this.muted ? 0 : amount * 0.24;
      this.rainBus.gain.cancelScheduledValues(this.ctx.currentTime);
      this.rainBus.gain.linearRampToValueAtTime(target, this.ctx.currentTime + 1.5);
      if (this.rainGain) this.rainGain.gain.value = 0.22 + amount * 0.1;
    }

    // ---- generative music -------------------------------------------------
    startMusic(mode = 'day') {
      if (!this.ready) return;
      this.musicMode = mode;
      if (this.musicPlaying) {
        this.setMusicMode(mode);
        return;
      }
      this.musicPlaying = true;
      this._startPad();
      this._scheduleMusic();
    }

    stopMusic() {
      this.musicPlaying = false;
      if (this.musicTimer) {
        clearInterval(this.musicTimer);
        this.musicTimer = null;
      }
      if (this.padGain && this.ctx) {
        this.padGain.gain.cancelScheduledValues(this.ctx.currentTime);
        this.padGain.gain.linearRampToValueAtTime(0.0001, this.ctx.currentTime + 1.2);
      }
      this.padGain = null;
      this.padOscs = null;
    }

    setMusicMode(mode) {
      if (this.musicMode === mode) return;
      this.musicMode = mode;
      if (this.padOscs && this.ctx) {
        const freq = mode === 'night' ? 55 : 65.41;
        this.padOscs.forEach((o, i) => {
          o.frequency.linearRampToValueAtTime(freq * (i === 0 ? 1 : 1.5), this.ctx.currentTime + 2.5);
        });
      }
    }

    _startPad() {
      if (!this.ready) return;
      const t = this.ctx.currentTime;
      const gain = this.ctx.createGain();
      gain.gain.value = 0.0001;
      gain.gain.linearRampToValueAtTime(0.028, t + 3);
      gain.connect(this.musicBus);
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 340;
      filter.Q.value = 1.4;
      filter.connect(gain);
      const freqs = this.musicMode === 'night' ? [55, 82.41] : [65.41, 98];
      const oscs = freqs.map((f, i) => {
        const o = this.ctx.createOscillator();
        o.type = i === 0 ? 'sine' : 'triangle';
        o.frequency.value = f;
        o.detune.value = i === 0 ? -4 : 5;
        const og = this.ctx.createGain();
        og.gain.value = i === 0 ? 0.55 : 0.22;
        o.connect(og);
        og.connect(filter);
        o.start(t);
        return o;
      });
      this.padGain = gain;
      this.padOscs = oscs;
    }

    _scheduleMusic() {
      if (this.musicTimer) clearInterval(this.musicTimer);
      const dayScale = [261.63, 293.66, 329.63, 392.0, 440.0, 523.25, 587.33, 659.25];
      const nightScale = [220.0, 246.94, 261.63, 293.66, 329.63, 392.0, 440.0, 523.25];
      let beat = 0;
      const step = () => {
        if (!this.musicPlaying || this.muted || !this.ready) return;
        const scale = this.musicMode === 'night' ? nightScale : dayScale;
        const t = this.ctx.currentTime;
        // sparse high pluck
        if (Math.random() < (this.musicMode === 'night' ? 0.45 : 0.55)) {
          const note = scale[Math.floor(Math.random() * scale.length)] * (Math.random() < 0.2 ? 2 : 1);
          this._musicNote(note, t + 0.03, 0.28, this.musicMode === 'night' ? 0.014 : 0.018);
        }
        // every 4 beats, a low pulse
        if (beat % 4 === 0) {
          this._musicNote(this.musicMode === 'night' ? 110 : 130.81, t + 0.02, 1.4, 0.012, 'sine');
        }
        // occasional soft echo
        if (Math.random() < 0.15) {
          const note = scale[Math.floor(Math.random() * scale.length)];
          this._musicNote(note * 1.5, t + 0.5, 0.5, 0.007);
        }
        beat++;
      };
      this.musicTimer = setInterval(step, 1250);
      step();
    }

    _musicNote(freq, when, dur, vol, type = 'triangle') {
      if (!this.ready || this.muted) return;
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.type = type;
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, when);
      g.gain.exponentialRampToValueAtTime(vol, when + 0.03);
      g.gain.exponentialRampToValueAtTime(0.0001, when + dur);
      o.connect(g);
      g.connect(this.musicBus);
      o.start(when);
      o.stop(when + dur + 0.05);
    }
  }

  TF.audio = new AudioSys();
})();
