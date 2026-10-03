// Big presentation moments (docs/03 §3.2): tier 2 all-in cut-in, tier 3 runout camera,
// tier 4 big-hand finale. All are skippable by tapping.
import { Container, Graphics, Text, Ticker } from 'pixi.js';
import type { Character } from '../characters';
import { FONT } from '../table/layout';
import { animate, ease, tween, wait } from '../tween';

function skippable(layer: Container): { skipped: () => boolean; done: () => void } {
  let skipped = false;
  layer.eventMode = 'static';
  layer.cursor = 'pointer';
  const onTap = () => (skipped = true);
  layer.on('pointertap', onTap);
  return { skipped: () => skipped, done: () => layer.off('pointertap', onTap) };
}

async function hold(ms: number, skipped: () => boolean) {
  const step = 50;
  for (let t = 0; t < ms && !skipped(); t += step) await wait(step);
}

/** Tier 2: a diagonal band with the character sweeps across (~1.2 s). */
export async function allInCutIn(layer: Container, char: Character, line: string) {
  const root = new Container();
  const shade = new Graphics().rect(0, 0, 1920, 1080).fill({ color: 0x000000, alpha: 0.35 });
  const band = new Container();
  const bandG = new Graphics()
    .poly([-200, 380, 2120, 300, 2120, 700, -200, 780]).fill(char.color)
    .poly([-200, 400, 2120, 320, 2120, 330, -200, 410]).fill({ color: 0xffffff, alpha: 0.6 })
    .poly([-200, 750, 2120, 670, 2120, 680, -200, 760]).fill({ color: 0xffffff, alpha: 0.6 });
  const portrait = new Graphics().circle(520, 540, 170).fill(0xffffff).circle(520, 540, 156).fill(char.color);
  const glyph = new Text({ text: char.name.slice(0, 1), style: { fontFamily: FONT, fontSize: 170, fontWeight: '900', fill: 0xffffff } });
  glyph.anchor.set(0.5);
  glyph.position.set(520, 540);
  const allIn = new Text({ text: 'ALL IN', style: { fontFamily: FONT, fontSize: 150, fontWeight: '900', fontStyle: 'italic', fill: 0xffffff, stroke: { color: 0x22223a, width: 10 } } });
  allIn.position.set(760, 390);
  const say = new Text({ text: `${char.name}「${line}」`, style: { fontFamily: FONT, fontSize: 38, fontWeight: '700', fill: 0xffffff, stroke: { color: 0x22223a, width: 6 } } });
  say.position.set(790, 580);
  band.addChild(bandG, portrait, glyph, allIn, say);
  root.addChild(shade, band);
  layer.addChild(root);
  const tap = skippable(root);

  band.x = 1920;
  shade.alpha = 0;
  await Promise.all([tween(band, { x: 0 }, 260, ease.outCubic), tween(shade, { alpha: 1 }, 200)]);
  await hold(750, tap.skipped);
  await Promise.all([tween(band, { x: -1920 }, 220, ease.inCubic), tween(shade, { alpha: 0 }, 220)]);
  tap.done();
  root.destroy({ children: true });
}

/** Tier 3 camera: a short push-in and shake on the river of an all-in runout. */
export async function riverPunch(cam: Container) {
  const s0 = cam.scale.x;
  const x0 = cam.x;
  const y0 = cam.y;
  // Zoom around the board (design point 960, 480) and shake a little.
  const set = (k: number, shake: number) => {
    const sc = s0 * (1 + 0.06 * k);
    cam.scale.set(sc);
    cam.position.set(x0 - 960 * (sc - s0) + shake * s0, y0 - 480 * (sc - s0));
  };
  await animate(180, (p) => set(p, 0));
  await animate(240, (p) => set(1, Math.sin(p * Math.PI * 6) * 7 * (1 - p)), ease.linear);
  await wait(200);
  await animate(200, (p) => set(1 - p, 0));
  cam.scale.set(s0);
  cam.position.set(x0, y0);
}

/** Tier 4: full-screen hand name (four of a kind, straight flush, royal flush). */
export async function bigHand(layer: Container, char: Character, handName: string, royal: boolean) {
  const root = new Container();
  const shade = new Graphics().rect(0, 0, 1920, 1080).fill({ color: 0x07060f, alpha: 0.82 });
  const rays = new Graphics();
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    rays.poly([0, 0, Math.cos(a) * 1400, Math.sin(a) * 1400, Math.cos(a + 0.09) * 1400, Math.sin(a + 0.09) * 1400])
      .fill({ color: royal ? 0xffd166 : char.color, alpha: 0.18 });
  }
  rays.position.set(960, 520);
  const title = new Text({
    text: handName,
    style: { fontFamily: FONT, fontSize: royal ? 150 : 130, fontWeight: '900', fill: royal ? 0xffe08a : 0xffffff, stroke: { color: royal ? 0x8a5a00 : char.color, width: 12 }, letterSpacing: 8 },
  });
  title.anchor.set(0.5);
  title.position.set(960, 500);
  const who = new Text({ text: char.name, style: { fontFamily: FONT, fontSize: 44, fontWeight: '700', fill: 0xffffff } });
  who.anchor.set(0.5);
  who.position.set(960, 640);
  root.addChild(shade, rays, title, who);
  layer.addChild(root);
  const tap = skippable(root);

  root.alpha = 0;
  title.scale.set(2.4);
  void tween(root, { alpha: 1 }, 200);
  await tween(title.scale, { x: 1, y: 1 }, 420, ease.outBack);
  const spin = () => (rays.rotation += 0.004);
  Ticker.shared.add(spin);
  await hold(1900, tap.skipped);
  await tween(root, { alpha: 0 }, 250);
  Ticker.shared.remove(spin);
  tap.done();
  root.destroy({ children: true });
}
