// Drives one game: asks the engine for events, plays them as animations, and paces
// bot turns. The engine decides everything; this file only decides how it looks.
//
// Mind games (docs/06-mind-games.md): table talk is sent through the overlay at any
// time; bots think on a visible clock and may leak tells while they do; every hand
// that gets turned face up is written into the "reading notes" next to what that
// player said and did, so you can learn their habits.
import type { Container } from 'pixi.js';
import { type Character, EXPRESSION_LABEL, STICKER_LABEL, gestureCaption, pick, talkLine } from './characters';
import { Expression, type Game, type GameEvent, Gesture, type SignalKindName, Sticker, type StrengthName, type TableState } from './engine';
import type { Face } from './fx/stickers';
import { allInCutIn, bigHand, riverPunch } from './fx/effects';
import type { TableView } from './table/TableView';
import { fmt } from './table/layout';
import { timing, wait } from './tween';
import type { Clock, Overlay } from './ui/overlay';

const BIG_HAND_CATEGORY = 7; // four of a kind and up (HandCategory in hand_eval.hpp)
const TELLS_KEY = 'poker.tells.v1';
const TELL_UNLOCK = 2; // sightings needed before a tell goes into the collection

interface Note {
  hand: number;
  cards: string[];
  handName?: string;
  strength?: StrengthName;
  did: string[];
  voluntary: boolean;
}

interface TellRecord {
  count: number;
  text: string;
  character: string;
}

function loadTells(): Record<string, TellRecord> {
  try {
    return JSON.parse(localStorage.getItem(TELLS_KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
}
function saveTells(t: Record<string, TellRecord>) {
  try {
    localStorage.setItem(TELLS_KEY, JSON.stringify(t));
  } catch {
    /* storage unavailable */
  }
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

  constructor(
    private game: Game,
    private table: TableView,
    private ui: Overlay,
    private cast: Character[],
    private camera: Container,
    private fxLayer: Container,
    private onFinished: () => void,
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

  // ---------------- table talk ----------------

  private talk(kind: SignalKindName, code: number, target: number): boolean {
    if (this.stopped || this.heroOut) return false;
    const ok = this.game.signal(kind, code, target);
    for (const e of this.game.drain()) {
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
    if (this.game.handRunning || this.handHasWinner) this.did[e.seat].push(note);
  }

  private recordTell(e: Extract<GameEvent, { t: 'tellSeen' }>) {
    const tells = loadTells();
    const key = String(e.tell);
    const rec = tells[key] ?? { count: 0, text: e.text, character: this.cast[e.seat].name };
    rec.count += 1;
    tells[key] = rec;
    saveTells(tells);
    if (rec.count === TELL_UNLOCK) this.ui.toast(`发现破绽！${rec.character}：${rec.text}`);
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
    T.showBanner('胜负揭晓');
    await wait(700);
    for (const seat of revealed) {
      if (seat === 0) continue; // the system never acts for the human
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
    await wait(1300);
    T.hideBanner();
  }

  // ---------------- event playback ----------------

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
    const all = [...this.backlog.splice(0), ...events];
    for (const e of all)
      if (e.t === 'win') {
        this.winners.add(e.seat);
        this.wonTotal[e.seat] = (this.wonTotal[e.seat] ?? 0) + e.amount;
      }
    for (const e of all) {
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
        this.did = this.did.map(() => []);
        this.heroHole = [];
        this.equity = {};
        this.winners.clear();
        this.wonTotal = {};
        this.reacted = false;
        this.tableChips = e.stacks.reduce((a, b) => a + b, 0);
        this.lineCooldown = this.lineCooldown.map((c) => Math.max(0, c - 1));
        this.ui.resetPreActions();
        T.newHand(e.stacks, e.button);
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
        void T.flyChip(s.L.avatar, { x: 960, y: 357 }, 300);
        T.pot += e.amount;
        T.refreshPot();
        break;
      }
      case 'hole':
        this.heroHole = e.cards;
        await T.seats[e.seat].reveal(e.cards);
        break;
      case 'act': {
        const s = T.seats[e.seat];
        const c = this.cast[e.seat];
        s.setActive(false);
        const secs = e.thinkMs !== undefined ? ` ${(e.thinkMs / 1000).toFixed(1)}s` : '';
        const size = e.potPct ? ` ${e.potPct}%池` : '';
        if (e.action === 'fold') {
          s.setFolded(true);
          s.setTag('弃牌', 0x9a94b8);
        } else if (e.action === 'check') {
          s.setTag(`过牌${secs}`, 0xcfe9df);
        } else {
          const verb = e.action === 'call' ? '跟注' : e.action === 'bet' ? '下注' : '加注';
          s.setStack(s.stack - e.amount);
          s.setBet(e.total);
          s.setTag(`${verb}${size}${secs}`, 0xffe08a);
          void T.flyChip(s.L.avatar, s.betPos, 220);
          // How big and how fast the chips went in is part of what others can read.
          const sizeNote = e.potPct ? `（底池的 ${e.potPct}%）` : '';
          if (e.thinkMs !== undefined) this.did[e.seat].push(`${verb}${sizeNote}前想了 ${(e.thinkMs / 1000).toFixed(1)} 秒`);
          else if (sizeNote) this.did[e.seat].push(`${verb}${sizeNote}`);
        }
        T.refreshPot();
        if (e.allIn) {
          s.markAllIn();
          if (this.pres === 'full') await allInCutIn(this.fxLayer, c, pick(c.lines.allIn) ?? 'ALL IN！');
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
        if (dramatic && e.street === 'river' && this.pres === 'full') {
          await wait(500);
          await Promise.all([T.revealBoard(e.cards, true), riverPunch(this.camera)]);
        } else {
          await T.revealBoard(e.cards, dramatic);
        }
        if (e.equity)
          for (const q of e.equity) {
            T.seats[q.seat].showEquity(q.pct);
            if (e.street !== 'river') this.equity[q.seat] = q.pct;
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
        if (e.equity)
          for (const q of e.equity) {
            T.seats[q.seat].showEquity(q.pct);
            this.equity[q.seat] = q.pct;
          }
        break;
      }
      case 'finalHands':
        for (const h of e.hands) {
          T.seats[h.seat].showHand(h.hand);
          this.best[h.seat] = h.best;
          const cards = T.seats[h.seat].cards.map((c) => c.code ?? '').filter(Boolean);
          this.addNote(h.seat, cards, h.hand, h.strength, false);
        }
        await this.showdownReactions(e.hands.map((h) => h.seat));
        break;
      case 'voluntaryShow': {
        const s = T.seats[e.seat];
        const c = this.cast[e.seat];
        if (e.cards.length === 2) {
          await s.reveal(e.cards);
        } else {
          // One card: flip the matching one (the hero knows which; opponents' order is cosmetic).
          const i = e.seat === 0 ? Math.max(0, this.heroHole.indexOf(e.cards[0])) : 0;
          s.cards[i].visible = true;
          await s.cards[i].flipTo(e.cards[0], 260);
        }
        if (e.hand) s.showHand(e.hand);
        const bluff = e.strength === 'weak';
        T.showBanner(`${c.name} 亮牌了${bluff ? '：是诈唬！' : ''}`, e.cards.map(prettyCard).join(' '));
        if (e.cards.length === 2) this.addNote(e.seat, e.cards, e.hand, e.strength, true);
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
        }
        const best = this.best[e.seat];
        T.seats.forEach((s) => s.highlightCards(s.seat === e.seat ? best : undefined));
        T.highlightBoard(e.hand ? best : undefined);
        T.showBanner(`${c.name} 赢得 ${fmt(e.amount)}${e.pot > 0 ? '（边池）' : ''}`, e.hand ?? '');
        if (e.category !== undefined && e.category >= BIG_HAND_CATEGORY && this.pres === 'full' && e.pot === 0)
          await bigHand(this.fxLayer, c, e.royal ? '皇家同花顺' : (e.hand ?? '').split(' ')[0], !!e.royal);
        else if (first && e.seat !== 0 && this.pres === 'full' && (this.wonTotal[e.seat] ?? 0) >= this.tableChips * 0.25)
          await allInCutIn(this.fxLayer, c, pick(c.lines.win) ?? '我赢了！', 'WIN', 0xe0a630);
        if (first && !e.hand && e.seat !== 0 && this.pres !== 'off') {
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
        T.seats.forEach((s) => s.setActive(false));
        this.updateHud();
        break;
      case 'eliminated': {
        const place = e.place === e.placeTo ? `第 ${e.place} 名` : `并列第 ${e.place} 名`;
        T.seats[e.seat].setOut(place);
        this.say(e.seat, this.cast[e.seat].lines.out, 1);
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
