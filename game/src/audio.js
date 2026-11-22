// Synthesised sound: every effect and the music loop are built with the
// Web Audio API, so the game ships no audio files at all.

export class AudioEngine {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.musicTimer = null;
    this.musicStep = 0;
    this.engineNodes = null;
    this.sirenNodes = null;
    this.noiseBuffer = null;
  }

  // Must be called from a user gesture (the Play button) to unlock audio.
  unlock() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
      return;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : 0.55;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    } catch {
      this.ctx = null;
    }
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master && this.ctx) {
      this.master.gain.setValueAtTime(muted ? 0 : 0.55, this.ctx.currentTime);
    }
  }

  _tone(freq, dur, type = 'sine', vol = 0.3, when = 0, slideTo = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.05);
  }

  _noise(dur, vol = 0.4, filterFreq = 1200, when = 0) {
    if (!this.ctx) return;
    const t0 = this.ctx.currentTime + when;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = filterFreq;
    const gain = this.ctx.createGain();
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
  }

  shoot() { this._noise(0.12, 0.5, 2600); this._tone(160, 0.1, 'square', 0.25, 0, 60); }
  enemyShoot() { this._noise(0.09, 0.22, 1800); }
  crash() { this._noise(0.3, 0.5, 500); this._tone(70, 0.25, 'sine', 0.4, 0, 40); }
  explosion() {
    this._noise(0.9, 0.8, 300);
    this._tone(55, 0.8, 'sine', 0.6, 0, 28);
  }
  pickup() { this._tone(660, 0.12, 'sine', 0.3); this._tone(990, 0.18, 'sine', 0.3, 0.09); }
  cashRegister() {
    this._tone(880, 0.1, 'triangle', 0.3);
    this._tone(1174, 0.14, 'triangle', 0.3, 0.08);
    this._tone(1568, 0.2, 'triangle', 0.3, 0.16);
  }
  missionJingle() {
    [523, 659, 784, 1046].forEach((f, i) => this._tone(f, 0.22, 'triangle', 0.3, i * 0.11));
  }
  missionFail() { [392, 330, 262].forEach((f, i) => this._tone(f, 0.25, 'triangle', 0.28, i * 0.14)); }
  horn() { this._tone(392, 0.25, 'square', 0.18); this._tone(330, 0.25, 'square', 0.18); }
  click() { this._tone(1200, 0.05, 'sine', 0.15); }
  jump() { this._tone(300, 0.12, 'sine', 0.12, 0, 520); }

  // Continuous engine hum: pitch and loudness follow speed (0..1).
  setEngine(speed01, running) {
    if (!this.ctx) return;
    if (!running || speed01 <= 0.01) {
      if (this.engineNodes) {
        try { this.engineNodes.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.1); } catch { /* ignore */ }
      }
      return;
    }
    if (!this.engineNodes) {
      const osc1 = this.ctx.createOscillator();
      osc1.type = 'sawtooth';
      const osc2 = this.ctx.createOscillator();
      osc2.type = 'square';
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain).connect(this.master);
      osc1.start();
      osc2.start();
      this.engineNodes = { osc1, osc2, gain };
    }
    const f = 55 + speed01 * 130;
    const t = this.ctx.currentTime;
    this.engineNodes.osc1.frequency.setTargetAtTime(f, t, 0.08);
    this.engineNodes.osc2.frequency.setTargetAtTime(f * 1.5, t, 0.08);
    this.engineNodes.gain.gain.setTargetAtTime(0.05 + speed01 * 0.06, t, 0.1);
  }

  // Police siren: two alternating tones, louder the closer the nearest cop.
  setSiren(level01) {
    if (!this.ctx) return;
    if (level01 <= 0.01) {
      if (this.sirenNodes) {
        try { this.sirenNodes.gain.gain.setTargetAtTime(0, this.ctx.currentTime, 0.2); } catch { /* ignore */ }
      }
      return;
    }
    if (!this.sirenNodes) {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      const gain = this.ctx.createGain();
      gain.gain.value = 0;
      const lfo = this.ctx.createOscillator();
      lfo.type = 'square';
      lfo.frequency.value = 1.6;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 130;
      lfo.connect(lfoGain).connect(osc.frequency);
      osc.frequency.value = 820;
      osc.connect(gain).connect(this.master);
      osc.start();
      lfo.start();
      this.sirenNodes = { osc, gain };
    }
    this.sirenNodes.gain.gain.setTargetAtTime(0.02 + level01 * 0.05, this.ctx.currentTime, 0.2);
  }

  // A light synthwave loop: Am – F – C – G pads with a soft bass pulse.
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    const chords = [
      [110.0, 164.8, 220.0], [87.3, 174.6, 261.6],
      [130.8, 196.0, 261.6], [98.0, 196.0, 246.9],
    ];
    const stepDur = 0.5;
    this.musicTimer = setInterval(() => {
      if (!this.ctx || this.muted) return;
      const step = this.musicStep++;
      const chord = chords[Math.floor(step / 8) % chords.length];
      if (step % 8 === 0) {
        chord.forEach((f) => this._tone(f, 3.6, 'triangle', 0.055));
      }
      if (step % 2 === 0) this._tone(chord[0] / 2, 0.4, 'sine', 0.09);
      if (step % 4 === 2) this._tone(chord[1] * 2, 0.18, 'sine', 0.035);
    }, stepDur * 1000);
  }

  stopMusic() {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }
}
