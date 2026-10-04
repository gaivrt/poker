// The connection to the game server: one WebSocket with the account token kept in
// this browser. If the connection drops during a game it reconnects by itself and
// the server replays the current hand.
import { type ClientMsg, PROTOCOL_VERSION, type ServerMsg } from './protocol';

const TOKEN_KEY = 'poker.online.token';

/** Where the server is: ?server=wss://…, else the dev server, else the page's own host. */
export function serverUrl(): string | null {
  const param = new URLSearchParams(location.search).get('server');
  if (param) return param;
  if (location.protocol !== 'http:' && location.protocol !== 'https:') return null;
  // vite dev (5173) and preview (4173): the game server runs next to it on 8787
  if (location.port === '5173' || location.port === '4173') return `ws://${location.hostname}:8787/ws`;
  return `${location.protocol === 'https:' ? 'wss' : 'ws'}://${location.host}/ws`;
}

type Welcome = Extract<ServerMsg, { t: 'welcome' }>;

function loadToken(): string | undefined {
  try {
    return localStorage.getItem(TOKEN_KEY) ?? undefined;
  } catch {
    return undefined;
  }
}

export class Net {
  private ws: WebSocket | null = null;
  private name = '玩家';
  private wantOpen = false;
  private retryTimer = 0;
  private pingTimer = 0;
  private everWelcomed = false;
  welcome: Welcome | null = null;
  /** Every message from the server goes here (the screen that is showing decides what to do). */
  handler: (m: ServerMsg) => void = () => {};
  /** Connection state changes (for a "reconnecting…" notice). */
  onStatus: (connected: boolean) => void = () => {};

  get connected() {
    return !!this.ws && this.ws.readyState === WebSocket.OPEN && !!this.welcome;
  }

  /** Connects and signs in; rejects when the server can't be reached in time. */
  connect(name: string, timeoutMs = 8000): Promise<Welcome> {
    this.name = name;
    this.wantOpen = true;
    if (this.connected) return Promise.resolve(this.welcome!);
    return new Promise((resolve, reject) => {
      const url = serverUrl();
      if (!url) {
        reject(new Error('no server'));
        return;
      }
      const timer = window.setTimeout(() => {
        reject(new Error('timeout'));
        this.ws?.close();
      }, timeoutMs);
      this.open(url, (w) => {
        window.clearTimeout(timer);
        resolve(w);
      }, () => {
        window.clearTimeout(timer);
        reject(new Error('closed'));
      });
    });
  }

  private open(url: string, onWelcome?: (w: Welcome) => void, onFail?: () => void) {
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      onFail?.();
      return;
    }
    this.ws = ws;
    let welcomed = false;
    ws.onopen = () => this.sendRaw({ t: 'hello', v: PROTOCOL_VERSION, name: this.name, token: loadToken() });
    ws.onmessage = (ev) => {
      let m: ServerMsg;
      try {
        m = JSON.parse(String(ev.data)) as ServerMsg;
      } catch {
        return;
      }
      if (m.t === 'welcome') {
        welcomed = true;
        this.everWelcomed = true;
        this.welcome = m;
        try {
          localStorage.setItem(TOKEN_KEY, m.token);
        } catch {
          /* private mode: a new guest account each time */
        }
        window.clearInterval(this.pingTimer);
        this.pingTimer = window.setInterval(() => this.sendRaw({ t: 'ping' }), 25000);
        this.onStatus(true);
        onWelcome?.(m);
      }
      if (m.t !== 'pong') this.handler(m);
    };
    ws.onclose = () => {
      if (this.ws !== ws) return;
      this.ws = null;
      this.welcome = null;
      window.clearInterval(this.pingTimer);
      if (!welcomed) onFail?.();
      this.onStatus(false);
      // Dropped while we still want to be online: try again (the server keeps our seat).
      if (this.wantOpen && this.everWelcomed) {
        window.clearTimeout(this.retryTimer);
        this.retryTimer = window.setTimeout(() => this.open(url), welcomed ? 800 : 2500);
      }
    };
  }

  send(m: ClientMsg) {
    this.sendRaw(m);
  }

  private sendRaw(m: ClientMsg) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) this.ws.send(JSON.stringify(m));
  }

  close() {
    this.wantOpen = false;
    window.clearTimeout(this.retryTimer);
    window.clearInterval(this.pingTimer);
    this.ws?.close();
    this.ws = null;
    this.welcome = null;
  }
}
