// One player at the first-person table: character art (hot-swappable PNG or
// placeholder), paper name plate on the rim, cards on the felt, chip stack, and the
// mind-game decorations (bubbles, stickers, gesture captions, thinking clock).
import { ColorMatrixFilter, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { type Character, EXPRESSION_COLOR, EXPRESSION_LABEL } from '../characters';
import { Expression } from '../engine';
import { type Face, makeSticker } from '../fx/stickers';
import { CardSprite } from '../table/CardSprite';
import { FONT, FONT_BRUSH, FONT_DISPLAY, FONT_NUM, HERO_CARD, OPP_CARD, type Point, type SeatSpot, fmt, headOf } from '../table/layout';
import { animate, ease, tween, wait } from '../tween';
import type { PoseSet, RealArt } from './assets';
import { CHIP_COLORS, PAL, type Pose, paintGlow } from './painter';
import { type Rim, rimFor } from './rim';

let glowTex: Texture | null = null;

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

/** Multiplies two colours channel by channel. */
function mulColor(a: number, b: number): number {
  const ch = (s: number) => Math.round((((a >> s) & 255) * ((b >> s) & 255)) / 255) << s;
  return ch(16) | ch(8) | ch(0);
}

function shade(c: number, k: number): number {
  const r = ((c >> 16) & 255) * k, g = ((c >> 8) & 255) * k, b = (c & 255) * k;
  return (Math.round(r) << 16) | (Math.round(g) << 8) | Math.round(b);
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
  /** Halo, art, rim light and blink, scaled (and mirrored) together. */
  private body = new Container();
  private figure = new Sprite();
  private halo = new Sprite();
  private rim = new Sprite();
  private blink = new Sprite();
  private nextBlink = 0;
  private blinkUntil = 0;
  private art?: RealArt;
  /** -1 when the art is mirrored to turn toward the middle of the table. */
  private dir = 1;
  private spotlight = new Sprite();
  private poses: PoseSet;
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
  private handMask = new Graphics();
  private flames = new Graphics();
  private burning = false;
  private dimmed = false;
  private standing = false;
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

  constructor(seat: number, char: Character, spot: SeatSpot, poses: PoseSet, isHero: boolean) {
    super();
    this.seat = seat;
    this.char = char;
    this.spot = spot;
    this.isHero = isHero;
    this.poses = poses;
    this.art = poses.art;
    this.gray.desaturate();

    // Real art turns toward the middle of the table: mirror it on the side it faces away from.
    const facing = this.art?.meta.facing ?? 'front';
    if ((facing === 'left' && spot.base.x < 900) || (facing === 'right' && spot.base.x > 1020)) this.dir = -1;
    this.head = this.art ? this.artHead() : headOf(spot);

    // Character art, anchored at the waist, scaled to the spot's depth.
    for (const sp of [this.halo, this.figure, this.rim, this.blink]) sp.anchor.set(0.5, 1);
    this.halo.alpha = 0.5;
    this.rim.blendMode = 'add';
    this.blink.visible = false;
    if (this.art?.blink) this.blink.texture = this.art.blink;
    this.body.addChild(this.halo, this.figure, this.rim, this.blink);
    this.setPose('idle');
    this.shade(0xffffff);
    this.avatar.position.set(spot.base.x, spot.base.y);
    this.avatar.addChild(this.body);
    this.avatar.eventMode = 'static';
    this.avatar.cursor = 'pointer';
    // Warm light behind whoever is acting.
    glowTex ??= Texture.from(paintGlow(256, 'rgba(255,236,214,0.9)'));
    this.spotlight.texture = glowTex;
    this.spotlight.anchor.set(0.5);
    this.spotlight.width = spot.height * 1.1;
    this.spotlight.height = spot.height * 1.25;
    this.spotlight.position.set(this.head.x, this.head.y + spot.height * 0.1);
    this.spotlight.alpha = 0;
    this.spotlight.blendMode = 'add';

    // Paper name plate taped to the rim.
    const pw = isHero ? 210 : 190, ph = 62;
    const paper = new Graphics()
      .roundRect(-pw / 2 + 2, -ph / 2 + 6, pw, ph, 8).fill({ color: 0x000000, alpha: 0.45 })
      .roundRect(-pw / 2, -ph / 2, pw, ph, 8).fill({ color: 0x262624, alpha: 0.92 })
      .roundRect(-pw / 2, -ph / 2, pw, ph, 8).stroke({ width: 1.5, color: PAL.beige, alpha: 0.3 })
      .rect(-pw / 2 + 4, -ph / 2 + 8, 4, ph - 16).fill(char.color);
    const name = new Text({ text: char.name, style: { fontFamily: FONT_DISPLAY, fontWeight: '900', fontSize: 23, fill: PAL.ivory } });
    name.anchor.set(0, 0.5);
    name.position.set(-pw / 2 + 18, -12);
    this.stackText = new Text({ text: '0', style: { fontFamily: FONT_NUM, fontWeight: '700', fontSize: 21, fill: PAL.beige } });
    this.stackText.anchor.set(0, 0.5);
    this.stackText.position.set(-pw / 2 + 18, 14);
    this.plate.addChild(paper, name, this.stackText);
    this.plate.position.set(spot.plate.x, spot.plate.y);
    this.plate.rotation = spot.plateTilt;

    this.tag = new Text({ text: '', style: { fontFamily: FONT_DISPLAY, fontWeight: '900', fontSize: 21, fill: 0xffffff, stroke: { color: 0x1a1918, width: 5 } } });
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
    this.betText = new Text({ text: '', style: { fontFamily: FONT_NUM, fontWeight: '700', fontSize: 20, fill: PAL.paper, stroke: { color: 0x1a1918, width: 5 } } });
    this.betText.anchor.set(0, 0.5);
    this.betBox.position.set(spot.bet.x, spot.bet.y);
    this.betBox.visible = false;

    this.handLabel = new Text({ text: '', style: { fontFamily: FONT_DISPLAY, fontWeight: '900', fontSize: isHero ? 34 : 26, fill: PAL.paper, stroke: { color: 0x1a1918, width: 7 } } });
    this.handLabel.anchor.set(0.5);
    this.handLabel.position.set(isHero ? spot.cards.x + 100 : spot.cards.x, isHero ? spot.cards.y - 175 : spot.cards.y + 60);

    this.badge.position.set(spot.plate.x, spot.plate.y + 52);
    this.badge.visible = false;
    this.exprChip.position.set(this.head.x - spot.height * 0.2, this.head.y - spot.height * 0.3);
    this.caption.position.set(this.head.x, this.head.y + spot.height * 0.12);
    this.thinking = new Text({ text: '', style: { fontFamily: FONT_NUM, fontWeight: '700', fontSize: 21, fill: PAL.paper, stroke: { color: 0x1a1918, width: 5 } } });
    this.thinking.anchor.set(0.5);
    this.thinking.position.set(spot.plate.x, spot.plate.y - ph / 2 - 50);
    const toCenter = { x: 960 - this.head.x, y: 560 - this.head.y };
    const len = Math.hypot(toCenter.x, toCenter.y) || 1;
    this.stickerLayer.position.set(this.head.x + (toCenter.x / len) * spot.height * 0.32, this.head.y + (toCenter.y / len) * 40 - (isHero ? 120 : 0));
    this.outStamp.position.set(this.head.x, this.head.y + spot.height * 0.15);

    this.addChild(this.spotlight, this.avatar, this.outStamp, this.exprChip);
    this.handLabel.mask = this.handMask;
    this.handMask.rect(-400, -60, 800, 120).fill(0xffffff);
    this.handMask.position.copyFrom(this.handLabel.position);
    this.front.addChild(this.flames, this.plate, this.tag, this.betBox, ...this.cards, this.handLabel, this.badge, this.thinking, this.caption, this.bubble, this.stickerLayer, this.handMask);
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

  poseTexture(pose: Pose): Texture {
    return this.poses[pose] ?? this.poses.idle;
  }

  /** A portrait for cut-ins, anchored at her face (scale it by 1 / texture height). */
  portrait(pose: Pose = 'angry'): Sprite {
    const sp = new Sprite(this.poseTexture(pose));
    const [hx, hy] = this.art?.meta.head ?? [0.5, 0.39];
    sp.anchor.set(hx, hy);
    return sp;
  }

  /** The close-up cut-in art, if she has one. */
  get cutin(): { texture: Texture; eyes: [number, number] } | null {
    const a = this.art;
    return a?.cutin ? { texture: a.cutin, eyes: a.meta.cutinEyes ?? [0.5, 0.5] } : null;
  }

  /** Where her face is on screen, from the art's meta. */
  private artHead(): Point {
    const idle = this.poses.idle;
    const k = this.spot.height / idle.height;
    const [hx, hy] = this.art!.meta.head;
    return { x: this.spot.base.x + this.dir * (hx - 0.5) * idle.width * k, y: this.spot.base.y - this.spot.height * (1 - hy) };
  }

  setPose(pose: Pose) {
    const tex = this.poses[pose] ?? this.poses.idle;
    this.figure.texture = tex;
    const rim: Rim | null = this.art ? rimFor(tex, this.char.color) : null;
    this.rim.visible = this.halo.visible = !!rim;
    if (rim) {
      this.rim.texture = rim.rim;
      this.halo.texture = rim.halo;
    }
    this.blink.visible = false;
    const k = this.spot.height / tex.height;
    this.body.scale.set(k * this.dir, k);
  }

  /** Light on her: white is fully lit; darker tints for folded, dimmed and out. Real art is
   *  warmed to sit in the room, and its rim light follows how lit she is. */
  private shade(tint: number) {
    const lit = ((tint >> 16) & 255) / 255;
    this.figure.tint = this.art ? mulColor(tint, 0xf6ece2) : tint;
    this.blink.tint = this.figure.tint;
    this.rim.alpha = 0.85 * lit * lit;
    this.halo.alpha = 0.5 * lit * lit;
  }

  /** Back to the resting pose for the current expression. */
  restPose() {
    this.setPose(this.basePose);
  }

  tick(t: number) {
    // breathing, and with real art a slow sway from the waist and blinking
    const k = this.spot.height / this.figure.texture.height;
    const breath = Math.sin(t / 900 + this.seat);
    this.body.scale.set(k * this.dir * (1 - breath * 0.002), k * (1 + breath * 0.008));
    if (this.art) {
      this.body.rotation = Math.sin(t / 2300 + this.seat * 1.7) * 0.006;
      if (this.art.blink && this.figure.texture === this.poses.idle) {
        if (!this.nextBlink) this.nextBlink = t + Math.random() * 4000;
        if (t >= this.nextBlink) {
          this.blinkUntil = t + 130;
          this.nextBlink = t + 2500 + Math.random() * 3500;
        }
        this.blink.visible = t < this.blinkUntil;
      }
    }
    if (this.active) this.spotlight.alpha = 0.45 + 0.12 * Math.sin(t / 260);
    if (this.thinkStart) this.thinking.text = `思考中 ${((performance.now() - this.thinkStart) / 1000).toFixed(1)}s`;
    if (this.burning) this.drawFlames(t);
  }

  /** ALL IN: the name plate burns with a ring of fire until the hand ends. */
  setBurning(on: boolean) {
    this.burning = on;
    this.flames.clear();
  }

  private drawFlames(t: number) {
    const pw = (this.isHero ? 210 : 190) + 16, ph = 62 + 14;
    const { x, y } = this.spot.plate;
    const g = this.flames.clear();
    g.position.set(x, y);
    g.rotation = this.spot.plateTilt;
    const flick = 0.75 + 0.25 * Math.sin(t / 70 + this.seat) * Math.sin(t / 113);
    g.roundRect(-pw / 2 - 6, -ph / 2 - 6, pw + 12, ph + 12, 18).stroke({ width: 12, color: 0xff5a2f, alpha: 0.35 * flick });
    g.roundRect(-pw / 2, -ph / 2, pw, ph, 14).stroke({ width: 5, color: 0xffb347, alpha: 0.9 * flick });
    // tongues of flame along the top edge
    const n = 9;
    for (let i = 0; i < n; i++) {
      const fx = -pw / 2 + 10 + (i / (n - 1)) * (pw - 20);
      const h = 14 + 16 * (0.5 + 0.5 * Math.sin(t / 90 + i * 1.7 + this.seat * 3));
      g.moveTo(fx - 9, -ph / 2).quadraticCurveTo(fx - 4, -ph / 2 - h * 0.6, fx, -ph / 2 - h).quadraticCurveTo(fx + 4, -ph / 2 - h * 0.6, fx + 9, -ph / 2).closePath();
    }
    g.fill({ color: 0xff7a2f, alpha: 0.85 * flick });
  }

  /** M10: she folded to a bluff that was then shown. The plate cracks and she reacts. */
  fooled() {
    const pw = this.isHero ? 210 : 190, ph = 62;
    const crack = new Graphics();
    let x = -pw * 0.1, y = -ph / 2;
    crack.moveTo(x, y);
    for (let i = 1; i <= 6; i++) {
      x += (Math.random() - 0.4) * 22;
      y = -ph / 2 + (ph * i) / 6;
      crack.lineTo(x, y);
      if (i === 3) crack.moveTo(x, y).lineTo(x + 26, y - 10).moveTo(x, y);
    }
    crack.stroke({ width: 3, color: 0x1f1e1d, alpha: 0.85 });
    crack.label = 'crack';
    this.plate.addChild(crack);
    const x0 = this.plate.x;
    void animate(320, (p) => (this.plate.x = x0 + Math.sin(p * Math.PI * 8) * 7 * (1 - p)), ease.linear);
    if (!this.isHero) this.setPose(Math.random() < 0.5 ? 'angry' : 'shock');
    const t = new Text({ text: '被骗了！', style: { fontFamily: FONT_DISPLAY, fontWeight: '900', fontSize: 28, fill: 0xffffff, stroke: { color: 0x8a4632, width: 6 } } });
    t.anchor.set(0.5);
    t.position.set(this.spot.plate.x, this.spot.plate.y - 50);
    t.rotation = (Math.random() - 0.5) * 0.3;
    t.scale.set(0.3);
    this.front.addChild(t);
    void tween(t.scale, { x: 1, y: 1 }, 240, ease.outBack)
      .then(() => wait(1300))
      .then(() => tween(t, { alpha: 0, y: t.y - 20 }, 300))
      .then(() => t.destroy());
  }

  shakePlate() {
    const x0 = this.spot.plate.x;
    void animate(420, (p) => (this.plate.x = x0 + Math.sin(p * Math.PI * 10) * 9 * (1 - p)), ease.linear);
  }

  /** M14: the name plate catches fire and burns away. Resolves with where the ash should fly from. */
  async burnAway(): Promise<Point> {
    this.setBurning(true);
    await tween(this.plate.scale, { x: 1.06, y: 1.06 }, 200, ease.outBack);
    await wait(350);
    this.setBurning(false);
    const at = { ...this.spot.plate };
    void tween(this.plate.scale, { x: 0.6, y: 0.2 }, 260, ease.inCubic);
    await tween(this.plate, { alpha: 0 }, 260);
    for (const c of this.cards) c.visible = false;
    this.betBox.visible = false;
    return at;
  }

  /** Showdown spotlight: everyone but the player being shown drops into shadow. */
  dim(on: boolean) {
    this.dimmed = on;
    if (this.out) return;
    this.shade(on ? 0x6f5f66 : this.folded ? 0x8f8088 : 0xffffff);
  }

  /** 本局主役: the winner stands up in the victory pose (and sits back down). */
  async standUp(on: boolean) {
    if (on === this.standing) return;
    this.standing = on;
    if (on) {
      this.setPose('win');
      this.shade(0xffffff);
      await Promise.all([
        tween(this.avatar, { y: this.spot.base.y - this.spot.height * 0.12 }, 380, ease.outBack),
        tween(this.avatar.scale, { x: 1.1, y: 1.1 }, 380, ease.outBack),
      ]);
    } else {
      this.restPose();
      await Promise.all([tween(this.avatar, { y: this.spot.base.y }, 300), tween(this.avatar.scale, { x: 1, y: 1 }, 300)]);
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
    this.shade(on || this.isHero ? 0xffffff : this.dimmed ? 0x6f5f66 : this.folded ? 0x8f8088 : 0xeee2e0);
    void tween(this.avatar.scale, { x: on ? 1.03 : 1, y: on ? 1.03 : 1 }, 250);
  }

  setTag(text: string, color = 0xffffff) {
    this.tag.text = text;
    this.tag.style.fill = color;
  }

  markAllIn() {
    this.allIn = true;
    this.setTag('ALL IN', 0xd97757);
  }

  setFolded(folded: boolean) {
    this.folded = folded;
    this.shade(folded ? 0x8f8088 : 0xffffff);
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
    this.body.filters = [this.gray];
    this.shade(0x9a9098);
    this.avatar.alpha = 0.6;
    this.setTag(place, 0xbfb8e6);
    this.cards.forEach((c) => (c.visible = false));
    this.outStamp.removeChildren().forEach((c) => c.destroy());
    const t = new Text({ text: `OUT · ${place.replace(/[^0-9]/g, '')}`, style: { fontFamily: FONT_NUM, fontWeight: '900', fontSize: 40, fill: 0xd97757, stroke: { color: 0x1a1918, width: 8 } } });
    t.anchor.set(0.5);
    t.rotation = -0.2;
    this.outStamp.addChild(t);
    this.outStamp.scale.set(2.2);
    void tween(this.outStamp.scale, { x: 1, y: 1 }, 260, ease.inCubic);
  }

  newHand(stack: number) {
    this.setStack(stack);
    this.setBet(0);
    this.plate.getChildrenByLabel('crack').forEach((c) => c.destroy());
    this.setActive(false);
    this.folded = false;
    this.allIn = false;
    this.setBurning(false);
    this.dimmed = false;
    this.standing = false;
    this.avatar.scale.set(1);
    this.avatar.y = this.spot.base.y;
    this.stopThinking();
    if (this.expression !== Expression.Angry) this.setExpression(Expression.Calm);
    this.restPose();
    if (!this.out) {
      this.shade(0xffffff);
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
      // At showdown opponents' cards lift off the felt and turn to face you, much bigger.
      const lift = showdown && !this.isHero;
      if (lift) void tween(c, { y: this.spot.cards.y - 40, x: this.spot.cards.x + (i - 0.5) * OPP_CARD.w * 1.25 }, 260);
      if (c.code !== codes[i] || !c.faceUp) await c.flipTo(codes[i], 240, true, lift ? { x: 2.1, y: 2.1 } : undefined);
      else if (lift) await tween(c.scale, { x: 2.1, y: 2.1 }, 240, ease.outBack);
    }
  }

  highlightCards(best: string[] | undefined) {
    for (const c of this.cards) c.highlight(!!best && !!c.code && best.includes(c.code));
  }

  /** The hand's name under the cards; `brush` writes it in calligraphy, stroke by stroke. */
  showHand(text: string | null, brush = false) {
    this.handLabel.text = text ?? '';
    this.handLabel.style.fontFamily = brush ? FONT_BRUSH : FONT_DISPLAY;
    this.handLabel.style.fontWeight = brush ? 'normal' : '900';
    this.handLabel.style.fontSize = brush ? (this.isHero ? 52 : 40) : this.isHero ? 34 : 26;
    if (!brush || !text) {
      this.handMask.clear().rect(-400, -60, 800, 120).fill(0xffffff);
      this.handMask.pivot.x = 0;
      this.handMask.position.copyFrom(this.handLabel.position);
      this.handMask.scale.x = 1;
      return;
    }
    // wipe in from the left like a brush stroke
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
    const label = new Text({ text: `胜率 ${pct.toFixed(pct >= 99.95 || pct < 0.05 ? 0 : 1)}%`, style: { fontFamily: FONT_NUM, fontWeight: '700', fontSize: 21, fill: 0xffffff } });
    label.anchor.set(0.5);
    const bg = new Graphics().roundRect(-label.width / 2 - 14, -19, label.width + 28, 38, 6).fill(pct >= 50 ? 0x17574b : 0x8a4632).stroke({ width: 1.5, color: PAL.beige, alpha: 0.35 });
    this.badge.addChild(bg, label);
  }

  setExpression(e: Expression) {
    this.expression = e;
    this.basePose = e === Expression.Smug ? 'smug' : e === Expression.Nervous ? 'nervous' : e === Expression.Angry ? 'angry' : 'idle';
    this.restPose();
    this.exprChip.removeChildren().forEach((c) => c.destroy());
    if (e === Expression.Calm) return;
    const label = new Text({ text: EXPRESSION_LABEL[e], style: { fontFamily: FONT_DISPLAY, fontWeight: '900', fontSize: 20, fill: 0xffffff } });
    label.position.set(12, 5);
    const bg = new Graphics().roundRect(0, 0, label.width + 24, 34, 6).fill({ color: 0x262624, alpha: 0.9 }).stroke({ width: 2, color: EXPRESSION_COLOR[e] });
    this.exprChip.addChild(bg, label);
    this.exprChip.scale.set(1.4);
    void tween(this.exprChip.scale, { x: 1, y: 1 }, 220, ease.outBack);
  }

  showCaption(text: string) {
    this.caption.removeChildren().forEach((c) => c.destroy());
    const label = new Text({ text, style: { fontFamily: FONT, fontSize: 20, fontWeight: '700', fill: 0xffffff } });
    label.anchor.set(0.5);
    const bg = new Graphics().roundRect(-label.width / 2 - 14, -18, label.width + 28, 36, 6).fill({ color: 0x1a1918, alpha: 0.85 }).stroke({ width: 1.5, color: PAL.beige, alpha: 0.6 });
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
    const label = new Text({ text: toName ? `→${toName}  ${text}` : text, style: { fontFamily: FONT, fontSize: 24, fontWeight: '700', fill: PAL.ivory, wordWrap: true, wordWrapWidth: 300, breakWords: true } });
    const pw = label.width + 32, ph = label.height + 20;
    const ax = this.isHero ? this.head.x + 90 : this.head.x;
    const top = this.isHero ? this.head.y - 230 : this.head.y - this.spot.height * 0.42 - ph;
    const left = Math.min(Math.max(ax - pw / 2, 40), 1880 - pw);
    const bg = new Graphics()
      .roundRect(4, 6, pw, ph, 10).fill({ color: 0x000000, alpha: 0.4 })
      .poly([ax - left - 12, ph - 2, ax - left + 12, ph - 2, ax - left, ph + 18]).fill({ color: 0x262624, alpha: 0.95 })
      .roundRect(0, 0, pw, ph, 10).fill({ color: 0x262624, alpha: 0.95 }).stroke({ width: 2.5, color: this.char.color });
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
