import { ColorMatrixFilter, Container, Graphics, Text } from 'pixi.js';
import { type Character, EXPRESSION_COLOR, EXPRESSION_LABEL } from '../characters';
import { Expression } from '../engine';
import { ease, tween, wait } from '../tween';
import { CardSprite } from './CardSprite';
import { FONT, HERO_CARD, OPP_CARD, type SeatLayout, fmt } from './layout';

function lighten(color: number, amt: number): number {
  const r = Math.min(255, ((color >> 16) & 255) + amt);
  const g = Math.min(255, ((color >> 8) & 255) + amt);
  const b = Math.min(255, (color & 255) + amt);
  return (r << 16) | (g << 8) | b;
}

/** One seat: placeholder portrait, name plate, hole cards, bet on the felt, speech bubble. */
export class SeatView extends Container {
  readonly seat: number;
  readonly char: Character;
  readonly L: SeatLayout;
  readonly isHero: boolean;

  readonly avatar = new Container();
  private ring = new Graphics();
  private plate = new Container();
  private stackText: Text;
  private tag: Text;
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
  expression = Expression.Calm;

  stack = 0;
  bet = 0;
  active = false;
  out = false;
  folded = false;
  allIn = false;

  constructor(seat: number, char: Character, layout: SeatLayout, isHero: boolean) {
    super();
    this.seat = seat;
    this.char = char;
    this.L = layout;
    this.isHero = isHero;
    const { w, h } = layout.avatarSize;
    const { x, y } = layout.avatar;

    // Portrait placeholder: framed card in the character colour with a big glyph.
    const frame = new Graphics()
      .roundRect(-w / 2, -h / 2, w, h, 16).fill(char.color)
      .roundRect(-w / 2 + 6, -h / 2 + 6, w - 12, h * 0.62, 12).fill(lighten(char.color, 40))
      .circle(0, -h * 0.12, w * 0.26).fill(lighten(char.color, 85));
    const glyph = new Text({
      text: char.name.slice(0, 1),
      style: { fontFamily: FONT, fontSize: Math.round(w * 0.32), fontWeight: '900', fill: char.color },
    });
    glyph.anchor.set(0.5);
    glyph.position.set(0, -h * 0.12);
    const style = new Text({ text: char.style, style: { fontFamily: FONT, fontSize: 18, fill: 0xffffff } });
    style.anchor.set(0.5);
    style.position.set(0, h * 0.33);
    this.avatar.addChild(frame, glyph, style);
    this.avatar.position.set(x, y);
    this.ring.position.set(x, y);
    this.drawRing(w, h);
    this.ring.visible = false;

    // Name plate (opponents under the portrait; the hero overlaps the bottom edge).
    const pw = isHero ? 190 : 170;
    const ph = 56;
    const plateY = isHero ? y + h / 2 - 34 : y + h / 2 + 34;
    const plateBg = new Graphics().roundRect(-pw / 2, -ph / 2, pw, ph, 10).fill({ color: 0x0b0a16, alpha: 0.82 });
    const name = new Text({ text: char.name, style: { fontFamily: FONT, fontSize: 18, fill: 0xd8d3f5 } });
    name.anchor.set(0.5);
    name.position.set(0, -12);
    this.stackText = new Text({ text: '0', style: { fontFamily: FONT, fontSize: 22, fontWeight: '700', fill: 0xffe08a } });
    this.stackText.anchor.set(0.5);
    this.stackText.position.set(0, 13);
    this.plate.addChild(plateBg, name, this.stackText);
    this.plate.position.set(x, plateY);

    this.tag = new Text({ text: '', style: { fontFamily: FONT, fontSize: 18, fontWeight: '900', fill: 0xffffff, stroke: { color: 0x000000, width: 4 } } });
    this.tag.anchor.set(0.5);
    this.tag.position.set(x, plateY + (isHero ? -50 : 42));

    // Hole cards
    const size = isHero ? HERO_CARD : OPP_CARD;
    this.cards = [new CardSprite(size.w, size.h), new CardSprite(size.w, size.h)];
    this.cards.forEach((c, i) => {
      c.position.set(layout.cards.x + i * layout.cardGap, layout.cards.y);
      if (isHero) c.rotation = i === 0 ? -0.07 : 0.07;
      c.visible = false;
    });

    // Bet on the felt
    const chip = new Graphics().circle(0, 0, 15).fill(0xffd166).stroke({ width: 3, color: 0xb8860b }).circle(0, 0, 8).stroke({ width: 2, color: 0xffffff, alpha: 0.8 });
    this.betText = new Text({ text: '', style: { fontFamily: FONT, fontSize: 20, fontWeight: '700', fill: 0xffffff, stroke: { color: 0x0b0a16, width: 4 } } });
    this.betText.anchor.set(0, 0.5);
    this.betText.position.set(22, 0);
    this.betBox.addChild(chip, this.betText);
    this.betBox.position.set(layout.bet.x - 30, layout.bet.y);
    this.betBox.visible = false;

    this.handLabel = new Text({ text: '', style: { fontFamily: FONT, fontSize: isHero ? 26 : 20, fontWeight: '800', fill: 0xffe08a, stroke: { color: 0x000000, width: 5 } } });
    this.handLabel.anchor.set(0.5);
    const cardsMid = layout.cards.x + layout.cardGap / 2;
    this.handLabel.position.set(cardsMid, layout.cards.y + size.h / 2 + 18);
    if (isHero) this.handLabel.position.set(cardsMid, layout.cards.y - size.h / 2 - 24);

    this.badge.position.set(x, y - h / 2 - 26);
    this.badge.visible = false;

    this.exprChip.position.set(x - w / 2 + 6, y - h / 2 + 6);
    this.caption.position.set(x, y + h * 0.08);
    this.thinking = new Text({ text: '', style: { fontFamily: FONT, fontSize: 20, fontWeight: '700', fill: 0xffe08a, stroke: { color: 0x000000, width: 4 } } });
    this.thinking.anchor.set(0.5);
    this.thinking.position.set(x, y - h / 2 - 20);

    // Tap a portrait to aim table talk at that player.
    this.avatar.eventMode = 'static';
    this.avatar.cursor = 'pointer';

    this.addChild(this.ring, this.avatar, this.exprChip, this.plate, this.tag, ...this.cards, this.betBox, this.handLabel, this.badge, this.thinking, this.caption, this.bubble);
  }

  private drawRing(w: number, h: number) {
    this.ring.clear().roundRect(-w / 2 - 7, -h / 2 - 7, w + 14, h + 14, 20).stroke({ width: 6, color: 0xffd166 });
  }

  tick(t: number) {
    if (this.ring.visible) this.ring.alpha = 0.55 + 0.45 * Math.sin(t / 180);
    if (this.thinkStart) this.thinking.text = `思考中 ${((performance.now() - this.thinkStart) / 1000).toFixed(1)}s`;
  }

  /** Shows a running "thinking" clock: how long a player takes is part of the read. */
  startThinking() {
    this.thinkStart = performance.now();
  }

  stopThinking() {
    this.thinkStart = 0;
    this.thinking.text = '';
  }

  setExpression(e: Expression) {
    this.expression = e;
    this.exprChip.removeChildren().forEach((c) => c.destroy());
    if (e === Expression.Calm) return;
    const label = new Text({ text: EXPRESSION_LABEL[e], style: { fontFamily: FONT, fontSize: 18, fontWeight: '800', fill: 0xffffff } });
    label.position.set(10, 4);
    const bg = new Graphics().roundRect(0, 0, label.width + 20, 30, 15).fill(EXPRESSION_COLOR[e]).stroke({ width: 2, color: 0xffffff, alpha: 0.8 });
    this.exprChip.addChild(bg, label);
    this.exprChip.scale.set(1.4);
    void tween(this.exprChip.scale, { x: 1, y: 1 }, 220, ease.outBack);
  }

  /** A short caption over the portrait for gestures ("摸了摸筹码"). */
  showCaption(text: string) {
    this.caption.removeChildren().forEach((c) => c.destroy());
    const label = new Text({ text, style: { fontFamily: FONT, fontSize: 19, fontWeight: '700', fill: 0xffffff } });
    label.anchor.set(0.5);
    const bg = new Graphics().roundRect(-label.width / 2 - 12, -17, label.width + 24, 34, 17).fill({ color: 0x0b0a16, alpha: 0.85 });
    this.caption.addChild(bg, label);
    this.caption.alpha = 0;
    this.caption.y = this.L.avatar.y + this.L.avatarSize.h * 0.08 + 12;
    const id = ++this.captionTimer;
    void tween(this.caption, { alpha: 1, y: this.caption.y - 12 }, 200)
      .then(() => wait(1700))
      .then(() => (id === this.captionTimer ? tween(this.caption, { alpha: 0 }, 300) : undefined));
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
    await tween(this.avatar, { y: y0 + 8 }, 300);
    await tween(this.avatar, { y: y0 }, 400);
  }

  setStack(n: number) {
    this.stack = n;
    this.stackText.text = fmt(n);
  }

  setBet(n: number) {
    this.bet = n;
    this.betBox.visible = n > 0;
    this.betText.text = fmt(n);
  }

  get betPos() {
    return { x: this.L.bet.x - 30, y: this.L.bet.y };
  }

  setActive(on: boolean) {
    this.active = on;
    this.ring.visible = on;
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
    this.avatar.alpha = folded ? 0.45 : 1;
    if (folded && !this.isHero) this.cards.forEach((c) => (c.visible = false));
    if (folded && this.isHero) this.cards.forEach((c) => (c.alpha = 0.45));
  }

  setOut(place: string) {
    this.out = true;
    const gray = new ColorMatrixFilter();
    gray.desaturate();
    this.avatar.filters = [gray];
    this.avatar.alpha = 0.5;
    this.setTag(place, 0xbfb8e6);
    this.cards.forEach((c) => (c.visible = false));
  }

  /** Reset for a new hand. */
  newHand(stack: number) {
    this.setStack(stack);
    this.setBet(0);
    this.setActive(false);
    this.avatar.alpha = 1;
    this.stopThinking();
    if (this.expression !== Expression.Angry) this.setExpression(Expression.Calm);
    this.folded = false;
    this.allIn = false;
    this.showHand(null);
    this.showEquity(null);
    if (!this.out) this.setTag('');
    this.cards.forEach((c) => {
      c.visible = false;
      c.alpha = 1;
      c.highlight(false);
      c.set(null);
    });
  }

  async dealBack(i: number, from: { x: number; y: number }) {
    const c = this.cards[i];
    const target = { x: c.x, y: c.y };
    c.set(null);
    c.position.set(from.x, from.y);
    c.alpha = 0;
    c.visible = true;
    await Promise.all([tween(c.position, target, 220), tween(c, { alpha: 1 }, 120)]);
  }

  async reveal(codes: string[]) {
    for (let i = 0; i < 2; i++) {
      const c = this.cards[i];
      c.visible = true;
      c.alpha = 1;
      if (c.code !== codes[i]) await c.flipTo(codes[i], 240);
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
    const label = new Text({ text: `胜率 ${pct.toFixed(pct >= 99.95 || pct < 0.05 ? 0 : 1)}%`, style: { fontFamily: FONT, fontSize: 22, fontWeight: '800', fill: 0xffffff } });
    label.anchor.set(0.5);
    const bg = new Graphics().roundRect(-label.width / 2 - 14, -20, label.width + 28, 40, 20).fill(pct >= 50 ? 0x2f9e62 : 0x8a3a4a);
    this.badge.addChild(bg, label);
  }

  /** Speech bubble above the portrait. Never driven by hidden information. */
  say(text: string, ms = 1800, toName?: string) {
    this.bubble.removeChildren().forEach((c) => c.destroy());
    const label = new Text({ text: toName ? `→${toName}  ${text}` : text, style: { fontFamily: FONT, fontSize: 22, fill: 0x22223a, wordWrap: true, wordWrapWidth: 280, breakWords: true } });
    const pw = label.width + 28;
    const ph = label.height + 18;
    const { x, y } = this.L.avatar;
    const top = this.isHero ? y - this.L.avatarSize.h / 2 - ph - 20 : y - this.L.avatarSize.h / 2 - ph - 22;
    const left = Math.min(Math.max(x - pw / 2, 100), 1820 - pw);
    const bg = new Graphics()
      .roundRect(0, 0, pw, ph, 14).fill(0xffffff).stroke({ width: 3, color: this.char.color })
      .poly([x - left - 10, ph - 1, x - left + 10, ph - 1, x - left, ph + 14]).fill(0xffffff);
    label.position.set(14, 9);
    this.bubble.addChild(bg, label);
    this.bubble.position.set(left, Math.max(8, top));
    this.bubble.alpha = 0;
    this.bubble.scale.set(1);
    const id = ++this.bubbleTimer;
    void tween(this.bubble, { alpha: 1 }, 150, ease.outCubic)
      .then(() => wait(ms))
      .then(() => (id === this.bubbleTimer ? tween(this.bubble, { alpha: 0 }, 250) : undefined));
  }
}
