import { Application, Container } from 'pixi.js';
import './style.css';
import { CAST, type Character, HERO, characterFor } from './characters';
import { Director } from './director';
import { type Difficulty, type Format, Game, loadEngine } from './engine';
import { TableView } from './table/TableView';
import { DESIGN_H, DESIGN_W } from './table/layout';
import { timing } from './tween';
import { Overlay } from './ui/overlay';

const app = new Application();
await app.init({
  background: 0x14121f,
  resizeTo: window,
  antialias: true,
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  autoDensity: true,
});
document.getElementById('stage')!.appendChild(app.canvas);

// Everything is laid out in 1920x1080 design pixels and letterboxed to the window.
// The canvas world (camera) and the HTML overlay share the same transform.
const camera = new Container();
app.stage.addChild(camera);
const uiRoot = document.getElementById('ui')!;
function fit() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const s = Math.min(w / DESIGN_W, h / DESIGN_H);
  const ox = (w - DESIGN_W * s) / 2;
  const oy = (h - DESIGN_H * s) / 2;
  camera.scale.set(s);
  camera.position.set(ox, oy);
  uiRoot.style.transform = `translate(${ox}px, ${oy}px) scale(${s})`;
}
window.addEventListener('resize', fit);
fit();

const overlay = new Overlay(uiRoot);
const engine = await loadEngine();

let game: Game | null = null;
let table: TableView | null = null;
let fx: Container | null = null;
let director: Director | null = null;
app.ticker.add(() => table?.tick(performance.now()));

// ?speed=0 makes every animation instant (used by automated browser tests).
const speedOverride = new URLSearchParams(location.search).get('speed');
function applySettings() {
  timing.scale = speedOverride !== null ? Number(speedOverride) : overlay.settings.fast ? 0.5 : 1;
}
overlay.onSettings = applySettings;

function teardown() {
  director?.stop();
  director = null;
  const oldGame = game;
  const oldTable = table;
  const oldFx = fx;
  game = table = fx = null;
  // Let in-flight animations settle before destroying what they touch.
  if (oldTable) oldTable.visible = false;
  if (oldFx) oldFx.visible = false;
  setTimeout(() => {
    oldTable?.destroy({ children: true });
    oldFx?.destroy({ children: true });
    oldGame?.dispose();
  }, 4000);
  applySettings();
}

function showMenu() {
  teardown();
  // A quiet table behind the menu.
  table = new TableView([HERO, ...CAST.slice(0, 5)]);
  table.seats.forEach((s) => (s.visible = false));
  camera.addChild(table);
  overlay.showMenu(start);
}

function start(format: Format, difficulty: Difficulty) {
  teardown();
  // ?seed=N replays the exact same deal (bug reports, tests).
  const seedParam = new URLSearchParams(location.search).get('seed');
  const seed = seedParam !== null ? Number(seedParam) >>> 0 : (Date.now() ^ Math.floor(Math.random() * 0x7fffffff)) >>> 0;
  game = new Game(engine, format, difficulty, seed);
  const cast: Character[] = game.roster.map(characterFor);
  table = new TableView(cast);
  fx = new Container();
  camera.addChild(table, fx);
  overlay.setInGame(true);
  const g = game;
  director = new Director(g, table, overlay, cast, camera, fx, () => {
    applySettings();
    overlay.showResults(g.standings(), cast, () => start(format, difficulty), showMenu);
  });
  overlay.onQuit = showMenu;
  overlay.onSkip = () => director?.skipToEnd();
  void director.run();
}

showMenu();
