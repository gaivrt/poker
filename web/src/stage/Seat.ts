// One player at the first-person table: character art (hot-swappable PNG or
// placeholder), paper name plate on the rim, cards on the felt, chip stack, and the
// mind-game decorations (bubbles, stickers, gesture captions, thinking clock).
import { ColorMatrixFilter, Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { type Character, EXPRESSION_COLOR, EXPRESSION_LABEL } from '../characters';
import { Expression } from '../engine';
import { type Face, makeSticker } from '../fx/stickers';
import { CardSprite } from '../table/CardSprite';
import { FONT, FONT_DISPLAY, FONT_NUM, HERO_CARD, OPP_CARD, type Point, type SeatSpot, fmt, headOf } from '../table/layout';
import { ease, tween, wait } from '../tween';
import type { Pose } from './painter';

/** A stack of chips whose height grows with the amount. */
export function chipStack(amount: number, unit: number, scale = 1): Container {
  const c = new Container();
  const n = Math.max(1, Math.min(12, Math.round(Math.log2(Math.max(1, amount / Math.max(1, unit))) + 1)));
  const w = 26 * scale, h = 9 * scale, step = 6 * scale;
  const g = new Graphics();
  for (let i = 0; i < n; i++) {
    const y = -i * step;
    const col = i % 3 === 2 ? 0xd6334a : i % 2 ? 0xf7f2ee : 0x1e1a22;
    g.ellipse(0, y + 3 * scale, w, h).fill(0x0e0a10);
    g.rect(-w, y - 1, w * 2, 4 * scale).fill(0x0e0a10);
    g.ellipse(0, y, w, h).fill(col);
  }
  g.ellipse(0, -(n - 1) * step, w * 0.62, h * 0.6).stroke({ width: 3 * scale, color: n % 2 ? 0x1e1a22 : 0xf7f2ee, alpha: 0.8 });
  c.addChild(g);
  return c;
}

export class Seat extends Container {
  readonly seat: number;
  readonly char: Character;
  readonly spot: SeatSpot;
  readonly isHero: boolean;
  readonly head: Point;

  /** The character art; tap it to aim table talk at this player. */
  readonly avatar = new Container();
  /** Everything on or above the table (plate, chips, cards, bubbles); drawn in front of the table rim. */
  readonly front = new Container();
  private figure = new Sprite();
  private spotlight = new Graphics();
  private poses: Record<Pose, Texture>;
  private basePose: Pose = 'idle';
  private gray = new ColorMatrixFilter();

  private plate = new Container();
  private stackText: Text;
  private tag: Text;
  private outStamp = new Container();
  readonly cards: CardSprite[];
  private betBox = new Container();
  private betText: Text;
  private bubble = new Container();
  private bubbleTimer = 0;
  private badge = new Container();
  private handLabel: Text;
  private exprChip = new Container();
  private caption = new Container();
  private captionTimer = 0;
  private thinking: Text;
  private thinkStart = 0;
  private stickerLayer = new Container();
  private stickerTimer = 0;
  private unit = 20;

  stack = 0;
  bet = 0;
  active = false;
  out = false;
  folded = false;
  allIn = false;
  expression = Expression.Calm;

  constructor(seat: number, char: Character, spot: SeatSpot, poses: Record<Pose, Texture>, isHero: boolean) {
    super();
    this.seat = seat;
    this.char = char;
    this.spot = spot;
    this.isHero = isHero;
    this.poses = poses;
    this.head = headOf(spot);
    this.gray.desaturate();

    // Character art, anchored at the waist, scaled to the spot's depth.
    this.figure.anchor.set(0.5, 1);
    this.setPose('idle');
    this.avatar.position.set(spot.base.x, spot.base.y);
    this.avatar.addChild(this.figure);
    this.avatar.eventMode = 'static';
    this.avatar.cursor = 'pointer';
    // Warm light behind whoever is acting.
    this.spotlight.ellipse(0, 0, spot.height * 0.42, spot.height * 0.5).fill({ color: 0xfff1e0, alpha: 0.55 });
    this.spotlight.position.set(this.head.x, this.head.y + spot.height * 0.1);
    this.spotlight.alpha = 0;
    this.spotlight.blendMode = 'add';

    // Paper name plate taped to the rim.
    const pw = isHero ? 210 : 190, ph = 62;
    const paper = new Graphics()
      .roundRect(-pw / 2 + 3, -ph / 2 + 5, pw, ph, 12).fill({ color: 0x300b0b, alpha: 0.35 })
      .roundRect(-pw / 2, -ph / 2, pw, ph, 12).fill(0xfbf1ea)
      .rect(-pw / 2, -ph / 2, 10, ph).fill(char.color);
    const tape = new Graphics().rect(-26, -ph / 2 - 9, 52, 18).fill({ color: 0xffd36b, alpha: 0.85 });
    const name = new Text({ text: char.name, style: { fontFamily: FONT_DISPLAY, fontSize: 24, fill: 0x5b2324 } });
    name.anchor.set(0, 0.5);
    name.position.set(-pw / 2 + 20, -11);
    this.stackText = new Text({ text: '0', style: { fontFamily: FONT_NUM, fontSize: 22, fill: 0x943a3f } });
    this.stackText.anchor.set(0, 0.5);
    this.stackText.position.set(-pw / 2 + 20, 15);
    this.plate.addChild(paper, tape, name, this.stackText);
    this.plate.position.set(spot.plate.x, spot.plate.y);
    this.plate.rotation = spot.plateTilt;

    this.tag = new Text({ text: '', style: { fontFamily: FONT_DISPLAY, fontSize: 22, fill: 0xffffff, stroke: { color: 0x300b0b, width: 5 } } });
    this.tag.anchor.set(0.5);
    this.tag.position.set(spot.plate.x, spot.plate.y - ph / 2 - 22);

    // Cards on the felt (yours are big, in the foreground)
    const size = isHero ? HERO_CARD : OPP_CARD;
    this.cards = [new CardSprite(size.w, size.h), new CardSprite(size.w, size.h)];
    this.cards.forEach((c, i) => {
      if (isHero) {
        c.position.set(spot.cards.x + i * 200, spot.cards.y + i * 6);
        c.rotation = i === 0 ? -0.14 : 0.12;
      } else {
        c.position.set(spot.cards.x + (i - 0.5) * size.w * 0.55 * spot.cardScale, spot.cards.y);
        c.rotation = (i - 0.5) * 0.18;
        c.scale.set(spot.cardScale, spot.cardScale * 0.82); // lying on the felt
      }
      c.visible = false;
    });

    // Bet
    this.betText = new Text({ text: '', style: { fontFamily: FONT_NUM, fontSize: 20, fill: 0xffffff, stroke: { color: 0x300b0b, width: 5 } } });
    this.betText.anchor.set(0, 0.5);
    this.betBox.position.set(spot.bet.x, spot.bet.y);
    this.betBox.visible = false;

    this.handLabel = new Text({ text: '', style: { fontFamily: FONT_DISPLAY, fontSize: isHero ? 34 : 26, fill: 0xffe08a, stroke: { color: 0x300b0b, width: 7 } } });
    this.handLabel.anchor.set(0.5);
    this.handLabel.position.set(isHero ? spot.cards.x + 100 : spot.cards.x, isHero ? spot.cards.y - 175 : spot.cards.y + 60);

    this.badge.position.set(spot.plate.x, spot.plate.y + 52);
    this.badge.visible = false;
    this.exprChip.position.set(this.head.x - spot.height * 0.2, this.head.y - spot.height * 0.3);
    this.caption.position.set(this.head.x, this.head.y + spot.height * 0.12);
    this.thinking = new Text({ text: '', style: { fontFamily: FONT_NUM, fontSize: 22, fill: 0xffe08a, stroke: { color: 0x300b0b, width: 5 } } });
    this.thinking.anchor.set(0.5);
    this.thinking.position.set(spot.plate.x, spot.plate.y - ph / 2 - 50);
    const toCenter = { x: 960 - this.head.x, y: 560 - this.head.y };
    const len = Math.hypot(toCenter.x, toCenter.y) || 1;
    this.stickerLayer.position.set(this.head.x + (toCenter.x / len) * spot.height * 0.32, this.head.y + (toCenter.y / len) * 40 - (isHero ? 120 : 0));
    this.outStamp.position.set(this.head.x, this.head.y + spot.height * 0.15);

    this.addChild(this.spotlight, this.avatar, this.outStamp, this.exprChip);
    this.front.addChild(this.plate, this.tag, this.betBox, ...this.cards, this.handLabel, this.badge, this.thinking, this.caption, this.bubble, this.stickerLayer);
  }

  /** Chips leave from (and arrive at) the name plate. */
  get anchor(): Point {
    return this.spot.plate;
  }
  get betPos(): Point {
    return this.spot.bet;
  }

  setUnit(bb: number) {
    this.unit = bb;
  }

  setPose(pose: Pose) {
    const tex = this.poses[pose] ?? this.poses.idle;
    this.figure.texture = tex;
    const k = this.spot.height / tex.height;
    this.figure.scale.set(k);
  }

  /** Back to the resting pose for the current expression. */
  restPose() {
    this.setPose(this.basePose);
  }

  tick(t: number) {
    // breathing
    const k = this.spot.height / this.figure.texture.height;
    this.figure.scale.set(k, k * (1 + Math.sin(t / 900 + this.seat) * 0.008));
    if (this.active) this.spotlight.alpha = 0.7 + 0.2 * Math.sin(t / 260);
    if (this.thinkStart) this.thinking.text = `思考中 ${((performance.now() - this.thinkStart) / 1000).toFixed(1)}s`;
  }

  startThinking() {
    this.thinkStart = performance.now();
  }
  stopThinking() {
    this.thinkStart = 0;
    this.thinking.text = '';
  }

  setStack(n: number) {
    this.stack = n;
    this.stackText.text = fmt(n);
  }

  setBet(n: number) {
    this.bet = n;
    this.betBox.removeChildren().forEach((c) => c !== this.betText && c.destroy({ children: true }));
    this.betBox.visible = n > 0;
    if (n <= 0) return;
    const s = chipStack(n, this.unit, this.isHero ? 1 : this.spot.cardScale);
    this.betText.text = fmt(n);
    this.betText.position.set(34, -6);
    this.betBox.addChild(s, this.betText);
  }

  setActive(on: boolean) {
    this.active = on;
    if (!on) this.spotlight.alpha = 0;
    if (this.out) return;
    this.figure.tint = on || this.isHero ? 0xffffff : this.folded ? 0x8f8088 : 0xeee2e0;
    void tween(this.avatar.scale, { x: on ? 1.03 : 1, y: on ? 1.03 : 1 }, 250);
  }

  setTag(text: string, color = 0xffffff) {
    this.tag.text = text;
    this.tag.style.fill = color;
  }

  markAllIn() {
    this.allIn = true;
    this.setTag('ALL IN', 0xff5a6a);
  }

  setFolded(folded: boolean) {
    this.folded = folded;
    this.figure.tint = folded ? 0x8f8088 : 0xffffff;
    // lean back into the shadow
    void tween(this.avatar, { y: this.spot.base.y + (folded ? 14 : 0) }, 300);
    if (folded) {
      for (const c of this.cards)
        if (c.visible) {
          if (this.isHero) c.alpha = 0.45;
          else void tween(c, { alpha: 0, y: c.y - 20 }, 250).then(() => (c.visible = false));
        }
    }
  }

  setOut(place: string) {
    this.out = true;
    this.figure.filters = [this.gray];
    this.figure.tint = 0x9a9098;
    this.avatar.alpha = 0.6;
    this.setTag(place, 0xbfb8e6);
    this.cards.forEach((c) => (c.visible = false));
    this.outStamp.removeChildren().forEach((c) => c.destroy());
    const t = new Text({ text: `OUT · ${place.replace(/[^0-9]/g, '')}`, style: { fontFamily: FONT_NUM, fontSize: 40, fill: 0xd6334a, stroke: { color: 0xfbf1ea, width: 8 } } });
    t.anchor.set(0.5);
    t.rotation = -0.2;
    this.outStamp.addChild(t);
    this.outStamp.scale.set(2.2);
    void tween(this.outStamp.scale, { x: 1, y: 1 }, 260, ease.inCubic);
  }

  newHand(stack: number) {
    this.setStack(stack);
    this.setBet(0);
    this.setActive(false);
    this.folded = false;
    this.allIn = false;
    this.avatar.y = this.spot.base.y;
    this.stopThinking();
    if (this.expression !== Expression.Angry) this.setExpression(Expression.Calm);
    this.restPose();
    if (!this.out) {
      this.figure.tint = 0xffffff;
      this.setTag('');
    }
    this.showHand(null);
    this.showEquity(null);
    this.cards.forEach((c, i) => {
      c.visible = false;
      c.alpha = 1;
      c.highlight(false);
      c.set(null);
      if (this.isHero) c.position.set(this.spot.cards.x + i * 200, this.spot.cards.y + i * 6);
      else c.position.set(this.spot.cards.x + (i - 0.5) * OPP_CARD.w * 0.55 * this.spot.cardScale, this.spot.cards.y);
      if (!this.isHero) c.scale.set(this.spot.cardScale, this.spot.cardScale * 0.82);
    });
  }

  /** Card i flies from the dealer, spinning, and lands face down. */
  async dealBack(i: number, from: Point) {
    const c = this.cards[i];
    const target = { x: c.x, y: c.y };
    const rot = c.rotation;
    const sx = c.scale.x, sy = c.scale.y;
    c.set(null);
    c.position.set(from.x, from.y);
    c.rotation = rot + (Math.random() < 0.5 ? -1 : 1) * Math.PI * 1.5;
    c.scale.set(sx * 0.35, sy * 0.35);
    c.alpha = 1;
    c.visible = true;
    await Promise.all([
      tween(c.position, target, 300, ease.outCubic),
      tween(c, { rotation: rot }, 300, ease.outCubic),
      tween(c.scale, { x: sx, y: sy }, 300, ease.outBack),
    ]);
  }

  /** Turn the cards face up (showdown: they also lift toward the camera). */
  async reveal(codes: string[], showdown = false) {
    for (let i = 0; i < 2; i++) {
      const c = this.cards[i];
      c.visible = true;
      c.alpha = 1;
      if (showdown && !this.isHero) {
        const k = Math.max(1.5, 1.9 * this.spot.cardScale);
        void tween(c.scale, { x: k, y: k }, 260, ease.outBack);
        void tween(c, { y: this.spot.cards.y - 30 }, 260);
      }
      if (c.code !== codes[i] || !c.faceUp) await c.flipTo(codes[i], 240);
    }
  }

  highlightCards(best: string[] | undefined) {
    for (const c of this.cards) c.highlight(!!best && !!c.code && best.includes(c.code));
  }

  showHand(text: string | null) {
    this.handLabel.text = text ?? '';
  }

  showEquity(pct: number | null) {
    this.badge.removeChildren().forEach((c) => c.destroy());
    this.badge.visible = pct !== null;
    if (pct === null) return;
    const label = new Text({ text: `胜率 ${pct.toFixed(pct >= 99.95 || pct < 0.05 ? 0 : 1)}%`, style: { fontFamily: FONT_NUM, fontSize: 22, fill: 0xffffff } });
    label.anchor.set(0.5);
    const bg = new Graphics().roundRect(-label.width / 2 - 14, -20, label.width + 28, 40, 20).fill(pct >= 50 ? 0x2a8e9e : 0x943a3f).stroke({ width: 3, color: 0xffffff });
    this.badge.addChild(bg, label);
  }

  setExpression(e: Expression) {
    this.expression = e;
    this.basePose = e === Expression.Smug ? 'smug' : e === Expression.Nervous ? 'nervous' : e === Expression.Angry ? 'angry' : 'idle';
    this.restPose();
    this.exprChip.removeChildren().forEach((c) => c.destroy());
    if (e === Expression.Calm) return;
    const label = new Text({ text: EXPRESSION_LABEL[e], style: { fontFamily: FONT_DISPLAY, fontSize: 22, fill: 0xffffff } });
    label.position.set(12, 4);
    const bg = new Graphics().roundRect(0, 0, label.width + 24, 34, 17).fill(EXPRESSION_COLOR[e]).stroke({ width: 3, color: 0xffffff });
    this.exprChip.addChild(bg, label);
    this.exprChip.scale.set(1.4);
    void tween(this.exprChip.scale, { x: 1, y: 1 }, 220, ease.outBack);
  }

  showCaption(text: string) {
    this.caption.removeChildren().forEach((c) => c.destroy());
    const label = new Text({ text, style: { fontFamily: FONT, fontSize: 20, fontWeight: '700', fill: 0xffffff } });
    label.anchor.set(0.5);
    const bg = new Graphics().roundRect(-label.width / 2 - 14, -18, label.width + 28, 36, 18).fill({ color: 0x300b0b, alpha: 0.85 });
    this.caption.addChild(bg, label);
    this.caption.alpha = 0;
    const y0 = this.head.y + this.spot.height * 0.12;
    this.caption.y = y0 + 12;
    const id = ++this.captionTimer;
    void tween(this.caption, { alpha: 1, y: y0 }, 200)
      .then(() => wait(1700))
      .then(() => (id === this.captionTimer ? tween(this.caption, { alpha: 0 }, 300) : undefined));
  }

  showSticker(kind: Face) {
    this.stickerLayer.removeChildren().forEach((c) => c.destroy({ children: true }));
    const st = makeSticker(kind, this.char.color);
    st.rotation = (Math.random() - 0.5) * 0.25;
    st.scale.set(0.2);
    this.stickerLayer.addChild(st);
    const id = ++this.stickerTimer;
    void tween(st.scale, { x: 0.85, y: 0.85 }, 260, ease.outBack)
      .then(() => wait(2000))
      .then(() => (id === this.stickerTimer ? tween(st, { alpha: 0 }, 300) : undefined))
      .then(() => {
        if (id === this.stickerTimer && !st.destroyed) st.destroy({ children: true });
      });
  }

  async recheckCards() {
    const ys = this.cards.map((c) => c.y);
    await Promise.all(this.cards.map((c, i) => (c.visible ? tween(c, { y: ys[i] - 16 }, 160) : Promise.resolve())));
    await wait(250);
    await Promise.all(this.cards.map((c, i) => (c.visible ? tween(c, { y: ys[i] }, 160) : Promise.resolve())));
  }

  async fiddleChips() {
    const x0 = this.stackText.x;
    for (let i = 0; i < 6; i++) {
      this.stackText.x = x0 + (i % 2 ? -4 : 4);
      await wait(60);
    }
    this.stackText.x = x0;
  }

  async sigh() {
    const y0 = this.avatar.y;
    await tween(this.avatar, { y: y0 + 10 }, 300);
    await tween(this.avatar, { y: y0 }, 400);
  }

  say(text: string, ms = 1800, toName?: string) {
    this.bubble.removeChildren().forEach((c) => c.destroy());
    const label = new Text({ text: toName ? `→${toName}  ${text}` : text, style: { fontFamily: FONT, fontSize: 24, fontWeight: '700', fill: 0x5b2324, wordWrap: true, wordWrapWidth: 300, breakWords: true } });
    const pw = label.width + 32, ph = label.height + 20;
    const ax = this.isHero ? this.head.x + 90 : this.head.x;
    const top = this.isHero ? this.head.y - 230 : this.head.y - this.spot.height * 0.42 - ph;
    const left = Math.min(Math.max(ax - pw / 2, 40), 1880 - pw);
    const bg = new Graphics()
      .roundRect(4, 6, pw, ph, 18).fill({ color: 0x300b0b, alpha: 0.3 })
      .roundRect(0, 0, pw, ph, 18).fill(0xffffff).stroke({ width: 4, color: this.char.color })
      .poly([ax - left - 12, ph - 2, ax - left + 12, ph - 2, ax - left, ph + 18]).fill(0xffffff);
    label.position.set(16, 10);
    this.bubble.addChild(bg, label);
    this.bubble.position.set(left, Math.max(8, top));
    this.bubble.alpha = 0;
    this.bubble.scale.set(0.9);
    const id = ++this.bubbleTimer;
    void Promise.all([tween(this.bubble, { alpha: 1 }, 150), tween(this.bubble.scale, { x: 1, y: 1 }, 220, ease.outBack)])
      .then(() => wait(ms))
      .then(() => (id === this.bubbleTimer ? tween(this.bubble, { alpha: 0 }, 250) : undefined));
  }
}
