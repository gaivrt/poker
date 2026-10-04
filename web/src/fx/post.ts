// Post-processing: grain, vignette (with "tighten" for suspense), bloom on the
// effects layer, white flash, shockwave and RGB split for impact frames.
import { ColorMatrixFilter, type Container, type Filter, Graphics, NoiseFilter, Sprite, Texture, Ticker } from 'pixi.js';
import { AdvancedBloomFilter, RGBSplitFilter, ShockwaveFilter } from 'pixi-filters';
import { animate, ease, tween } from '../tween';
import { paintVignette } from '../stage/painter';

export type Quality = 'high' | 'medium' | 'low';

export class Post {
  private grain = new NoiseFilter({ noise: 0.05, seed: Math.random() });
  private grade = new ColorMatrixFilter();
  private vignette: Sprite;
  private flashG = new Graphics().rect(0, 0, 1920, 1080).fill(0xffffff);
  private red: Sprite;
  private pressureMode: 'off' | 'low' | 'bank' = 'off';
  /** Filters of the impacts still playing; they can overlap. */
  private impacts = new Set<Filter>();
  quality: Quality = 'high';

  constructor(
    private world: Container,
    private fxLayer: Container,
    private screen: Container,
  ) {
    this.vignette = new Sprite(Texture.from(paintVignette(1920, 1080)));
    this.vignette.alpha = 0.85;
    // colour grade: a little more contrast and richness (deep blacks, glowing golds)
    this.grade.contrast(0.12, false);
    this.grade.saturate(0.08, true);
    this.flashG.alpha = 0;
    this.red = new Sprite(Texture.from(redEdge(1920, 1080)));
    this.red.alpha = 0;
    this.screen.addChild(this.vignette, this.red, this.flashG);
    Ticker.shared.add(() => {
      if (this.quality !== 'low') this.grain.seed = Math.random();
      // time pressure: the red edge beats like a heart (faster in the time bank)
      const t = performance.now() / (this.pressureMode === 'bank' ? 600 : 1000);
      const beat = Math.max(0, Math.sin(t * Math.PI * 2)) ** 6;
      const target = this.pressureMode === 'off' ? 0 : 0.55 + 0.45 * beat;
      this.red.alpha += (target - this.red.alpha) * 0.25;
    });
    this.setQuality(this.quality);
  }

  setQuality(q: Quality) {
    this.quality = q;
    this.applyWorldFilters();
    this.fxLayer.filters = q === 'high' ? [new AdvancedBloomFilter({ threshold: 0.45, bloomScale: 1.1, brightness: 1, blur: 6, quality: 4 })] : [];
  }

  /** Quality filters plus any running impacts, rebuilt whenever either changes. */
  private applyWorldFilters() {
    const base: Filter[] = this.quality === 'low' ? [] : this.quality === 'medium' ? [this.grade] : [this.grade, this.grain];
    this.world.filters = [...base, ...this.impacts];
  }

  /** M15: the clock is running out ('low') or eating the time bank ('bank'). */
  pressure(mode: 'off' | 'low' | 'bank') {
    this.pressureMode = mode;
  }

  /** Tighten (1) or relax (0) the vignette; used for heartbeats and suspense. */
  tighten(level: number, ms = 300) {
    return tween(this.vignette, { alpha: 0.75 + level * 0.25 }, ms);
  }

  async flash(strength = 0.8, ms = 220) {
    this.flashG.alpha = strength;
    await tween(this.flashG, { alpha: 0 }, ms, ease.outCubic);
  }

  /** Ripple from a point in world space, plus a brief colour split. */
  async impact(x: number, y: number, ms = 600) {
    if (this.quality === 'low') return this.flash(0.5, 200);
    const wave = new ShockwaveFilter({ center: { x, y }, amplitude: 24, wavelength: 160, speed: 900, brightness: 1.15, radius: 900 });
    const split = new RGBSplitFilter({ red: { x: -6, y: 0 }, green: { x: 0, y: 4 }, blue: { x: 6, y: 0 } });
    this.impacts.add(wave).add(split);
    this.applyWorldFilters();
    try {
      await animate(ms, (p) => {
        wave.time = p * (ms / 1000);
        const k = 1 - p;
        split.red = { x: -6 * k, y: 0 };
        split.blue = { x: 6 * k, y: 0 };
      }, ease.linear);
    } finally {
      // Remove only this impact's filters: another one may have started meanwhile.
      this.impacts.delete(wave);
      this.impacts.delete(split);
      this.applyWorldFilters();
      wave.destroy();
      split.destroy();
    }
  }
}

/** A red edge for time pressure: reaches further in than the normal vignette. */
function redEdge(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d')!;
  const v = g.createRadialGradient(w / 2, h / 2, h * 0.28, w / 2, h / 2, w * 0.58);
  v.addColorStop(0, 'rgba(190,85,50,0)');
  v.addColorStop(0.5, 'rgba(190,85,50,0.28)');
  v.addColorStop(1, 'rgba(120,50,30,0.9)');
  g.fillStyle = v;
  g.fillRect(0, 0, w, h);
  return c;
}
