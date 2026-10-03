import { Container, Graphics, Text } from 'pixi.js';
import { ease, tween } from '../tween';
import { FONT } from './layout';

const SUITS: Record<string, { glyph: string; color: number }> = {
  s: { glyph: '♠', color: 0x22223a },
  c: { glyph: '♣', color: 0x22223a },
  h: { glyph: '♥', color: 0xd6334a },
  d: { glyph: '♦', color: 0xd6334a },
};

function rankLabel(r: string): string {
  return r === 'T' ? '10' : r;
}

/** A playing card drawn procedurally. Pivot is the centre, so it flips and rotates in place. */
export class CardSprite extends Container {
  readonly w: number;
  readonly h: number;
  private face = new Container();
  private back = new Container();
  private outline = new Graphics();
  code: string | null = null;
  faceUp = false;

  constructor(w: number, h: number) {
    super();
    this.w = w;
    this.h = h;
    this.pivot.set(w / 2, h / 2);
    this.drawBack();
    this.addChild(this.back, this.face, this.outline);
    this.face.visible = false;
  }

  private drawBack() {
    const { w, h } = this;
    const r = Math.max(6, w * 0.09);
    const g = new Graphics()
      .roundRect(0, 0, w, h, r).fill(0x3a2f6b).stroke({ width: 2, color: 0xd9c7ff, alpha: 0.6 })
      .roundRect(w * 0.1, h * 0.08, w * 0.8, h * 0.84, r * 0.6).stroke({ width: 2, color: 0xb59cff, alpha: 0.7 });
    // Diamond lattice
    for (let i = 1; i < 4; i++) {
      g.moveTo(w / 2, h * (0.08 + 0.21 * i - 0.1)).lineTo(w * 0.5 + w * 0.18, h * (0.08 + 0.21 * i))
        .lineTo(w / 2, h * (0.08 + 0.21 * i + 0.1)).lineTo(w * 0.5 - w * 0.18, h * (0.08 + 0.21 * i)).closePath();
    }
    g.stroke({ width: 1.5, color: 0xffd166, alpha: 0.55 });
    this.back.addChild(g);
  }

  private drawFace(code: string) {
    this.face.removeChildren().forEach((c) => c.destroy());
    const { w, h } = this;
    const suit = SUITS[code[1]];
    const r = Math.max(6, w * 0.09);
    this.face.addChild(new Graphics().roundRect(0, 0, w, h, r).fill(0xfbf8f1).stroke({ width: 2, color: 0xcfc6b2 }));
    const small = Math.round(h * 0.2);
    const rank = new Text({ text: rankLabel(code[0]), style: { fontFamily: FONT, fontSize: small, fontWeight: '800', fill: suit.color } });
    rank.position.set(w * 0.08, h * 0.04);
    const pip = new Text({ text: suit.glyph, style: { fontFamily: FONT, fontSize: Math.round(small * 0.8), fill: suit.color } });
    pip.position.set(w * 0.08 + (rank.width - pip.width) / 2, h * 0.04 + small * 0.95);
    const big = new Text({ text: suit.glyph, style: { fontFamily: FONT, fontSize: Math.round(h * 0.42), fill: suit.color } });
    big.anchor.set(0.5);
    big.position.set(w * 0.6, h * 0.62);
    this.face.addChild(rank, pip, big);
  }

  /** Show `code` face up (or the back when null) without animation. */
  set(code: string | null) {
    this.code = code;
    this.faceUp = !!code;
    if (code) this.drawFace(code);
    this.face.visible = this.faceUp;
    this.back.visible = !this.faceUp;
    this.scale.x = Math.abs(this.scale.x) || 1;
  }

  async flipTo(code: string, ms = 260) {
    const sy = this.scale.y;
    await tween(this.scale, { x: 0 }, ms / 2, ease.inCubic);
    this.set(code);
    this.scale.y = sy;
    await tween(this.scale, { x: sy }, ms / 2, ease.outCubic);
  }

  highlight(on: boolean) {
    this.outline.clear();
    if (on) this.outline.roundRect(-3, -3, this.w + 6, this.h + 6, Math.max(8, this.w * 0.1)).stroke({ width: 5, color: 0xffd166 });
  }
}
