// Typed wrapper around the C++ engine compiled to WebAssembly.
import createPokerModule, { type PokerModule, type WasmSession } from './wasm/poker.js';

export type Format = 'quick' | 'standard' | 'classic';
export type Difficulty = 0 | 1 | 2;
export type ActionName = 'fold' | 'check' | 'call' | 'bet' | 'raise';
export type SignalKindName = 'line' | 'expression' | 'gesture';
export type StrengthName = 'weak' | 'medium' | 'strong';

// Codes mirror core/include/poker/talk.hpp.
export const SIGNAL_KIND: Record<SignalKindName, number> = { line: 0, expression: 1, gesture: 2 };
export enum LineKind { Taunt, Weak, Confident, Probe, Hurry, Plead }
export enum Expression { Calm, Smug, Nervous, Smile, Angry }
export enum Gesture { RecheckCards, FiddleChips, Stare, Sigh }

export interface Equity {
  seat: number;
  pct: number;
}
export interface Standing {
  seat: number;
  place: number;
  placeTo: number;
  chips: number;
}

export type GameEvent =
  | {
      t: 'handStart';
      hand: number;
      maxHands: number;
      level: number;
      handsPerLevel: number;
      sb: number;
      bb: number;
      ante: number;
      button: number;
      stacks: number[];
    }
  | { t: 'postSB' | 'postBB' | 'postAnte'; seat: number; amount: number; allIn: boolean }
  | { t: 'hole'; seat: number; cards: string[] }
  | { t: 'act'; seat: number; action: ActionName; amount: number; total: number; allIn: boolean; street: string; thinkMs?: number }
  | { t: 'board'; street: string; cards: string[]; equity?: Equity[] }
  | { t: 'uncalled'; seat: number; amount: number }
  | { t: 'runout' }
  | { t: 'show'; seat: number; cards: string[]; hand?: string; category?: number; best?: string[]; equity?: Equity[] }
  | { t: 'finalHands'; hands: { seat: number; hand: string; category: number; best: string[]; strength: StrengthName }[] }
  | { t: 'signal'; seat: number; kind: SignalKindName; code: number; target: number }
  | { t: 'voluntaryShow'; seat: number; cards: string[]; strength?: StrengthName; hand?: string }
  | { t: 'tellSeen'; seat: number; tell: number; text: string }
  | { t: 'win'; seat: number; amount: number; pot: number; hand?: string; category?: number; royal?: boolean }
  | { t: 'handEnd' }
  | { t: 'eliminated'; seat: number; place: number; placeTo: number }
  | { t: 'tournamentEnd'; standings: Standing[] };

export interface SeatState {
  stack: number;
  bet: number;
  inHand: boolean;
  folded: boolean;
  allIn: boolean;
}
export interface TableState {
  finished: boolean;
  handsPlayed: number;
  maxHands: number;
  toAct: number;
  seats: SeatState[];
  pot?: number;
  button?: number;
  board?: string[];
  hole?: string[];
  currentBet?: number;
  bb?: number;
  sb?: number;
}
export interface Legal {
  canFold: boolean;
  canCheck: boolean;
  canCall: boolean;
  canBet: boolean;
  canRaise: boolean;
  toCall?: number;
  minTo?: number;
  maxTo?: number;
}

let modulePromise: Promise<PokerModule> | null = null;
export function loadEngine(): Promise<PokerModule> {
  modulePromise ??= createPokerModule();
  return modulePromise;
}

export class Game {
  private s: WasmSession;
  /** Personality preset index per seat; -1 = the human. */
  readonly roster: number[];

  constructor(mod: PokerModule, format: Format, difficulty: Difficulty, seed: number) {
    this.s = new mod.Session(format, difficulty, seed >>> 0);
    this.roster = JSON.parse(this.s.roster());
  }

  get finished() { return this.s.finished(); }
  get handRunning() { return this.s.handRunning(); }
  get isHumanTurn() { return this.s.isHumanTurn(); }
  startHand() { this.s.startHand(); }
  /** The bot to act plans its move; null when it is not a bot's turn. */
  prepareBot(): { seat: number; thinkMs: number } | null {
    const p = JSON.parse(this.s.prepareBot());
    return typeof p.seat === 'number' ? p : null;
  }
  stepBot() { return this.s.stepBot(); }
  act(type: ActionName, to = 0, thinkMs = 0) { return this.s.humanAct(type, to, Math.round(thinkMs)); }
  signal(kind: SignalKindName, code: number, target = -1) { return this.s.humanSignal(SIGNAL_KIND[kind], code, target); }
  get canShow() { return this.s.canHumanShow(); }
  show(mask: 1 | 2 | 3) { return this.s.humanShow(mask); }
  finishHand() { this.s.finishHand(); }
  drain(): GameEvent[] { return JSON.parse(this.s.drainEvents()); }
  state(): TableState { return JSON.parse(this.s.state()); }
  legal(): Legal { return JSON.parse(this.s.legal()); }
  standings(): Standing[] { return JSON.parse(this.s.standings()); }
  dispose() { this.s.delete(); }
}
