// Post-processing: grain, vignette (with "tighten" for suspense), bloom on the
// effects layer, white flash, shockwave and RGB split for impact frames.
import { type Container, Graphics, NoiseFilter, Sprite, Texture, Ticker } from 'pixi.js';
import { AdvancedBloomFilter, RGBSplitFilter, ShockwaveFilter } from 'pixi-filters';
import { animate, ease, tween } from '../tween';
import { paintVignette } from '../stage/painter';

export type Quality = 'high' | 'medium' | 'low';

export class Post {
  private grain = new NoiseFilter({ noise: 0.07, seed: Math.random() });
  private vignette: Sprite;
  private flashG = new Graphics().rect(0, 0, 1920, 1080).fill(0xffffff);
  quality: Quality = 'high';

  constructor(
    private world: Container,
    private fxLayer: Container,
    private screen: Container,
  ) {
    this.vignette = new Sprite(Texture.from(paintVignette(1920, 1080)));
    this.vignette.alpha = 0.75;
    this.flashG.alpha = 0;
    this.screen.addChild(this.vignette, this.flashG);
    Ticker.shared.add(() => {
      if (this.quality !== 'low') this.grain.seed = Math.random();
    });
    this.setQuality(this.quality);
  }

  setQuality(q: Quality) {
    this.quality = q;
    this.world.filters = q === 'low' ? [] : [this.grain];
    this.fxLayer.filters = q === 'high' ? [new AdvancedBloomFilter({ threshold: 0.45, bloomScale: 1.1, brightness: 1, blur: 6, quality: 4 })] : [];
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
    const base = this.world.filters ? [...(this.world.filters as never[])] : [];
    this.world.filters = [...base, wave, split];
    await animate(ms, (p) => {
      wave.time = p * (ms / 1000);
      const k = 1 - p;
      split.red = { x: -6 * k, y: 0 };
      split.blue = { x: 6 * k, y: 0 };
    }, ease.linear);
    this.world.filters = base;
  }
}
