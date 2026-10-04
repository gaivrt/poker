// Sound effects. Each one is synthesized with WebAudio as a placeholder; a file with
// the same name in public/art/audio/ (mp3/ogg/wav) replaces it automatically.
import { artUrl } from '../stage/assets';

export type SfxName =
  | 'deal' | 'flip' | 'chip' | 'slide' | 'thud' | 'whoosh' | 'heartbeat' | 'impact' | 'chime' | 'riser' | 'tick' | 'cheer' | 'thunder' | 'bell' | 'glass' | 'ooh' | 'crack' | 'whoosh2';

class Sfx {
  private ctx: AudioContext | null = null;
  private buffers = new Map<string, AudioBuffer | null>();
  volume = 0.6;
  muted = false;

  /** Must be called from a user gesture (browsers block audio before that). */
  unlock() {
    if (!this.ctx) {
      try {
        this.ctx = new AudioContext();
      } catch {
        return;
      }
    }
    void this.ctx.resume();
  }

  private async file(name: SfxName): Promise<AudioBuffer | null> {
    if (!this.ctx) return null;
    if (this.buffers.has(name)) return this.buffers.get(name)!;
    const src = artUrl(`audio/${name}.mp3`) ?? artUrl(`audio/${name}.ogg`) ?? artUrl(`audio/${name}.wav`);
    let buf: AudioBuffer | null = null;
    if (src) {
      try {
        buf = await this.ctx.decodeAudioData(await (await fetch(src)).arrayBuffer());
      } catch {
        buf = null;
      }
    }
    this.buffers.set(name, buf);
    return buf;
  }

  play(name: SfxName, gain = 1) {
    if (this.muted || !this.ctx || this.ctx.state !== 'running') return;
    void this.file(name).then((buf) => {
      const ctx = this.ctx!;
      const out = ctx.createGain();
      out.gain.value = this.volume * gain;
      out.connect(ctx.destination);
      if (buf) {
        const s = ctx.createBufferSource();
        s.buffer = buf;
        s.connect(out);
        s.start();
        return;
      }
      this.synth(name, ctx, out);
    });
  }

  private noise(ctx: AudioContext, seconds: number) {
    const b = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * seconds), ctx.sampleRate);
    const d = b.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    const s = ctx.createBufferSource();
    s.buffer = b;
    return s;
  }

  private env(ctx: AudioContext, g: GainNode, a: number, peak: number, d: number) {
    const t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(0.0001, t + a + d);
  }

  private tone(ctx: AudioContext, out: AudioNode, f0: number, f1: number, dur: number, type: OscillatorType = 'sine', peak = 0.6, delay = 0) {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    const t = ctx.currentTime + delay;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(1, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(out);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private burst(ctx: AudioContext, out: AudioNode, dur: number, type: BiquadFilterType, freq: number, peak = 0.5, q = 1, sweepTo?: number) {
    const n = this.noise(ctx, dur + 0.05);
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    f.Q.value = q;
    if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, ctx.currentTime + dur);
    const g = ctx.createGain();
    this.env(ctx, g, 0.005, peak, dur);
    n.connect(f).connect(g).connect(out);
    n.start();
  }

  private synth(name: SfxName, ctx: AudioContext, out: AudioNode) {
    switch (name) {
      case 'deal': this.burst(ctx, out, 0.08, 'highpass', 2500, 0.35); break;
      case 'flip': this.burst(ctx, out, 0.05, 'bandpass', 3000, 0.6, 2); this.tone(ctx, out, 900, 600, 0.04, 'triangle', 0.15); break;
      case 'chip':
        this.tone(ctx, out, 3200, 2900, 0.05, 'triangle', 0.25);
        this.tone(ctx, out, 2600, 2400, 0.06, 'triangle', 0.2, 0.04);
        break;
      case 'slide': this.burst(ctx, out, 0.25, 'bandpass', 1200, 0.25, 0.8, 600); break;
      case 'thud': this.tone(ctx, out, 140, 45, 0.35, 'sine', 0.9); this.burst(ctx, out, 0.12, 'lowpass', 400, 0.5); break;
      case 'whoosh': this.burst(ctx, out, 0.45, 'bandpass', 400, 0.5, 1.5, 3000); break;
      case 'heartbeat': this.tone(ctx, out, 70, 40, 0.18, 'sine', 0.9); this.tone(ctx, out, 60, 35, 0.2, 'sine', 0.7, 0.22); break;
      case 'impact': this.tone(ctx, out, 90, 30, 0.8, 'sine', 1); this.burst(ctx, out, 0.5, 'lowpass', 900, 0.7); break;
      case 'chime': [1318, 1760, 2637].forEach((f, i) => this.tone(ctx, out, f, f, 0.9, 'sine', 0.25, i * 0.06)); break;
      case 'riser': this.burst(ctx, out, 1.2, 'bandpass', 200, 0.35, 2, 5000); break;
      case 'tick': this.tone(ctx, out, 2000, 1800, 0.03, 'square', 0.12); break;
      case 'thunder': this.burst(ctx, out, 1.1, 'lowpass', 2400, 0.8, 0.7, 120); this.tone(ctx, out, 60, 28, 0.9, 'sawtooth', 0.35); break;
      case 'bell': [880, 1320, 2200, 3300].forEach((f, i) => this.tone(ctx, out, f, f * 0.998, 1.6 - i * 0.3, 'sine', 0.3 / (i + 1))); break;
      case 'glass':
        this.burst(ctx, out, 0.5, 'highpass', 4500, 0.6, 1);
        [3100, 4200, 5300, 6100].forEach((f, i) => this.tone(ctx, out, f, f * 0.97, 0.35, 'triangle', 0.12, i * 0.03));
        break;
      case 'ooh': // a crowd going "oh~": a few voices gliding down
        [210, 260, 320, 390].forEach((f, i) => this.tone(ctx, out, f * 1.25, f, 0.9, 'sawtooth', 0.05, i * 0.02));
        this.burst(ctx, out, 0.9, 'bandpass', 700, 0.12, 1, 400);
        break;
      case 'crack': this.burst(ctx, out, 0.12, 'highpass', 1800, 0.8); this.tone(ctx, out, 400, 90, 0.2, 'square', 0.15); break;
      case 'whoosh2': this.burst(ctx, out, 0.6, 'bandpass', 2400, 0.35, 1.2, 300); break;
      case 'cheer': this.burst(ctx, out, 1.4, 'bandpass', 1500, 0.35, 0.5, 900); break;
    }
  }
}

export const sfx = new Sfx();
