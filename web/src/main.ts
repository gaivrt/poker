import 'pixi.js/unsafe-eval'; // Pixi without eval(): runs under strict content security policies
import { Application, Container, Sprite, type Texture } from 'pixi.js';
import './style.css';
import { music } from './audio/music';
import { sfx } from './audio/sfx';
import { CAST, type Character, HERO, characterFor } from './characters';
import { Net, serverUrl } from './net/client';
import type { OnlineFormat, SeatInfo, ServerMsg } from './net/protocol';
import { Director } from './director';
import { type Difficulty, type Format, Game, Sticker, loadEngine } from './engine';
import { Camera } from './fx/camera';
import { Moments } from './fx/moments';
import { Particles } from './fx/particles';
import { type Quality, Post } from './fx/post';
import { makeSticker } from './fx/stickers';
import { loadProfile, saveProfile } from './profile';
import { Lobby } from './screens/Lobby';
import { characterId, loadBackground, loadPoses } from './stage/assets';
import type { Pose } from './stage/painter';
import { TableStage } from './stage/TableStage';
import { DESIGN_H, DESIGN_W } from './table/layout';
import { timing } from './tween';
import { Overlay, PLACE_POINTS } from './ui/overlay';

// Fonts come from Google Fonts; don't wait forever if they are blocked.
// The brush font is split into subsets by character, so ask for the ones the big moments use.
const BRUSH_TEXT = '胜负揭晓高牌一对两对三条顺子同花葫芦四条同花顺皇家冤家牌本局主役混战到带大和AKQJT98765432';
await Promise.race([
  Promise.all([
    ...['40px "ZCOOL QingKe HuangYou"', '40px "Dela Gothic One"', '700 40px "Noto Sans SC"'].map((f) => document.fonts.load(f)),
    document.fonts.load('40px "Ma Shan Zheng"', BRUSH_TEXT),
  ]),
  new Promise((r) => setTimeout(r, 2500)),
]);

const app = new Application();
await app.init({
  background: 0x300b0b,
  resizeTo: window,
  antialias: true,
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  autoDensity: true,
});
document.getElementById('stage')!.appendChild(app.canvas);

// root: letterboxed 1920×1080 design space
//   world:  everything the camera moves (scene, table, characters)
//   screen: full-screen effects that ignore the camera (vignette, flash, cut-ins)
const root = new Container();
const world = new Container();
const screen = new Container();
const worldFx = new Container();
root.addChild(world, screen);
app.stage.addChild(root);
const uiRoot = document.getElementById('ui')!;
function fit() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const s = Math.min(w / DESIGN_W, h / DESIGN_H);
  const ox = (w - DESIGN_W * s) / 2;
  const oy = (h - DESIGN_H * s) / 2;
  root.scale.set(s);
  root.position.set(ox, oy);
  uiRoot.style.transform = `translate(${ox}px, ${oy}px) scale(${s})`;
}
window.addEventListener('resize', fit);
fit();

const overlay = new Overlay(uiRoot);
const camera = new Camera(world, null);
const post = new Post(world, worldFx, screen);
const persistentScreen = new Set(screen.children); // the vignettes and the flash stay between games
const engine = await loadEngine();

// Pictures of the stickers for the talk-panel buttons, rendered once by the canvas.
overlay.stickerPreviews = await Promise.all(
  Array.from({ length: 8 }, async (_, i) => {
    const st = makeSticker(i as Sticker, HERO.color);
    try {
      return await app.renderer.extract.base64({ target: st, resolution: 0.5 });
    } catch {
      return '';
    } finally {
      st.destroy({ children: true });
    }
  }),
);

// ?speed=0 makes every animation instant (used by automated browser tests).
const speedOverride = new URLSearchParams(location.search).get('speed');
// ?debug exposes the clock so a test can fast-forward to the hand it wants to film.
const debug: Record<string, unknown> | null = new URLSearchParams(location.search).has('debug') ? { timing } : null;
if (debug) (window as unknown as { __poker: unknown }).__poker = debug;
if (debug) Object.assign(debug, { overlay, post, music });
// One particle system for the whole session.
const particles = new Particles(worldFx);

// Quality: "auto" starts high (medium on phones) and steps down while the frame rate
// stays low; it never steps back up within a session.
const PARTICLE_CAP: Record<Quality, number> = { high: 420, medium: 220, low: 110 };
const RESOLUTION: Record<Quality, number> = { high: 2, medium: 1.5, low: 1 };
const TIERS: Quality[] = ['high', 'medium', 'low'];
const phone = navigator.maxTouchPoints > 0 && Math.min(window.screen.width, window.screen.height) < 820;
let autoTier: Quality = phone ? 'medium' : 'high';
let appliedQuality: Quality | null = null;
function applyQuality() {
  const q = overlay.settings.quality === 'auto' ? autoTier : overlay.settings.quality;
  if (q === appliedQuality) return;
  appliedQuality = q;
  post.setQuality(q);
  particles.max = PARTICLE_CAP[q];
  const res = Math.min(window.devicePixelRatio || 1, RESOLUTION[q]);
  if (app.renderer.resolution !== res) app.renderer.resize(window.innerWidth, window.innerHeight, res);
}
const fpsWatch = { frames: 0, since: performance.now(), bad: 0, skip: true };
/** A table just loaded: its first seconds are always choppy, so don't judge them. */
function resetFpsWatch() {
  Object.assign(fpsWatch, { frames: 0, since: performance.now(), bad: 0, skip: true });
}
app.ticker.add(() => {
  const w = fpsWatch;
  w.frames++;
  const now = performance.now();
  if (now - w.since < 4000) return;
  const fps = (w.frames * 1000) / (now - w.since);
  w.frames = 0;
  w.since = now;
  // Only judge while a table is on screen and the tab is visible; two slow windows in a row step down.
  if (w.skip || overlay.settings.quality !== 'auto' || document.hidden || !stage) {
    w.skip = false;
    return;
  }
  w.bad = fps < 42 ? w.bad + 1 : 0;
  const i = TIERS.indexOf(autoTier);
  if (w.bad >= 2 && i < TIERS.length - 1) {
    autoTier = TIERS[i + 1];
    w.bad = 0;
    applyQuality();
  }
});

function applySettings() {
  timing.scale = speedOverride !== null ? Number(speedOverride) : overlay.settings.fast ? 0.5 : 1;
  sfx.muted = !overlay.settings.sound;
  music.setEnabled(overlay.settings.music);
  applyQuality();
}
overlay.onSettings = applySettings;
overlay.onClock = (mode) => post.pressure(mode);
applySettings();
window.addEventListener('pointerdown', () => sfx.unlock(), { once: false });

let game: Game | null = null;
let stage: TableStage | null = null;
let lobby: Lobby | null = null;
let director: Director | null = null;
app.ticker.add(() => stage?.tick(performance.now()));

function teardown() {
  director?.stop();
  director = null;
  const oldGame = game, oldStage = stage, oldLobby = lobby;
  game = stage = lobby = null;
  if (oldStage) oldStage.visible = false;
  if (oldLobby) oldLobby.visible = false;
  // Let in-flight animations settle before destroying what they touch.
  setTimeout(() => {
    oldStage?.destroy({ children: true });
    oldLobby?.dispose();
    oldGame?.dispose();
  }, 4000);
  for (const c of [...screen.children]) if (!persistentScreen.has(c)) c.removeFromParent();
  particles.clear();
  worldFx.removeChildren();
  camera.look = { x: 960, y: 540 };
  camera.zoom = 1;
  applySettings();
}

async function showHome() {
  teardown();
  overlay.setInGame(false);
  const mascot = CAST[4];
  const [bg, poses] = await Promise.all([loadBackground('lobby', { x: 1300, y: 380 }), loadPoses(characterId(4), mascot)]);
  music.play('lobby');
  lobby = new Lobby(bg, poses.win, mascot, particles, worldFx);
  world.addChild(lobby);
  const profile = loadProfile();
  const handlers = {
    start: (format: Format, difficulty: Difficulty, ranked: boolean) => void start(format, difficulty, ranked),
    online: (format: OnlineFormat) => void startOnline(format),
    rename: (name: string) => {
      profile.name = name;
      saveProfile(profile);
    },
  };
  overlay.showHome(profile, handlers);
  // Signed in to the server in the background: show the online rank (and rejoin a running game).
  if (serverUrl()) {
    const shown = lobby;
    net.connect(profile.name).then((w) => {
      Object.assign(profile, { points: w.points, games: w.games });
      saveProfile(profile);
      if (lobby === shown && lobby) overlay.showHome(profile, handlers);
    }, () => {});
  }
}

// ---------------- online ----------------

const net = new Net();
let onlineBuffer: ServerMsg[] | null = null; // messages that arrive while the table loads

/** What the server says while we are not at a table (home, matchmaking). */
function lobbyHandler(m: ServerMsg) {
  if (m.t === 'queue') overlay.updateMatchmaking(m.found, m.seconds);
  else if (m.t === 'matched') void beginOnline(m);
  else if (m.t === 'refused' && m.what === 'queue') overlay.toast(m.reason ?? '现在无法匹配');
  else if (m.t === 'error') overlay.toast(m.message);
}
net.handler = lobbyHandler;
net.onStatus = (ok) => overlay.setConnection(ok || !director || !onlineGame);
let onlineGame = false;

async function startOnline(format: OnlineFormat) {
  sfx.unlock();
  const profile = loadProfile();
  overlay.showMatchmaking(format, () => {
    net.send({ t: 'cancel' });
    void showHome();
  });
  try {
    await net.connect(profile.name);
  } catch {
    overlay.closeModal();
    offlineFallback(format);
    return;
  }
  net.handler = lobbyHandler;
  net.send({ t: 'queue', format });
}

/** No server (e.g. this demo page): offer a ranked game against the AI instead. */
function offlineFallback(format: OnlineFormat) {
  overlay.confirm(
    '连不上游戏服务器',
    '联网对战需要游戏服务器（这个试玩页面没有连接服务器）。要先打一局离线段位赛吗？对手全部是 AI，段位分只记在这台设备上。',
    '离线段位赛',
    () => void start(format, loadProfile().points >= 600 ? 2 : 1, true),
    () => void showHome(),
  );
}

function personCharacter(s: SeatInfo): Character {
  // Another player: their name on a character look, and no system lines spoken for them.
  return { ...CAST[s.look % CAST.length], name: s.name, style: '玩家', lines: { raise: [], call: [], allIn: [], win: [], out: [] } };
}

async function beginOnline(m: Extract<ServerMsg, { t: 'matched' }>) {
  onlineBuffer = [];
  net.handler = (x) => onlineBuffer?.push(x);
  overlay.closeModal();
  if (m.rejoin) overlay.toast('回到牌桌：正在追上进度');
  teardown();
  const cast = m.seats.map((s, i) => (i === 0 ? HERO : s.bot ? CAST[s.look % CAST.length] : personCharacter(s)));
  const looks = m.seats.map((s, i) => (i === 0 ? -1 : s.look));
  const built = await buildTable(cast, looks);
  onlineGame = true;
  const finish = () => {
    onlineGame = false;
    net.handler = lobbyHandler;
    overlay.setConnection(true);
    applySettings();
    const result = director?.result;
    if (!result) return;
    const profile = loadProfile();
    Object.assign(profile, { points: result.rank.after, games: profile.games + 1 });
    saveProfile(profile);
    const me = result.standings.find((x) => x.seat === 0)!;
    void music.sting(me.place <= 3 ? 'win' : 'lose');
    overlay.showResults(result.standings, cast, () => void startOnline(m.format), () => void showHome(), result.rank);
  };
  director = new Director(null, built.stage, overlay, cast, built.moments, finish, net, m.seats.map((s) => !s.bot));
  const leave = (note: string) => {
    director?.leaveTable();
    onlineGame = false;
    net.handler = lobbyHandler;
    void showHome().then(() => overlay.toast(note));
  };
  overlay.onQuit = () => leave('已离开牌桌：剩下的手牌会自动过牌或弃牌，段位分照常结算。');
  overlay.spectateAction = '离开牌桌';
  overlay.onSkip = () => leave('名次已经确定，段位分会在这局结束时结算。');
  void director.run();
  // replay what arrived while the table was loading
  const early = onlineBuffer;
  onlineBuffer = null;
  for (const x of early) net.handler(x);
}

async function start(format: Format, difficulty: Difficulty, ranked: boolean) {
  sfx.unlock();
  teardown();
  overlay.loading(true);
  // ?seed=N replays the exact same deal (bug reports, tests).
  const seedParam = new URLSearchParams(location.search).get('seed');
  const seed = seedParam !== null ? Number(seedParam) >>> 0 : (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
  game = new Game(engine, format, difficulty, seed);
  const cast: Character[] = game.roster.map(characterFor);
  const { stage: st, moments } = await buildTable(cast, game.roster);
  const g = game;
  director = new Director(g, st, overlay, cast, moments, () => {
    applySettings();
    const standings = g.standings();
    let rank: { before: number; after: number } | undefined;
    if (ranked) {
      const profile = loadProfile();
      const me = standings.find((s) => s.seat === 0)!;
      let pts = 0;
      for (let p = me.place; p <= me.placeTo; p++) pts += PLACE_POINTS[p - 1] ?? 0;
      pts /= me.placeTo - me.place + 1;
      rank = { before: profile.points, after: Math.max(0, profile.points + Math.round(pts)) };
      profile.points = rank.after;
      profile.games += 1;
      saveProfile(profile);
    }
    const me = standings.find((s) => s.seat === 0)!;
    void music.sting(me.place <= 3 ? 'win' : 'lose');
    overlay.showResults(standings, cast, () => void start(format, difficulty, ranked), () => void showHome(), rank);
  });
  overlay.onQuit = () => void showHome();
  overlay.spectateAction = '直接看结果';
  overlay.onSkip = () => director?.skipToEnd();
  void director.run();
}

/** Loads art for the cast, builds the table scene and its big moments. looks: art per seat (-1 = you). */
async function buildTable(cast: Character[], looks: number[]) {
  overlay.loading(true);
  const [bg, ...poses] = await Promise.all([
    loadBackground('table', { x: 960, y: 330 }),
    ...looks.map((r, i) => loadPoses(characterId(r), cast[i])),
  ]);
  music.play('table');
  stage = new TableStage(cast, poses as Record<Pose, Texture>[], bg, { camera, post, particles, screen });
  world.addChild(stage);
  resetFpsWatch();
  world.addChild(worldFx);
  overlay.loading(false);
  overlay.setInGame(true);
  // Portraits for the final results cards, rendered in the background.
  overlay.portraits = [];
  void (async () => {
    const shot = async (tex: Texture) => {
      const sp = new Sprite(tex);
      sp.scale.set(320 / tex.height);
      try {
        return await app.renderer.extract.base64({ target: sp, resolution: 1 });
      } catch {
        return '';
      } finally {
        sp.destroy();
      }
    };
    const out: { idle: string; win: string }[] = [];
    for (const p of poses as Record<Pose, Texture>[]) out.push({ idle: await shot(p.idle), win: await shot(p.win) });
    overlay.portraits = out;
  })();
  const moments = new Moments({ stage, camera, post, particles, screen });
  if (debug) Object.assign(debug, { moments, stage, net }); // lets a test replay any moment (royal flush etc.)
  return { stage, moments };
}

void showHome();
