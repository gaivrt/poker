// Matchmaking: one queue per format. The first player in starts a countdown; when it
// runs out (or six players are waiting) a table starts and bots fill the empty seats.
import type { OnlineFormat } from '../../web/src/net/protocol.ts';
import type { Player } from './player.ts';

interface Queue {
  players: Player[];
  deadline: number;
}

export class Matchmaker {
  private queues = new Map<OnlineFormat, Queue>();
  private waitMs: number;
  private start: (format: OnlineFormat, players: Player[]) => void;

  constructor(waitMs: number, start: (format: OnlineFormat, players: Player[]) => void) {
    this.waitMs = waitMs;
    this.start = start;
    setInterval(() => this.tick(), 1000);
  }

  get waiting() {
    let n = 0;
    for (const q of this.queues.values()) n += q.players.length;
    return n;
  }

  join(p: Player, format: OnlineFormat) {
    this.leave(p);
    let q = this.queues.get(format);
    if (!q) {
      q = { players: [], deadline: Date.now() + this.waitMs };
      this.queues.set(format, q);
    }
    q.players.push(p);
    if (q.players.length >= 6) this.launch(format, q);
    else this.status(format, q);
  }

  leave(p: Player) {
    for (const [format, q] of this.queues) {
      const before = q.players.length;
      q.players = q.players.filter((x) => x !== p);
      if (q.players.length !== before) {
        if (!q.players.length) this.queues.delete(format);
        else this.status(format, q);
      }
    }
  }

  private tick() {
    for (const [format, q] of this.queues) {
      q.players = q.players.filter((p) => p.connected && !p.table);
      if (!q.players.length) {
        this.queues.delete(format);
        continue;
      }
      if (Date.now() >= q.deadline) this.launch(format, q);
      else this.status(format, q);
    }
  }

  private launch(format: OnlineFormat, q: Queue) {
    const players = q.players.splice(0, 6);
    if (!q.players.length) this.queues.delete(format);
    else q.deadline = Date.now() + this.waitMs;
    this.start(format, players);
  }

  private status(format: OnlineFormat, q: Queue) {
    const seconds = Math.max(0, Math.ceil((q.deadline - Date.now()) / 1000));
    for (const p of q.players) p.send({ t: 'queue', format, found: q.players.length, seconds });
  }
}
