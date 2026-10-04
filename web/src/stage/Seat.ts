// One player at the table (docs/10): opponents are standing court cards with their
// portrait inside (hot-swappable PNG or placeholder), name and stack underneath, cards
// on the table, chip stack, and the mind-game decorations (bubbles, stickers, gesture
// captions, thinking clock). Folding turns the court card face down.
import { Container, Graphics, Text, type Texture } from 'pixi.js';
import { type Character, EXPRESSION_COLOR, EXPRESSION_LABEL } from '../characters';
import { Expression } from '../engine';
import { type Face, makeSticker } from '../fx/stickers';
import { CardSprite } from '../table/CardSprite';
import { FONT, FONT_DISPLAY, FONT_NUM, HERO_CARD, OPP_CARD, type Point, SEAT_CARD, type SeatSpot, fmt, headOf } from '../table/layout';
import { animate, ease, tween, wait } from '../tween';
import { CourtCard, cardBack } from './court';
import { CHIP_COLORS, PAL, type Pose } from './painter';

/** How a status tag under the name is drawn. */
export type TagKind = 'plain' | 'bet' | 'alert' | 'muted';

/** A stack of chips whose height grows with the amount: each chip has a thickness,
 *  edge stripes and a lit top; the whole stack throws a shadow on the felt. */
export function chipStack(amount: number, unit: number, scale = 1): Container {
  const c = new Container();
  const n = Math.max(1, Math.min(12, Math.round(Math.log2(Math.max(1, amount / Math.max(1, unit))) + 1)));
  const w = 26 * scale, h = 9 * scale, t = 6 * scale; // radius x, radius y, thickness
  const g = new Graphics();
  g.ellipse(4 * scale, 5 * scale, w * 1.15, h * 1.3).fill({ color: 0x000000, alpha: 0.35 });
  // bigger amounts get the darker, rarer colours on top
  const order = [2, 1, 0, 3];
  for (let i = 0; i < n; i++) {
    const y = -i * t;
    const [face, spot] = CHIP_COLORS[order[Math.min(order.length - 1, Math.floor((i / n) * 2 + (n > 6 ? 1 : 0)) + (i % 2))]];
    const dark = shade(face, 0.55);
    // side
    g.rect(-w, y - t, w * 2, t).fill(dark);
    g.ellipse(0, y, w, h).fill(dark);
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI + 0.25;
      const sx = Math.cos(a) * w;
      g.rect(sx - 2.5 * scale, y - t + 1, 5 * scale, t - 1).fill({ color: spot, alpha: 0.85 });
    }
    // top
    g.ellipse(0, y - t, w, h).fill(face);
    g.ellipse(0, y - t, w * 0.8, h * 0.8).stroke({ width: 2.2 * scale, color: spot, alpha: 0.9 });
    g.ellipse(-w * 0.25, y - t - h * 0.25, w * 0.45, h * 0.3).fill({ color: 0xffffff, alpha: 0.12 });
  }
  c.addChild(g);
  return c;
}

function shade(c: number, k: number): number {
  const r = ((c >> 16) & 255) * k, g = ((c >> 8) & 255) * k, b = (c & 255) * k;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
}


const CW = SEAT_CARD.w, CH = SEAT_CARD.h;

export class Seat extends Container {
  readonly seat: number;
  readonly char: Character;
  readonly spot: SeatSpot;
  readonly isHero: boolean;
  readonly head: Point;

  /** The court card; tap it to aim table talk at this player. */
  readonly avatar = new Container();
  /** Everything on or above the table (plate, chips, cards, bubbles); drawn in front of the table. */
  readonly front = new Container();
  private court: CourtCard;
  private back: Container;
  private outline = new Graphics();
  private poses: Record<Pose, Texture>;
  private basePose: Pose = 'idle';
  private pose: Pose = 'idle';

  private plate = new Container();
  private nameText: Text;
  private stackText: Text;
  private tag = new Container();
  private outStamp = new Container();
  readonly cards: CardSprite[];
  private betBox = new Container();
  private betText: Text;
  private bubble = new Container();
  private bubbleTimer = 0;
  private badge = new Container();
  private handLabel: Text;
  private handMask = new Graphics();
  private flames = new Graphics();
  private burning = false;
  private standing = false;
  private faceDown = false;
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

    // The court card, standing behind the table edge.
    this.court = new CourtCard({ w: CW, h: CH, court: char.court, texture: poses.idle });
    this.back = cardBack(CW, CH);
    this.back.visible = false;
    const shadow = new Graphics().roundRect(-CW / 2 + 8, -CH / 2 + 16, CW, CH, 14).fill({ color: 0x000000, alpha: 0.45 });
    this.avatar.addChild(shadow, this.outline, this.court, this.back);
    this.avatar.position.set(spot.base.x, this.cardY);
    this.avatar.rotation = spot.tilt;
    this.avatar.visible = !isHero;
    this.avatar.eventMode = 'static';
    this.avatar.cursor = 'pointer';

    // Name and stack under the card; yours sit on an ivory panel.
    this.nameText = new Text({ text: char.name, style: { fontFamily: FONT_DISPLAY, fontWeight: '900', fontSize: isHero ? 24 : 20, fill: isHero ? PAL.ink : PAL.ivory, stroke: isHero ? undefined : { color: PAL.ink, width: 4 } } });
    this.nameText.anchor.set(0, 0.5);
    this.stackText = new Text({ text: '0', style: { fontFamily: FONT_NUM, fontSize: isHero ? 30 : 19, fill: isHero ? PAL.ink : PAL.ivory, stroke: isHero ? undefined : { color: PAL.ink, width: 4 } } });
    this.stackText.anchor.set(0, 0.5);
    if (isHero) this.plate.addChild(new Graphics().roundRect(-150, -40, 300, 80, 18).fill(PAL.ivory));
    this.plate.addChild(this.nameText, this.stackText);
    this.plate.position.set(spot.plate.x, spot.plate.y);
    this.layoutPlate();

    this.tag.position.set(spot.plate.x, spot.plate.y + (isHero ? -66 : 32));

    // Cards on the table (yours are big, in the foreground)
    const size = isHero ? HERO_CARD : OPP_CARD;
    this.cards = [new CardSprite(size.w, size.h), new CardSprite(size.w, size.h)];
    this.cards.forEach((c) => (c.visible = false));
    this.placeCards();

    // Bet
    this.betText = new Text({ text: '', style: { fontFamily: FONT_NUM, fontSize: 20, fill: PAL.ivory, stroke: { color: PAL.ink, width: 4 } } });
    this.betText.anchor.set(0, 0.5);
    this.betBox.position.set(spot.bet.x, spot.bet.y);
    this.betBox.visible = false;

    this.handLabel = new Text({ text: '', style: { fontFamily: FONT_DISPLAY, fontWeight: '900', fontSize: isHero ? 34 : 24, fill: PAL.ivory, stroke: { color: PAL.ink, width: 6 } } });
    this.handLabel.anchor.set(0.5);
    this.handLabel.position.set(isHero ? spot.cards.x + 95 : spot.cards.x, isHero ? spot.cards.y - 150 : spot.cards.y + 50);

    this.badge.position.set(spot.plate.x, spot.plate.y + (isHero ? -110 : 66));
    this.badge.visible = false;
    const cardTop = spot.base.y - spot.height;
    this.exprChip.position.set(spot.base.x + CW / 2 - 20, cardTop - 8);
    this.caption.position.set(this.head.x, this.head.y + 70);
    this.thinking = new Text({ text: '', style: { fontFamily: FONT_NUM, fontSize: 18, fill: PAL.ivory, stroke: { color: PAL.ink, width: 4 } } });
    this.thinking.anchor.set(0.5);
    this.thinking.position.set(spot.plate.x, isHero ? spot.plate.y - 100 : cardTop - 20);
    const toCenter = { x: 960 - this.head.x, y: 560 - this.head.y };
    const len = Math.hypot(toCenter.x, toCenter.y) || 1;
    this.stickerLayer.position.set(this.head.x + (toCenter.x / len) * 170, this.head.y + (toCenter.y / len) * 60 - (isHero ? 140 : 0));
    this.outStamp.position.set(spot.base.x, this.cardY);

    this.addChild(this.avatar, this.outStamp, this.exprChip);
    this.handLabel.mask = this.handMask;
    this.handMask.rect(-400, -60, 800, 120).fill(0xffffff);
    this.handMask.position.copyFrom(this.handLabel.position);
    this.front.addChild(this.flames, this.plate, this.tag, this.betBox, ...this.cards, this.handLabel, this.badge, this.thinking, this.caption, this.bubble, this.stickerLayer, this.handMask);
  }

  /** Where the court card's centre rests. */
  private get cardY() {
    return this.spot.base.y - this.spot.height / 2;
  }

  private layoutPlate() {
    const gap = 10;
    if (this.isHero) {
      this.nameText.x = -126;
      this.stackText.x = this.nameText.x + this.nameText.width + 16;
      return;
    }
    const total = this.nameText.width + gap + this.stackText.width;
    this.nameText.x = -total / 2;
    this.stackText.x = this.nameText.x + this.nameText.width + gap;
  }

  private placeCards() {
    const spot = this.spot;
    this.cards.forEach((c, i) => {
      if (this.isHero) {
        c.position.set(spot.cards.x + i * 190, spot.cards.y + i * 4);
        c.rotation = i === 0 ? -0.1 : 0.1;
        c.scale.set(1);
      } else {
        c.position.set(spot.cards.x + (i - 0.5) * OPP_CARD.w * 0.6 * spot.cardScale, spot.cards.y);
        c.rotation = (i - 0.5) * 0.2;
        c.scale.set(spot.cardScale, spot.cardScale * 0.86); // lying on the table
      }
    });
  }

  /** Chips leave from (and arrive at) the name. */
  get anchor(): Point {
    return this.spot.plate;
  }
  get betPos(): Point {
    return this.spot.bet;
  }

  setUnit(bb: number) {
    this.unit = bb;
  }

  poseTexture(pose: Pose): Texture {
    return this.poses[pose] ?? this.poses.idle;
  }

  setPose(pose: Pose) {
    this.pose = pose;
    this.court.setTexture(this.poseTexture(pose));
  }

  /** Back to the resting pose for the current expression. */
  restPose() {
    this.setPose(this.basePose);
  }

  tick(t: number) {
    // breathing
    if (!this.isHero) this.court.setTexture(this.poseTexture(this.pose), 1 + Math.sin(t / 900 + this.seat) * 0.008);
    if (this.active && !this.burning) this.outline.alpha = 0.7 + 0.3 * Math.sin(t / 220);
    if (this.thinkStart) this.thinking.text = `${((performance.now() - this.thinkStart) / 1000).toFixed(1)}s`;
    if (this.burning) this.drawBurn(t);
  }

  private drawOutline(color: number, width: number) {
    this.outline.clear().roundRect(-CW / 2 - width / 2 - 3, -CH / 2 - width / 2 - 3, CW + width + 6, CH + width + 6, 18).stroke({ width, color });
    this.outline.alpha = 1;
  }

  /** ALL IN: the card (or your panel) is edged in pulsing card red until the hand ends. */
  setBurning(on: boolean) {
    this.burning = on;
    this.flames.clear();
    if (!on) this.outline.clear();
  }

  private drawBurn(t: number) {
    const pulse = 0.6 + 0.4 * Math.sin(t / 140 + this.seat);
    if (this.isHero) {
      const { x, y } = this.spot.plate;
      this.flames.clear().roundRect(x - 158, y - 48, 316, 96, 24).stroke({ width: 6, color: PAL.red, alpha: pulse });
    } else {
      this.drawOutline(PAL.red, 7);
      this.outline.alpha = pulse;
    }
  }

  /** M10: she folded to a bluff that was then shown. Her card shakes and she reacts. */
  fooled() {
    const x0 = this.avatar.x;
    void animate(320, (p) => (this.avatar.x = x0 + Math.sin(p * Math.PI * 8) * 7 * (1 - p)), ease.linear);
    if (!this.isHero) this.setPose(Math.random() < 0.5 ? 'angry' : 'shock');
    const t = new Text({ text: '被骗了！', style: { fontFamily: FONT_DISPLAY, fontWeight: '900', fontSize: 24, fill: PAL.ivory } });
    t.anchor.set(0.5);
    const bg = new Graphics().roundRect(-t.width / 2 - 14, -20, t.width + 28, 40, 20).fill(PAL.red);
    const pill = new Container();
    pill.addChild(bg, t);
    pill.position.set(this.spot.plate.x, this.spot.plate.y - (this.isHero ? 70 : 40));
    pill.rotation = (Math.random() - 0.5) * 0.2;
    pill.scale.set(0.3);
    this.front.addChild(pill);
    void tween(pill.scale, { x: 1, y: 1 }, 240, ease.outBack)
      .then(() => wait(1300))
      .then(() => tween(pill, { alpha: 0, y: pill.y - 20 }, 300))
      .then(() => pill.destroy({ children: true }));
  }

  shakePlate() {
    const x0 = this.spot.plate.x;
    void animate(420, (p) => (this.plate.x = x0 + Math.sin(p * Math.PI * 10) * 9 * (1 - p)), ease.linear);
  }

  /** M14: knocked out. The card turns face down and drops away. Resolves with where the ash should fly from. */
  async burnAway(): Promise<Point> {
    this.setBurning(true);
    await wait(450);
    this.setBurning(false);
    const at = { x: this.spot.base.x, y: this.cardY };
    await this.turn(true);
    void tween(this.plate, { alpha: 0 }, 260);
    for (const c of this.cards) c.visible = false;
    this.betBox.visible = false;
    return at;
  }

  /** Flip the court card over (face down = folded or out). */
  private async turn(down: boolean, ms = 260) {
    if (this.isHero || down === this.faceDown) return;
    this.faceDown = down;
    const sx = Math.abs(this.avatar.scale.x) || 1;
    await tween(this.avatar.scale, { x: 0 }, ms / 2, ease.inCubic);
    this.court.visible = !down;
    this.back.visible = down;
    await tween(this.avatar.scale, { x: sx }, ms / 2, ease.outCubic);
  }

  /** Showdown spotlight: everyone but the player being shown drops into shadow. */
  dim(on: boolean) {
    if (this.out) return;
    this.avatar.alpha = on ? 0.45 : 1;
  }

  /** 本局主役: the winner's card rises in the victory pose (and settles back). */
  async standUp(on: boolean) {
    if (on === this.standing) return;
    this.standing = on;
    if (on) {
      this.setPose('win');
      this.avatar.alpha = 1;
      void this.turn(false, 200);
      await Promise.all([
        tween(this.avatar, { y: this.cardY - 40 }, 380, ease.outBack),
        tween(this.avatar.scale, { x: 1.15, y: 1.15 }, 380, ease.outBack),
      ]);
    } else {
      this.restPose();
      await Promise.all([tween(this.avatar, { y: this.cardY }, 300), tween(this.avatar.scale, { x: 1, y: 1 }, 300)]);
    }
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
    this.layoutPlate();
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

  /** Whoever is acting: the card lifts off the table, edged in light cobalt. */
  setActive(on: boolean) {
    if (on === this.active) return;
    this.active = on;
    if (this.out || this.isHero) return;
    if (!this.burning) {
      if (on) this.drawOutline(PAL.cobaltHi, 5);
      else this.outline.clear();
    }
    if (!this.standing) void tween(this.avatar, { y: this.cardY - (on ? 16 : 0) }, 220, ease.outCubic);
  }

  setTag(text: string, kind: TagKind = 'plain') {
    this.tag.removeChildren().forEach((c) => c.destroy());
    if (!text) return;
    const fill = kind === 'bet' ? PAL.cobalt : kind === 'alert' ? 0xffffff : kind === 'muted' ? PAL.grey : PAL.ivory;
    const t = new Text({ text, style: { fontFamily: FONT_DISPLAY, fontWeight: '900', fontSize: 16, fill } });
    t.anchor.set(0.5);
    if (kind === 'bet' || kind === 'alert') {
      const bg = new Graphics().roundRect(-t.width / 2 - 12, -14, t.width + 24, 28, 14).fill(kind === 'bet' ? PAL.ivory : PAL.red);
      this.tag.addChild(bg);
    } else {
      t.style.stroke = { color: PAL.ink, width: 4 };
    }
    this.tag.addChild(t);
  }

  markAllIn() {
    this.allIn = true;
    this.setTag('ALL IN', 'alert');
  }

  setFolded(folded: boolean) {
    this.folded = folded;
    void this.turn(folded);
    if (folded) {
      this.setActive(false);
      for (const c of this.cards)
        if (c.visible) {
          if (this.isHero) c.alpha = 0.45;
          else void tween(c, { alpha: 0, y: c.y - 20 }, 250).then(() => (c.visible = false));
        }
    }
  }

  setOut(place: string) {
    this.out = true;
    this.outline.clear();
    void this.turn(true);
    this.avatar.alpha = 0.5;
    this.plate.alpha = 0.5;
    this.setTag(place, 'muted');
    this.cards.forEach((c) => (c.visible = false));
    this.outStamp.removeChildren().forEach((c) => c.destroy());
    const t = new Text({ text: `OUT ${place.replace(/[^0-9]/g, '')}`, style: { fontFamily: FONT_NUM, fontSize: 30, fill: PAL.ivory } });
    t.anchor.set(0.5);
    const bg = new Graphics().roundRect(-t.width / 2 - 16, -24, t.width + 32, 48, 24).fill(PAL.red);
    this.outStamp.addChild(bg, t);
    this.outStamp.rotation = -0.12;
    this.outStamp.scale.set(2.2);
    void tween(this.outStamp.scale, { x: 1, y: 1 }, 260, ease.inCubic);
  }

  newHand(stack: number) {
    this.setStack(stack);
    this.setBet(0);
    this.setActive(false);
    this.folded = false;
    this.allIn = false;
    this.setBurning(false);
    this.standing = false;
    this.avatar.scale.set(1);
    this.avatar.y = this.cardY;
    this.stopThinking();
    if (this.expression !== Expression.Angry) this.setExpression(Expression.Calm);
    this.restPose();
    if (!this.out) {
      this.faceDown = false;
      this.court.visible = true;
      this.back.visible = false;
      this.avatar.alpha = 1;
      this.setTag('');
    }
    this.showHand(null);
    this.showEquity(null);
    this.cards.forEach((c) => {
      c.visible = false;
      c.alpha = 1;
      c.highlight(false);
      c.set(null);
    });
    this.placeCards();
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
      // At showdown opponents' cards lift off the table and turn to face you, much bigger.
      const lift = showdown && !this.isHero;
      if (lift) void tween(c, { y: this.spot.cards.y - 30, x: this.spot.cards.x + (i - 0.5) * OPP_CARD.w * 1.25 }, 260);
      if (c.code !== codes[i] || !c.faceUp) await c.flipTo(codes[i], 240, true, lift ? { x: 1.9, y: 1.9 } : undefined);
      else if (lift) await tween(c.scale, { x: 1.9, y: 1.9 }, 240, ease.outBack);
    }
  }

  highlightCards(best: string[] | undefined) {
    for (const c of this.cards) c.highlight(!!best && !!c.code && best.includes(c.code));
  }

  /** The hand's name under the cards; `brush` wipes it in from the left. */
  showHand(text: string | null, brush = false) {
    this.handLabel.text = text ?? '';
    this.handLabel.style.fontSize = brush ? (this.isHero ? 44 : 32) : this.isHero ? 34 : 24;
    if (!brush || !text) {
      this.handMask.clear().rect(-400, -60, 800, 120).fill(0xffffff);
      this.handMask.pivot.x = 0;
      this.handMask.position.copyFrom(this.handLabel.position);
      this.handMask.scale.x = 1;
      return;
    }
    const w = this.handLabel.width;
    this.handMask.clear().rect(-w / 2 - 10, -60, w + 20, 120).fill(0xffffff);
    this.handMask.pivot.x = -w / 2 - 10;
    this.handMask.x = this.handLabel.x - w / 2 - 10;
    this.handMask.scale.x = 0;
    void tween(this.handMask.scale, { x: 1 }, 420, ease.inOutCubic);
  }

  showEquity(pct: number | null) {
    this.badge.removeChildren().forEach((c) => c.destroy());
    this.badge.visible = pct !== null;
    if (pct === null) return;
    const ahead = pct >= 50;
    const label = new Text({ text: `${pct.toFixed(pct >= 99.95 || pct < 0.05 ? 0 : 1)}%`, style: { fontFamily: FONT_NUM, fontSize: 20, fill: ahead ? PAL.cobalt : PAL.ivory } });
    label.anchor.set(0.5);
    const bg = new Graphics().roundRect(-label.width / 2 - 14, -17, label.width + 28, 34, 17).fill(ahead ? PAL.ivory : PAL.ink).stroke({ width: 2, color: PAL.ivory });
    this.badge.addChild(bg, label);
  }

  setExpression(e: Expression) {
    this.expression = e;
    this.basePose = e === Expression.Smug ? 'smug' : e === Expression.Nervous ? 'nervous' : e === Expression.Angry ? 'angry' : 'idle';
    this.restPose();
    this.exprChip.removeChildren().forEach((c) => c.destroy());
    if (e === Expression.Calm) return;
    const label = new Text({ text: EXPRESSION_LABEL[e], style: { fontFamily: FONT_DISPLAY, fontWeight: '900', fontSize: 18, fill: PAL.ink } });
    label.anchor.set(0.5);
    const bg = new Graphics().roundRect(-label.width / 2 - 12, -16, label.width + 24, 32, 16).fill(PAL.ivory).stroke({ width: 3, color: EXPRESSION_COLOR[e] });
    this.exprChip.addChild(bg, label);
    this.exprChip.scale.set(1.4);
    void tween(this.exprChip.scale, { x: 1, y: 1 }, 220, ease.outBack);
  }

  showCaption(text: string) {
    this.caption.removeChildren().forEach((c) => c.destroy());
    const label = new Text({ text, style: { fontFamily: FONT, fontSize: 18, fontWeight: '700', fill: PAL.ivory } });
    label.anchor.set(0.5);
    const bg = new Graphics().roundRect(-label.width / 2 - 14, -17, label.width + 28, 34, 17).fill({ color: PAL.ink, alpha: 0.9 });
    this.caption.addChild(bg, label);
    this.caption.alpha = 0;
    const y0 = this.head.y + 70;
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
    void tween(st.scale, { x: 0.75, y: 0.75 }, 260, ease.outBack)
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
    const label = new Text({ text: toName ? `→${toName}  ${text}` : text, style: { fontFamily: FONT, fontSize: 22, fontWeight: '700', fill: PAL.ink, wordWrap: true, wordWrapWidth: 280, breakWords: true } });
    const pw = label.width + 32, ph = label.height + 22;
    const ax = this.head.x;
    const cardTop = this.spot.base.y - this.spot.height;
    let top = this.isHero ? this.spot.plate.y - 120 - ph : cardTop - ph - 16;
    // no room above the far cards: speak from beside them instead
    const beside = top < 8;
    if (beside) top = cardTop + 30;
    const left = beside
      ? (ax < 960 ? ax + CW / 2 + 16 : ax - CW / 2 - 16 - pw)
      : Math.min(Math.max(ax - pw / 2, 40), 1880 - pw);
    const bg = new Graphics()
      .roundRect(4, 8, pw, ph, 16).fill({ color: 0x000000, alpha: 0.35 })
      .roundRect(0, 0, pw, ph, 16).fill(PAL.ivory)
      .rect(16, ph - 4, 40, 4).fill(this.char.color);
    if (!beside) bg.poly([ax - left - 10, ph - 1, ax - left + 10, ph - 1, ax - left, ph + 14]).fill(PAL.ivory);
    label.position.set(16, 11);
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
