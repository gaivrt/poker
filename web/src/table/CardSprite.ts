import { Container, Graphics, Text } from 'pixi.js';
import { ease, tween } from '../tween';
import { PAL } from '../stage/painter';
import { FONT, FONT_NUM } from './layout';

const SUITS: Record<string, { glyph: string; color: number }> = {
  s: { glyph: '♠', color: PAL.ink },
  c: { glyph: '♣', color: PAL.ink },
  h: { glyph: '♥', color: PAL.red },
  d: { glyph: '♦', color: PAL.red },
};

function rankLabel(r: string): string {
  return r === 'T' ? '10' : r;
}

// Where the pips sit on number cards, in the inner area (0..1 × 0..1).
const PIPS: Record<string, [number, number][]> = {
  '2': [[0.5, 0.12], [0.5, 0.88]],
  '3': [[0.5, 0.12], [0.5, 0.5], [0.5, 0.88]],
  '4': [[0.22, 0.12], [0.78, 0.12], [0.22, 0.88], [0.78, 0.88]],
  '5': [[0.22, 0.12], [0.78, 0.12], [0.5, 0.5], [0.22, 0.88], [0.78, 0.88]],
  '6': [[0.22, 0.12], [0.78, 0.12], [0.22, 0.5], [0.78, 0.5], [0.22, 0.88], [0.78, 0.88]],
  '7': [[0.22, 0.12], [0.78, 0.12], [0.5, 0.31], [0.22, 0.5], [0.78, 0.5], [0.22, 0.88], [0.78, 0.88]],
  '8': [[0.22, 0.12], [0.78, 0.12], [0.5, 0.31], [0.22, 0.5], [0.78, 0.5], [0.5, 0.69], [0.22, 0.88], [0.78, 0.88]],
  '9': [[0.22, 0.12], [0.78, 0.12], [0.22, 0.375], [0.78, 0.375], [0.5, 0.5], [0.22, 0.625], [0.78, 0.625], [0.22, 0.88], [0.78, 0.88]],
  T: [[0.22, 0.12], [0.78, 0.12], [0.5, 0.25], [0.22, 0.375], [0.78, 0.375], [0.22, 0.625], [0.78, 0.625], [0.5, 0.75], [0.22, 0.88], [0.78, 0.88]],
};

/** A playing card drawn procedurally. Pivot is the centre, so it flips and rotates in place.
 *  Supports a light sweep on reveal and a corner "peel" for squeezing your own cards. */
export class CardSprite extends Container {
  readonly w: number;
  readonly h: number;
  private shadow = new Graphics();
  private face = new Container();
  private back = new Container();
  private outline = new Graphics();
  private sweep = new Graphics();
  private sweepMask = new Graphics();
  private peelMask = new Graphics();
  code: string | null = null;
  faceUp = false;

  constructor(w: number, h: number) {
    super();
    this.w = w;
    this.h = h;
    this.pivot.set(w / 2, h / 2);
    const r = Math.max(5, w * 0.08);
    // a soft contact shadow on the felt
    this.shadow.roundRect(w * 0.04, h * 0.05, w, h, r).fill({ color: 0x000000, alpha: 0.28 });
    this.shadow.roundRect(w * 0.08, h * 0.09, w, h, r * 1.4).fill({ color: 0x000000, alpha: 0.14 });
    this.drawBack();
    this.sweepMask.roundRect(0, 0, w, h, r).fill(0xffffff);
    this.sweep.rect(-w * 0.35, -h * 0.2, w * 0.3, h * 1.4).fill({ color: 0xffffff, alpha: 0.75 });
    this.sweep.skew.x = -0.4;
    this.sweep.mask = this.sweepMask;
    this.sweep.visible = false;
    this.addChild(this.shadow, this.back, this.face, this.sweep, this.sweepMask, this.outline, this.peelMask);
    this.face.visible = false;
  }

  /** The house back: cobalt lattice inside an ivory border (the same back as the table). */
  private drawBack() {
    const { w, h } = this;
    const r = Math.max(5, w * 0.08);
    const bw = Math.max(3, w * 0.07);
    const g = new Graphics().roundRect(0, 0, w, h, r).fill(PAL.ivory)
      .roundRect(bw, bw, w - bw * 2, h - bw * 2, r * 0.6).fill(PAL.cobalt);
    const step = Math.max(6, w * 0.09);
    const lattice = new Graphics();
    for (let x = -h; x < w + h; x += step) {
      lattice.moveTo(x, 0).lineTo(x + h, h);
      lattice.moveTo(x, h).lineTo(x + h, 0);
    }
    lattice.stroke({ width: Math.max(0.8, w * 0.008), color: PAL.ivory, alpha: 0.28 });
    const clip = new Graphics().roundRect(bw, bw, w - bw * 2, h - bw * 2, r * 0.6).fill(0xffffff);
    lattice.mask = clip;
    const m = bw + Math.max(2, w * 0.045);
    const line = new Graphics().roundRect(m, m, w - m * 2, h - m * 2, r * 0.4).stroke({ width: Math.max(1, w * 0.012), color: PAL.ivory, alpha: 0.6 });
    this.back.addChild(g, lattice, clip, line);
  }

  private drawFace(code: string) {
    this.face.removeChildren().forEach((c) => c.destroy({ children: true }));
    const { w, h } = this;
    const suit = SUITS[code[1]];
    const rank = code[0];
    const r = Math.max(5, w * 0.08);
    this.face.addChild(
      new Graphics()
        .roundRect(0, 0, w, h, r).fill(PAL.ivory).stroke({ width: Math.max(1, w * 0.012), color: 0xd9d1bf }),
    );
    // corner indices (top-left and, upside down, bottom-right)
    const idx = Math.round(h * 0.2);
    for (const flip of [false, true]) {
      const corner = new Container();
      const t = new Text({ text: rankLabel(rank), style: { fontFamily: FONT_NUM, fontSize: Math.round(idx * 0.9), fill: suit.color } });
      t.anchor.set(0.5, 0);
      const p = new Text({ text: suit.glyph, style: { fontFamily: FONT, fontSize: Math.round(idx * 0.72), fill: suit.color } });
      p.anchor.set(0.5, 0);
      p.y = idx * 0.98;
      corner.addChild(t, p);
      corner.position.set(w * 0.13, h * 0.03);
      if (flip) {
        corner.rotation = Math.PI;
        corner.position.set(w * 0.87, h * 0.97);
      }
      this.face.addChild(corner);
    }
    // the middle: pips, an ace, or a court card
    const inner = { x: w * 0.25, y: h * 0.16, w: w * 0.5, h: h * 0.68 };
    if (PIPS[rank]) {
      const size = Math.round(Math.min(w * 0.24, h * (rank === 'T' || rank === '9' ? 0.15 : 0.18)));
      for (const [px, py] of PIPS[rank]) {
        const pip = new Text({ text: suit.glyph, style: { fontFamily: FONT, fontSize: size, fill: suit.color } });
        pip.anchor.set(0.5);
        pip.position.set(inner.x + px * inner.w, inner.y + py * inner.h);
        if (py > 0.55) pip.rotation = Math.PI;
        this.face.addChild(pip);
      }
    } else if (rank === 'A') {
      const ring = new Graphics().circle(w / 2, h / 2, w * 0.28).stroke({ width: Math.max(0.8, w * 0.014), color: PAL.cobalt, alpha: 0.6 });
      const big = new Text({ text: suit.glyph, style: { fontFamily: FONT, fontSize: Math.round(h * 0.4), fill: suit.color } });
      big.anchor.set(0.5);
      big.position.set(w / 2, h * 0.5);
      this.face.addChild(ring, big);
    } else {
      // J Q K: a court frame split on the diagonal, the letter and the suit
      const fx = w * 0.22, fy = h * 0.17, fw = w * 0.56, fh = h * 0.66;
      const frame = new Graphics()
        .roundRect(fx, fy, fw, fh, r * 0.4).fill(PAL.cobaltTint)
        .poly([fx, fy + fh * 0.56, fx + fw, fy + fh * 0.44, fx + fw, fy + fh, fx, fy + fh]).fill({ color: PAL.cobalt, alpha: 0.12 })
        .roundRect(fx, fy, fw, fh, r * 0.4).stroke({ width: Math.max(1, w * 0.018), color: PAL.cobalt });
      const letter = new Text({ text: rank, style: { fontFamily: FONT_NUM, fontSize: Math.round(fh * 0.4), fill: suit.color } });
      letter.anchor.set(0.5);
      letter.position.set(w / 2, fy + fh * 0.55);
      const s = new Text({ text: suit.glyph, style: { fontFamily: FONT, fontSize: Math.round(fh * 0.18), fill: suit.color } });
      s.anchor.set(0.5);
      s.position.set(w / 2, fy + fh * 0.86);
      this.face.addChild(frame, letter, s);
    }
  }

  /** Show `code` face up (or the back when null) without animation. */
  set(code: string | null) {
    this.code = code;
    this.faceUp = !!code;
    if (code) this.drawFace(code);
    this.face.visible = this.faceUp;
    this.face.mask = null;
    this.peelMask.clear();
    this.back.visible = !this.faceUp;
    this.scale.x = Math.abs(this.scale.x) || 1;
  }

  /** Light sweeping across the face (gold for big moments). */
  async shine(color = 0xffffff, ms = 380) {
    this.sweep.tint = color;
    this.sweep.visible = true;
    this.sweep.x = -this.w * 0.3;
    await tween(this.sweep, { x: this.w * 1.4 }, ms, ease.inOutCubic);
    this.sweep.visible = false;
  }

  /** Turn over to `code`; `toScale` lets the card grow while it turns (x lands there, y follows). */
  async flipTo(code: string, ms = 260, shine = true, toScale?: { x: number; y: number }) {
    const sx = toScale?.x ?? (Math.abs(this.scale.x) || 1);
    if (toScale) void tween(this.scale, { y: toScale.y }, ms, ease.outBack);
    await tween(this.scale, { x: 0 }, ms / 2, ease.inCubic);
    const sy = this.scale.y;
    this.set(code);
    this.scale.y = sy;
    await tween(this.scale, { x: sx }, ms / 2, ease.outBack);
    if (shine) void this.shine();
  }

  /** Squeeze: reveal the face from the bottom-right corner, p in 0..1. */
  peel(code: string, p: number) {
    if (this.code !== code || this.faceUp) {
      this.code = code;
      this.drawFace(code);
    }
    const { w, h } = this;
    const k = Math.min(1, Math.max(0, p)) * (w + h);
    this.peelMask.clear().poly([w, h, w - Math.min(k, w), h, ...(k > w ? [0, h - (k - w)] : []), ...(k > h ? [w - (k - h), 0] : []), w, h - Math.min(k, h)]).fill(0xffffff);
    this.face.mask = this.peelMask;
    this.face.visible = true;
    this.back.visible = true;
  }

  highlight(on: boolean, color: number = PAL.cobaltHi) {
    this.outline.clear();
    if (on) this.outline.roundRect(-4, -4, this.w + 8, this.h + 8, Math.max(8, this.w * 0.1)).stroke({ width: Math.max(4, this.w * 0.05), color });
  }
}
