// The online protocol: JSON messages over one WebSocket (docs/09-online.md).
// Shared by the client (web/src/net) and the server (server/src); types only.
//
// The server runs the same C++ engine (as WebAssembly) and is the only authority.
// Seats are rotated per player: every client sees itself in seat 0, exactly like the
// single-player game, so the same table and director code plays both.
import type { ActionName, GameEvent, Legal, SignalKindName, Standing, TableState } from '../engine';

export const PROTOCOL_VERSION = 1;

/** Online games are ranked; the classic knockout stays offline. */
export type OnlineFormat = 'quick' | 'standard';

export interface BetContext {
  pot: number;
  currentBet: number;
  bb: number;
  sb: number;
  preflop: boolean;
}

export interface SeatInfo {
  /** Players' names; bots go by their character's name. */
  name: string;
  bot: boolean;
  /** Which character art to use (personality preset index, 0..5). */
  look: number;
}

// ---------------- client → server ----------------
export type ClientMsg =
  | { t: 'hello'; v: number; name: string; token?: string }
  | { t: 'queue'; format: OnlineFormat }
  | { t: 'cancel' }
  /** Your action; only valid after an "ask". */
  | { t: 'act'; type: ActionName; to: number }
  | { t: 'signal'; kind: SignalKindName; code: number; target: number }
  /** Answer to "askShow": 0 muck, 1 first card, 2 second, 3 both. */
  | { t: 'show'; mask: 0 | 1 | 2 | 3 }
  /** Finished playing the "events" batch `seq` (the table waits for everyone, briefly). */
  | { t: 'ready'; seq: number }
  /** Leave the table: the rest of the game plays itself (check or fold). */
  | { t: 'leave' }
  | { t: 'ping' };

// ---------------- server → client ----------------
export type ServerMsg =
  | { t: 'welcome'; token: string; name: string; points: number; games: number; online: number }
  | { t: 'queue'; format: OnlineFormat; found: number; seconds: number }
  | { t: 'matched'; table: string; format: OnlineFormat; seats: SeatInfo[]; rejoin: boolean }
  /** Game events to play in order; answer with "ready". `replay`: catching up after a reconnect (play instantly). */
  | { t: 'events'; seq: number; events: GameEvent[]; state: TableState; replay?: boolean }
  /** Table talk: show it at once, out of turn. */
  | { t: 'live'; events: GameEvent[] }
  /** Someone is thinking (seat in your rotation); `ms`: the time they have. */
  | { t: 'turn'; seat: number; ms: number }
  /** Your turn. */
  | { t: 'ask'; legal: Legal; ctx: BetContext; clock: { perActionMs: number; bankMs: number } }
  | { t: 'askShow'; cards: string[]; ms: number }
  /** The pause between hands. */
  | { t: 'pause'; ms: number }
  | { t: 'end'; standings: Standing[]; rank: { before: number; after: number } }
  | { t: 'refused'; what: 'signal' | 'act' | 'queue'; reason?: string }
  | { t: 'error'; message: string }
  | { t: 'pong' };
