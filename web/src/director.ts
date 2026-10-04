// Drives one game: asks the engine for events, plays them as animations, and paces
// bot turns. The engine decides everything; this file only decides how it looks.
//
// Mind games (docs/06-mind-games.md): table talk is sent through the overlay at any
// time; bots think on a visible clock and may leak tells while they do; every hand
// that gets turned face up is written into the "reading notes" next to what that
// player said and did, so you can learn their habits.
import { music } from './audio/music';
import { sfx } from './audio/sfx';
import { type Character, EXPRESSION_LABEL, STICKER_LABEL, gestureCaption, pick, talkLine } from './characters';
import { Expression, type Game, type GameEvent, Gesture, type SignalKindName, Sticker, type Standing, type StrengthName, type TableState } from './engine';
import type { Net } from './net/client';
import type { ServerMsg } from './net/protocol';
import type { Face } from './fx/stickers';
import { type EquityBars, type Moments } from './fx/moments';
import type { TableStage } from './stage/TableStage';
import { POT_POS, fmt } from './table/layout';
import { timing, wait } from './tween';
import { TELL_UNLOCK, loadTells, saveTells } from './tells';
import type { Clock, Overlay } from './ui/overlay';

// HandCategory in core/include/poker/hand_eval.hpp
const STRAIGHT = 4;
const FULL_HOUSE = 6;
const QUADS = 7;
const STRAIGHT_FLUSH = 8;
const BIG_NAME: Record<number, string> = { [FULL_HOUSE]: '葫芦', [QUADS]: '四条', [STRAIGHT_FLUSH]: '同花顺' };
interface Note {
  hand: number;
  cards: string[];
  handName?: string;
  strength?: StrengthName;
  did: string[];
  voluntary: boolean;
}

const SUIT: Record<string, string> = { s: '♠', h: '♥', d: '♦', c: '♣' };
const prettyCard = (c: string) => `${c[0] === 'T' ? '10' : c[0]}${SUIT[c[1]] ?? ''}`;
const STRENGTH_LABEL: Record<StrengthName, string> = { strong: '大牌', medium: '中等', weak: '弱牌' };

export class Director {
  private stopped = false;
  private runout = false;
  private handHasWinner = false;
  private best: Record<number, string[] | undefined> = {};
  private hand = { no: 0, maxHands: 0, level: 0, handsPerLevel: 1, sb: 0, bb: 0, ante: 0 };
  private heroOut = false;
  private skipping = false;
  private lineCooldown: number[] = [0, 0, 0, 0, 0, 0];
  private backlog: GameEvent[] = [];
  private clock: Clock = { perActionMs: 20000, bankMs: 30000 };
  private heroHole: string[] = [];
  private did: string[][] = [[], [], [], [], [], []]; // what each seat said/did this hand
  private equity: Record<number, number> = {}; // last shown all-in equity per seat
  private winners = new Set<number>();          // seats that win a pot in the batch being played
  private wonTotal: Record<number, number> = {};
  private reacted = false;                      // showdown reactions already played this hand
  private tableChips = 0;
  private notes: Note[][] = [[], [], [], [], [], []];
  private bars: EquityBars | null = null;       // the VS equity bars during an all-in face-off
  private openedShowdown = false;               // "胜负揭晓" already stamped this hand
  private ahead: GameEvent[] = [];              // events after the one being played (lookahead)
  private consumed = new Set<GameEvent>();      // events already played as part of a bigger moment
  private faceoff = new Set<number>();          // seats in this hand's all-in face-off
  private lastAggr: { seat: number; street: string; big: boolean } | null = null; // the last bet or raise this hand
  private foldedAfter = new Set<number>();      // who folded since that bet
  private foldedAll = new Set<number>();
  private strengthOf: Record<number, StrengthName> = {};
  private allIns = 0; // all-ins so far this hand (only the first gets the full cut-in)
  private handActive = false;
  private remoteState: TableState | null = null;
  /** Online: the final standings and rank change sent by the server. */
  result: { standings: Standing[]; rank: { before: number; after: number } } | null = null;

  /**
   * game: the local engine (single player), or null when `net` drives the game (online).
   * humans: which seats are people (online opponents are never spoken for by the system).
   */
  constructor(
    private game: Game | null,
    private table: TableStage,
    private ui: Overlay,
    private cast: Character[],
    private moments: Moments,
    private onFinished: () => void,
    private net: Net | null = null,
    private humans: boolean[] = [true, false, false, false, false, false],
  ) {
    ui.onTalk = (kind, code, target) => this.talk(kind, code, target);
    ui.onNotes = () => this.notesHtml();
    table.seats.forEach((s) => {
      if (s.seat > 0) s.avatar.on('pointertap', () => !s.out && this.ui.setTarget(s.seat));
    });
  }

  stop() {
    this.stopped = true;
    this.ui.cancelAsk();
  }

  /** Spectating after elimination: play the rest instantly. */
  skipToEnd() {
    this.skipping = true;
    this.moments.forceInstant();
    timing.scale = 0;
  }

  private get pres() {
    return this.skipping ? 'off' : this.ui.settings.presentation;
  }

  private isPerson(seat: number) {
    return !!this.humans[seat];
  }

  async run() {
    if (this.net) return this.runRemote(this.net);
    const g = this.game!;
    g.startHand();
    while (!this.stopped) {
      await this.play(g.drain());
      if (this.stopped || g.finished) break;
      this.markActive();

      if (g.isHumanTurn) {
        await this.table.revealHeroNow();
        const st = g.state();
        const choice = await this.ui.ask(
          g.legal(),
          { pot: st.pot ?? 0, currentBet: st.currentBet ?? 0, bb: st.bb ?? 0, sb: st.sb ?? 0, preflop: (st.board ?? []).length === 0 },
          this.clock,
        );
        if (!choice || this.stopped) break;
        g.act(choice.type, choice.to, choice.thinkMs);
      } else if (g.handRunning) {
        const plan = g.prepareBot();
        await this.play(g.drain()); // tells that slip out while it thinks
        if (plan) {
          const seat = this.table.seats[plan.seat];
          seat.startThinking();
          await wait(plan.thinkMs);
          seat.stopThinking();
        }
        if (this.stopped) break;
        g.stepBot();
      } else {
        await wait(600);
        if (g.canShow && !this.skipping) {
          const mask = await this.ui.askShow(this.heroHole.map(prettyCard));
          if (mask) g.show(mask);
          await this.play(g.drain());
        }
        // Let the result sink in before the next hand ("下一手" skips ahead).
        if (!this.skipping && timing.scale > 0) await this.ui.waitNext(this.reacted ? 5000 : 3000);
        g.finishHand();
        await this.play(g.drain());
        if (this.stopped || g.finished) break;
        g.startHand();
      }
    }
    if (!this.stopped) this.onFinished();
  }

  /** Online: the server runs the table; this plays what it sends and answers its questions. */
  private async runRemote(net: Net) {
    const inbox: ServerMsg[] = [];
    let wake: (() => void) | null = null;
    net.handler = (m) => {
      // Table talk shows at once, even in the middle of an animation.
      if (m.t === 'live') {
        for (const e of m.events) if (e.t === 'signal') this.showSignal(e);
        return;
      }
      inbox.push(m);
      wake?.();
    };
    const next = async () => {
      while (!inbox.length && !this.stopped) await new Promise<void>((r) => (wake = r));
      wake = null;
      return inbox.shift();
    };
    while (!this.stopped) {
      const m = await next();
      if (!m || this.stopped) break;
      switch (m.t) {
        case 'events': {
          // Catching up after a reconnect, or the tab is in the background: no animations.
          const instant = !!m.replay || document.hidden || this.skipping;
          const scale = timing.scale;
          if (instant) timing.scale = 0;
          this.remoteState = m.state;
          await this.play(m.events);
          if (instant && !this.skipping) timing.scale = scale;
          net.send({ t: 'ready', seq: m.seq });
          break;
        }
        case 'turn': {
          this.table.seats.forEach((s, i) => s.setActive(i === m.seat));
          if (m.seat !== 0) this.table.seats[m.seat].startThinking();
          break;
        }
        case 'ask': {
          this.table.seats.forEach((s, i) => s.setActive(i === 0));
          await this.table.revealHeroNow();
          const choice = await this.ui.ask(m.legal, m.ctx, { perActionMs: m.clock.perActionMs, bankMs: m.clock.bankMs });
          if (choice && !this.stopped) net.send({ t: 'act', type: choice.type, to: choice.to });
          break;
        }
        case 'askShow': {
          const mask = this.skipping ? 0 : await this.ui.askShow(m.cards.map(prettyCard));
          net.send({ t: 'show', mask });
          break;
        }
        case 'pause':
          if (!this.skipping && !document.hidden) await this.ui.waitNext(m.ms);
          break;
        case 'end':
          this.result = { standings: m.standings, rank: m.rank };
          this.stopped = true;
          this.onFinished();
          return;
        case 'refused':
          if (m.what === 'signal') this.ui.toast('这条街已经说得够多了，等下一条街吧');
          else if (m.what === 'act') this.ui.toast('这个操作无效，已自动过牌或弃牌');
          break;
        case 'error':
          this.ui.toast(m.message);
          break;
        case 'matched':
        case 'welcome':
          break; // a reconnect: the replay that follows catches the table up
      }
    }
  }

  /** Online: give up the seat (it checks or folds by itself until the game ends). */
  leaveTable() {
    this.net?.send({ t: 'leave' });
    this.stop();
  }

  // ---------------- table talk ----------------

  private talk(kind: SignalKindName, code: number, target: number): boolean {
    if (this.stopped || this.heroOut) return false;
    if (this.net) {
      // The server checks the rate limit and sends it back to everyone (us included).
      this.net.send({ t: 'signal', kind, code, target });
      return true;
    }
    const ok = this.game!.signal(kind, code, target);
    for (const e of this.game!.drain()) {
      if (e.t === 'signal') this.showSignal(e);
      else this.backlog.push(e);
    }
    return ok;
  }

  /** Renders a signal right away (never blocks the game). */
  private showSignal(e: Extract<GameEvent, { t: 'signal' }>) {
    const seat = this.table.seats[e.seat];
    const c = this.cast[e.seat];
    const targetName = e.target >= 0 ? this.cast[e.target].name : undefined;
    let note = '';
    if (e.kind === 'line') {
      const text = talkLine(c, e.code);
      seat.say(text, 2400, targetName);
      note = `说「${text}」${targetName ? `（对${targetName}）` : ''}`;
    } else if (e.kind === 'sticker') {
      seat.showSticker(e.code as Sticker);
      note = `发了表情包「${STICKER_LABEL[e.code as Sticker]}」${targetName ? `（对${targetName}）` : ''}`;
    } else if (e.kind === 'expression') {
      const ex = e.code as Expression;
      seat.setExpression(ex);
      const face: Record<Expression, Face | null> = {
        [Expression.Calm]: null,
        [Expression.Smug]: Sticker.Smug,
        [Expression.Nervous]: 'nervous',
        [Expression.Smile]: Sticker.GoodHand,
        [Expression.Angry]: Sticker.Angry,
      };
      const f = face[ex];
      if (f !== null) seat.showSticker(f);
      note = `表情：${EXPRESSION_LABEL[ex]}`;
    } else {
      const g = e.code as Gesture;
      const caption = gestureCaption(g, targetName);
      seat.showCaption(caption);
      if (g === Gesture.RecheckCards) void seat.recheckCards();
      else if (g === Gesture.FiddleChips) void seat.fiddleChips();
      else if (g === Gesture.Sigh) void seat.sigh();
      else if (g === Gesture.Stare && e.target >= 0) void this.table.stare(e.seat, e.target);
      note = caption;
    }
    if (this.handActive || this.handHasWinner) this.did[e.seat].push(note);
  }

  private recordTell(e: Extract<GameEvent, { t: 'tellSeen' }>) {
    const tells = loadTells();
    const key = String(e.tell);
    const rec = tells[key] ?? { count: 0, text: e.text, character: this.cast[e.seat].name };
    rec.count += 1;
    tells[key] = rec;
    saveTells(tells);
    if (rec.count === TELL_UNLOCK) this.ui.tellCard(rec.character, this.cast[e.seat].color, rec.text);
  }

  private addNote(seat: number, cards: string[], handName: string | undefined, strength: StrengthName | undefined, voluntary: boolean) {
    if (seat === 0) return;
    this.notes[seat].unshift({ hand: this.hand.no, cards, handName, strength, did: [...this.did[seat]], voluntary });
    this.ui.refreshNotes();
  }

  private notesHtml(): string {
    const tells = loadTells();
    const hex = (c: number) => '#' + c.toString(16).padStart(6, '0');
    const sections = this.cast
      .map((c, seat) => {
        if (seat === 0) return '';
        const found = Object.values(tells).filter((t) => t.character === c.name && t.count >= TELL_UNLOCK);
        const notes = this.notes[seat]
          .slice(0, 8)
          .map((n) => `<li><b>第 ${n.hand} 手</b> ${n.voluntary ? '<em>主动亮牌</em> ' : ''}${n.cards.map(prettyCard).join(' ')}
            ${n.handName ? `· ${n.handName}` : ''} ${n.strength ? `<span class="st ${n.strength}">${STRENGTH_LABEL[n.strength]}</span>` : ''}
            <div class="did">${n.did.length ? n.did.join(' · ') : '这手什么都没说'}</div></li>`)
          .join('');
        return `<section><h4 style="color:${hex(c.color)}">${c.name} <small>${c.style}</small></h4>
          ${found.length ? `<div class="tells">已发现的破绽：${found.map((t) => `<span>${t.text}</span>`).join('')}</div>` : ''}
          ${notes ? `<ul>${notes}</ul>` : '<p class="empty">还没见过她亮牌。</p>'}</section>`;
      })
      .join('');
    return `<p class="hint">每次有人亮牌，这里会记下她这一手说过什么、做过什么、想了多久。对照她的真实牌力，找出她的习惯。</p>${sections}`;
  }

  /** The moment the hands are turned over, before any chips move: winners gloat,
   *  losers sulk, and whoever was ahead and got outdrawn is stunned. Driven only by
   *  cards that are already face up, so it never gives anything away. */
  private async showdownReactions(revealed: number[]) {
    if (this.reacted || this.pres === 'off') return;
    this.reacted = true;
    const T = this.table;
    for (const seat of revealed) {
      if (this.isPerson(seat)) continue; // the system never acts for a person
      const c = this.cast[seat];
      const s = T.seats[seat];
      if (this.winners.has(seat)) {
        s.showSticker(Math.random() < 0.5 ? Sticker.Smug : Sticker.GoodHand);
        s.say(pick(c.lines.win) ?? '赢了！', 2200);
      } else {
        const outdrawn = (this.equity[seat] ?? 0) >= 55;
        const sulky = c.style === '疯狂型' || c.style === '紧凶型';
        s.showSticker(outdrawn ? Sticker.Shock : sulky ? Sticker.Angry : Sticker.Cry);
        s.say(outdrawn ? '怎么可能！？' : sulky ? '……可恶。' : '呜……输了。', 2200);
      }
      await wait(250);
    }
    await wait(1100);
  }

  /** Whether a seat's best five uses at least one of her own cards. */
  private usesHole(seat: number, best: string[] | undefined) {
    const hole = this.table.seats[seat].cards.map((c) => c.code).filter(Boolean);
    return !!best && best.some((c) => hole.includes(c));
  }

  /** At most one big moment per hand, the grandest one; the others ride along as tags (docs/08 §4 M13).
   *  Order: 皇家同花顺 / 同花顺 > 逆转 > 本局主役 > 四条 > 抓诈 / 神跟注 > 葫芦. */
  private async bigMoment(e: Extract<GameEvent, { t: 'win' }>) {
    const cat = e.category ?? -1;
    const won = this.wonTotal[e.seat] ?? 0;
    const best = this.best[e.seat] ?? [];
    // A monster that is all board belongs to everyone: no fanfare for it.
    const name = this.usesHole(e.seat, this.best[e.seat]) ? (e.royal ? '皇家同花顺' : BIG_NAME[cat]) : undefined;
    const others = [...this.faceoff].filter((x) => x !== e.seat);
    const comeback = this.faceoff.has(e.seat) && (this.equity[e.seat] ?? 100) < 25;
    // Caught bluff: the river bettor (half the pot or more) showed a weak hand and lost to the one who called.
    const ag = this.lastAggr;
    const caught = !!ag && ag.street === 'river' && ag.big && ag.seat !== e.seat && this.strengthOf[ag.seat] === 'weak' && this.strengthOf[e.seat] !== undefined;
    const god = caught && this.strengthOf[e.seat] !== 'strong';

    const options: [string, (extras: string[]) => Promise<void>][] = [];
    if (name && (e.royal || cat === STRAIGHT_FLUSH)) options.push([name, (x) => this.moments.bigHand(e.seat, cat, !!e.royal, best, x)]);
    if (comeback) options.push(['逆转', (x) => this.moments.comeback(e.seat, others, x)]);
    if (won >= this.tableChips * 0.25) options.push(['本局主役', (x) => this.moments.mvp(e.seat, won, x)]);
    if (name && cat === QUADS) options.push([name, (x) => this.moments.bigHand(e.seat, cat, false, best, x)]);
    if (caught) options.push([god ? '神跟注' : '抓到了', () => this.moments.caught(ag!.seat, e.seat, god)]);
    if (name && cat === FULL_HOUSE) options.push([name, (x) => this.moments.bigHand(e.seat, cat, false, best, x)]);
    if (!options.length) return;
    if (this.pres === 'simple') return this.moments.quick(options[0][0], 0xe4dbcd);
    const [, play] = options[0];
    await play(options.slice(1).map(([label]) => label));
  }

  // ---------------- event playback ----------------

  private markActive() {
    const st = this.game!.state();
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
    if (this.isPerson(seat) || this.pres !== 'full' || Math.random() > chance) return;
    if (this.lineCooldown[seat] > 0) return;
    const line = pick(lines);
    if (!line) return;
    this.lineCooldown[seat] = 3;
    this.table.seats[seat].say(line);
  }

  private async play(events: GameEvent[]) {
    const all = [...this.backlog.splice(0), ...events];
    for (const e of all)
      if (e.t === 'win') {
        this.winners.add(e.seat);
        this.wonTotal[e.seat] = (this.wonTotal[e.seat] ?? 0) + e.amount;
      }
    for (let i = 0; i < all.length; i++) {
      if (this.stopped) return;
      if (this.consumed.delete(all[i])) continue;
      this.ahead = all.slice(i + 1);
      await this.playOne(all[i]);
    }
    this.ahead = [];
    if (this.stopped) return;
    if (this.game) {
      if (this.game.handRunning) this.sync(this.game.state());
    } else if (this.remoteState && this.remoteState.toAct >= 0) this.sync(this.remoteState);
  }

  private updateHud() {
    const h = this.hand;
    const st = this.game ? this.game.state() : this.remoteState;
    const stacks = st ? st.seats.map((s) => s.stack) : this.table.seats.map((s) => s.stack);
    const rank = 1 + stacks.filter((v, i) => i !== 0 && v > stacks[0]).length;
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
        this.did = this.did.map(() => []);
        this.heroHole = [];
        this.equity = {};
        this.winners.clear();
        this.wonTotal = {};
        this.reacted = false;
        this.openedShowdown = false;
        this.faceoff.clear();
        this.lastAggr = null;
        this.foldedAfter.clear();
        this.foldedAll.clear();
        this.strengthOf = {};
        void this.bars?.dispose();
        this.bars = null;
        this.tableChips = e.stacks.reduce((a, b) => a + b, 0);
        music.setTension(0);
        this.allIns = 0;
        this.handActive = true;
        this.moments.newHand();
        this.lineCooldown = this.lineCooldown.map((c) => Math.max(0, c - 1));
        this.ui.resetPreActions();
        T.newHand(e.stacks, e.button, e.bb);
        this.ui.setTalkSeats(this.cast.map((c, seat) => ({ seat, name: c.name, color: c.color, live: seat > 0 && e.stacks[seat] > 0 })));
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
        void T.flyChip(s.anchor, POT_POS, 300);
        T.pot += e.amount;
        T.refreshPot();
        break;
      }
      case 'hole':
        // Your cards arrive face down: hold to squeeze, or they turn over by themselves.
        this.heroHole = e.cards;
        T.startSqueeze(e.cards);
        break;
      case 'act': {
        const s = T.seats[e.seat];
        const c = this.cast[e.seat];
        s.setActive(false);
        s.stopThinking();
        const secs = e.thinkMs !== undefined ? ` ${(e.thinkMs / 1000).toFixed(1)}s` : '';
        const size = e.potPct ? ` ${e.potPct}%池` : '';
        if (e.action === 'bet' || e.action === 'raise') {
          this.lastAggr = { seat: e.seat, street: e.street, big: e.allIn || (e.potPct ?? 0) >= 50 };
          this.foldedAfter.clear();
        }
        if (e.action === 'fold') {
          this.foldedAfter.add(e.seat);
          this.foldedAll.add(e.seat);
          s.setFolded(true);
          s.setTag('弃牌', 0x9a94b8);
        } else if (e.action === 'check') {
          s.setTag(`过牌${secs}`, 0xcfe9df);
          sfx.play('tick', 1.5);
        } else {
          const verb = e.action === 'call' ? '跟注' : e.action === 'bet' ? '下注' : '加注';
          s.setTag(`${verb}${size}${secs}`, 0xe4dbcd);
          // M5: the all-in cut-in plays before the chips avalanche in.
          if (e.allIn && this.pres !== 'off') {
            if (this.allIns++ > 0) await this.moments.allInSmall(e.seat);
            else if (this.pres === 'full') await this.moments.allIn(e.seat, pick(c.lines.allIn) ?? 'ALL IN！');
            else await this.moments.quick('ALL IN');
          }
          // Heavy bets (the pot or more, or all-in) slam down.
          await T.bet(e.seat, e.amount, e.total, e.allIn || (e.potPct ?? 0) >= 100);
          // How big and how fast the chips went in is part of what others can read.
          const sizeNote = e.potPct ? `（底池的 ${e.potPct}%）` : '';
          if (e.thinkMs !== undefined) this.did[e.seat].push(`${verb}${sizeNote}前想了 ${(e.thinkMs / 1000).toFixed(1)} 秒`);
          else if (sizeNote) this.did[e.seat].push(`${verb}${sizeNote}`);
        }
        T.refreshPot();
        if (e.allIn) {
          music.setTension(0.7);
          s.markAllIn();
          if (this.pres !== 'off') s.setBurning(true);
        }
        await wait(e.action === 'fold' ? 300 : 500);
        break;
      }
      case 'signal':
        this.showSignal(e);
        if (e.kind === 'line' && e.seat !== 0) await wait(450);
        break;
      case 'board': {
        await T.gatherBets();
        T.seats.forEach((s) => {
          if (!s.out && !s.folded && !s.allIn) s.setTag('');
        });
        const dramatic = this.runout && this.pres !== 'off';
        const big = this.pres !== 'off' && T.totalPot() >= this.tableChips * 0.3;
        // M7: in a face-off the river is squeezed open in slow motion.
        if (this.bars && e.street === 'river' && this.pres === 'full') await this.moments.slowRiver(e.cards[0]);
        else await T.revealBoard(e.cards, dramatic, big || (dramatic && e.street === 'river'));
        if (e.equity) {
          if (this.bars) this.bars.set(e.equity);
          for (const q of e.equity) {
            if (!this.bars) T.seats[q.seat].showEquity(q.pct);
            if (e.street !== 'river') this.equity[q.seat] = q.pct;
          }
        }
        await wait(dramatic ? (e.street === 'river' ? 400 : 900) : 700); // a beat to read the new card
        break;
      }
      case 'uncalled': {
        const s = T.seats[e.seat];
        s.setBet(Math.max(0, s.bet - e.amount));
        s.setStack(s.stack + e.amount);
        T.refreshPot();
        break;
      }
      case 'runout': {
        this.runout = true;
        await T.gatherBets();
        if (this.pres === 'off') break;
        // M6: when cards are still to come, the face-off plays the reveals itself.
        const shows: Extract<GameEvent, { t: 'show' }>[] = [];
        for (const x of this.ahead) {
          if (x.t !== 'show') break;
          shows.push(x);
        }
        const boardComing = this.ahead.some((x) => x.t === 'board');
        if (shows.length >= 2 && boardComing) {
          shows.forEach((x) => this.consumed.add(x));
          const eq = shows[shows.length - 1].equity ?? [];
          for (const q of eq) this.equity[q.seat] = q.pct;
          shows.forEach((x) => this.faceoff.add(x.seat));
          music.setTension(1);
          this.bars = await this.moments.versus(shows.map((x) => ({ seat: x.seat, cards: x.cards })), eq, this.pres === 'full');
          for (const x of shows) {
            this.best[x.seat] = x.best;
            if (x.hand) T.seats[x.seat].showHand(x.hand, true);
          }
        } else {
          T.showBanner('ALL IN · 摊牌！');
          await wait(700);
          T.hideBanner();
        }
        break;
      }
      case 'show': {
        const s = T.seats[e.seat];
        // M8: "胜负揭晓", then a spotlight on each player as her cards turn over.
        const spotlight = this.pres !== 'off' && !this.bars;
        if (spotlight && !this.openedShowdown) {
          this.openedShowdown = true;
          T.hideBanner();
          await this.moments.showdownOpen();
        }
        if (spotlight) T.focusSeat(e.seat);
        await s.reveal(e.cards, true);
        if (e.hand) s.showHand(e.hand, this.pres !== 'off');
        this.best[e.seat] = e.best;
        if (e.equity) {
          this.bars?.set(e.equity);
          for (const q of e.equity) {
            if (!this.bars) T.seats[q.seat].showEquity(q.pct);
            this.equity[q.seat] = q.pct;
          }
        }
        if (spotlight) await wait(420);
        break;
      }
      case 'finalHands': {
        T.focusSeat(null);
        for (const h of e.hands) {
          T.seats[h.seat].showHand(h.hand, this.pres !== 'off');
          this.best[h.seat] = h.best;
          this.strengthOf[h.seat] = h.strength;
          const cards = T.seats[h.seat].cards.map((c) => c.code ?? '').filter(Boolean);
          this.addNote(h.seat, cards, h.hand, h.strength, false);
        }
        // Two monsters at once: the hands collide before anyone wins.
        const strong = e.hands.filter((h) => h.category >= STRAIGHT && this.usesHole(h.seat, h.best)).sort((a, b) => b.category - a.category);
        if (strong.length >= 2 && strong[0].category > STRAIGHT && this.pres === 'full') {
          const cardsOf = (seat: number) => T.seats[seat].cards.map((c) => c.code ?? '').filter(Boolean);
          await this.moments.cooler({ seat: strong[0].seat, cards: cardsOf(strong[0].seat) }, { seat: strong[1].seat, cards: cardsOf(strong[1].seat) });
        }
        await this.showdownReactions(e.hands.map((h) => h.seat));
        break;
      }
      case 'voluntaryShow': {
        const s = T.seats[e.seat];
        const c = this.cast[e.seat];
        if (e.cards.length === 2) {
          await s.reveal(e.cards, true);
        } else {
          // One card: flip the matching one (the hero knows which; opponents' order is cosmetic).
          const i = e.seat === 0 ? Math.max(0, this.heroHole.indexOf(e.cards[0])) : 0;
          s.cards[i].visible = true;
          await s.cards[i].flipTo(e.cards[0], 260);
        }
        if (e.hand) s.showHand(e.hand, this.pres !== 'off');
        const bluff = e.strength === 'weak' && e.cards.length === 2;
        if (e.cards.length === 2) this.addNote(e.seat, e.cards, e.hand, e.strength, true);
        if (bluff && this.pres !== 'off') {
          // M10: the ones who folded to her last bet find out they were had.
          const victims = [...(this.lastAggr?.seat === e.seat ? this.foldedAfter : this.foldedAll)].filter((v) => v !== e.seat && !T.seats[v].out);
          if (this.pres === 'full') await this.moments.bluff(e.seat, e.cards, victims);
          else {
            victims.forEach((v) => T.seats[v].fooled());
            await this.moments.quick('BLUFF!', 0xd97757);
          }
          break;
        }
        T.showBanner(`${c.name} 亮牌了${bluff ? '：是诈唬！' : ''}`, e.cards.map(prettyCard).join(' '));
        await wait(1400);
        break;
      }
      case 'tellSeen':
        this.recordTell(e);
        break;
      case 'win': {
        const first = !this.handHasWinner;
        this.handHasWinner = true;
        const c = this.cast[e.seat];
        if (first) {
          await T.gatherBets();
          T.seats.forEach((s) => s.showEquity(null));
          T.focusSeat(null);
          void this.bars?.dispose();
          this.bars = null;
          music.setTension(0);
        }
        const best = this.best[e.seat];
        T.seats.forEach((s) => s.highlightCards(s.seat === e.seat ? best : undefined));
        T.highlightBoard(e.hand ? best : undefined);
        if (first && this.pres !== 'off') await this.bigMoment(e);
        T.showBanner(`${c.name} 赢得 ${fmt(e.amount)}${e.pot > 0 ? '（边池）' : ''}`, e.hand ?? '');
        if (first && !e.hand && !this.isPerson(e.seat) && this.pres !== 'off') {
          // Everyone folded to a bot: it gloats a little.
          T.seats[e.seat].showSticker(Math.random() < 0.5 ? Sticker.Smug : Sticker.Taunt);
          this.say(e.seat, c.lines.win, 0.7);
        }
        await T.payOut(e.seat, e.amount);
        if (!this.reacted) this.say(e.seat, c.lines.win, 0.6);
        await wait(e.hand ? 1200 : 700);
        break;
      }
      case 'handEnd':
        this.handActive = false;
        T.seats.forEach((s) => s.setActive(false));
        this.updateHud();
        break;
      case 'eliminated': {
        const place = e.place === e.placeTo ? `第 ${e.place} 名` : `并列第 ${e.place} 名`;
        this.say(e.seat, this.cast[e.seat].lines.out, 1);
        await this.moments.eliminate(e.seat, place, this.pres === 'full');
        if (e.seat === 0) {
          this.heroOut = true;
          this.ui.hideTalk();
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
