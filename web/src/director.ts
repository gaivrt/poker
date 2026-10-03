// Drives one game: asks the engine for events, plays them as animations, and paces
// bot turns. The engine decides everything; this file only decides how it looks.
import type { Container } from 'pixi.js';
import { type Character, pick } from './characters';
import type { Game, GameEvent, TableState } from './engine';
import { allInCutIn, bigHand, riverPunch } from './fx/effects';
import type { TableView } from './table/TableView';
import { fmt } from './table/layout';
import { timing, wait } from './tween';
import type { Overlay } from './ui/overlay';

const BIG_HAND_CATEGORY = 7; // four of a kind and up (HandCategory in hand_eval.hpp)

export class Director {
  private stopped = false;
  private runout = false;
  private handHasWinner = false;
  private best: Record<number, string[] | undefined> = {};
  private hand = { no: 0, maxHands: 0, level: 0, handsPerLevel: 1, sb: 0, bb: 0, ante: 0 };
  private heroOut = false;
  private skipping = false;
  private lineCooldown: number[] = [0, 0, 0, 0, 0, 0];

  constructor(
    private game: Game,
    private table: TableView,
    private ui: Overlay,
    private cast: Character[],
    private camera: Container,
    private fxLayer: Container,
    private onFinished: () => void,
  ) {}

  stop() {
    this.stopped = true;
    this.ui.cancelAsk();
  }

  /** Spectating after elimination: play the rest instantly. */
  skipToEnd() {
    this.skipping = true;
    timing.scale = 0;
  }

  private get pres() {
    return this.skipping ? 'off' : this.ui.settings.presentation;
  }

  async run() {
    const g = this.game;
    g.startHand();
    while (!this.stopped) {
      await this.play(g.drain());
      if (this.stopped || g.finished) break;
      this.markActive();

      if (g.isHumanTurn) {
        const st = g.state();
        const choice = await this.ui.ask(g.legal(), {
          pot: st.pot ?? 0,
          currentBet: st.currentBet ?? 0,
          bb: st.bb ?? 0,
          sb: st.sb ?? 0,
          preflop: (st.board ?? []).length === 0,
        });
        if (!choice || this.stopped) break;
        g.act(choice.type, choice.to);
      } else if (g.handRunning) {
        await wait(this.ui.settings.fast ? 250 + Math.random() * 250 : 550 + Math.random() * 650);
        if (this.stopped) break;
        g.stepBot();
      } else {
        await wait(this.handHasWinner ? 1500 : 600);
        g.finishHand();
        await this.play(g.drain());
        if (this.stopped || g.finished) break;
        g.startHand();
      }
    }
    if (!this.stopped) this.onFinished();
  }

  private markActive() {
    const st = this.game.state();
    this.table.seats.forEach((s, i) => s.setActive(i === st.toAct));
  }

  private sync(st: TableState) {
    if (st.pot === undefined) return;
    let bets = 0;
    st.seats.forEach((s, i) => {
      this.table.seats[i].setStack(s.stack);
      this.table.seats[i].setBet(s.bet);
      bets += s.bet;
    });
    this.table.pot = Math.max(0, st.pot - bets);
    this.table.refreshPot();
  }

  private say(seat: number, lines: string[], chance: number) {
    if (seat === 0 || this.pres !== 'full' || Math.random() > chance) return;
    if (this.lineCooldown[seat] > 0) return;
    const line = pick(lines);
    if (!line) return;
    this.lineCooldown[seat] = 3;
    this.table.seats[seat].say(line);
  }

  private async play(events: GameEvent[]) {
    for (const e of events) {
      if (this.stopped) return;
      await this.playOne(e);
    }
    if (!this.stopped && this.game.handRunning) this.sync(this.game.state());
  }

  private updateHud() {
    const h = this.hand;
    const st = this.game.state();
    const hero = st.seats[0].stack;
    const rank = 1 + st.seats.filter((s, i) => i !== 0 && s.stack > hero).length;
    const handPart = h.maxHands ? `第 ${h.no} / ${h.maxHands} 手` : `第 ${h.no} 手`;
    const nextLevel = h.handsPerLevel - ((h.no - 1) % h.handsPerLevel);
    const lastHands = h.maxHands && h.maxHands - h.no < nextLevel;
    this.ui.setHud(
      `${handPart} · 盲注 ${fmt(h.sb)}/${fmt(h.bb)}${h.ante ? ` · 前注 ${fmt(h.ante)}` : ''}`,
      `${lastHands ? (h.no === h.maxHands ? '最后一手！' : `还剩 ${h.maxHands - h.no + 1} 手`) : `${nextLevel} 手后升盲`}${this.heroOut ? '' : ` · 当前第 ${rank} 名`}`,
    );
  }

  private async playOne(e: GameEvent) {
    const T = this.table;
    switch (e.t) {
      case 'handStart': {
        Object.assign(this.hand, { no: e.hand, maxHands: e.maxHands, level: e.level, handsPerLevel: e.handsPerLevel, sb: e.sb, bb: e.bb, ante: e.ante });
        this.runout = false;
        this.handHasWinner = false;
        this.best = {};
        this.lineCooldown = this.lineCooldown.map((c) => Math.max(0, c - 1));
        this.ui.resetPreActions();
        T.newHand(e.stacks, e.button);
        this.updateHud();
        const dealt = e.stacks.map((s, i) => (s > 0 ? i : -1)).filter((i) => i >= 0);
        const order = [...dealt.filter((i) => i > e.button), ...dealt.filter((i) => i <= e.button)];
        await T.dealHoleBacks(order);
        break;
      }
      case 'postSB':
      case 'postBB': {
        const s = T.seats[e.seat];
        s.setStack(s.stack - e.amount);
        s.setBet(s.bet + e.amount);
        if (e.allIn) s.markAllIn();
        T.refreshPot();
        break;
      }
      case 'postAnte': {
        const s = T.seats[e.seat];
        s.setStack(s.stack - e.amount);
        void T.flyChip(s.L.avatar, { x: 960, y: 357 }, 300);
        T.pot += e.amount;
        T.refreshPot();
        break;
      }
      case 'hole':
        await T.seats[e.seat].reveal(e.cards);
        break;
      case 'act': {
        const s = T.seats[e.seat];
        const c = this.cast[e.seat];
        s.setActive(false);
        if (e.action === 'fold') {
          s.setFolded(true);
          s.setTag('弃牌', 0x9a94b8);
        } else if (e.action === 'check') {
          s.setTag('过牌', 0xcfe9df);
        } else {
          s.setStack(s.stack - e.amount);
          s.setBet(e.total);
          s.setTag(e.action === 'call' ? '跟注' : e.action === 'bet' ? '下注' : '加注', 0xffe08a);
          void T.flyChip(s.L.avatar, s.betPos, 220);
        }
        T.refreshPot();
        if (e.allIn) {
          s.markAllIn();
          if (this.pres === 'full') await allInCutIn(this.fxLayer, c, pick(c.lines.allIn) ?? 'ALL IN！');
        } else if (e.action === 'bet' || e.action === 'raise') {
          this.say(e.seat, c.lines.raise, 0.35);
        } else if (e.action === 'call' && e.amount * 2 >= T.totalPot() - e.amount) {
          this.say(e.seat, c.lines.call, 0.3);
        }
        await wait(e.action === 'fold' ? 120 : 220);
        break;
      }
      case 'board': {
        await T.gatherBets();
        T.seats.forEach((s) => {
          if (!s.out && !s.folded && !s.allIn) s.setTag('');
        });
        const dramatic = this.runout && this.pres !== 'off';
        if (dramatic && e.street === 'river' && this.pres === 'full') {
          await wait(500);
          await Promise.all([T.revealBoard(e.cards, true), riverPunch(this.camera)]);
        } else {
          await T.revealBoard(e.cards, dramatic);
        }
        if (e.equity) for (const q of e.equity) T.seats[q.seat].showEquity(q.pct);
        if (dramatic) await wait(e.street === 'river' ? 300 : 700);
        break;
      }
      case 'uncalled': {
        const s = T.seats[e.seat];
        s.setBet(Math.max(0, s.bet - e.amount));
        s.setStack(s.stack + e.amount);
        T.refreshPot();
        break;
      }
      case 'runout':
        this.runout = true;
        await T.gatherBets();
        if (this.pres !== 'off') {
          T.showBanner('ALL IN · 摊牌！');
          await wait(700);
          T.hideBanner();
        }
        break;
      case 'show': {
        const s = T.seats[e.seat];
        await s.reveal(e.cards);
        if (e.hand) s.showHand(e.hand);
        this.best[e.seat] = e.best;
        if (e.equity) for (const q of e.equity) T.seats[q.seat].showEquity(q.pct);
        break;
      }
      case 'finalHands':
        for (const h of e.hands) {
          T.seats[h.seat].showHand(h.hand);
          this.best[h.seat] = h.best;
        }
        break;
      case 'win': {
        const first = !this.handHasWinner;
        this.handHasWinner = true;
        const c = this.cast[e.seat];
        if (first) {
          await T.gatherBets();
          T.seats.forEach((s) => s.showEquity(null));
        }
        const best = this.best[e.seat];
        T.seats.forEach((s) => s.highlightCards(s.seat === e.seat ? best : undefined));
        T.highlightBoard(e.hand ? best : undefined);
        T.showBanner(`${c.name} 赢得 ${fmt(e.amount)}${e.pot > 0 ? '（边池）' : ''}`, e.hand ?? '');
        if (e.category !== undefined && e.category >= BIG_HAND_CATEGORY && this.pres === 'full' && e.pot === 0)
          await bigHand(this.fxLayer, c, e.royal ? '皇家同花顺' : (e.hand ?? '').split(' ')[0], !!e.royal);
        await T.payOut(e.seat, e.amount);
        this.say(e.seat, c.lines.win, 0.6);
        await wait(e.hand ? 900 : 400);
        break;
      }
      case 'handEnd':
        T.seats.forEach((s) => s.setActive(false));
        this.updateHud();
        break;
      case 'eliminated': {
        const place = e.place === e.placeTo ? `第 ${e.place} 名` : `并列第 ${e.place} 名`;
        T.seats[e.seat].setOut(place);
        this.say(e.seat, this.cast[e.seat].lines.out, 1);
        if (e.seat === 0) {
          this.heroOut = true;
          this.ui.showSpectate(place);
        }
        await wait(600);
        break;
      }
      case 'tournamentEnd':
        T.hideBanner();
        break;
    }
  }
}
