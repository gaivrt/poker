// The online game server (docs/09-online.md).
//
//   node src/main.ts            (Node 22.18+ runs TypeScript directly)
//
// Environment:
//   PORT=8787                   HTTP + WebSocket port (WebSocket at /ws)
//   STATIC_DIR=../web/dist      the built web client, served at / (optional)
//   DB_FILE=./data/poker.db     SQLite file for accounts and results
//   MATCH_WAIT_SEC=20           how long matchmaking waits for players before bots fill in
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, resolve } from 'node:path';
import { WebSocketServer } from 'ws';
import createPokerModule from '../../web/src/wasm/poker.js';
import { type ClientMsg, type OnlineFormat, PROTOCOL_VERSION } from '../../web/src/net/protocol.ts';
import { Matchmaker } from './matchmaker.ts';
import { Player } from './player.ts';
import { Store } from './store.ts';
import { Table } from './table.ts';

const here = import.meta.dirname;
const PORT = Number(process.env.PORT ?? 8787);
const STATIC_DIR = resolve(process.env.STATIC_DIR ?? join(here, '../../web/dist'));
const DB_FILE = process.env.DB_FILE ?? join(here, '../data/poker.db');
const MATCH_WAIT_MS = Number(process.env.MATCH_WAIT_SEC ?? 20) * 1000;

const log = (line: string) => console.log(`${new Date().toISOString()} ${line}`);
const mod = await createPokerModule();
const store = new Store(DB_FILE);
const players = new Map<string, Player>(); // by account token
const tables = new Set<Table>();

const matchmaker = new Matchmaker(MATCH_WAIT_MS, (format, group) => {
  // Opponents get tougher from 黄金 (600 points) up, by the group's average.
  const avg = group.reduce((a, p) => a + p.account.points, 0) / group.length;
  const table = new Table({ mod, store, log, onClose: (t) => tables.delete(t) }, format, group, avg >= 600 ? 2 : 1);
  tables.add(table);
  void table.run();
});

// ---------------- HTTP: health check and the static client ----------------

const MIME: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg', '.wav': 'audio/wav', '.woff2': 'font/woff2', '.ico': 'image/x-icon',
};

const server = createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://x');
  if (url.pathname === '/healthz') {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true, online: [...players.values()].filter((p) => p.connected).length, tables: tables.size, queue: matchmaker.waiting }));
    return;
  }
  if (!existsSync(STATIC_DIR)) {
    res.writeHead(404).end('no client build (set STATIC_DIR)');
    return;
  }
  let file = normalize(join(STATIC_DIR, decodeURIComponent(url.pathname)));
  if (!file.startsWith(STATIC_DIR)) {
    res.writeHead(403).end();
    return;
  }
  if (!existsSync(file) || statSync(file).isDirectory()) file = join(STATIC_DIR, 'index.html');
  const type = MIME[extname(file)] ?? 'application/octet-stream';
  res.writeHead(200, { 'content-type': type, 'cache-control': file.endsWith('index.html') ? 'no-cache' : 'public, max-age=31536000, immutable' });
  createReadStream(file).pipe(res);
});

// ---------------- WebSocket ----------------

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 8 * 1024 });

function cleanName(raw: unknown): string {
  const s = typeof raw === 'string' ? raw.replace(/[\u0000-\u001f<>&"]/g, '').trim() : '';
  return [...s].slice(0, 8).join('') || '玩家';
}

function parse(raw: string): ClientMsg | null {
  try {
    const m = JSON.parse(raw) as ClientMsg;
    return m && typeof m === 'object' && typeof m.t === 'string' ? m : null;
  } catch {
    return null;
  }
}

wss.on('connection', (ws) => {
  let player: Player | null = null;
  ws.on('message', (data) => {
    const msg = parse(String(data));
    if (!msg) return;
    if (msg.t === 'ping') {
      ws.send(JSON.stringify({ t: 'pong' }));
      return;
    }
    if (msg.t === 'hello') {
      if (msg.v !== PROTOCOL_VERSION) {
        ws.send(JSON.stringify({ t: 'error', message: '版本过旧，请刷新页面。' }));
        ws.close();
        return;
      }
      const account = store.login(typeof msg.token === 'string' ? msg.token : undefined, cleanName(msg.name));
      player = players.get(account.token) ?? new Player(account);
      player.account = account;
      players.set(account.token, player);
      if (player.ws && player.ws !== ws) player.ws.close(4000, 'replaced'); // signed in elsewhere
      player.ws = ws;
      player.send({ t: 'welcome', token: account.token, name: account.name, points: account.points, games: account.games, online: wss.clients.size });
      if (player.table && !player.table.finished) player.table.rejoin(player);
      return;
    }
    if (!player) return;
    switch (msg.t) {
      case 'queue':
        if (player.table) player.send({ t: 'refused', what: 'queue', reason: '你已经在牌桌上了' });
        else if (msg.format === 'quick' || msg.format === 'standard') matchmaker.join(player, msg.format as OnlineFormat);
        break;
      case 'cancel':
        matchmaker.leave(player);
        break;
      default:
        player.table?.onMessage(player, msg);
    }
  });
  ws.on('close', () => {
    if (!player || player.ws !== ws) return;
    player.ws = null;
    matchmaker.leave(player);
  });
});

server.listen(PORT, () => log(`poker server on :${PORT} (client: ${existsSync(STATIC_DIR) ? STATIC_DIR : 'none'}, match wait ${MATCH_WAIT_MS / 1000}s)`));
