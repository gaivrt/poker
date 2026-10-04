// The first-person table (docs/07 §4, docs/08 §1): layered scene, board, pot and
// the everyday moments M1–M4 (deal + squeeze, flop fan, turn/river suspense,
// weighted bets). Big moments live in fx/ and director.ts.
import { ColorMatrixFilter, Container, Graphics, Sprite, Text, Texture } from 'pixi.js';
import { sfx } from '../audio/sfx';
import type { Character } from '../characters';
import type { Camera } from '../fx/camera';
import type { Particles } from '../fx/particles';
import type { Post } from '../fx/post';
import { CardSprite } from '../table/CardSprite';
import { BOARD_CARD, BOARD_X, BOARD_Y, FONT_DISPLAY, FONT_NUM, POT_POS, type Point, SHOE, SPOTS, fmt } from '../table/layout';
import { animate, ease, tween, wait } from '../tween';
import { PAL, paintBeam, paintForeground, paintTable, type Pose } from './painter';
import { Seat, chipStack } from './Seat';

export interface StageDeps {
  camera: Camera;
  post: Post;
  particles: Particles;
  /** Full-screen layer outside the camera (banners, stamps, cut-ins). */
  screen: Container;
}

export class TableStage extends Container {
  readonly seats: Seat[] = [];
  readonly board: CardSprite[] = [];
  readonly background = new Container();
  readonly fxLayer = new Container();
  private chars = new Container();
  private tableLayer = new Container();
  private boardLayer = new Container();
  private heroLayer = new Container();
  private frontLayer = new Container();
  private foreground: Sprite;
  private potBox = new Container();
  private potText: Text;
  private potChips = new Container();
  private dealer = new Container();
  private banner = new Container();
  private squeeze: { codes: string[]; done: boolean; p: number; holding: boolean } | null = null;
  private squeezeHint: Text;
  pot = 0;
  unit = 20;

  constructor(
    cast: Character[],
    poses: Record<Pose, Texture>[],
    bg: Texture,
    private deps: StageDeps,
  ) {
    super();
    const bgSprite = new Sprite(bg);
    bgSprite.width = 1920 + 80;
    bgSprite.height = 1080 + 50;
    bgSprite.position.set(-40, -25);
    // a cone of warm light falling on the table, in front of the room and behind the players
    const beam = new Sprite(paintBeamTexture());
    beam.blendMode = 'add';
    this.background.addChild(bgSprite, beam);
    this.tableLayer.addChild(new Sprite(paintTableTexture()));

    // Opponents sit behind the table (far ones first so near ones overlap them).
    const order = [3, 2, 4, 1, 5];
    for (let i = 0; i < 6; i++) this.seats.push(new Seat(i, cast[i], SPOTS[i], poses[i], i === 0));
    for (const i of order) {
      this.chars.addChild(this.seats[i]);
      this.frontLayer.addChild(this.seats[i].front);
    }

    BOARD_X.forEach((bx) => {
      const c = new CardSprite(BOARD_CARD.w, BOARD_CARD.h);
      c.position.set(bx, BOARD_Y);
      c.scale.set(1, 0.9);
      c.visible = false;
      this.board.push(c);
    });

    const potBg = new Graphics()
      .roundRect(-120, -24, 240, 48, 6).fill({ color: 0x1a1918, alpha: 0.82 })
      .roundRect(-120, -24, 240, 48, 6).stroke({ width: 1.5, color: PAL.beige, alpha: 0.35 });
    this.potText = new Text({ text: '', style: { fontFamily: FONT_NUM, fontWeight: '700', fontSize: 24, fill: PAL.paper, letterSpacing: 1 } });
    this.potText.anchor.set(0.5);
    this.potBox.addChild(potBg, this.potText);
    this.potBox.position.set(POT_POS.x, POT_POS.y);
    this.potChips.position.set(POT_POS.x - 175, POT_POS.y + 8);

    const btn = new Graphics()
      .ellipse(3, 5, 23, 15).fill({ color: 0x000000, alpha: 0.4 })
      .circle(0, 0, 22).fill(PAL.ivory).stroke({ width: 3, color: PAL.beige })
      .circle(0, 0, 16).stroke({ width: 1, color: PAL.muted, alpha: 0.7 });
    const d = new Text({ text: 'D', style: { fontFamily: FONT_NUM, fontWeight: '900', fontSize: 20, fill: 0x2b2a27 } });
    d.anchor.set(0.5);
    this.dealer.addChild(btn, d);
    this.dealer.visible = false;

    this.squeezeHint = new Text({ text: '按住手牌眯牌', style: { fontFamily: FONT_DISPLAY, fontWeight: '900', fontSize: 24, fill: PAL.paper, stroke: { color: 0x1a1918, width: 6 } } });
    this.squeezeHint.anchor.set(0.5);
    this.squeezeHint.position.set(SPOTS[0].cards.x + 100, SPOTS[0].cards.y - 170);
    this.squeezeHint.visible = false;

    this.foreground = new Sprite(paintForegroundTexture());
    this.foreground.alpha = 0;

    // Your own character and cards are in the foreground.
    const hero = this.seats[0];
    this.heroLayer.addChild(hero, hero.front);
    this.boardLayer.addChild(...this.board, this.potChips, this.potBox, this.dealer);
    this.addChild(this.background, this.chars, this.tableLayer, this.boardLayer, this.frontLayer, this.fxLayer, this.heroLayer, this.squeezeHint, this.foreground);
    deps.screen.addChild(this.banner);
    this.setupSqueeze();
    this.refreshPot();
  }

  // ---------------- basics ----------------

  tick(t: number) {
    this.seats.forEach((s) => s.tick(t));
    if (this.squeezeHint.visible) this.squeezeHint.alpha = 0.6 + 0.4 * Math.sin(t / 200);
  }

  totalPot() {
    return this.pot + this.seats.reduce((a, s) => a + s.bet, 0);
  }

  refreshPot() {
    const total = this.totalPot();
    this.potBox.visible = total > 0;
    this.potText.text = `底池 ${fmt(total)}`;
    this.potChips.removeChildren().forEach((c) => c.destroy({ children: true }));
    if (this.pot > 0) this.potChips.addChild(chipStack(this.pot, this.unit, 1.1));
  }

  newHand(stacks: number[], button: number, bb: number) {
    this.unit = bb;
    this.pot = 0;
    this.board.forEach((c) => {
      c.visible = false;
      c.alpha = 1;
      c.highlight(false);
      c.set(null);
    });
    this.seats.forEach((s, i) => {
      s.setUnit(bb);
      s.newHand(stacks[i]);
    });
    this.hideBanner();
    this.squeeze = null;
    this.squeezeHint.visible = false;
    const target = SPOTS[button].dealer;
    if (!this.dealer.visible) {
      this.dealer.position.set(target.x, target.y);
      this.dealer.visible = true;
    } else {
      void tween(this.dealer.position, target, 450, ease.inOutCubic);
    }
    this.refreshPot();
  }

  // ---------------- M1: deal + squeeze ----------------

  async dealHoleBacks(order: number[]) {
    for (let round = 0; round < 2; round++)
      for (const s of order) {
        sfx.play('deal', 0.7);
        void this.seats[s].dealBack(round, SHOE);
        await wait(70);
      }
    await wait(320);
  }

  private setupSqueeze() {
    const hero = this.seats[0];
    for (const c of hero.cards) {
      c.eventMode = 'static';
      c.cursor = 'grab';
      c.on('pointerdown', () => {
        if (this.squeeze && !this.squeeze.done) this.squeeze.holding = true;
      });
    }
    const release = () => {
      if (this.squeeze?.holding) void this.revealHeroNow();
    };
    window.addEventListener('pointerup', release);
    // While held, the cards peel open from the corner.
    const step = () => {
      const sq = this.squeeze;
      if (sq && !sq.done && sq.holding) {
        sq.p = Math.min(1, sq.p + 0.012);
        hero.cards.forEach((c, i) => c.peel(sq.codes[i], sq.p * (i === 0 ? 1 : 0.85)));
        hero.cards.forEach((c) => (c.y = SPOTS[0].cards.y - 18 * sq.p));
        if (sq.p >= 1) void this.revealHeroNow();
      }
      requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  /** Your cards arrive face down; hold them to squeeze, or they turn over by themselves. */
  startSqueeze(codes: string[], autoMs = 1400) {
    this.squeeze = { codes, done: false, p: 0, holding: false };
    this.squeezeHint.visible = true;
    void wait(autoMs).then(() => {
      if (this.squeeze && !this.squeeze.done && !this.squeeze.holding) void this.revealHeroNow();
    });
  }

  async revealHeroNow() {
    const sq = this.squeeze;
    if (!sq || sq.done) return;
    sq.done = true;
    this.squeezeHint.visible = false;
    const hero = this.seats[0];
    await Promise.all(
      hero.cards.map(async (c, i) => {
        await wait(i * 90);
        sfx.play('flip');
        await c.flipTo(sq.codes[i], 220);
        void tween(c, { y: SPOTS[0].cards.y + i * 6 }, 200);
      }),
    );
  }

  // ---------------- M2/M3: board ----------------

  /** Flop slides out stacked and fans open; turn and river slide out alone.
   *  `big`: a big pot — hold before the flip with a heartbeat. `dramatic`: all-in runout. */
  async revealBoard(cards: string[], dramatic: boolean, big = false) {
    const start = this.board.findIndex((c) => !c.visible);
    const slots = cards.map((_, i) => this.board[start + i]);
    const targets = slots.map((_, i) => ({ x: BOARD_X[start + i], y: BOARD_Y }));
    // slide out from the shoe, stacked on the first slot
    slots.forEach((c) => {
      c.set(null);
      c.position.set(SHOE.x, SHOE.y);
      c.scale.set(0.5, 0.45);
      c.alpha = 0;
      c.visible = true;
    });
    sfx.play('slide', 0.8);
    await Promise.all(
      slots.map((c, i) =>
        Promise.all([
          tween(c.position, { x: targets[0].x + i * 4, y: targets[0].y - i * 3 }, 260, ease.outCubic),
          tween(c.scale, { x: 1, y: 0.9 }, 260, ease.outCubic),
          tween(c, { alpha: 1 }, 120),
        ]),
      ),
    );
    if (slots.length > 1) {
      // fan open
      await Promise.all(slots.map((c, i) => tween(c.position, targets[i], 240 + i * 40, ease.outBack)));
    }
    if (big || dramatic) {
      // suspense: hold, tighten the frame, heartbeat
      sfx.play('heartbeat', 0.9);
      void this.deps.post.tighten(0.8, 250);
      await wait(dramatic ? 650 : 380);
    }
    for (let i = 0; i < slots.length; i++) {
      sfx.play('flip');
      await slots[i].flipTo(cards[i], dramatic ? 520 : 260);
      if (slots.length > 1) await wait(70);
    }
    if (big || dramatic) void this.deps.post.tighten(0, 400);
  }

  /** The winning five rise off the felt and glow; the rest of the board sinks into shadow. */
  highlightBoard(best: string[] | undefined) {
    this.board.forEach((c, i) => {
      if (!c.visible) return;
      const on = !!best && !!c.code && best.includes(c.code);
      c.highlight(on);
      c.alpha = best && !on ? 0.45 : 1;
      void tween(c, { y: BOARD_Y - (on ? 16 : 0) }, 260, ease.outBack);
      if (on) void wait(i * 60).then(() => c.shine(0xe4dbcd, 420));
    });
  }

  /** M7: the river arrives face down and is squeezed open from the corner, slowly. */
  async squeezeRiver(code: string, ms = 1600) {
    const c = this.board[4];
    c.set(null);
    c.position.set(SHOE.x, SHOE.y);
    c.scale.set(0.5, 0.45);
    c.alpha = 0;
    c.visible = true;
    sfx.play('slide', 0.8);
    await Promise.all([
      tween(c.position, { x: BOARD_X[4], y: BOARD_Y }, 300, ease.outCubic),
      tween(c.scale, { x: 1, y: 0.9 }, 300, ease.outCubic),
      tween(c, { alpha: 1 }, 120),
    ]);
    await animate(ms, (p) => {
      c.peel(code, p * 0.82);
      c.y = BOARD_Y - 12 * p;
    }, ease.inCubic);
    c.set(code);
    c.y = BOARD_Y;
    sfx.play('flip');
    void c.shine(0xe4dbcd, 420);
  }

  /** Face-up card sprites (board and hands) showing any of `codes`. */
  cardSprites(codes: string[], seat = -1): CardSprite[] {
    const pool = [...this.board, ...(seat >= 0 ? this.seats[seat].cards : this.seats.flatMap((s) => s.cards))];
    return codes.map((code) => pool.find((c) => c.visible && c.code === code)).filter((c): c is CardSprite => !!c);
  }

  private gray: ColorMatrixFilter | null = null;

  /** Drain the colour from everything but one player (null: colour back). */
  drain(keep: number | null) {
    if (!this.gray) {
      this.gray = new ColorMatrixFilter();
      this.gray.desaturate();
    }
    const f = keep === null ? [] : [this.gray];
    for (const layer of [this.background, this.tableLayer, this.boardLayer]) layer.filters = f;
    for (const s of this.seats) {
      const ff = s.seat === keep ? [] : f;
      s.filters = ff;
      s.front.filters = ff;
    }
  }

  /** Showdown spotlight on one seat (null: lights back up for everyone). */
  focusSeat(seat: number | null) {
    this.seats.forEach((s) => {
      s.dim(seat !== null && s.seat !== seat && !s.isHero);
      s.setActive(s.seat === seat);
    });
  }

  // ---------------- M4: bets ----------------

  /** A chip token flying between two points. */
  flyChip(from: Point, to: Point, ms = 320) {
    return this.arc(from, to, ms);
  }

  /** Chips go in. Heavy bets (≥ the pot, or all-in) slam down. */
  async bet(seat: number, amount: number, total: number, heavy: boolean) {
    const s = this.seats[seat];
    s.setStack(s.stack - amount);
    if (!heavy) {
      sfx.play('chip');
      await this.arc(s.anchor, s.betPos, 280);
      s.setBet(total);
    } else {
      // drop from above and slam
      sfx.play('whoosh', 0.6);
      const st = chipStack(total, this.unit, 1.25);
      st.position.set(s.betPos.x, s.betPos.y - 220);
      st.alpha = 0;
      this.fxLayer.addChild(st);
      await Promise.all([tween(st, { alpha: 1 }, 80), tween(st.position, { y: s.betPos.y }, 220, ease.inCubic)]);
      st.destroy({ children: true });
      s.setBet(total);
      sfx.play('thud');
      this.deps.particles.dustRing(s.betPos.x, s.betPos.y);
      this.deps.camera.shake(9, 260);
    }
    this.refreshPot();
  }

  private async arc(from: Point, to: Point, ms: number) {
    const chip = new Sprite(this.deps.particles.chipTex[0]);
    chip.anchor.set(0.5);
    chip.scale.set(0.42);
    this.fxLayer.addChild(chip);
    await animate(ms, (t) => {
      chip.position.set(from.x + (to.x - from.x) * t, from.y + (to.y - from.y) * t - Math.sin(t * Math.PI) * 60);
      chip.scale.y = 0.42 * Math.cos(t * 12); // tumbling
    }, ease.inOutCubic);
    chip.destroy();
  }

  /** End of a betting round: every bet slides into the pot. */
  async gatherBets() {
    const moving = this.seats.filter((s) => s.bet > 0);
    if (!moving.length) return;
    sfx.play('slide');
    await Promise.all(moving.map((s) => this.arc(s.betPos, POT_POS, 300)));
    for (const s of moving) {
      this.pot += s.bet;
      s.setBet(0);
    }
    this.refreshPot();
  }

  async payOut(seat: number, amount: number) {
    const s = this.seats[seat];
    this.pot = Math.max(0, this.pot - amount);
    this.refreshPot();
    const n = Math.min(8, 2 + Math.floor(Math.log2(Math.max(1, amount / this.unit))));
    for (let i = 0; i < n; i++) {
      void this.arc(POT_POS, s.anchor, 420);
      if (i % 2 === 0) sfx.play('chip', 0.6);
      await wait(45);
    }
    await wait(380);
    s.setStack(s.stack + amount);
  }

  // ---------------- framing ----------------

  /** Dark spectators fade in at the bottom corners for big moments. */
  frame(on: boolean, ms = 300) {
    return tween(this.foreground, { alpha: on ? 1 : 0 }, ms);
  }

  showBanner(text: string, sub = '') {
    this.hideBanner();
    const t = new Text({ text, style: { fontFamily: FONT_DISPLAY, fontWeight: '900', fontSize: 40, fill: PAL.ivory } });
    t.anchor.set(0.5);
    const lines: Text[] = [t];
    if (sub) {
      const s = new Text({ text: sub, style: { fontFamily: FONT_DISPLAY, fontWeight: '900', fontSize: 28, fill: PAL.paper } });
      s.anchor.set(0.5);
      s.y = 46;
      lines.push(s);
    }
    const w = Math.max(...lines.map((l) => l.width)) + 80;
    const h = sub ? 118 : 74;
    const bg = new Graphics()
      .roundRect(-w / 2 + 4, -38 + 8, w, h, 8).fill({ color: 0x000000, alpha: 0.45 })
      .roundRect(-w / 2, -38, w, h, 8).fill({ color: 0x262624, alpha: 0.92 })
      .roundRect(-w / 2, -38, w, h, 8).stroke({ width: 1.5, color: PAL.beige, alpha: 0.35 });
    this.banner.addChild(bg, ...lines);
    this.banner.position.set(960, 470);
    this.banner.rotation = 0;
    this.banner.alpha = 0;
    this.banner.scale.set(1.3);
    void tween(this.banner, { alpha: 1 }, 150);
    void tween(this.banner.scale, { x: 1, y: 1 }, 260, ease.outBack);
  }

  hideBanner() {
    this.banner.removeChildren().forEach((c) => c.destroy());
  }

  /** A dashed sight line from one player to another (the "stare" gesture). */
  async stare(from: number, to: number) {
    const a = this.seats[from].head;
    const b = this.seats[to].head;
    const g = new Graphics();
    const n = 16;
    for (let i = 0; i < n; i += 2) {
      const t0 = i / n, t1 = (i + 1) / n;
      g.moveTo(a.x + (b.x - a.x) * t0, a.y + (b.y - a.y) * t0).lineTo(a.x + (b.x - a.x) * t1, a.y + (b.y - a.y) * t1);
    }
    g.stroke({ width: 6, color: this.seats[from].char.color, alpha: 0.9 });
    g.alpha = 0;
    this.fxLayer.addChild(g);
    await tween(g, { alpha: 1 }, 150);
    await wait(1300);
    await tween(g, { alpha: 0 }, 300);
    g.destroy();
  }
}

// Painted once and shared.
let tableTex: Texture | null = null;
let fgTex: Texture | null = null;
function paintTableTexture(): Texture {
  tableTex ??= Texture.from(paintTable(1920, 1080));
  return tableTex;
}
let beamTex: Texture | null = null;
function paintBeamTexture(): Texture {
  beamTex ??= Texture.from(paintBeam(1920, 1080, 960, -40, 760, 760));
  return beamTex;
}
function paintForegroundTexture(): Texture {
  fgTex ??= Texture.from(paintForeground(1920, 1080));
  return fgTex;
}
