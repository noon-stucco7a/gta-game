// audio.js — all of Marina Heat's sound is synthesised with WebAudio: a two-tone
// siren, an engine whose pitch follows the car's speed, gunshots, crashes, pickups
// and UI clicks. No audio files, nothing loaded. Created lazily on the first user
// gesture, as browsers require; M toggles mute.

export class SoundFX {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
    this.sirenFlip = null;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return;
    }
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    this.ctx = new AC();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.5;
    this.master.connect(this.ctx.destination);
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.value = muted ? 0 : 0.5;
  }

  tone(freq, dur, type = 'square', vol = 0.2, slideTo = null, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const osc = this.ctx.createOscillator();
    const gain = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t0 + dur);
    gain.gain.setValueAtTime(vol, t0);
    gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
    osc.connect(gain).connect(this.master);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  noise(dur, vol = 0.3, freq = 1000, delay = 0) {
    if (!this.ctx || this.muted) return;
    const t0 = this.ctx.currentTime + delay;
    const len = Math.max(1, Math.floor(this.ctx.sampleRate * dur));
    const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len);
    const src = this.ctx.createBufferSource();
    src.buffer = buffer;
    const filter = this.ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = freq;
    const gain = this.ctx.createGain();
    gain.gain.value = vol;
    src.connect(filter).connect(gain).connect(this.master);
    src.start(t0);
  }

  shot() {
    this.noise(0.12, 0.35, 2600);
    this.tone(160, 0.08, 'square', 0.12, 60);
  }

  crash(strength = 1) {
    this.noise(0.22, 0.3 * strength, 500);
    this.tone(90, 0.2, 'sine', 0.25 * strength, 40);
  }

  pickup() {
    this.tone(880, 0.09, 'sine', 0.2);
    this.tone(1318, 0.14, 'sine', 0.2, null, 0.07);
  }

  cashRegister() {
    this.tone(1046, 0.08, 'triangle', 0.22);
    this.tone(1568, 0.1, 'triangle', 0.22, null, 0.06);
    this.tone(2093, 0.16, 'triangle', 0.2, null, 0.12);
  }

  missionFailed() {
    this.tone(392, 0.16, 'triangle', 0.22);
    this.tone(330, 0.16, 'triangle', 0.22, null, 0.15);
    this.tone(262, 0.3, 'triangle', 0.22, null, 0.3);
  }

  click() {
    this.tone(660, 0.05, 'sine', 0.15);
  }

  door() {
    this.tone(140, 0.07, 'sine', 0.2, 90);
  }

  // Continuous engine loop while the player drives; pitch follows speed.
  setEngine(on, speedRatio = 0) {
    if (!this.ctx) return;
    if (on && !this.engineOsc) {
      this.engineOsc = this.ctx.createOscillator();
      this.engineGain = this.ctx.createGain();
      this.engineOsc.type = 'sawtooth';
      this.engineGain.gain.value = 0.0;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      this.engineOsc.connect(filter).connect(this.engineGain).connect(this.master);
      this.engineOsc.start();
    }
    if (this.engineOsc) {
      const t = this.ctx.currentTime;
      this.engineOsc.frequency.setTargetAtTime(55 + speedRatio * 165, t, 0.08);
      this.engineGain.gain.setTargetAtTime(on && !this.muted ? 0.06 + speedRatio * 0.05 : 0, t, 0.1);
      if (!on) {
        const osc = this.engineOsc;
        window.setTimeout(() => { try { osc.stop(); } catch { /* already stopped */ } }, 300);
        this.engineOsc = null;
        this.engineGain = null;
      }
    }
  }

  // Continuous two-tone siren while police are close; volume follows distance.
  setSiren(on, closeness = 0) {
    if (!this.ctx) return;
    if (on && !this.sirenOsc) {
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenGain = this.ctx.createGain();
      this.sirenOsc.type = 'triangle';
      this.sirenGain.gain.value = 0;
      this.sirenOsc.connect(this.sirenGain).connect(this.master);
      this.sirenOsc.start();
      let high = false;
      this.sirenFlip = window.setInterval(() => {
        if (!this.sirenOsc) return;
        high = !high;
        this.sirenOsc.frequency.setValueAtTime(high ? 960 : 720, this.ctx.currentTime);
      }, 380);
    }
    if (this.sirenGain) {
      this.sirenGain.gain.setTargetAtTime(on && !this.muted ? 0.02 + closeness * 0.05 : 0, this.ctx.currentTime, 0.15);
    }
    if (!on && this.sirenOsc) {
      const osc = this.sirenOsc;
      window.clearInterval(this.sirenFlip);
      window.setTimeout(() => { try { osc.stop(); } catch { /* already stopped */ } }, 250);
      this.sirenOsc = null;
      this.sirenGain = null;
      this.sirenFlip = null;
    }
  }
}
