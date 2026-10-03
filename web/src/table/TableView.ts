import { Container, Graphics, Text } from 'pixi.js';
import type { Character } from '../characters';
import { ease, tween, wait } from '../tween';
import { CardSprite } from './CardSprite';
import { SeatView } from './SeatView';
import { BOARD_CARD, BOARD_X, BOARD_Y, FONT, POT_POS, SEATS, TABLE_CENTER, fmt } from './layout';

/** The felt and everything on it. Purely visual: game rules live in the C++ engine. */
export class TableView extends Container {
  readonly seats: SeatView[] = [];
  readonly board: CardSprite[] = [];
  private boardSlots = new Graphics();
  private potBox = new Container();
  private potText: Text;
  private dealer = new Container();
  private banner = new Container();
  private fx = new Container();
  pot = 0; // chips already gathered in the middle

  constructor(cast: Character[]) {
    super();
    // Room + table
    const bg = new Graphics().rect(0, 0, 1920, 1080).fill(0x1d1b2e);
    for (let i = 0; i < 6; i++) bg.circle(960, 520, 900 - i * 120).fill({ color: 0x2a2645, alpha: 0.12 });
    const { x, y } = TABLE_CENTER;
    const table = new Graphics()
      .ellipse(x, y + 14, 742, 322).fill({ color: 0x000000, alpha: 0.35 })
      .ellipse(x, y, 732, 312).fill(0x8a6d3b)
      .ellipse(x, y, 712, 292).fill(0x6e5530)
      .ellipse(x, y, 700, 280).fill(0x2f6b57)
      .ellipse(x, y - 30, 600, 200).fill({ color: 0x3d8a70, alpha: 0.35 })
      .ellipse(x, y, 640, 230).stroke({ width: 3, color: 0x4fa385, alpha: 0.6 });
    this.addChild(bg, table, this.boardSlots);

    BOARD_X.forEach((bx) => {
      this.boardSlots.roundRect(bx - BOARD_CARD.w / 2, BOARD_Y - BOARD_CARD.h / 2, BOARD_CARD.w, BOARD_CARD.h, 10).stroke({ width: 2, color: 0x4fa385, alpha: 0.5 });
      const c = new CardSprite(BOARD_CARD.w, BOARD_CARD.h);
      c.position.set(bx, BOARD_Y);
      c.visible = false;
      this.board.push(c);
    });

    const potBg = new Graphics().roundRect(-110, -24, 220, 48, 24).fill({ color: 0x000000, alpha: 0.45 });
    this.potText = new Text({ text: '', style: { fontFamily: FONT, fontSize: 26, fontWeight: '700', fill: 0xffe08a } });
    this.potText.anchor.set(0.5);
    this.potBox.addChild(potBg, this.potText);
    this.potBox.position.set(POT_POS.x, POT_POS.y);

    const btn = new Graphics().circle(0, 0, 20).fill(0xffffff).stroke({ width: 3, color: 0x9a8f6a });
    const d = new Text({ text: 'D', style: { fontFamily: FONT, fontSize: 20, fontWeight: '900', fill: 0x22223a } });
    d.anchor.set(0.5);
    this.dealer.addChild(btn, d);
    this.dealer.visible = false;

    this.addChild(...this.board, this.potBox);
    SEATS.forEach((L, i) => {
      const sv = new SeatView(i, cast[i], L, i === 0);
      this.seats.push(sv);
      this.addChild(sv);
    });
    this.addChild(this.dealer, this.fx, this.banner);
    this.refreshPot();
  }

  tick(t: number) {
    this.seats.forEach((s) => s.tick(t));
  }

  totalPot() {
    return this.pot + this.seats.reduce((a, s) => a + s.bet, 0);
  }

  refreshPot() {
    const total = this.totalPot();
    this.potBox.visible = total > 0;
    this.potText.text = `底池 ${fmt(total)}`;
  }

  newHand(stacks: number[], button: number) {
    this.pot = 0;
    this.board.forEach((c) => {
      c.visible = false;
      c.alpha = 1;
      c.highlight(false);
      c.set(null);
    });
    this.seats.forEach((s, i) => s.newHand(stacks[i]));
    this.hideBanner();
    const target = SEATS[button].dealer;
    if (!this.dealer.visible) {
      this.dealer.position.set(target.x, target.y);
      this.dealer.visible = true;
    } else {
      void tween(this.dealer.position, target, 400, ease.inOutCubic);
    }
    this.refreshPot();
  }

  async dealHoleBacks(seats: number[]) {
    for (let round = 0; round < 2; round++)
      for (const s of seats) {
        void this.seats[s].dealBack(round, TABLE_CENTER);
        await wait(45);
      }
    await wait(200);
  }

  async revealBoard(cards: string[], dramatic: boolean) {
    const start = this.board.findIndex((c) => !c.visible);
    for (let i = 0; i < cards.length; i++) {
      const c = this.board[start + i];
      c.set(null);
      c.visible = true;
      c.alpha = 0;
      await tween(c, { alpha: 1 }, 90);
      await c.flipTo(cards[i], dramatic ? 520 : 260);
      if (cards.length === 3) await wait(60);
    }
  }

  highlightBoard(best: string[] | undefined) {
    for (const c of this.board) {
      if (!c.visible) continue;
      const on = !!best && !!c.code && best.includes(c.code);
      c.highlight(on);
      c.alpha = best && !on ? 0.55 : 1;
    }
  }

  /** A chip token flying between two points. */
  async flyChip(from: { x: number; y: number }, to: { x: number; y: number }, ms = 320) {
    const chip = new Graphics().circle(0, 0, 14).fill(0xffd166).stroke({ width: 3, color: 0xb8860b });
    chip.position.set(from.x, from.y);
    this.fx.addChild(chip);
    await tween(chip.position, to, ms, ease.inOutCubic);
    chip.destroy();
  }

  /** End of a betting round: every bet slides into the pot. */
  async gatherBets() {
    const moving = this.seats.filter((s) => s.bet > 0);
    if (!moving.length) return;
    await Promise.all(moving.map((s) => this.flyChip(s.betPos, POT_POS, 300)));
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
    await this.flyChip(POT_POS, s.L.avatar, 420);
    s.setStack(s.stack + amount);
  }

  /** A dashed sight line from one player to another (the "stare" gesture). */
  async stare(from: number, to: number) {
    const a = this.seats[from].L.avatar;
    const b = this.seats[to].L.avatar;
    const g = new Graphics();
    const n = 14;
    for (let i = 0; i < n; i += 2) {
      const t0 = i / n, t1 = (i + 1) / n;
      g.moveTo(a.x + (b.x - a.x) * t0, a.y + (b.y - a.y) * t0).lineTo(a.x + (b.x - a.x) * t1, a.y + (b.y - a.y) * t1);
    }
    g.stroke({ width: 5, color: this.seats[from].char.color, alpha: 0.9 });
    g.alpha = 0;
    this.fx.addChild(g);
    await tween(g, { alpha: 1 }, 150);
    await wait(1300);
    await tween(g, { alpha: 0 }, 300);
    g.destroy();
  }

  showBanner(text: string, sub = '') {
    this.hideBanner();
    const t = new Text({ text, style: { fontFamily: FONT, fontSize: 34, fontWeight: '900', fill: 0xffffff, stroke: { color: 0x000000, width: 6 } } });
    t.anchor.set(0.5);
    const lines: Text[] = [t];
    if (sub) {
      const s = new Text({ text: sub, style: { fontFamily: FONT, fontSize: 26, fontWeight: '700', fill: 0xffe08a, stroke: { color: 0x000000, width: 5 } } });
      s.anchor.set(0.5);
      s.y = 40;
      lines.push(s);
    }
    const w = Math.max(...lines.map((l) => l.width)) + 60;
    const bg = new Graphics().roundRect(-w / 2, -32, w, sub ? 100 : 64, 16).fill({ color: 0x0b0a16, alpha: 0.7 });
    this.banner.addChild(bg, ...lines);
    this.banner.position.set(960, 610);
    this.banner.alpha = 0;
    void tween(this.banner, { alpha: 1 }, 180);
  }

  hideBanner() {
    this.banner.removeChildren().forEach((c) => c.destroy());
  }
}
