import { Container, Graphics, Text } from 'pixi.js';
import { ease, tween } from '../tween';
import { FONT, FONT_NUM } from './layout';

const SUITS: Record<string, { glyph: string; color: number }> = {
  s: { glyph: '♠', color: 0x22223a },
  c: { glyph: '♣', color: 0x22223a },
  h: { glyph: '♥', color: 0xd6334a },
  d: { glyph: '♦', color: 0xd6334a },
};

function rankLabel(r: string): string {
  return r === 'T' ? '10' : r;
}

/** A playing card drawn procedurally. Pivot is the centre, so it flips and rotates in place.
 *  Supports a light sweep on reveal and a corner "peel" for squeezing your own cards. */
export class CardSprite extends Container {
  readonly w: number;
  readonly h: number;
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
    this.drawBack();
    const r = Math.max(6, w * 0.09);
    this.sweepMask.roundRect(0, 0, w, h, r).fill(0xffffff);
    this.sweep.rect(-w * 0.35, -h * 0.2, w * 0.3, h * 1.4).fill({ color: 0xffffff, alpha: 0.75 });
    this.sweep.skew.x = -0.4;
    this.sweep.mask = this.sweepMask;
    this.sweep.visible = false;
    this.addChild(this.back, this.face, this.sweep, this.sweepMask, this.outline, this.peelMask);
    this.face.visible = false;
  }

  private drawBack() {
    const { w, h } = this;
    const r = Math.max(6, w * 0.09);
    const g = new Graphics()
      .roundRect(0, 0, w, h, r).fill(0x5b2324).stroke({ width: Math.max(2, w * 0.03), color: 0xffffff })
      .roundRect(w * 0.1, h * 0.08, w * 0.8, h * 0.84, r * 0.6).stroke({ width: Math.max(1.5, w * 0.02), color: 0xffd36b, alpha: 0.8 });
    for (let i = 0; i < 5; i++) {
      const cy = h * (0.18 + i * 0.16);
      g.moveTo(w / 2, cy - h * 0.07).lineTo(w * 0.66, cy).lineTo(w / 2, cy + h * 0.07).lineTo(w * 0.34, cy).closePath();
    }
    g.stroke({ width: Math.max(1, w * 0.015), color: 0xf69375, alpha: 0.7 });
    this.back.addChild(g);
  }

  private drawFace(code: string) {
    this.face.removeChildren().forEach((c) => c.destroy());
    const { w, h } = this;
    const suit = SUITS[code[1]];
    const r = Math.max(6, w * 0.09);
    this.face.addChild(new Graphics().roundRect(0, 0, w, h, r).fill(0xfffbf5).stroke({ width: Math.max(2, w * 0.025), color: 0xd9cbbd }));
    const small = Math.round(h * 0.22);
    const rank = new Text({ text: rankLabel(code[0]), style: { fontFamily: FONT_NUM, fontSize: small, fill: suit.color } });
    rank.position.set(w * 0.08, h * 0.03);
    const pip = new Text({ text: suit.glyph, style: { fontFamily: FONT, fontSize: Math.round(small * 0.8), fill: suit.color } });
    pip.position.set(w * 0.08 + (rank.width - pip.width) / 2, h * 0.03 + small * 1.0);
    const big = new Text({ text: suit.glyph, style: { fontFamily: FONT, fontSize: Math.round(h * 0.44), fill: suit.color } });
    big.anchor.set(0.5);
    big.position.set(w * 0.6, h * 0.63);
    this.face.addChild(rank, pip, big);
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

  highlight(on: boolean, color = 0xffd36b) {
    this.outline.clear();
    if (on) this.outline.roundRect(-4, -4, this.w + 8, this.h + 8, Math.max(8, this.w * 0.1)).stroke({ width: Math.max(4, this.w * 0.05), color });
  }
}
