/**
 * Retro 8-bit sound effects synthesized with Web Audio API.
 * No audio files needed - all sounds generated from oscillators and noise.
 */
export class SoundManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private volume = 0.3;

  private ensureContext(): AudioContext {
    if (!this.ctx) {
      this.ctx = new AudioContext();
      this.masterGain = this.ctx.createGain();
      this.masterGain.gain.value = this.volume;
      this.masterGain.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  private getMaster(): GainNode {
    this.ensureContext();
    return this.masterGain!;
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.masterGain) this.masterGain.gain.value = v;
  }

  // --- Helper: play a tone with envelope ---
  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType = 'square',
    freqEnd?: number,
    gainStart = 0.3,
    gainEnd = 0,
  ): void {
    const ctx = this.ensureContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = type;
    osc.frequency.setValueAtTime(freq, ctx.currentTime);
    if (freqEnd !== undefined) {
      osc.frequency.linearRampToValueAtTime(freqEnd, ctx.currentTime + duration);
    }

    gain.gain.setValueAtTime(gainStart, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(gainEnd, ctx.currentTime + duration);

    osc.connect(gain);
    gain.connect(this.getMaster());
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  }

  // --- Helper: play noise burst ---
  private playNoise(duration: number, gainStart = 0.2): void {
    const ctx = this.ensureContext();
    const bufferSize = ctx.sampleRate * duration;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const source = ctx.createBufferSource();
    source.buffer = buffer;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(gainStart, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + duration);

    source.connect(gain);
    gain.connect(this.getMaster());
    source.start(ctx.currentTime);
  }

  // ===== COMBAT SOUNDS =====

  towerFire(): void {
    this.playTone(880, 0.06, 'square', 440, 0.2);
  }

  towerFireSniper(): void {
    this.playTone(1200, 0.1, 'sawtooth', 200, 0.15);
  }

  towerFireSplash(): void {
    this.playTone(300, 0.15, 'square', 100, 0.2);
    this.playNoise(0.08);
  }

  towerFireSlow(): void {
    this.playTone(600, 0.12, 'sine', 400, 0.15);
  }

  enemyDeath(): void {
    this.playTone(400, 0.08, 'square', 100);
    this.playNoise(0.1);
  }

  enemyReachGoal(): void {
    // Ominous descending tone
    this.playTone(500, 0.3, 'sawtooth', 80, 0.25);
  }

  enemySpawn(): void {
    this.playTone(200, 0.05, 'square', 300, 0.08);
  }

  // ===== BUILDING SOUNDS =====

  towerPlaced(): void {
    this.playTone(440, 0.05, 'square');
    setTimeout(() => this.playTone(660, 0.05, 'square'), 50);
  }

  towerUpgraded(): void {
    this.playTone(440, 0.05, 'square');
    setTimeout(() => this.playTone(660, 0.05, 'square'), 60);
    setTimeout(() => this.playTone(880, 0.08, 'square'), 120);
  }

  towerSold(): void {
    this.playTone(660, 0.05, 'square', 330, 0.15);
  }

  // ===== PHASE SOUNDS =====

  waveStart(): void {
    // Rising fanfare
    const notes = [330, 440, 550, 660];
    notes.forEach((freq, i) => {
      setTimeout(() => this.playTone(freq, 0.1, 'square', undefined, 0.2), i * 80);
    });
  }

  airRaidSiren(): void {
    // Classic two-tone air raid siren: oscillate between ~400 Hz and ~800 Hz
    // across three cycles, then tail off.
    const ctx = this.ensureContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    const t0 = ctx.currentTime;
    const cycle = 0.45;
    for (let i = 0; i < 3; i++) {
      const cStart = t0 + i * cycle;
      osc.frequency.setValueAtTime(420, cStart);
      osc.frequency.linearRampToValueAtTime(820, cStart + cycle * 0.5);
      osc.frequency.linearRampToValueAtTime(420, cStart + cycle);
    }
    const total = cycle * 3;
    gain.gain.setValueAtTime(0.18, t0);
    gain.gain.setValueAtTime(0.18, t0 + total - 0.1);
    gain.gain.linearRampToValueAtTime(0, t0 + total);
    osc.connect(gain);
    gain.connect(this.getMaster());
    osc.start(t0);
    osc.stop(t0 + total);
  }

  waveComplete(): void {
    // Victory jingle
    const notes = [523, 659, 784, 1047];
    notes.forEach((freq, i) => {
      setTimeout(() => this.playTone(freq, 0.15, 'square', undefined, 0.2), i * 100);
    });
  }

  gameOver(): void {
    // Descending defeat
    const notes = [660, 550, 440, 330, 220];
    notes.forEach((freq, i) => {
      setTimeout(() => this.playTone(freq, 0.25, 'sawtooth', undefined, 0.2), i * 150);
    });
  }

  victory(): void {
    // Ascending triumph
    const notes = [523, 659, 784, 1047, 1319];
    notes.forEach((freq, i) => {
      setTimeout(() => this.playTone(freq, 0.2, 'square', undefined, 0.25), i * 120);
    });
  }

  // ===== UI SOUNDS =====

  actionFailed(): void {
    this.playTone(200, 0.15, 'square', 150, 0.15);
  }

  playerReady(): void {
    this.playTone(880, 0.08, 'sine', undefined, 0.15);
  }
}
