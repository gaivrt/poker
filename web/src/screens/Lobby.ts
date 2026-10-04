// The home screen's canvas half: the casino lobby, the featured character in a
// victory pose with chips drifting around her, and her lines when tapped.
import { Container, Graphics, Sprite, Text, Texture, Ticker } from 'pixi.js';
import { sfx } from '../audio/sfx';
import type { Character } from '../characters';
import type { Particles } from '../fx/particles';
import { PAL, paintBeam } from '../stage/painter';
import { FONT, FONT_DISPLAY } from '../table/layout';
import { ease, tween, wait } from '../tween';

const LINES = ['今晚，想赢点什么？', '坐下吧。牌桌可不等人。', '看穿我，你就赢了。', '本局主役，非我莫属。', '筹码会说话——你听得见吗？'];

export class Lobby extends Container {
  private figure: Sprite;
  private bubble = new Container();
  private t0 = performance.now();
  private tick = () => this.update();
  private chipTimer = 0;

  constructor(bg: Texture, pose: Texture, private char: Character, private particles: Particles, fx: Container) {
    super();
    const back = new Sprite(bg);
    back.width = 1920;
    back.height = 1080;
    // a spotlight on her: a warm cone and a pool of light at her feet
    const beam = new Sprite(Texture.from(paintBeam(1920, 1080, 1380, -60, 1080, 560)));
    beam.blendMode = 'add';
    const glow = new Graphics().ellipse(1380, 1010, 520, 90).fill({ color: PAL.paper, alpha: 0.05 });
    glow.blendMode = 'add';
    this.figure = new Sprite(pose);
    this.figure.anchor.set(0.5, 1);
    const k = 980 / pose.height;
    this.figure.scale.set(k);
    this.figure.position.set(1380, 1120);
    this.figure.eventMode = 'static';
    this.figure.cursor = 'pointer';
    this.figure.on('pointertap', () => this.say());
    this.addChild(back, beam, glow, this.figure, fx, this.bubble);
    Ticker.shared.add(this.tick);
    void wait(900).then(() => this.say(LINES[0]));
  }

  private update() {
    const t = (performance.now() - this.t0) / 1000;
    const k = 980 / this.figure.texture.height;
    this.figure.scale.set(k, k * (1 + Math.sin(t * 1.6) * 0.01));
    this.figure.rotation = Math.sin(t * 0.8) * 0.01;
    if (performance.now() > this.chipTimer) {
      // a little dust drifting up through the light
      this.chipTimer = performance.now() + 1400;
      this.particles.sparkle(1380 + (Math.random() - 0.5) * 500, 600 + Math.random() * 300, 2, 140);
    }
  }

  say(text = LINES[Math.floor(Math.random() * LINES.length)]) {
    sfx.play('chime', 0.4);
    this.bubble.removeChildren().forEach((c) => c.destroy());
    const t = new Text({ text, style: { fontFamily: FONT_DISPLAY, fontSize: 30, fontWeight: '700', fill: PAL.paper } });
    const who = new Text({ text: `— ${this.char.name}`, style: { fontFamily: FONT, fontSize: 14, fill: PAL.muted, letterSpacing: 2 } });
    const w = Math.max(t.width, who.width) + 52, h = t.height + who.height + 40;
    const bg = new Graphics()
      .roundRect(0, 0, w, h, 10).fill({ color: 0x262624, alpha: 0.9 }).stroke({ width: 1, color: PAL.beige, alpha: 0.18 });
    t.position.set(26, 16);
    who.position.set(28, 24 + t.height);
    this.bubble.addChild(bg, t, who);
    this.bubble.position.set(1530, 300);
    this.bubble.rotation = 0;
    this.bubble.scale.set(0.6);
    this.bubble.alpha = 0;
    void tween(this.bubble, { alpha: 1 }, 150);
    void tween(this.bubble.scale, { x: 1, y: 1 }, 260, ease.outBack);
  }

  dispose() {
    Ticker.shared.remove(this.tick);
    this.destroy({ children: true });
  }
}
