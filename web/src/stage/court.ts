// Court cards and card backs (docs/10): every character is drawn as a playing card.
// The seat cards at the table show one upright portrait; the big cut-ins show the
// classic court-card layout, the same portrait upright on top and turned over below.
import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { FONT, FONT_NUM } from '../table/layout';
import { PAL } from './painter';

/** "Q♠" → its parts and ink colour. */
export function courtParts(court: string): { rank: string; suit: string; color: number } {
  const suit = court.slice(-1);
  return { rank: court.slice(0, -1), suit, color: suit === '♥' || suit === '♦' ? PAL.red : PAL.ink };
}

/** The house card back: an ivory border, cobalt with a lattice, an inner line. Centred. */
export function cardBack(w: number, h: number, r = Math.max(6, w * 0.075)): Container {
  const c = new Container();
  const bw = Math.max(4, w * 0.05);
  const g = new Graphics()
    .roundRect(-w / 2, -h / 2, w, h, r).fill(PAL.ivory)
    .roundRect(-w / 2 + bw, -h / 2 + bw, w - bw * 2, h - bw * 2, r * 0.7).fill(PAL.cobalt);
  const step = Math.max(8, w * 0.07);
  const lattice = new Graphics();
  for (let x = -w / 2 - h; x < w / 2 + h; x += step) {
    lattice.moveTo(x, -h / 2).lineTo(x + h, h / 2);
    lattice.moveTo(x, h / 2).lineTo(x + h, -h / 2);
  }
  lattice.stroke({ width: Math.max(1, w * 0.006), color: PAL.ivory, alpha: 0.25 });
  const clip = new Graphics().roundRect(-w / 2 + bw, -h / 2 + bw, w - bw * 2, h - bw * 2, r * 0.7).fill(0xffffff);
  lattice.mask = clip;
  const m = bw + Math.max(3, w * 0.035);
  const line = new Graphics().roundRect(-w / 2 + m, -h / 2 + m, w - m * 2, h - m * 2, r * 0.45).stroke({ width: Math.max(1.5, w * 0.01), color: PAL.ivory, alpha: 0.6 });
  c.addChild(g, lattice, clip, line);
  return c;
}

/** Rank and suit in a corner; `flip` puts the second copy upside down in the opposite corner. */
function cornerIndex(court: string, size: number): Container {
  const { rank, suit, color } = courtParts(court);
  const c = new Container();
  const r = new Text({ text: rank, style: { fontFamily: FONT_NUM, fontSize: size, fill: color } });
  r.anchor.set(0.5, 0);
  const s = new Text({ text: suit, style: { fontFamily: FONT, fontSize: Math.round(size * 0.78), fill: color } });
  s.anchor.set(0.5, 0);
  s.y = size * 1.02;
  c.addChild(r, s);
  return c;
}

export interface CourtOptions {
  w: number;
  h: number;
  court: string;
  texture: Texture;
  /** Classic court card: upright on top, turned over below (for big moments). */
  mirrored?: boolean;
  /** Frame colour (the joker uses red). */
  frame?: number;
}

/** A court card with a character in it, centred on its own origin. */
export class CourtCard extends Container {
  readonly w: number;
  readonly h: number;
  private figures: Sprite[] = [];
  private fh: number;
  private mirrored: boolean;
  readonly face = new Container();

  constructor(o: CourtOptions) {
    super();
    this.w = o.w;
    this.h = o.h;
    this.mirrored = !!o.mirrored;
    const { w, h } = o;
    const r = Math.max(8, w * 0.075);
    const frameColor = o.frame ?? PAL.cobalt;
    const fx = -w / 2 + w * 0.18, fw = w * 0.64, fy = -h / 2 + h * 0.06, fh = h * 0.88;
    this.fh = fh;

    const bg = new Graphics().roundRect(-w / 2, -h / 2, w, h, r).fill(PAL.ivory);
    const tint = new Graphics().rect(fx, fy, fw, fh).fill(PAL.cobaltTint);
    this.face.addChild(bg, tint);
    const tilt = fh * 0.06; // the diagonal between the two halves
    const halves = this.mirrored
      ? [[fx, fy, fx + fw, fy, fx + fw, -tilt, fx, tilt], [fx, tilt, fx + fw, -tilt, fx + fw, fy + fh, fx, fy + fh]]
      : [[fx, fy, fx + fw, fy, fx + fw, fy + fh, fx, fy + fh]];
    halves.forEach((poly, i) => {
      const sp = new Sprite(o.texture);
      sp.anchor.set(0.5, 1);
      const mask = new Graphics().poly(poly).fill(0xffffff);
      if (i === 1) {
        sp.rotation = Math.PI;
        tint.poly(poly).fill({ color: PAL.cobalt, alpha: 0.08 });
      }
      sp.mask = mask;
      this.figures.push(sp);
      this.face.addChild(sp, mask);
    });
    const frame = new Graphics().rect(fx, fy, fw, fh).stroke({ width: Math.max(2, w * 0.012), color: frameColor });
    if (this.mirrored) frame.moveTo(fx, tilt).lineTo(fx + fw, -tilt).stroke({ width: Math.max(2, w * 0.014), color: frameColor });
    const size = Math.round(w * 0.12);
    const tl = cornerIndex(o.court, size);
    tl.position.set(-w / 2 + w * 0.09, -h / 2 + h * 0.025);
    const br = cornerIndex(o.court, size);
    br.position.set(w / 2 - w * 0.09, h / 2 - h * 0.025);
    br.rotation = Math.PI;
    this.face.addChild(frame, tl, br);
    this.addChild(this.face);
    this.setTexture(o.texture);
  }

  setTexture(tex: Texture, breathe = 1) {
    const fh = this.fh;
    this.figures.forEach((sp, i) => {
      sp.texture = tex;
      // the waist sits on the bottom of the frame, or on the diagonal when mirrored
      const k = (this.mirrored ? fh * 0.54 : fh * 1.08) / tex.height;
      sp.scale.set(k, k * breathe);
      sp.position.set(0, this.mirrored ? 0 : -this.h / 2 + this.h * 0.06 + fh);
      if (i === 1) sp.position.set(0, 0);
    });
  }

  setFigureTint(c: number) {
    for (const sp of this.figures) sp.tint = c;
  }
}
