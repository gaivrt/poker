// Background music (docs/08 §3): a lazy jazz loop synthesized with WebAudio as a
// placeholder — walking bass, electric-piano comping, brushed drums — plus a tension
// layer (drone and straight hats) that rises during all-ins, ducking under big moments,
// and short win/lose stings.
//
// Files in public/art/audio/ replace the synthesized parts: bgm-lobby, bgm-table,
// bgm-tension (looped) and sting-win, sting-lose (mp3, ogg or wav).
import { artUrl } from '../stage/assets';
import { sfx } from './sfx';

export type Scene = 'off' | 'lobby' | 'table';

interface Chord {
  root: number;    // bass root (MIDI)
  voicing: number[];
}

// One chord per bar.
const SONGS: Record<Exclude<Scene, 'off'>, { bpm: number; chords: Chord[]; bright: number }> = {
  // ii–V–I–vi in F: Gm9 C13 Fmaj9 Dm9
  table: {
    bpm: 84,
    bright: 1800,
    chords: [
      { root: 43, voicing: [58, 62, 65, 69] },
      { root: 36, voicing: [58, 64, 69, 74] },
      { root: 41, voicing: [57, 60, 64, 67] },
      { root: 38, voicing: [53, 57, 60, 64] },
    ],
  },
  // brighter for the lobby: Ebmaj9 Dm7 Cm9 F13
  lobby: {
    bpm: 92,
    bright: 2600,
    chords: [
      { root: 39, voicing: [55, 58, 62, 65] },
      { root: 38, voicing: [53, 57, 60, 65] },
      { root: 36, voicing: [51, 55, 58, 62] },
      { root: 41, voicing: [51, 57, 62, 67] },
    ],
  },
};

const hz = (midi: number) => 440 * Math.pow(2, (midi - 69) / 12);

// Comping rhythms within a bar, in beats (0.67 = the swung "and").
const COMP = [[0, 1.67], [0.67, 2.67], [1, 3.67], [0, 2.67, 3.67], [1.67, 3]];

class Music {
  private ctx: AudioContext | null = null;
  private out: GainNode | null = null;    // music volume
  private duckG: GainNode | null = null;  // ducking under big moments
  private tensionG: GainNode | null = null;
  private drone: OscillatorNode | null = null;
  private droneF: BiquadFilterNode | null = null;
  private noise: AudioBuffer | null = null;
  private scene: Scene = 'off';
  private wanted: Scene = 'off';
  private tension = 0;
  private timer = 0;
  private nextTime = 0;   // when the next eighth note starts
  private step = 0;       // eighth-note counter
  private files = new Map<string, AudioBuffer | null>();
  private loops: AudioBufferSourceNode[] = [];
  private enabled = true;
  volume = 0.9;

  constructor() {
    sfx.onUnlock((ctx) => this.init(ctx));
  }

  private init(ctx: AudioContext) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = this.enabled ? this.volume : 0;
    this.duckG = ctx.createGain();
    this.out.connect(this.duckG).connect(sfx.master ?? ctx.destination);
    this.tensionG = ctx.createGain();
    this.tensionG.gain.value = 0;
    this.tensionG.connect(this.out);
    const n = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
    const d = n.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    this.noise = n;
    this.play(this.wanted);
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    if (this.out && this.ctx) this.out.gain.setTargetAtTime(on ? this.volume : 0, this.ctx.currentTime, 0.2);
  }

  /** Switch the loop (fades through silence). */
  play(scene: Scene) {
    this.wanted = scene;
    if (!this.ctx || scene === this.scene) return;
    this.stopLoop();
    this.scene = scene;
    this.setTension(0);
    if (scene === 'off') return;
    void this.startScene(scene);
  }

  private async startScene(scene: Exclude<Scene, 'off'>) {
    const ctx = this.ctx!;
    const file = await this.file(`bgm-${scene}`);
    if (this.scene !== scene) return;
    if (file) {
      this.loops.push(this.loop(file, this.out!));
      const tension = await this.file('bgm-tension');
      if (tension && this.scene === scene) this.loops.push(this.loop(tension, this.tensionG!));
      return;
    }
    // synthesized: a scheduler a little ahead of the clock
    this.nextTime = ctx.currentTime + 0.1;
    this.step = 0;
    this.startDrone();
    this.timer = window.setInterval(() => this.schedule(), 60);
  }

  private stopLoop() {
    window.clearInterval(this.timer);
    this.timer = 0;
    for (const l of this.loops) {
      try {
        l.stop();
      } catch {
        /* already stopped */
      }
    }
    this.loops = [];
    if (this.drone) {
      try {
        this.drone.stop();
      } catch {
        /* already stopped */
      }
      this.drone = null;
    }
  }

  /** 0 = calm, 1 = all-in. */
  setTension(level: number) {
    this.tension = Math.max(0, Math.min(1, level));
    if (this.ctx && this.tensionG) this.tensionG.gain.setTargetAtTime(this.tension, this.ctx.currentTime, 0.4);
  }

  /** Big moments: the music steps back while they play. */
  duck(on: boolean) {
    if (this.ctx && this.duckG) this.duckG.gain.setTargetAtTime(on ? 0.35 : 1, this.ctx.currentTime, on ? 0.08 : 0.5);
  }

  /** A short phrase over the music: the end of a game. */
  async sting(kind: 'win' | 'lose') {
    if (!this.ctx || !this.out || !this.enabled) return;
    const ctx = this.ctx;
    const file = await this.file(`sting-${kind}`);
    this.duck(true);
    window.setTimeout(() => this.duck(false), 2600);
    const dest = ctx.createGain();
    dest.gain.value = this.volume * (file ? 0.8 : 1.4);
    dest.connect(sfx.master ?? ctx.destination);
    if (file) {
      const s = ctx.createBufferSource();
      s.buffer = file;
      s.connect(dest);
      s.start();
      return;
    }
    const t = ctx.currentTime + 0.05;
    if (kind === 'win') {
      // a rising arpeggio landing on a bright chord
      [65, 69, 72, 77].forEach((m, i) => this.keys(dest, m, t + i * 0.11, 0.9, 0.16));
      [65, 69, 72, 76, 79].forEach((m) => this.keys(dest, m, t + 0.5, 2.2, 0.1));
      this.bass(dest, 41, t + 0.5, 1.6);
    } else {
      [67, 63, 60, 55].forEach((m, i) => this.keys(dest, m, t + i * 0.16, 1, 0.13));
      this.bass(dest, 36, t + 0.6, 1.8);
    }
  }

  // ---------------- synthesis ----------------

  private schedule() {
    const ctx = this.ctx!;
    const scene = this.scene;
    if (scene === 'off') return;
    const song = SONGS[scene];
    const beat = 60 / song.bpm;
    // If the page was busy (loading a table), skip the missed notes instead of
    // playing them all at once — stay on the beat.
    while (this.nextTime < ctx.currentTime) {
      this.nextTime += this.step % 2 === 0 ? beat * (2 / 3) : beat * (1 / 3);
      this.step++;
    }
    // Schedule half a second ahead so a stalled frame (a busy phone) never drops a note.
    while (this.nextTime < ctx.currentTime + 0.5) {
      const eighth = this.step % 8;           // position in the bar
      const bar = Math.floor(this.step / 8);
      const chord = song.chords[bar % song.chords.length];
      const next = song.chords[(bar + 1) % song.chords.length];
      // swing: the second eighth of each beat lands at 2/3 of the beat
      const t = this.nextTime;
      const onBeat = eighth % 2 === 0;
      const beatNo = Math.floor(eighth / 2);

      if (onBeat) {
        this.bass(this.out!, this.walk(chord, next, beatNo), t, beat * 0.9);
        // ride: ding (every beat)
        this.cymbal(t, 0.035, 9000, 0.25);
        // hi-hat foot on 2 and 4, brush swish
        if (beatNo % 2 === 1) this.cymbal(t, 0.03, 5000, 0.08, 'bandpass');
        if (beatNo === 0) this.kick(t, 0.25);
      } else if (beatNo % 2 === 1) {
        // the skip note of the ride: "ding ding-a ding"
        this.cymbal(t, 0.02, 9000, 0.12);
      }
      // comping
      if (eighth === 0) this.comp = COMP[Math.floor(Math.random() * COMP.length)];
      for (const at of this.comp) {
        const pos = Math.floor(at) * 2 + (at % 1 > 0.5 ? 1 : 0);
        if (pos === eighth) chord.voicing.forEach((m, i) => this.keys(this.out!, m, t + i * 0.012, beat * 1.6, 0.12, song.bright));
      }
      // tension layer: straight hats and a pulse, only audible when tension is up
      if (this.tension > 0.01) {
        this.cymbal(t, 0.04, 7000, 0.18, 'highpass', this.tensionG!);
        if (onBeat && beatNo % 2 === 0) this.kick(t, 0.6, this.tensionG!);
        if (this.droneF && eighth === 0) this.drone!.frequency.setTargetAtTime(hz(chord.root - 12), t, 0.3);
      }
      this.nextTime += onBeat ? beat * (2 / 3) : beat * (1 / 3);
      this.step++;
    }
  }

  private comp: number[] = COMP[0];

  /** Walking bass: root, a chord tone, another, then a chromatic step into the next root. */
  private walk(chord: Chord, next: Chord, beat: number) {
    const r = chord.root;
    if (beat === 0) return r;
    if (beat === 1) return r + (Math.random() < 0.5 ? 3 : 4);
    if (beat === 2) return r + 7;
    const target = next.root;
    return target + (Math.random() < 0.5 ? -1 : 1);
  }

  private keys(dest: AudioNode, midi: number, t: number, dur: number, gain: number, bright = 2200) {
    const ctx = this.ctx!;
    const f = hz(midi);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain, t + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = bright;
    const a = ctx.createOscillator();
    a.type = 'sine';
    a.frequency.value = f;
    const b = ctx.createOscillator();
    b.type = 'triangle';
    b.frequency.value = f * 2.001; // the bell of an electric piano
    const bg = ctx.createGain();
    bg.gain.value = 0.18;
    a.connect(g);
    b.connect(bg).connect(g);
    g.connect(lp).connect(dest);
    a.start(t);
    b.start(t);
    a.stop(t + dur + 0.05);
    b.stop(t + dur + 0.05);
  }

  private bass(dest: AudioNode, midi: number, t: number, dur: number) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'triangle';
    o.frequency.value = hz(midi);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.55, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 700;
    o.connect(g).connect(lp).connect(dest);
    o.start(t);
    o.stop(t + dur + 0.05);
  }

  private cymbal(t: number, dur: number, freq: number, gain: number, type: BiquadFilterType = 'highpass', dest: AudioNode = this.out!) {
    const ctx = this.ctx!;
    const s = ctx.createBufferSource();
    s.buffer = this.noise;
    const f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain * 0.35, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur * 4);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random() * 0.5, dur * 4 + 0.02);
  }

  private kick(t: number, gain: number, dest: AudioNode = this.out!) {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.frequency.setValueAtTime(110, t);
    o.frequency.exponentialRampToValueAtTime(42, t + 0.12);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain * 1.1, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g).connect(dest);
    o.start(t);
    o.stop(t + 0.3);
  }

  private startDrone() {
    const ctx = this.ctx!;
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = hz(31);
    const f = ctx.createBiquadFilter();
    f.type = 'lowpass';
    f.frequency.value = 260;
    f.Q.value = 6;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.25;
    const lg = ctx.createGain();
    lg.gain.value = 120;
    lfo.connect(lg).connect(f.frequency);
    const g = ctx.createGain();
    g.gain.value = 0.09;
    o.connect(f).connect(g).connect(this.tensionG!);
    o.start();
    lfo.start();
    o.onended = () => lfo.stop();
    this.drone = o;
    this.droneF = f;
  }

  // ---------------- files ----------------

  private async file(name: string): Promise<AudioBuffer | null> {
    if (this.files.has(name)) return this.files.get(name)!;
    const src = artUrl(`audio/${name}.mp3`) ?? artUrl(`audio/${name}.ogg`) ?? artUrl(`audio/${name}.wav`);
    let buf: AudioBuffer | null = null;
    if (src && this.ctx) {
      try {
        buf = await this.ctx.decodeAudioData(await (await fetch(src)).arrayBuffer());
      } catch {
        buf = null;
      }
    }
    this.files.set(name, buf);
    return buf;
  }

  private loop(buf: AudioBuffer, dest: AudioNode) {
    const s = this.ctx!.createBufferSource();
    s.buffer = buf;
    s.loop = true;
    s.connect(dest);
    s.start();
    return s;
  }
}

export const music = new Music();
