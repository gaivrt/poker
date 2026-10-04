// One online table: six seats, people and bots, played in real time by the server.
//
// The engine (C++ → WebAssembly) decides everything. The table only paces it:
// after each batch of events it waits until every player's client has finished
// animating it (with a cap, so one slow client can't hold up the table), gives
// bots their thinking time, and runs each person's action clock.
import { randomBytes } from 'node:crypto';
import type { ActionName, GameEvent, Legal, SignalKindName, Standing, TableState } from '../../web/src/engine.ts';
import type { ClientMsg, OnlineFormat, SeatInfo, ServerMsg } from '../../web/src/net/protocol.ts';
import type { PokerModule, WasmSession } from '../../web/src/wasm/poker.js';
import type { Player } from './player.ts';
import { rotate, unrot } from './rotate.ts';
import type { Store } from './store.ts';

export const PER_ACTION_MS = 20000;
export const BANK_MS = 30000;
const ACK_CAP_MS = 10000;       // longest wait for a slow client after a batch
const PAUSE_MS = 4000;          // between hands
const SHOW_MS = 5000;           // to decide whether to show after winning uncontested
const ABANDONED_MS = 60000;     // nobody watching this long: play out the rest without pauses
const SIGNAL_KIND: Record<SignalKindName, number> = { line: 0, expression: 1, gesture: 2, sticker: 3 };
const ACTIONS: ActionName[] = ['fold', 'check', 'call', 'bet', 'raise'];
// Ranked points by place (1st..6th), shared places averaged; see docs/04 §2.3.
const PLACE_POINTS = [60, 30, 10, 0, -15, -30];

export interface TableDeps {
  mod: PokerModule;
  store: Store;
  log: (line: string) => void;
  onClose: (t: Table) => void;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class Table {
  readonly id = randomBytes(6).toString('hex');
  readonly format: OnlineFormat;
  readonly seats: (Player | null)[] = [null, null, null, null, null, null];
  finished = false;
  private s: WasmSession;
  private info: SeatInfo[] = [];
  private seq = 0;
  private acked = new Map<Player, number>();
  private handLog: { to: number; e: GameEvent }[] = [];
  private bank = [BANK_MS, BANK_MS, BANK_MS, BANK_MS, BANK_MS, BANK_MS];
  private asking: { player: Player; since: number; msg: Extract<ServerMsg, { t: 'ask' }> } | null = null;
  private emptySince = 0;
  private deps: TableDeps;

  constructor(deps: TableDeps, format: OnlineFormat, players: Player[], difficulty: number) {
    this.deps = deps;
    this.format = format;
    // People take random seats; bots fill the rest.
    const free = [0, 1, 2, 3, 4, 5];
    for (let i = free.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [free[i], free[j]] = [free[j], free[i]];
    }
    let mask = 0;
    players.slice(0, 6).forEach((p, i) => {
      const seat = free[i];
      this.seats[seat] = p;
      p.table = this;
      p.seat = seat;
      p.away = false;
      mask |= 1 << seat;
    });
    this.s = new deps.mod.Session(format, difficulty, randomBytes(4).readUInt32LE(0), mask);
    // Character art: bots have their own; people get the looks no bot is using.
    const roster = JSON.parse(this.s.roster()) as number[];
    const spare = [0, 1, 2, 3, 4, 5].filter((p) => !roster.includes(p));
    this.info = roster.map((look, seat) => {
      const p = this.seats[seat];
      return p ? { name: p.name, bot: false, look: spare.shift() ?? 0 } : { name: '', bot: true, look };
    });
    deps.store.gameStarted(this.id, format);
    deps.log(`table ${this.id} ${format}: ${players.map((p) => p.name).join(', ')} + ${6 - players.length} bots (difficulty ${difficulty})`);
  }

  private people(): Player[] {
    return this.seats.filter((p): p is Player => !!p);
  }

  private get watched() {
    return this.people().some((p) => p.connected && !p.away);
  }

  // ---------------- the game loop ----------------

  async run() {
    try {
      this.s.startHand();
      for (const p of this.people()) this.sendMatched(p, false);
      await this.flushAndWait();
      while (!this.s.finished()) {
        if (this.s.handRunning()) {
          const seat = this.s.toAct();
          if (this.s.isHumanTurn()) await this.humanTurn(seat);
          else await this.botTurn(seat);
          await this.flushAndWait();
        } else {
          await this.handEnd();
        }
      }
      this.end();
    } catch (err) {
      this.deps.log(`table ${this.id} crashed: ${(err as Error).stack}`);
      for (const p of this.people()) p.send({ t: 'error', message: '牌桌出错了，这局不计分。' });
      this.close();
    }
  }

  private async humanTurn(seat: number) {
    const p = this.seats[seat]!;
    const clock = { perActionMs: PER_ACTION_MS, bankMs: this.bank[seat] };
    this.broadcastTurn(seat, clock.perActionMs + clock.bankMs, p);
    if (p.away || this.abandoned()) {
      await this.pace(400);
      this.autoAct(seat);
      return;
    }
    const st = JSON.parse(this.s.stateFor(seat)) as TableState;
    const msg: Extract<ServerMsg, { t: 'ask' }> = {
      t: 'ask',
      legal: JSON.parse(this.s.legal()) as Legal,
      ctx: { pot: st.pot ?? 0, currentBet: st.currentBet ?? 0, bb: st.bb ?? 0, sb: st.sb ?? 0, preflop: (st.board ?? []).length === 0 },
      clock,
    };
    const since = Date.now();
    this.asking = { player: p, since, msg };
    p.send(msg);
    // A disconnected player keeps their clock: they may come back in time.
    const reply = await p.expect('act', clock.perActionMs + clock.bankMs + 1500);
    this.asking = null;
    const used = Date.now() - since;
    this.bank[seat] = Math.max(0, this.bank[seat] - Math.max(0, used - PER_ACTION_MS));
    if (reply && ACTIONS.includes(reply.type) && Number.isFinite(reply.to) && this.s.humanAct(reply.type, reply.to, used)) return;
    if (reply) p.send({ t: 'refused', what: 'act' });
    this.autoAct(seat);
  }

  /** Out of time, gone, or an invalid move: check if possible, else fold. */
  private autoAct(_seat: number) {
    const legal = JSON.parse(this.s.legal()) as Legal;
    this.s.humanAct(legal.canCheck ? 'check' : 'fold', 0, PER_ACTION_MS);
  }

  private async botTurn(seat: number) {
    const plan = JSON.parse(this.s.prepareBot()) as { seat?: number; thinkMs?: number };
    await this.flushAndWait(3000); // tells that slip out while it thinks
    const ms = plan.thinkMs ?? 800;
    this.broadcastTurn(seat, ms);
    await this.pace(ms);
    this.s.stepBot();
  }

  private async handEnd() {
    // Players who won uncontested may show their cards.
    await Promise.all(
      this.people()
        .filter((p) => this.s.canShow(p.seat) && p.connected && !p.away)
        .map(async (p) => {
          const st = JSON.parse(this.s.stateFor(p.seat)) as TableState;
          p.send({ t: 'askShow', cards: st.hole ?? [], ms: SHOW_MS });
          const r = await p.expect('show', SHOW_MS + 1000);
          if (r && r.mask >= 1 && r.mask <= 3) this.s.show(p.seat, r.mask);
        }),
    );
    await this.flushAndWait();
    this.broadcast({ t: 'pause', ms: PAUSE_MS });
    await this.pace(PAUSE_MS);
    this.s.finishHand();
    await this.flushAndWait();
    if (!this.s.finished()) {
      this.s.startHand();
      await this.flushAndWait();
    }
  }

  /** Nobody has been watching for a while: the rest of the game plays out without pauses. */
  private abandoned() {
    if (this.watched) {
      this.emptySince = 0;
      return false;
    }
    if (!this.emptySince) this.emptySince = Date.now();
    return Date.now() - this.emptySince > ABANDONED_MS;
  }

  private async pace(ms: number) {
    if (!this.abandoned()) await sleep(ms);
  }

  private end() {
    const standings = JSON.parse(this.s.standings()) as Standing[];
    const results: { name: string; place: number; delta: number }[] = [];
    for (const p of this.people()) {
      const row = standings.find((r) => r.seat === p.seat)!;
      let sum = 0;
      for (let k = row.place; k <= row.placeTo; k++) sum += PLACE_POINTS[k - 1] ?? 0;
      const delta = sum / (row.placeTo - row.place + 1);
      const before = p.account.points;
      p.account = this.deps.store.addResult(p.account.token, delta);
      results.push({ name: p.name, place: row.place, delta });
      p.send({ t: 'end', standings: rotate(standings, p.seat), rank: { before, after: p.account.points } });
    }
    this.deps.store.gameFinished(this.id, { standings, results });
    this.deps.log(`table ${this.id} finished: ${results.map((r) => `${r.name} #${r.place} ${r.delta >= 0 ? '+' : ''}${r.delta}`).join(', ')}`);
    this.close();
  }

  private close() {
    this.finished = true;
    for (const p of this.people()) {
      p.cancelWaits();
      if (p.table === this) {
        p.table = null;
        p.seat = -1;
        p.away = false;
      }
    }
    this.s.delete();
    this.deps.onClose(this);
  }

  // ---------------- sending ----------------

  private broadcast(msg: ServerMsg) {
    for (const p of this.people()) if (!p.away) p.send(msg);
  }

  private broadcastTurn(seat: number, ms: number, except?: Player) {
    for (const p of this.people()) if (p !== except && !p.away) p.send(rotate({ t: 'turn', seat, ms }, p.seat));
  }

  private sendMatched(p: Player, rejoin: boolean) {
    p.send(rotate({ t: 'matched', table: this.id, format: this.format, seats: this.info, rejoin }, p.seat));
  }

  /** Sends new events to everyone (each sees their own cards, in their own rotation). */
  private flush(live = false): number | null {
    const raw = JSON.parse(this.s.drainAll()) as { to: number; e: GameEvent }[];
    if (!raw.length) return null;
    for (const r of raw) {
      if (r.e.t === 'handStart') this.handLog = [];
      this.handLog.push(r);
    }
    const seq = live ? this.seq : ++this.seq;
    for (const p of this.people()) {
      if (!p.connected || p.away) continue;
      const events = raw.filter((r) => r.to < 0 || r.to === p.seat).map((r) => rotate(r.e, p.seat));
      if (!events.length) {
        if (!live) this.acked.set(p, seq);
        continue;
      }
      if (live) p.send({ t: 'live', events });
      else p.send({ t: 'events', seq, events, state: rotate(JSON.parse(this.s.stateFor(p.seat)) as TableState, p.seat) });
    }
    return live ? null : seq;
  }

  private async flushAndWait(cap = ACK_CAP_MS) {
    const seq = this.flush();
    if (seq === null) return;
    const end = Date.now() + cap;
    while (Date.now() < end) {
      if (this.people().every((p) => !p.connected || p.away || (this.acked.get(p) ?? 0) >= seq)) return;
      await sleep(40);
    }
  }

  // ---------------- from players ----------------

  onMessage(p: Player, msg: ClientMsg) {
    if (msg.t === 'ready') {
      if (Number.isInteger(msg.seq)) this.acked.set(p, Math.max(this.acked.get(p) ?? 0, msg.seq));
    } else if (msg.t === 'act' || msg.t === 'show') {
      p.deliver(msg);
    } else if (msg.t === 'signal') {
      const kind = SIGNAL_KIND[msg.kind];
      const target = Number.isInteger(msg.target) ? unrot(msg.target, p.seat) : -2;
      if (kind !== undefined && Number.isInteger(msg.code) && this.s.signalFrom(p.seat, kind, msg.code, target)) this.flush(true);
      else p.send({ t: 'refused', what: 'signal' });
    } else if (msg.t === 'leave') {
      p.away = true;
      p.cancelWaits();
      this.deps.log(`table ${this.id}: ${p.name} left`);
    }
  }

  /** Back after a disconnect: the current hand is replayed (instantly) to catch up. */
  rejoin(p: Player) {
    p.away = false;
    this.sendMatched(p, true);
    const events = this.handLog.filter((r) => r.to < 0 || r.to === p.seat).map((r) => rotate(r.e, p.seat));
    p.send({ t: 'events', seq: this.seq, events, state: rotate(JSON.parse(this.s.stateFor(p.seat)) as TableState, p.seat), replay: true });
    if (this.asking?.player === p) {
      const used = Date.now() - this.asking.since;
      const per = Math.max(0, PER_ACTION_MS - used);
      const bank = Math.max(0, this.asking.msg.clock.bankMs - Math.max(0, used - PER_ACTION_MS));
      p.send({ ...this.asking.msg, clock: { perActionMs: per, bankMs: bank } });
    }
    this.deps.log(`table ${this.id}: ${p.name} rejoined`);
  }
}
