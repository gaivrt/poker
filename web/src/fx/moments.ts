// The big presentation moments of docs/08 §4: M5 ALL IN, M6 VS with equity bars,
// M7 slow river, M8 showdown open, M9 big hands (+ cooler), M13 本局主役.
//
// Every moment can be skipped (tap the table or press Space: the rest plays
// instantly), and the second time a kind of moment plays its holds are shorter.
// Moments are only triggered by public events, so they never give anything away.
import { Container, Graphics, Sprite, Text, type Texture } from 'pixi.js';
import { music } from '../audio/music';
import { sfx } from '../audio/sfx';
import type { TableStage } from '../stage/TableStage';
import { CourtCard, cardBack } from '../stage/court';
import { PAL, type Pose } from '../stage/painter';
import { CardSprite } from '../table/CardSprite';
import { BOARD_X, BOARD_Y, FONT, FONT_DISPLAY, FONT_NUM, POT_POS, type Point, fmt } from '../table/layout';
import { animate, ease, timing, tween, wait } from '../tween';
import type { Camera } from './camera';
import { stamp } from './kinetic';
import type { Particles } from './particles';
import type { Post } from './post';

export interface MomentDeps {
  stage: TableStage;
  camera: Camera;
  post: Post;
  particles: Particles;
  /** Full-screen layer outside the camera. */
  screen: Container;
}

export interface Equity {
  seat: number;
  pct: number;
}

/** How often each kind of moment has played this session (the first is the full cut). */
const played = new Map<string, number>();

const CARD_W = 150;
const CARD_H = 210;

export class Moments {
  private skipped = false;
  private instant = false;
  private spent = 0; // ms of big moments already played this hand

  /** A new hand: the presentation budget starts over. */
  newHand() {
    this.spent = 0;
  }

  constructor(private d: MomentDeps) {}

  /** Spectating straight to the results: leave everything instant from now on. */
  forceInstant() {
    this.instant = true;
  }

  // ---------------- plumbing ----------------

  /** Runs a moment; k scales its holds (1 the first time, shorter afterwards). */
  private async run(kind: string, body: (k: number) => Promise<void>, canSkip = true) {
    const n = played.get(kind) ?? 0;
    played.set(kind, n + 1);
    const before = timing.scale;
    this.skipped = false;
    const skip = () => {
      if (!canSkip || this.skipped) return;
      this.skipped = true;
      timing.scale = 0;
    };
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement | null;
      if (!t?.closest?.('button, input, .modal')) skip();
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Escape') skip();
    };
    window.addEventListener('pointerdown', onDown);
    window.addEventListener('keydown', onKey);
    music.duck(true);
    // Busy hands get shorter holds once ~6 s of moments have played.
    const k = (n === 0 ? 1 : 0.6) * (this.spent > 6000 ? 0.5 : 1);
    const t0 = performance.now();
    try {
      await body(k);
    } finally {
      this.spent += performance.now() - t0;
      music.duck(false);
      window.removeEventListener('pointerdown', onDown);
      window.removeEventListener('keydown', onKey);
      if (this.skipped && !this.instant) timing.scale = before;
      this.skipped = false;
    }
  }

  /** A pause that ends early when the moment is skipped. */
  private async hold(ms: number) {
    const end = performance.now() + ms * timing.scale;
    while (performance.now() < end && timing.scale > 0) await new Promise((r) => setTimeout(r, 25));
  }

  private layer() {
    const c = new Container();
    this.d.screen.addChild(c);
    return c;
  }

  /** World (table) point → screen-layer point, wherever the camera is. */
  private toScreen(p: Point): Point {
    return this.d.screen.toLocal(this.d.stage.toGlobal(p));
  }

  /** Screen-layer point → world point (particles live in the world). */
  private toWorld(p: Point): Point {
    return this.d.stage.toLocal(this.d.screen.toGlobal(p));
  }

  private shade(alpha: number, color = 0x0a0910) {
    const g = new Graphics().rect(-40, -40, 2000, 1160).fill(color);
    g.alpha = 0;
    void tween(g, { alpha }, 160);
    return g;
  }

  /** A copy of a card on the screen layer, starting where `from` is on the table. */
  private cloneCard(code: string, from: CardSprite | undefined, layer: Container) {
    const c = new CardSprite(CARD_W, CARD_H);
    c.set(code);
    if (from) {
      const p = this.d.screen.toLocal(from.getGlobalPosition());
      c.position.set(p.x, p.y);
      const k = (from.w * Math.abs(from.worldTransform.a)) / (CARD_W * Math.abs(this.d.screen.worldTransform.a));
      c.scale.set(k);
      c.rotation = from.rotation;
    } else {
      c.position.set(960, -200);
      c.scale.set(0.6);
    }
    layer.addChild(c);
    return c;
  }

  /** The full-screen card back the big moments play on: cobalt lattice inside ivory rules. */
  private backdrop(): Container {
    const c = new Container();
    const g = new Graphics().rect(-40, -40, 2000, 1160).fill(PAL.cobalt);
    const lattice = new Graphics();
    for (let x = -1160; x < 2000; x += 26) {
      lattice.moveTo(x, -40).lineTo(x + 1160, 1120);
      lattice.moveTo(x, 1120).lineTo(x + 1160, -40);
    }
    lattice.stroke({ width: 1, color: PAL.ivory, alpha: 0.12 });
    const frame = new Graphics()
      .roundRect(36, 36, 1848, 1008, 36).stroke({ width: 3, color: PAL.ivory, alpha: 0.7 })
      .roundRect(50, 50, 1820, 980, 26).stroke({ width: 1, color: PAL.ivory, alpha: 0.45 });
    c.addChild(g, lattice, frame);
    return c;
  }

  /** A court card of this seat's character, with a soft shadow, centred. */
  private courtOf(seat: number, w: number, pose: Pose = 'angry', mirrored = true): Container {
    const s = this.d.stage.seats[seat];
    const h = w * 1.4;
    const c = new Container();
    const shadow = new Graphics().roundRect(-w / 2 + 16, -h / 2 + 34, w, h, w * 0.075).fill({ color: 0x000000, alpha: 0.4 });
    c.addChild(shadow, new CourtCard({ w, h, court: s.char.court, texture: s.poseTexture(pose), mirrored }));
    return c;
  }

  /** A poker chip with a word on it (VS, 混战). */
  private chip(r: number, word: string, size: number): Container {
    const c = new Container();
    const g = new Graphics().circle(6, 14, r).fill({ color: 0x000000, alpha: 0.4 }).circle(0, 0, r).fill(PAL.ivory);
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      g.poly([
        Math.cos(a - 0.12) * r, Math.sin(a - 0.12) * r, Math.cos(a + 0.12) * r, Math.sin(a + 0.12) * r,
        Math.cos(a + 0.14) * r * 0.8, Math.sin(a + 0.14) * r * 0.8, Math.cos(a - 0.14) * r * 0.8, Math.sin(a - 0.14) * r * 0.8,
      ]).fill(PAL.red);
    }
    g.circle(0, 0, r * 0.68).fill(PAL.ink).stroke({ width: 3, color: PAL.ivory });
    const t = new Text({ text: word, style: { fontFamily: /[A-Z]/.test(word) ? FONT_NUM : FONT, fontWeight: /[A-Z]/.test(word) ? 'normal' : '900', fontSize: size, fill: PAL.ivory } });
    t.anchor.set(0.5);
    c.addChild(g, t);
    return c;
  }

  private bigWord(text: string, size: number, fill: number = PAL.ivory, stroke: number = PAL.ink, font = FONT_DISPLAY) {
    const t = new Text({
      text,
      style: {
        fontFamily: font, fontWeight: font === FONT_NUM ? 'normal' : '900', fontSize: size, fill, stroke: { color: stroke, width: Math.round(size / 9) }, letterSpacing: 4,
        dropShadow: { color: 0x000000, alpha: 0.5, distance: 8, angle: Math.PI / 2, blur: 10 },
      },
    });
    t.anchor.set(0.5);
    return t;
  }

  /** Impact frame: flash, ripple, shake and a low hit, all at once. */
  private impact(at: Point, strength = 1) {
    void this.d.post.flash(0.55 * strength, 240);
    void this.d.post.impact(at.x, at.y, 600);
    this.d.camera.shake(14 * strength, 360);
    sfx.play('impact', strength);
  }

  /** A word stamped on the screen with a flash; the whole of "simple" mode's big moments. */
  quick(text: string, color: number = PAL.ivory) {
    return this.run(`quick:${text}`, async (k) => {
      void this.d.post.flash(0.45, 200);
      this.d.camera.shake(8, 250);
      sfx.play('impact', 0.6);
      await stamp(this.d.screen, text, 960, 470, { size: 130, color, hold: 380 * k });
    });
  }

  // ---------------- M5 ALL IN ----------------

  allIn(seat: number, line: string) {
    return this.run('allin', async (k) => {
      const s = this.d.stage.seats[seat];
      const c = s.char;
      const root = this.layer();
      try {
        // the screen turns into a card back, and she is dealt onto it as a court card
        const bd = this.backdrop();
        bd.alpha = 0;
        root.addChild(bd);
        void tween(bd, { alpha: 1 }, 120);
        sfx.play('riser', 0.6);
        const card = this.courtOf(seat, 600);
        card.position.set(2400, 380);
        card.rotation = 0.9;
        root.addChild(card);
        sfx.play('whoosh', 0.8);
        await Promise.all([tween(card.position, { x: 560, y: 560 }, 280, ease.outCubic), tween(card, { rotation: -0.09 }, 280, ease.outBack)]);

        // ALL IN. slides in beside her
        const title = new Text({ text: 'ALL\nIN.', style: { fontFamily: FONT_NUM, fontSize: 230, lineHeight: 200, fill: PAL.ivory, letterSpacing: -4 } });
        title.position.set(2000, 120);
        const amount = new Text({ text: `全部押上  ${fmt(s.bet + s.stack)}`, style: { fontFamily: FONT_DISPLAY, fontWeight: '900', fontSize: 52, fill: PAL.ivory } });
        amount.position.set(1100, 560);
        amount.alpha = 0;
        root.addChild(title, amount);
        await tween(title, { x: 1080 }, 170, ease.inCubic);
        this.impact({ x: 1300, y: 330 }, 0.9);
        void tween(amount, { alpha: 1 }, 160);

        // her line, on an ivory card
        const say = new Text({ text: `「${line}」`, style: { fontFamily: FONT, fontSize: 36, fontWeight: '900', fill: PAL.ink, wordWrap: true, wordWrapWidth: 700, breakWords: true } });
        const who = new Text({ text: `${c.court} ${c.name}`, style: { fontFamily: FONT, fontSize: 18, fontWeight: '700', fill: PAL.cobalt } });
        const pw = Math.max(say.width, who.width) + 64, ph = say.height + who.height + 50;
        const bubble = new Container();
        bubble.addChild(new Graphics().roundRect(8, 16, pw, ph, 20).fill({ color: 0x000000, alpha: 0.35 }).roundRect(0, 0, pw, ph, 20).fill(PAL.ivory), say, who);
        say.position.set(28, 20);
        who.position.set(32, 26 + say.height);
        bubble.position.set(1100, 700);
        bubble.alpha = 0;
        root.addChild(bubble);
        void tween(bubble, { alpha: 1, y: 690 }, 180);
        await this.hold(620 * k);

        // out: the card is swept off and the back fades
        await Promise.all([
          tween(card.position, { x: -500 }, 220, ease.inCubic),
          tween(card, { rotation: -0.6 }, 220),
          tween(title, { alpha: 0 }, 200),
          tween(amount, { alpha: 0 }, 160),
          tween(bubble, { alpha: 0 }, 160),
          tween(bd, { alpha: 0 }, 240),
        ]);
      } finally {
        root.destroy({ children: true });
      }
    });
  }

  /** A second all-in in the same hand: a stamp on her plate instead of the full band. */
  allInSmall(seat: number) {
    const s = this.d.stage.seats[seat];
    const at = this.toScreen({ x: s.spot.plate.x, y: s.spot.plate.y - 70 });
    sfx.play('thud', 0.8);
    this.d.camera.shake(6, 200);
    return stamp(this.d.screen, 'ALL IN', at.x, at.y, { font: FONT_NUM, size: 64, color: PAL.ivory, stroke: PAL.red, hold: 280 });
  }

  // ---------------- M6 VS ----------------

  /** The face-off when the all-in is called: portraits slam in, lightning, "VS", then
   *  everyone's cards flip at once and the equity bars come up. */
  async versus(entries: { seat: number; cards: string[] }[], equity: Equity[], full: boolean): Promise<EquityBars> {
    const st = this.d.stage;
    // you on the left when you are in it
    const order = [...entries].sort((a, b) => (a.seat === 0 ? -1 : b.seat === 0 ? 1 : a.seat - b.seat));
    if (full) await this.run(order.length === 2 ? 'vs' : 'melee', (k) => (order.length === 2 ? this.vsDuel(order[0].seat, order[1].seat, k) : this.vsMelee(order.map((o) => o.seat), k)));
    else await this.quick(order.length === 2 ? 'VS' : '混战');
    sfx.play('flip');
    await Promise.all(order.map((o) => st.seats[o.seat].reveal(o.cards, true)));
    const bars = new EquityBars(this.d.screen, this.d.particles, order.map((o) => ({ seat: o.seat, name: st.seats[o.seat].char.name, color: st.seats[o.seat].char.color })));
    bars.set(equity);
    return bars;
  }

  private async vsDuel(a: number, b: number, k: number) {
    const st = this.d.stage;
    const root = this.layer();
    try {
      const bd = this.backdrop();
      bd.alpha = 0;
      root.addChild(bd);
      void tween(bd, { alpha: 1 }, 140);
      // two court cards, dealt from either side, tilted toward each other
      const L = this.courtOf(a, 470);
      const R = this.courtOf(b, 470);
      L.position.set(-400, 560);
      L.rotation = -0.6;
      R.position.set(2320, 560);
      R.rotation = 0.6;
      root.addChild(L, R);
      sfx.play('whoosh', 0.9);
      await Promise.all([
        tween(L.position, { x: 470 }, 260, ease.outCubic), tween(L, { rotation: -0.14 }, 260, ease.outBack),
        tween(R.position, { x: 1450 }, 260, ease.outCubic), tween(R, { rotation: 0.14 }, 260, ease.outBack),
      ]);
      const names = [a, b].map((seat, i) => {
        const n = this.bigWord(st.seats[seat].char.name, 64);
        n.position.set(i ? 1150 : 770, 790);
        n.alpha = 0;
        root.addChild(n);
        void tween(n, { alpha: 1 }, 160);
        return n;
      });

      // VS, printed on a chip that is tossed onto the middle
      const vs = this.chip(130, 'VS', 82);
      vs.position.set(960, -200);
      vs.rotation = -2;
      root.addChild(vs);
      sfx.play('thud', 0.9);
      await Promise.all([tween(vs.position, { y: 560 }, 220, ease.inCubic), tween(vs, { rotation: -0.12 }, 220)]);
      this.impact({ x: 960, y: 560 }, 0.8);
      await this.hold(700 * k);

      await Promise.all([
        tween(L.position, { x: -500 }, 220, ease.inCubic),
        tween(R.position, { x: 2400 }, 220, ease.inCubic),
        tween(vs.scale, { x: 0.2, y: 0.2 }, 200),
        tween(vs, { alpha: 0 }, 200),
        ...names.map((n) => tween(n, { alpha: 0 }, 150)),
        tween(bd, { alpha: 0 }, 240),
      ]);
    } finally {
      root.destroy({ children: true });
    }
  }

  private async vsMelee(seats: number[], k: number) {
    const root = this.layer();
    try {
      const bd = this.backdrop();
      bd.alpha = 0;
      root.addChild(bd);
      void tween(bd, { alpha: 1 }, 140);
      const n = seats.length;
      // everyone's card, fanned like a hand
      const cards = seats.map((seat, i) => {
        const c = this.courtOf(seat, 330, 'angry', false);
        const t = n === 1 ? 0 : i / (n - 1) - 0.5;
        c.position.set(960 + t * 1300, 2000);
        c.rotation = t * 0.5;
        root.addChild(c);
        return { c, x: 960 + t * 1300, y: 560 + Math.abs(t) * 120 };
      });
      sfx.play('whoosh', 0.9);
      for (const { c, x, y } of cards) {
        void tween(c.position, { x, y }, 260, ease.outBack);
        await wait(70);
      }
      await wait(200);
      const title = this.chip(150, '混战', 84);
      title.position.set(960, 520);
      title.scale.set(3);
      title.alpha = 0;
      const sub = this.bigWord(`${n} 人全下`, 64);
      sub.position.set(960, 730);
      root.addChild(title, sub);
      sfx.play('thunder');
      await Promise.all([tween(title.scale, { x: 1, y: 1 }, 180, ease.inCubic), tween(title, { alpha: 1 }, 100)]);
      this.impact({ x: 960, y: 520 }, 0.9);
      await this.hold(800 * k);
      await Promise.all([
        ...cards.map(({ c }) => tween(c.position, { y: 1700 }, 220, ease.inCubic)),
        tween(title, { alpha: 0 }, 200),
        tween(sub, { alpha: 0 }, 200),
        tween(bd, { alpha: 0 }, 240),
      ]);
    } finally {
      root.destroy({ children: true });
    }
  }

  // ---------------- M7 slow river ----------------

  slowRiver(code: string) {
    return this.run('river', async (k) => {
      const { camera, post, stage, particles } = this.d;
      void camera.push(960, BOARD_Y, 1.25, 520, 0.65);
      void post.tighten(1, 400);
      sfx.play('riser', 0.5);
      // the heartbeat speeds up while the card peels open
      const beats = (async () => {
        for (const gap of [0, 470, 400, 330, 270]) {
          await wait(gap);
          if (timing.scale === 0) return;
          sfx.play('heartbeat', 1);
          void post.tighten(0.55, 90).then(() => post.tighten(1, 170));
        }
      })();
      await stage.squeezeRiver(code, 1500);
      const at = { x: BOARD_X[4], y: BOARD_Y };
      this.impact(this.toScreen(at), 1.1);
      particles.sparks(at.x, at.y, 30);
      await this.hold(380 * k);
      await beats;
      await Promise.all([camera.reset(420), post.tighten(0, 400)]);
    });
  }

  // ---------------- M8 showdown ----------------

  /** "胜负揭晓" stamped across the table before the hands are turned over. */
  showdownOpen() {
    return this.run('showdown', async (k) => {
      sfx.play('thud', 0.8);
      void stamp(this.d.screen, '胜负揭晓', 960, 430, { size: 130, color: PAL.ivory, stroke: PAL.ink, hold: 260 * k, rotate: -0.06 });
      await this.hold(560);
    });
  }

  // ---------------- M9 big hands ----------------

  /** Two monsters collide: both hands fly to the middle and smash into each other. */
  cooler(a: { seat: number; cards: string[] }, b: { seat: number; cards: string[] }) {
    return this.run('cooler', async (k) => {
      const st = this.d.stage;
      const root = this.layer();
      try {
        const shade = this.shade(0.5);
        root.addChild(shade);
        const pair = (h: { seat: number; cards: string[] }, side: -1 | 1) =>
          h.cards.map((code, i) => {
            const c = this.cloneCard(code, st.cardSprites([code], h.seat)[0], root);
            return { c, x: 960 + side * (230 - i * 80), r: side * 0.12 };
          });
        const cards = [...pair(a, -1), ...pair(b, 1)];
        sfx.play('whoosh');
        await Promise.all(cards.map(({ c, x, r }) =>
          Promise.all([tween(c.position, { x, y: 480 }, 300, ease.outCubic), tween(c.scale, { x: 1, y: 1 }, 300), tween(c, { rotation: r }, 300)])));
        await wait(120);
        // charge and collide
        await Promise.all(cards.map(({ c, x }) => tween(c.position, { x: x + (x < 960 ? 60 : -60) }, 110, ease.inCubic)));
        const hit = this.toWorld({ x: 960, y: 480 });
        this.d.particles.sparks(hit.x, hit.y, 50);
        this.impact({ x: 960, y: 480 }, 1);
        await Promise.all(cards.map(({ c, x }) => tween(c.position, { x }, 200, ease.outBack)));
        await stamp(root, '冤家牌！', 960, 760, { size: 130, color: PAL.ivory, stroke: PAL.cobalt, hold: 380 * k });
        await Promise.all([...cards.map(({ c }) => tween(c, { alpha: 0 }, 200)), tween(shade, { alpha: 0 }, 220)]);
      } finally {
        root.destroy({ children: true });
      }
    });
  }

  /** Full house and up, by rarity: 葫芦 1 s, 四条 1.8 s, 同花顺 2.4 s, 皇家同花顺 4 s. */
  bigHand(seat: number, category: number, royal: boolean, best: string[], extras: string[] = []) {
    if (royal) return this.run('royal', (k) => this.royal(best, extras, k), (played.get('royal') ?? 0) > 0);
    if (category >= 8) return this.run('straightFlush', (k) => this.straightFlush(seat, best, extras, k));
    if (category === 7) return this.run('quads', (k) => this.quads(seat, best, extras, k));
    return this.run('fullHouse', (k) => this.fullHouse(seat, best, extras, k));
  }

  private extrasText(root: Container, extras: string[], y: number, x = 960) {
    if (!extras.length) return;
    const t = new Text({ text: extras.map((e) => `＋${e}`).join('  '), style: { fontFamily: FONT, fontSize: 30, fontWeight: '900', fill: PAL.ivory, stroke: { color: PAL.cobalt, width: 6 } } });
    t.anchor.set(0.5);
    t.position.set(x, y);
    root.addChild(t);
  }

  private async fullHouse(seat: number, best: string[], extras: string[], k: number) {
    const st = this.d.stage;
    const sprites = st.cardSprites(best, seat);
    sfx.play('chime', 0.8);
    sprites.forEach((c, i) => {
      void wait(i * 70).then(() => c.shine(0xcfd6ff, 420));
      const p = st.toLocal(c.getGlobalPosition());
      void wait(i * 70).then(() => this.d.particles.sparkle(p.x, p.y, 8, 70));
    });
    const root = this.layer();
    try {
      this.extrasText(root, extras, 690);
      await stamp(root, '葫芦', 960, 600, { size: 150, color: PAL.ivory, stroke: PAL.cobalt, hold: 420 * k });
    } finally {
      root.destroy({ children: true });
    }
  }

  private async quads(seat: number, best: string[], extras: string[], k: number) {
    const st = this.d.stage;
    const counts = new Map<string, number>();
    best.forEach((c) => counts.set(c[0], (counts.get(c[0]) ?? 0) + 1));
    const rank = [...counts.entries()].find(([, n]) => n === 4)?.[0];
    const four = best.filter((c) => c[0] === rank);
    const root = this.layer();
    try {
      // freeze frame
      void this.d.post.flash(0.9, 180);
      sfx.play('impact', 0.7);
      await wait(150);
      const shade = this.shade(0.7);
      root.addChild(shade);
      const cards = four.map((code) => this.cloneCard(code, st.cardSprites([code], seat)[0], root));
      sfx.play('whoosh');
      await Promise.all(cards.map((c, i) =>
        Promise.all([
          tween(c.position, { x: 960 + (i - 1.5) * 185, y: 450 }, 360, ease.outCubic),
          tween(c.scale, { x: 1.05, y: 1.05 }, 360, ease.outBack),
          tween(c, { rotation: (i - 1.5) * 0.04 }, 360),
        ])));
      cards.forEach((c, i) => void wait(i * 60).then(() => c.shine(0xcfd6ff, 380)));
      const word = this.bigWord('四条', 170, PAL.ivory, PAL.cobalt);
      word.position.set(960, 740);
      word.scale.set(2.6);
      word.alpha = 0;
      root.addChild(word);
      this.extrasText(root, extras, 850);
      await Promise.all([tween(word.scale, { x: 1, y: 1 }, 200, ease.inCubic), tween(word, { alpha: 1 }, 120)]);
      this.impact({ x: 960, y: 600 }, 1);
      const w = this.toWorld({ x: 960, y: 740 });
      this.d.particles.sparks(w.x, w.y, 40);
      await this.hold(900 * k);
      await Promise.all([tween(root, { alpha: 0 }, 260)]);
    } finally {
      root.destroy({ children: true });
    }
  }

  private async straightFlush(seat: number, best: string[], extras: string[], k: number) {
    const st = this.d.stage;
    const root = this.layer();
    try {
      const shade = this.shade(0.78);
      root.addChild(shade);
      // in rank order (the wheel puts its ace first)
      const R = '23456789TJQKA';
      const wheel = best.some((c) => c[0] === 'A') && best.some((c) => c[0] === '2');
      const v = (c: string) => (wheel && c[0] === 'A' ? -1 : R.indexOf(c[0]));
      const sorted = [...best].sort((a, b) => v(a) - v(b));
      const cards = sorted.map((code) => this.cloneCard(code, st.cardSprites([code], seat)[0], root));
      sfx.play('riser', 0.6);
      // an arc in the air
      await Promise.all(cards.map((c, i) => {
        const a = (i - 2) * 0.2;
        return Promise.all([
          tween(c.position, { x: 960 + Math.sin(a) * 760, y: 1240 - Math.cos(a) * 820 }, 420 + i * 40, ease.outBack),
          tween(c, { rotation: a }, 420 + i * 40),
          tween(c.scale, { x: 1, y: 1 }, 420),
        ]);
      }));
      // a rainbow sweep, card by card
      const rainbow = [PAL.ivory, PAL.cobaltHi, PAL.redHi, PAL.ivory, PAL.cobaltHi];
      for (let i = 0; i < cards.length; i++) {
        void cards[i].shine(rainbow[i], 360);
        sfx.play('chime', 0.35);
        await wait(90);
      }
      const word = this.bigWord('同花顺', 170, PAL.ivory, PAL.cobalt);
      word.position.set(960, 790);
      word.scale.set(2.6);
      word.alpha = 0;
      root.addChild(word);
      this.extrasText(root, extras, 900);
      await Promise.all([tween(word.scale, { x: 1, y: 1 }, 200, ease.inCubic), tween(word, { alpha: 1 }, 120)]);
      this.impact({ x: 960, y: 700 }, 1);
      sfx.play('cheer', 0.8);
      const colors = [PAL.ivory, PAL.cobaltHi, PAL.redHi, 0xffffff, PAL.cobaltTint];
      for (let i = 0; i < 5; i++) {
        const p = this.toWorld({ x: 260 + Math.random() * 1400, y: 120 + Math.random() * 260 });
        void wait(i * 160).then(() => this.d.particles.firework(p.x, p.y, colors[i]));
      }
      await this.hold(1200 * k);
      await tween(root, { alpha: 0 }, 280);
    } finally {
      root.destroy({ children: true });
    }
  }

  private async royal(best: string[], extras: string[], k: number) {
    const root = this.layer();
    try {
      const shade = this.shade(0.92, 0x07060c);
      const beam = new Graphics().poly([880, -40, 1040, -40, 1340, 1120, 580, 1120]).fill({ color: 0xdfe4ff, alpha: 0.14 });
      beam.alpha = 0;
      root.addChild(shade, beam);
      sfx.play('riser', 0.5);
      await wait(300);
      await tween(beam, { alpha: 1 }, 400);
      // five cards fall from the sky, a bell each
      const R = '23456789TJQKA';
      const order = [...best].sort((a, b) => R.indexOf(a[0]) - R.indexOf(b[0]));
      const cards: CardSprite[] = [];
      for (let i = 0; i < order.length; i++) {
        const c = this.cloneCard(order[i], undefined, root);
        c.position.set(960 + (i - 2) * 180, -220);
        c.scale.set(1.05);
        c.rotation = (Math.random() - 0.5) * 0.6;
        cards.push(c);
        sfx.play('bell', 0.7);
        await Promise.all([tween(c.position, { y: 430 }, 380, ease.outBack), tween(c, { rotation: 0 }, 380)]);
        void c.shine(0xcfd6ff, 380);
        await wait(140 * k + 60);
      }
      // the burst
      void this.d.post.flash(0.85, 400);
      this.d.camera.shake(16, 500);
      sfx.play('impact', 1);
      sfx.play('cheer', 1);
      const top = this.toWorld({ x: 960, y: -40 });
      this.d.particles.confetti(180, top.x, top.y);
      const mid = this.toWorld({ x: 960, y: 430 });
      for (let i = 0; i < 4; i++) void wait(i * 140).then(() => this.d.particles.firework(mid.x + (i - 1.5) * 380, mid.y - 200, i % 2 ? PAL.ivory : PAL.cobaltHi, 44));
      const en = this.bigWord('ROYAL FLUSH', 120, PAL.ivory, PAL.cobalt, FONT_NUM);
      en.position.set(960, 700);
      const zh = this.bigWord('皇家同花顺', 120);
      zh.position.set(960, 850);
      for (const t of [en, zh]) {
        t.scale.set(2.4);
        t.alpha = 0;
      }
      root.addChild(en, zh);
      this.extrasText(root, extras, 960);
      await Promise.all([tween(en.scale, { x: 1, y: 1 }, 220, ease.inCubic), tween(en, { alpha: 1 }, 120)]);
      await Promise.all([tween(zh.scale, { x: 1, y: 1 }, 220, ease.inCubic), tween(zh, { alpha: 1 }, 120)]);
      await this.hold(1500 * k);
      await tween(root, { alpha: 0 }, 350);
    } finally {
      root.destroy({ children: true });
    }
  }

  // ---------------- M10 BLUFF! ----------------

  /** Everyone folded, and she shows them what they folded to: nothing. */
  bluff(seat: number, cards: string[], victims: number[]) {
    return this.run('bluff', async (k) => {
      const { stage, particles } = this.d;
      const s = stage.seats[seat];
      const root = this.layer();
      try {
        const shade = this.shade(0.7);
        root.addChild(shade);
        // the cards she showed are tossed onto the left
        const clones = cards.map((code) => this.cloneCard(code, stage.cardSprites([code], seat)[0], root));
        sfx.play('whoosh', 0.8);
        await Promise.all(clones.map((c, i) =>
          Promise.all([
            tween(c.position, { x: 360 + i * 190, y: 470 + i * 50 }, 380, ease.outCubic),
            tween(c, { rotation: i ? 0.1 : -0.24 }, 380, ease.outCubic),
            tween(c.scale, { x: 2.1, y: 2.1 }, 380, ease.outBack),
          ])));

        // her card is turned over, and it is the joker
        const joker = this.jokerCard(s.poseTexture('smug'));
        const back = cardBack(500, 700, 38);
        const holder = new Container();
        holder.addChild(back, joker);
        joker.visible = false;
        holder.position.set(1150, 530);
        holder.rotation = 0.06;
        holder.scale.set(0.6);
        holder.alpha = 0;
        root.addChild(holder);
        await Promise.all([tween(holder.scale, { x: 1, y: 1 }, 220, ease.outBack), tween(holder, { alpha: 1 }, 120)]);
        await tween(holder.scale, { x: 0 }, 130, ease.inCubic);
        back.visible = false;
        joker.visible = true;
        sfx.play('flip');
        await tween(holder.scale, { x: 1 }, 160, ease.outBack);
        this.impact({ x: 1150, y: 530 }, 0.7);
        sfx.play('ooh', 0.9);

        const fooled = victims.map((v) => stage.seats[v].char.name).join(' · ');
        const cap = new Text({ text: `${s.char.court} ${s.char.name}  用这手牌诈唬成功${fooled ? `\n被骗弃牌：${fooled}` : ''}`, style: { fontFamily: FONT, fontSize: 28, fontWeight: '900', fill: PAL.ivory, lineHeight: 44, stroke: { color: PAL.ink, width: 6 } } });
        cap.position.set(250, 800);
        root.addChild(cap);
        for (const v of victims) stage.seats[v].fooled();
        const p = this.toWorld({ x: 1150, y: 530 });
        particles.sparkle(p.x, p.y, 16, 360);
        await this.hold(900 * k);
        await tween(root, { alpha: 0 }, 260);
      } finally {
        root.destroy({ children: true });
      }
    });
  }

  /** The joker: JOKER down the corners in red, her portrait, and 诈唬 across the bottom. */
  private jokerCard(tex: Texture): Container {
    const w = 500, h = 700;
    const c = new Container();
    const g = new Graphics()
      .roundRect(-w / 2 + 16, -h / 2 + 34, w, h, 38).fill({ color: 0x000000, alpha: 0.4 })
      .roundRect(-w / 2, -h / 2, w, h, 38).fill(PAL.ivory)
      .rect(-w / 2 + 96, -h / 2 + 50, w - 192, h - 100).fill(0xf6dadc).stroke({ width: 3, color: PAL.red });
    const pic = new Sprite(tex);
    pic.anchor.set(0.5, 1);
    pic.scale.set((h * 0.5) / tex.height);
    pic.position.set(0, 40);
    const mask = new Graphics().rect(-w / 2 + 96, -h / 2 + 50, w - 192, h * 0.5).fill(0xffffff);
    pic.mask = mask;
    const letters = (flip: boolean) => {
      const t = new Text({ text: 'J\nO\nK\nE\nR', style: { fontFamily: FONT_NUM, fontSize: 30, lineHeight: 32, fill: PAL.red, align: 'center' } });
      t.anchor.set(0.5, 0);
      t.position.set(flip ? w / 2 - 44 : -w / 2 + 44, flip ? h / 2 - 24 : -h / 2 + 24);
      if (flip) t.rotation = Math.PI;
      return t;
    };
    const word = new Text({ text: '诈唬', style: { fontFamily: FONT_DISPLAY, fontWeight: '900', fontSize: 112, fill: PAL.red } });
    word.anchor.set(0.5);
    word.position.set(0, 150);
    const en = new Text({ text: 'B L U F F', style: { fontFamily: FONT_NUM, fontSize: 28, fill: PAL.ink } });
    en.anchor.set(0.5);
    en.position.set(0, 240);
    c.addChild(g, pic, mask, letters(false), letters(true), word, en);
    return c;
  }

  // ---------------- M11 caught bluff / hero call ----------------

  /** The bettor was bluffing and the caller saw through it: colour drains from everything
   *  but the caller, the bluff shatters like glass, and the caller gets her stamp. */
  caught(bluffer: number, caller: number, godCall: boolean) {
    return this.run('caught', async (k) => {
      const { stage } = this.d;
      const root = this.layer();
      try {
        stage.drain(caller);
        sfx.play('crack', 0.8);
        await wait(220);
        const sprites = stage.seats[bluffer].cards.filter((c) => c.visible);
        for (const c of sprites) {
          const p = this.d.screen.toLocal(c.getGlobalPosition());
          const sc = (c.w * Math.abs(c.worldTransform.a)) / Math.abs(this.d.screen.worldTransform.a);
          this.shatter(root, p, sc, sc * (c.h / c.w), c.rotation);
          c.visible = false;
        }
        sfx.play('glass', 1);
        this.d.camera.shake(10, 300);
        void this.d.post.flash(0.35, 200);
        const caller_ = stage.seats[caller];
        const at = this.toScreen({ x: caller_.spot.cards.x, y: caller_.spot.cards.y - 120 });
        await wait(250);
        await stamp(root, godCall ? '神跟注！' : '抓到了！', Math.min(1660, Math.max(260, at.x)), Math.max(260, at.y), {
          size: 120, color: PAL.ivory, stroke: godCall ? PAL.cobalt : PAL.red, hold: 600 * k,
        });
      } finally {
        stage.drain(null);
        root.destroy({ children: true });
      }
    });
  }

  /** A card breaking into shards that fly apart and fall. */
  private shatter(layer: Container, at: Point, w: number, h: number, rot: number) {
    const cx = (Math.random() - 0.5) * w * 0.3, cy = (Math.random() - 0.5) * h * 0.3;
    const rim: Point[] = [];
    const n = 10;
    for (let i = 0; i < n; i++) {
      const t = (i / n) * 4;
      const side = Math.floor(t), f = t - side + (Math.random() - 0.5) * 0.15;
      const x = side === 0 ? -w / 2 + f * w : side === 1 ? w / 2 : side === 2 ? w / 2 - f * w : -w / 2;
      const y = side === 0 ? -h / 2 : side === 1 ? -h / 2 + f * h : side === 2 ? h / 2 : h / 2 - f * h;
      rim.push({ x, y });
    }
    const shards: { g: Graphics; vx: number; vy: number; vr: number }[] = [];
    for (let i = 0; i < n; i++) {
      const a = rim[i], b = rim[(i + 1) % n];
      const g = new Graphics()
        .poly([cx, cy, a.x, a.y, b.x, b.y]).fill(0xfffbf5).stroke({ width: 2, color: 0xd9cbbd })
        .poly([cx, cy, a.x, a.y, b.x, b.y]).fill({ color: 0xb9e4f0, alpha: 0.25 });
      const c = layer.addChild(new Container());
      c.position.set(at.x, at.y);
      c.rotation = rot;
      c.addChild(g);
      const mx = (cx + a.x + b.x) / 3, my = (cy + a.y + b.y) / 3;
      const len = Math.hypot(mx - cx, my - cy) || 1;
      shards.push({ g, vx: ((mx - cx) / len) * (180 + Math.random() * 260), vy: ((my - cy) / len) * (180 + Math.random() * 260) - 220, vr: (Math.random() - 0.5) * 9 });
    }
    void animate(900, (p) => {
      const t = p * 0.9;
      for (const sh of shards) {
        sh.g.position.set(sh.vx * t, sh.vy * t + 900 * t * t);
        sh.g.rotation = sh.vr * t;
        sh.g.alpha = 1 - p * p;
      }
    }, ease.linear);
  }

  // ---------------- M12 comeback ----------------

  /** The winner was under 25% before the river: freeze, drain, crack the screen, "逆转！". */
  comeback(winner: number, losers: number[], extras: string[] = []) {
    return this.run('comeback', async (k) => {
      const { stage, post } = this.d;
      const root = this.layer();
      try {
        void post.flash(0.95, 160);
        sfx.play('crack', 1);
        await wait(160);
        stage.drain(winner);
        // the screen cracks from the middle
        const crack = new Graphics();
        for (let i = 0; i < 9; i++) {
          let a = (i / 9) * Math.PI * 2 + Math.random() * 0.4;
          let x = 960, y = 520;
          crack.moveTo(x, y);
          for (let j = 0; j < 6; j++) {
            a += (Math.random() - 0.5) * 0.6;
            const step = 60 + Math.random() * 110;
            x += Math.cos(a) * step;
            y += Math.sin(a) * step;
            crack.lineTo(x, y);
          }
        }
        crack.stroke({ width: 9, color: PAL.ink, alpha: 0.35 }).stroke({ width: 3, color: 0xffffff, alpha: 0.95 });
        crack.pivot.set(960, 520);
        crack.position.set(960, 520);
        crack.scale.set(0.1);
        root.addChild(crack);
        void tween(crack.scale, { x: 1, y: 1 }, 140, ease.outCubic);
        const word = this.bigWord('逆转！', 230, PAL.ivory, PAL.cobalt);
        word.position.set(960, 500);
        word.scale.set(3);
        word.alpha = 0;
        root.addChild(word);
        this.extrasText(root, extras, 650);
        await Promise.all([tween(word.scale, { x: 1, y: 1 }, 180, ease.inCubic), tween(word, { alpha: 1 }, 100)]);
        this.impact({ x: 960, y: 500 }, 1.2);
        for (const l of losers) {
          const s = stage.seats[l];
          if (!s.isHero) s.setPose('shock');
          s.shakePlate();
        }
        await wait(300);
        void tween(crack, { alpha: 0 }, 500); // and heals
        await this.hold(800 * k);
        await tween(root, { alpha: 0 }, 250);
      } finally {
        stage.drain(null);
        root.destroy({ children: true });
      }
    });
  }

  // ---------------- M14 elimination ----------------

  /** Her name plate burns to ash and the wind takes what was in front of her. */
  eliminate(seat: number, place: string, full: boolean) {
    const s = this.d.stage.seats[seat];
    if (!full) {
      s.setOut(place);
      return Promise.resolve();
    }
    return this.run('out', async () => {
      sfx.play('whoosh2', 0.7);
      const at = await s.burnAway();
      this.d.particles.ash(at.x, at.y, 200, 50);
      this.d.particles.ash(s.spot.cards.x, s.spot.cards.y, 120, 20);
      s.setOut(place);
      sfx.play('thud', 0.7);
      await this.hold(500);
    });
  }

  // ---------------- M13 本局主役 ----------------

  mvp(seat: number, amount: number, extras: string[] = []) {
    return this.run('mvp', async (k) => {
      const { stage, camera, post, particles } = this.d;
      const s = stage.seats[seat];
      const root = this.layer();
      const sash = new Container();
      try {
        void camera.push(s.head.x, s.head.y + s.spot.height * 0.2, 1.12, 520, 0.35);
        // the ceiling lights come on, row by row
        const lights = Array.from({ length: 7 }, (_, i) => {
          const l = new Sprite(particles.glowTex);
          l.anchor.set(0.5);
          l.position.set(260 + i * 233, 30);
          l.scale.set(4.2, 2.6);
          l.blendMode = 'add';
          l.tint = 0xdfe4ff;
          l.alpha = 0;
          root.addChild(l);
          return l;
        });
        lights.forEach((l, i) => void wait(i * 60).then(() => {
          sfx.play('tick', 0.8);
          return tween(l, { alpha: 0.9 }, 140);
        }));
        void post.flash(0.3, 300);
        // everyone else reacts
        stage.seats.forEach((o) => {
          if (o.seat !== seat && !o.out && !o.isHero) o.setPose(Math.random() < 0.5 ? 'shock' : 'cry');
        });
        await s.standUp(true);

        // the sash
        const sc = s.spot.height / 600;
        const ribbon = new Graphics()
          .roundRect(-270, -40, 540, 80, 40).fill(PAL.ivory)
          .roundRect(-260, -30, 520, 60, 30).stroke({ width: 2, color: PAL.cobalt });
        const word = new Text({ text: '本局主役', style: { fontFamily: FONT_DISPLAY, fontWeight: '900', fontSize: 50, fill: PAL.cobalt, letterSpacing: 10 } });
        word.anchor.set(0.5);
        const reveal = new Graphics().rect(-290, -50, 580, 100).fill(0xffffff);
        reveal.pivot.x = -290;
        reveal.x = -290;
        reveal.scale.x = 0;
        sash.addChild(ribbon, word, reveal);
        sash.mask = reveal;
        // across her chest once she has stood up
        sash.position.set(s.head.x, s.head.y + s.spot.height * 0.1);
        sash.rotation = -0.32;
        sash.scale.set(sc);
        stage.fxLayer.addChild(sash);
        sfx.play('chime', 1);
        await tween(reveal.scale, { x: 1 }, 320, ease.inOutCubic);

        // chips burst off the table and rain down
        particles.chipBurst(POT_POS.x, POT_POS.y, 60, 1.3);
        const top = this.toWorld({ x: 960, y: -60 });
        particles.confetti(90, top.x, top.y);
        particles.chipRain(1300, 45);
        sfx.play('cheer', 0.9);
        const head = this.toScreen(s.head);
        const gain = this.bigWord(`+${fmt(amount)}`, 76, PAL.ivory, PAL.cobalt, FONT_NUM);
        const scale = this.d.screen.toLocal(stage.toGlobal({ x: 0, y: s.spot.height })).y - this.d.screen.toLocal(stage.toGlobal({ x: 0, y: 0 })).y;
        gain.position.set(Math.min(1700, Math.max(220, head.x)), Math.max(150, head.y - scale * 0.5));
        gain.alpha = 0;
        root.addChild(gain);
        void tween(gain, { alpha: 1, y: gain.y - 30 }, 300);
        if (extras.length) this.extrasText(root, extras, gain.y + 40, gain.x);
        await this.hold(1400 * k);

        await Promise.all([
          tween(root, { alpha: 0 }, 300),
          tween(sash, { alpha: 0 }, 300),
          camera.reset(450),
          s.standUp(false),
        ]);
        stage.seats.forEach((o) => o.restPose());
      } finally {
        root.destroy({ children: true });
        sash.destroy({ children: true });
      }
    });
  }
}

// ---------------- equity bars ----------------

interface BarRow {
  seat: number;
  color: number;
  x: number;
  y: number;
  w: number;
  h: number;
  dir: 1 | -1;
  frame: Graphics;
  dmg: Graphics;
  fill: Graphics;
  flash: Graphics;
  pctText: Text;
  box: Container;
  shown: number;
  dmgShown: number;
}

/** Fighting-game style equity bars for an all-in face-off (two duelists, or a stack for a melee). */
export class EquityBars {
  readonly root = new Container();
  private rows: BarRow[] = [];
  private leader = -1;

  constructor(screen: Container, private particles: Particles, entries: { seat: number; name: string; color: number }[]) {
    screen.addChild(this.root);
    const duel = entries.length === 2;
    entries.forEach((e, i) => {
      const box = new Container();
      const left = !duel || i === 0;
      const x = duel ? (left ? 250 : 1030) : 760;
      const y = duel ? 172 : 150 + i * 50;
      const w = duel ? 640 : 520;
      const h = duel ? 36 : 28;
      const name = new Text({ text: e.name, style: { fontFamily: FONT_DISPLAY, fontWeight: '900', fontSize: duel ? 44 : 32, fill: PAL.ivory, stroke: { color: PAL.ink, width: 6 } } });
      const pctText = new Text({ text: '', style: { fontFamily: FONT_NUM, fontSize: duel ? 30 : 24, fill: PAL.ivory, stroke: { color: PAL.ink, width: 5 } } });
      if (duel) {
        name.anchor.set(left ? 0 : 1, 1);
        name.position.set(left ? x : x + w, y - 4);
        pctText.anchor.set(left ? 1 : 0, 1);
        pctText.position.set(left ? x + w : x, y - 6);
      } else {
        name.anchor.set(1, 0.5);
        name.position.set(x - 14, y + h / 2);
        pctText.anchor.set(0, 0.5);
        pctText.position.set(x + w + 14, y + h / 2);
      }
      const frame = new Graphics();
      const dmg = new Graphics();
      const fill = new Graphics();
      const flash = new Graphics();
      flash.alpha = 0;
      box.addChild(frame, dmg, fill, flash, name, pctText);
      this.root.addChild(box);
      const row: BarRow = { seat: e.seat, color: e.color, x, y, w, h, dir: duel && !left ? -1 : 1, frame, dmg, fill, flash, pctText, box, shown: 0, dmgShown: 0 };
      this.drawSeg(frame, row, 1, PAL.ink, 0.85, true);
      this.drawSeg(flash, row, 1, PAL.red, 0.9);
      this.rows.push(row);
    });
    if (duel) {
      const vs = new Text({ text: 'VS', style: { fontFamily: FONT_NUM, fontSize: 40, fill: PAL.ivory, stroke: { color: PAL.cobalt, width: 7 } } });
      vs.anchor.set(0.5);
      vs.position.set(960, 190);
      this.root.addChild(vs);
    }
    this.root.alpha = 0;
    void tween(this.root, { alpha: 1 }, 250);
  }

  /** A slanted segment covering fraction f of the bar, from its anchored end. */
  private drawSeg(g: Graphics, r: BarRow, f: number, color: number, alpha = 1, border = false) {
    g.clear();
    const len = Math.max(0, Math.min(1, f)) * r.w;
    if (len <= 0 && !border) return;
    const s = 12; // slant
    const x0 = r.dir === 1 ? r.x : r.x + r.w - len;
    const x1 = x0 + len;
    g.poly([x0 + s, r.y, x1 + s, r.y, x1, r.y + r.h, x0, r.y + r.h]).fill({ color, alpha });
    if (border) g.poly([r.x + s, r.y, r.x + r.w + s, r.y, r.x + r.w, r.y + r.h, r.x, r.y + r.h]).stroke({ width: 3, color: PAL.ivory });
    else g.rect(Math.min(x0, x1) + s * 0.6, r.y + 4, Math.max(0, len - s * 0.4), 5).fill({ color: 0xffffff, alpha: 0.35 * alpha });
  }

  private paint(r: BarRow) {
    this.drawSeg(r.dmg, r, r.dmgShown, PAL.ivory);
    this.drawSeg(r.fill, r, r.shown, r.color);
    r.pctText.text = `${(r.shown * 100).toFixed(r.shown >= 0.9995 || r.shown < 0.0005 ? 0 : 1)}%`;
  }

  /** New equities: losses drop at once and the white "damage" drains after; gains fill up. */
  set(equity: Equity[]) {
    const pct = (seat: number) => (equity.find((q) => q.seat === seat)?.pct ?? 0) / 100;
    let leader = -1;
    let top = -1;
    for (const r of this.rows) {
      const to = pct(r.seat);
      if (to > top) {
        top = to;
        leader = r.seat;
      }
      const from = r.shown;
      if (to < from) {
        r.shown = to;
        r.dmgShown = Math.max(r.dmgShown, from);
        this.paint(r);
        sfx.play('thud', 0.5);
        const start = r.dmgShown;
        void wait(320).then(() => animate(380, (p) => {
          r.dmgShown = start + (to - start) * p;
          this.paint(r);
        }));
        void animate(260, (p) => (r.box.x = Math.sin(p * Math.PI * 6) * 8 * (1 - p)), ease.linear);
      } else {
        void animate(500, (p) => {
          r.shown = from + (to - from) * p;
          r.dmgShown = r.shown;
          this.paint(r);
        });
      }
    }
    // overtaken: the old leader's bar flashes red
    if (this.leader >= 0 && leader !== this.leader) {
      const old = this.rows.find((r) => r.seat === this.leader);
      if (old) {
        old.flash.alpha = 1;
        void tween(old.flash, { alpha: 0 }, 650);
      }
      const now = this.rows.find((r) => r.seat === leader);
      if (now) this.particles.sparkle(now.x + now.w / 2, now.y + now.h / 2, 10, now.w * 0.6);
    }
    this.leader = leader;
  }

  async dispose() {
    await tween(this.root, { alpha: 0 }, 300);
    this.root.destroy({ children: true });
  }
}
