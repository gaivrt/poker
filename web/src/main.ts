import 'pixi.js/unsafe-eval'; // Pixi without eval(): runs under strict content security policies
import { Application, Container, type Texture } from 'pixi.js';
import './style.css';
import { sfx } from './audio/sfx';
import { CAST, type Character, HERO, characterFor } from './characters';
import { Director } from './director';
import { type Difficulty, type Format, Game, Sticker, loadEngine } from './engine';
import { Camera } from './fx/camera';
import { Particles } from './fx/particles';
import { Post } from './fx/post';
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
await Promise.race([
  Promise.all(['40px "ZCOOL QingKe HuangYou"', '40px "Dela Gothic One"', '700 40px "Noto Sans SC"'].map((f) => document.fonts.load(f))),
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
function applySettings() {
  timing.scale = speedOverride !== null ? Number(speedOverride) : overlay.settings.fast ? 0.5 : 1;
  sfx.muted = !overlay.settings.sound;
  post.setQuality(overlay.settings.quality);
}
overlay.onSettings = applySettings;
applySettings();
window.addEventListener('pointerdown', () => sfx.unlock(), { once: false });

let game: Game | null = null;
let stage: TableStage | null = null;
let lobby: Lobby | null = null;
let particles: Particles | null = null;
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
  for (const c of [...screen.children]) if (c !== screen.children[0] && c !== screen.children[1]) c.removeFromParent();
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
  particles = new Particles(worldFx);
  lobby = new Lobby(bg, poses.win, mascot, particles, worldFx);
  world.addChild(lobby);
  const profile = loadProfile();
  overlay.showHome(profile, {
    start: (format, difficulty, ranked) => void start(format, difficulty, ranked),
    rename: (name) => {
      profile.name = name;
      saveProfile(profile);
    },
  });
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
  const [bg, ...poses] = await Promise.all([
    loadBackground('table', { x: 960, y: 330 }),
    ...game.roster.map((r, i) => loadPoses(characterId(r), cast[i])),
  ]);
  particles = new Particles(worldFx);
  stage = new TableStage(cast, poses as Record<Pose, Texture>[], bg, { camera, post, particles, screen });
  world.addChild(stage);
  world.addChild(worldFx);
  overlay.loading(false);
  overlay.setInGame(true);
  const g = game;
  director = new Director(g, stage, overlay, cast, camera, screen, () => {
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
    overlay.showResults(standings, cast, () => void start(format, difficulty, ranked), () => void showHome(), rank);
  });
  overlay.onQuit = () => void showHome();
  overlay.onSkip = () => director?.skipToEnd();
  void director.run();
}

void showHome();
