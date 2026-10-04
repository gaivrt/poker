// Pooled particles: chips with tumbling flips, sparks, dust rings, confetti.
import { type Container, Sprite, Texture, Ticker } from 'pixi.js';
import { paintChip, paintGlow } from '../stage/painter';

interface P {
  s: Sprite;
  vx: number; vy: number; vr: number; g: number;
  life: number; age: number; flip: number; fade: boolean; base: number;
}

export class Particles {
  private live: P[] = [];
  private pool: Sprite[] = [];
  readonly chipTex = [Texture.from(paintChip(64)), Texture.from(paintChip(64, 0xf7f2ee, 0x1e1a22)), Texture.from(paintChip(64, 0xd6334a, 0xf7f2ee))];
  readonly glowTex = Texture.from(paintGlow(128));
  readonly goldTex = Texture.from(paintGlow(64, '#FFD36B'));
  private paperTex: Texture | null = null;
  /** Most particles alive at once (lowered on weaker devices). */
  max = 420;

  constructor(private layer: Container) {
    Ticker.shared.add((t) => this.update(t.deltaMS / 1000));
  }

  private take(tex: Texture): Sprite {
    const s = this.pool.pop() ?? new Sprite();
    s.texture = tex;
    s.anchor.set(0.5);
    s.alpha = 1;
    s.visible = true;
    s.rotation = 0;
    s.blendMode = 'normal';
    s.tint = 0xffffff;
    this.layer.addChild(s);
    return s;
  }

  private spawn(tex: Texture, x: number, y: number, o: Partial<P> & { scale?: number; tint?: number; add?: boolean }) {
    if (this.live.length >= this.max) return;
    const s = this.take(tex);
    if (o.tint !== undefined) s.tint = o.tint;
    if (o.add) s.blendMode = 'add';
    s.position.set(x, y);
    const base = o.scale ?? 1;
    s.scale.set(base);
    this.live.push({ s, vx: o.vx ?? 0, vy: o.vy ?? 0, vr: o.vr ?? 0, g: o.g ?? 0, life: o.life ?? 1, age: 0, flip: o.flip ?? 0, fade: o.fade ?? true, base });
  }

  private update(dt: number) {
    for (let i = this.live.length - 1; i >= 0; i--) {
      const p = this.live[i];
      p.age += dt;
      p.vy += p.g * dt;
      p.s.x += p.vx * dt;
      p.s.y += p.vy * dt;
      p.s.rotation += p.vr * dt;
      if (p.flip) p.s.scale.y = p.base * Math.cos(p.age * p.flip); // tumbling coin
      const t = p.age / p.life;
      if (p.fade && t > 0.7) p.s.alpha = Math.max(0, (1 - t) / 0.3);
      if (t >= 1) {
        p.s.visible = false;
        p.s.removeFromParent();
        this.pool.push(p.s);
        this.live.splice(i, 1);
      }
    }
  }

  /** Drop everything in flight (leaving a screen). */
  clear() {
    for (const p of this.live) {
      p.s.visible = false;
      p.s.removeFromParent();
      this.pool.push(p.s);
    }
    this.live = [];
  }

  /** Chips bursting up from a point and raining down. */
  chipBurst(x: number, y: number, n = 40, power = 1) {
    for (let i = 0; i < n; i++) {
      const a = -Math.PI / 2 + (Math.random() - 0.5) * 2.2;
      const v = (500 + Math.random() * 700) * power;
      this.spawn(this.chipTex[i % 3 === 2 ? 2 : i % 2], x, y, {
        vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 1500, vr: (Math.random() - 0.5) * 12,
        flip: 6 + Math.random() * 10, life: 1.6 + Math.random() * 0.8, scale: 0.5 + Math.random() * 0.6,
      });
    }
  }

  /** A ring of warm dust where something heavy lands. */
  dustRing(x: number, y: number, n = 18) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      this.spawn(this.glowTex, x, y, { vx: Math.cos(a) * 260, vy: Math.sin(a) * 90, life: 0.5, scale: 0.35 + Math.random() * 0.2 });
    }
  }

  sparkle(x: number, y: number, n = 14, spread = 120) {
    for (let i = 0; i < n; i++) {
      this.spawn(this.goldTex, x + (Math.random() - 0.5) * spread, y + (Math.random() - 0.5) * spread * 0.5, {
        vx: (Math.random() - 0.5) * 80, vy: -40 - Math.random() * 120, life: 0.7 + Math.random() * 0.5, scale: 0.25 + Math.random() * 0.35,
      });
    }
  }

  /** Chips falling from above the screen for `ms` (the victory rain). */
  chipRain(ms = 1200, perSecond = 60) {
    const n = Math.round((ms / 1000) * perSecond);
    for (let i = 0; i < n; i++) {
      setTimeout(() => {
        this.spawn(this.chipTex[i % 3], 100 + Math.random() * 1720, -60, {
          vx: (Math.random() - 0.5) * 120, vy: 300 + Math.random() * 300, g: 900, vr: (Math.random() - 0.5) * 8,
          flip: 5 + Math.random() * 8, life: 1.6, scale: 0.45 + Math.random() * 0.5,
        });
      }, (i / n) * ms);
    }
  }

  /** Paper confetti in the warm palette. */
  confetti(n = 120, x = 960, y = -40, spread = 1900) {
    if (!this.paperTex) {
      const c = document.createElement('canvas');
      c.width = 18;
      c.height = 10;
      const g = c.getContext('2d')!;
      g.fillStyle = '#fff';
      g.fillRect(0, 0, 18, 10);
      this.paperTex = Texture.from(c);
    }
    const colors = [0xffd36b, 0xf69375, 0xe04fb0, 0x52c0cf, 0xb9a7f0, 0xffffff];
    for (let i = 0; i < n; i++) {
      this.spawn(this.paperTex, x + (Math.random() - 0.5) * spread, y - Math.random() * 200, {
        vx: (Math.random() - 0.5) * 260, vy: 160 + Math.random() * 260, g: 120, vr: (Math.random() - 0.5) * 10,
        flip: 4 + Math.random() * 10, life: 2.6 + Math.random() * 1.2, scale: 0.8 + Math.random() * 0.9, tint: colors[i % colors.length],
      });
    }
  }

  /** A firework: a ring of glowing sparks that droop and fade. */
  firework(x: number, y: number, color = 0xffd36b, n = 36) {
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.random() * 0.1;
      const v = 320 + Math.random() * 160;
      this.spawn(this.glowTex, x, y, { vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 260, life: 1 + Math.random() * 0.4, scale: 0.22 + Math.random() * 0.12, tint: color, add: true });
    }
  }

  /** Sparks thrown sideways from a collision point. */
  sparks(x: number, y: number, n = 30) {
    for (let i = 0; i < n; i++) {
      const a = (Math.random() - 0.5) * Math.PI * 2;
      const v = 400 + Math.random() * 700;
      this.spawn(this.goldTex, x, y, { vx: Math.cos(a) * v, vy: Math.sin(a) * v - 200, g: 1400, life: 0.5 + Math.random() * 0.4, scale: 0.15 + Math.random() * 0.2, add: true });
    }
  }

  /** Ash and embers drifting up and away (a burnt name plate). */
  ash(x: number, y: number, w = 200, n = 40) {
    for (let i = 0; i < n; i++) {
      const ember = i % 4 === 0;
      this.spawn(this.glowTex, x + (Math.random() - 0.5) * w, y + (Math.random() - 0.5) * 40, {
        vx: 60 + Math.random() * 160, vy: -60 - Math.random() * 140, g: -20, vr: (Math.random() - 0.5) * 4,
        life: 1 + Math.random() * 0.8, scale: ember ? 0.12 + Math.random() * 0.1 : 0.1 + Math.random() * 0.15,
        tint: ember ? 0xff8a3d : 0x3a2a2a, add: ember,
      });
    }
  }
}
