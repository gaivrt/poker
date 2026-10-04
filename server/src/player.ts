// A connected (or briefly disconnected) player.
import type { WebSocket } from 'ws';
import type { ClientMsg, ServerMsg } from '../../web/src/net/protocol.ts';
import type { Account } from './store.ts';
import type { Table } from './table.ts';

type Waiter = { type: ClientMsg['t']; resolve: (m: ClientMsg | null) => void; timer: NodeJS.Timeout };

export class Player {
  ws: WebSocket | null = null;
  table: Table | null = null;
  seat = -1;
  /** Left the table on purpose: it plays itself until the game ends. */
  away = false;
  private waiters: Waiter[] = [];

  account: Account;

  constructor(account: Account) {
    this.account = account;
  }

  get name() {
    return this.account.name;
  }

  get connected() {
    return !!this.ws && this.ws.readyState === 1;
  }

  send(msg: ServerMsg) {
    if (this.connected) this.ws!.send(JSON.stringify(msg));
  }

  /** Waits for the next message of a type (null on timeout). */
  expect<T extends ClientMsg['t']>(type: T, ms: number): Promise<Extract<ClientMsg, { t: T }> | null> {
    return new Promise((resolve) => {
      const w: Waiter = {
        type,
        resolve: resolve as (m: ClientMsg | null) => void,
        timer: setTimeout(() => {
          this.waiters = this.waiters.filter((x) => x !== w);
          resolve(null);
        }, ms),
      };
      this.waiters.push(w);
    });
  }

  /** Hands a message to whoever is waiting for it; false when nobody was. */
  deliver(msg: ClientMsg): boolean {
    const w = this.waiters.find((x) => x.type === msg.t);
    if (!w) return false;
    clearTimeout(w.timer);
    this.waiters = this.waiters.filter((x) => x !== w);
    w.resolve(msg);
    return true;
  }

  /** Stop waiting (disconnected, or the table moved on). */
  cancelWaits() {
    for (const w of this.waiters) {
      clearTimeout(w.timer);
      w.resolve(null);
    }
    this.waiters = [];
  }
}
