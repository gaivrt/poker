// Smoke test: N scripted players queue up, play a whole game (check or call, some
// table talk, show when allowed), acknowledge every batch, and check the results.
//
//   MATCH_WAIT_SEC=2 node src/main.ts &   node tools/smoke.ts [players=3] [ws://localhost:8787/ws]
import { WebSocket } from 'ws';
import type { ClientMsg, ServerMsg } from '../../web/src/net/protocol.ts';

const N = Number(process.argv[2] ?? 3);
const URL = process.argv[3] ?? 'ws://localhost:8787/ws';
const started = Date.now();

function bot(i: number): Promise<{ name: string; ok: boolean; hands: number; place: number; points: string; errors: string[] }> {
  return new Promise((done) => {
    const ws = new WebSocket(URL);
    const name = `测试${i}`;
    const send = (m: ClientMsg) => ws.send(JSON.stringify(m));
    let hands = 0;
    const errors: string[] = [];
    let mySeen = 0;
    ws.on('open', () => send({ t: 'hello', v: 1, name }));
    ws.on('message', (raw) => {
      const m = JSON.parse(String(raw)) as ServerMsg;
      switch (m.t) {
        case 'welcome':
          send({ t: 'queue', format: 'quick' });
          break;
        case 'matched':
          if (m.seats.length !== 6 || m.seats[0].name !== name) errors.push('seat 0 is not me');
          break;
        case 'events':
          for (const e of m.events) {
            if (e.t === 'handStart') hands++;
            if (e.t === 'hole') {
              if (e.seat !== 0) errors.push(`saw hole cards of seat ${e.seat}`);
              mySeen++;
            }
          }
          setTimeout(() => send({ t: 'ready', seq: m.seq }), 20);
          break;
        case 'ask':
          if (Math.random() < 0.2) send({ t: 'signal', kind: 'line', code: Math.floor(Math.random() * 6), target: -1 });
          setTimeout(() => send({ t: 'act', type: m.legal.canCheck ? 'check' : 'call', to: 0 }), 50 + Math.random() * 200);
          break;
        case 'askShow':
          send({ t: 'show', mask: 3 });
          break;
        case 'refused':
          if (m.what === 'act') errors.push('act refused');
          break;
        case 'error':
          errors.push(m.message);
          break;
        case 'end': {
          const me = m.standings.find((s) => s.seat === 0)!;
          ws.close();
          done({ name, ok: errors.length === 0 && mySeen > 0, hands, place: me.place, points: `${m.rank.before}→${m.rank.after}`, errors });
          break;
        }
      }
    });
    ws.on('error', (e) => done({ name, ok: false, hands, place: 0, points: '', errors: [String(e)] }));
  });
}

const results = await Promise.all(Array.from({ length: N }, (_, i) => bot(i + 1)));
console.log(JSON.stringify({ seconds: Math.round((Date.now() - started) / 1000), results }, null, 1));
process.exit(results.every((r) => r.ok) ? 0 : 1);
