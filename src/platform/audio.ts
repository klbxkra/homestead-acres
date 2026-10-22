/**
 * Sound effects and music, synthesized with Web Audio (PLAN.md section 10).
 * There are no audio files: every sound is a few oscillators or a burst of
 * noise, so the game stays small and works offline. Audio unlocks on the first
 * tap or key press (browsers block sound before that) and goes quiet while the
 * page is hidden.
 */
import { BEATS_PER_BAR, midiToHz, MUSIC_BPM, musicBar } from './music';

export type SoundId =
  | 'tap'
  | 'plow'
  | 'plant'
  | 'harvest'
  | 'collect'
  | 'coins'
  | 'buy'
  | 'levelUp'
  | 'error'
  | 'gift'
  | 'build'
  | 'medal'
  | 'magic'
  | 'help';

export interface GameAudio {
  /** Call from a user gesture; safe to call often. */
  unlock(): void;
  play(id: SoundId): void;
  /** 0..1 each. Music starts or stops to match. */
  setVolumes(sfx: number, music: number): void;
  /** False while the page is hidden. */
  setActive(active: boolean): void;
}

/** For tests, servers and browsers without Web Audio. */
export const silentAudio: GameAudio = {
  unlock: () => undefined,
  play: () => undefined,
  setVolumes: () => undefined,
  setActive: () => undefined,
};

/**
 * Drops repeats of the same sound closer together than `gapMs`, so painting
 * across 40 plots doesn't play 40 overlapping sounds at once.
 */
export class SoundThrottle {
  private readonly last = new Map<string, number>();
  constructor(private readonly gapMs: number) {}
  allow(id: string, now: number): boolean {
    const prev = this.last.get(id);
    if (prev !== undefined && now - prev < this.gapMs) return false;
    this.last.set(id, now);
    return true;
  }
}

type Ctx = AudioContext;

export function createAudio(): GameAudio {
  const AC: typeof AudioContext | undefined =
    typeof window === 'undefined' ? undefined : (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
  return AC ? new WebAudio(AC) : silentAudio;
}

class WebAudio implements GameAudio {
  private ctx: Ctx | null = null;
  private sfxGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private sfx = 0.5;
  private music = 0.25;
  private active = true;
  private readonly throttle = new SoundThrottle(70);
  private musicTimer: ReturnType<typeof setInterval> | null = null;
  private nextBarAt = 0;
  private bar = 0;

  constructor(private readonly AC: typeof AudioContext) {}

  unlock(): void {
    if (!this.ctx) {
      try {
        this.ctx = new this.AC();
      } catch {
        return;
      }
      const master = this.ctx.createDynamicsCompressor();
      master.connect(this.ctx.destination);
      this.sfxGain = this.ctx.createGain();
      this.musicGain = this.ctx.createGain();
      this.sfxGain.connect(master);
      this.musicGain.connect(master);
      this.applyVolumes();
      this.noise = makeNoise(this.ctx);
    }
    if (this.ctx.state === 'suspended' && this.active) void this.ctx.resume().catch(() => undefined);
    this.updateMusic();
  }

  setVolumes(sfx: number, music: number): void {
    this.sfx = sfx;
    this.music = music;
    this.applyVolumes();
    this.updateMusic();
  }

  setActive(active: boolean): void {
    this.active = active;
    if (!this.ctx) return;
    if (active) void this.ctx.resume().catch(() => undefined);
    else void this.ctx.suspend().catch(() => undefined);
    this.updateMusic();
  }

  play(id: SoundId): void {
    const ctx = this.ctx;
    if (!ctx || !this.sfxGain || this.sfx === 0 || !this.active || ctx.state !== 'running') return;
    if (!this.throttle.allow(id, ctx.currentTime * 1000)) return;
    const t = ctx.currentTime + 0.005;
    const out = this.sfxGain;
    switch (id) {
      case 'tap':
        tone(ctx, out, t, 880, 0.04, 0.12, 'sine');
        break;
      case 'plow':
        this.burst(t, 0.16, 500, 0.5);
        tone(ctx, out, t, 110, 0.12, 0.25, 'sine', 70);
        break;
      case 'plant':
        tone(ctx, out, t, 520, 0.07, 0.22, 'triangle');
        tone(ctx, out, t + 0.06, 780, 0.08, 0.2, 'triangle');
        break;
      case 'harvest':
        [784, 988, 1175].forEach((f, i) => tone(ctx, out, t + i * 0.055, f, 0.12, 0.22, 'triangle'));
        break;
      case 'collect':
        tone(ctx, out, t, 660, 0.06, 0.2, 'square', 990);
        tone(ctx, out, t + 0.07, 1320, 0.18, 0.16, 'sine');
        break;
      case 'coins':
        tone(ctx, out, t, 1319, 0.25, 0.18, 'sine');
        tone(ctx, out, t + 0.08, 1760, 0.3, 0.16, 'sine');
        break;
      case 'buy':
        this.burst(t, 0.03, 3000, 0.3);
        tone(ctx, out, t + 0.03, 1568, 0.3, 0.16, 'sine');
        break;
      case 'levelUp':
        [523, 659, 784, 1047].forEach((f, i) => tone(ctx, out, t + i * 0.09, f, 0.16, 0.22, 'triangle'));
        [523, 659, 784].forEach((f) => tone(ctx, out, t + 0.4, f * 2, 0.6, 0.1, 'sine'));
        break;
      case 'error':
        tone(ctx, out, t, 150, 0.16, 0.2, 'sawtooth', 120, 800);
        break;
      case 'gift':
        tone(ctx, out, t, 1200, 0.18, 0.12, 'sine', 2400);
        tone(ctx, out, t + 0.12, 1760, 0.3, 0.14, 'sine');
        break;
      case 'build':
        [0, 0.09, 0.18].forEach((d) => this.burst(t + d, 0.05, 900, 0.45));
        break;
      case 'medal':
        [392, 523, 659, 784].forEach((f, i) => tone(ctx, out, t + i * 0.11, f, i === 3 ? 0.5 : 0.14, 0.2, 'triangle'));
        break;
      case 'magic':
        [1568, 2093, 1760, 2637, 2349].forEach((f, i) => tone(ctx, out, t + i * 0.05, f, 0.22, 0.07, 'sine'));
        break;
      case 'help':
        tone(ctx, out, t, 988, 0.12, 0.16, 'sine');
        tone(ctx, out, t + 0.08, 1319, 0.2, 0.14, 'sine');
        break;
    }
  }

  private applyVolumes(): void {
    if (!this.ctx || !this.sfxGain || !this.musicGain) return;
    const now = this.ctx.currentTime;
    this.sfxGain.gain.setTargetAtTime(this.sfx, now, 0.02);
    this.musicGain.gain.setTargetAtTime(this.music * 0.6, now, 0.2);
  }

  /** Short filtered noise: plowing dirt, hammering. */
  private burst(t: number, length: number, freq: number, volume: number): void {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = freq;
    filter.Q.value = 1.2;
    const g = ctx.createGain();
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + length);
    src.connect(filter).connect(g).connect(this.sfxGain!);
    src.start(t, Math.random() * 0.5, length + 0.02);
  }

  // ---------------------------------------------------------------- music

  private updateMusic(): void {
    const ctx = this.ctx;
    const shouldPlay = !!ctx && this.music > 0 && this.active && ctx.state !== 'closed';
    if (shouldPlay && this.musicTimer === null) {
      this.nextBarAt = ctx.currentTime + 0.1;
      this.musicTimer = setInterval(() => this.scheduleMusic(), 200);
      this.scheduleMusic();
    } else if (!shouldPlay && this.musicTimer !== null) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }

  /** Schedules bars a little ahead of time so timers firing late don't stutter. */
  private scheduleMusic(): void {
    const ctx = this.ctx;
    if (!ctx || !this.musicGain || ctx.state !== 'running') return;
    const beat = 60 / MUSIC_BPM;
    if (this.nextBarAt < ctx.currentTime) this.nextBarAt = ctx.currentTime + 0.05; // after a pause, don't rush to catch up
    while (this.nextBarAt < ctx.currentTime + 0.6) {
      for (const n of musicBar(this.bar)) {
        const t = this.nextBarAt + n.beat * beat;
        const f = midiToHz(n.midi);
        if (n.voice === 'bass') tone(ctx, this.musicGain, t, f, n.length * beat, 0.22 * n.velocity, 'sine');
        else if (n.voice === 'pad') pad(ctx, this.musicGain, t, f, n.length * beat, 0.035 * n.velocity);
        else tone(ctx, this.musicGain, t, f, n.length * beat, 0.09 * n.velocity, 'triangle', undefined, 2400);
      }
      this.nextBarAt += BEATS_PER_BAR * beat;
      this.bar++;
    }
  }
}

/** One note with a quick attack and exponential decay. `toFreq` slides the pitch; `lowpass` softens it. */
function tone(
  ctx: Ctx,
  out: AudioNode,
  t: number,
  freq: number,
  length: number,
  volume: number,
  type: OscillatorType,
  toFreq?: number,
  lowpass?: number,
): void {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  if (toFreq !== undefined) osc.frequency.exponentialRampToValueAtTime(toFreq, t + length);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(volume, t + 0.008);
  g.gain.exponentialRampToValueAtTime(0.0001, t + length);
  let node: AudioNode = osc;
  if (lowpass !== undefined) {
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = lowpass;
    node = node.connect(f);
  }
  node.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + length + 0.05);
}

/** A slow-swelling sine for the background chords. */
function pad(ctx: Ctx, out: AudioNode, t: number, freq: number, length: number, volume: number): void {
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  osc.frequency.value = freq;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(volume, t + length * 0.35);
  g.gain.linearRampToValueAtTime(0.0001, t + length);
  osc.connect(g).connect(out);
  osc.start(t);
  osc.stop(t + length + 0.05);
}

function makeNoise(ctx: Ctx): AudioBuffer {
  const length = ctx.sampleRate; // one second, played from a random offset
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}
