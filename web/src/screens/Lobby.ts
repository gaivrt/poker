// The home screen's canvas half: the casino lobby, the featured character in a
// victory pose with chips drifting around her, and her lines when tapped.
import { Container, Graphics, Sprite, Text, Texture, Ticker } from 'pixi.js';
import { sfx } from '../audio/sfx';
import type { Character } from '../characters';
import type { Particles } from '../fx/particles';
import { PAL, paintBeam } from '../stage/painter';
import { FONT } from '../table/layout';
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
    const glow = new Graphics().ellipse(1380, 1010, 520, 90).fill({ color: PAL.goldHi, alpha: 0.12 });
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
      // gold dust drifting up through the light
      this.chipTimer = performance.now() + 700;
      this.particles.sparkle(1380 + (Math.random() - 0.5) * 500, 600 + Math.random() * 300, 5, 140);
    }
  }

  say(text = LINES[Math.floor(Math.random() * LINES.length)]) {
    sfx.play('chime', 0.4);
    this.bubble.removeChildren().forEach((c) => c.destroy());
    const t = new Text({ text, style: { fontFamily: FONT, fontSize: 28, fontWeight: '700', fill: PAL.ivory } });
    const w = t.width + 48, h = t.height + 28;
    const bg = new Graphics()
      .roundRect(5, 7, w, h, 10).fill({ color: 0x000000, alpha: 0.45 })
      .poly([24, h - 2, 60, h - 2, 10, h + 34]).fill({ color: 0x140c12, alpha: 0.95 })
      .roundRect(0, 0, w, h, 10).fill({ color: 0x140c12, alpha: 0.95 }).stroke({ width: 2.5, color: this.char.color })
      .roundRect(4, 4, w - 8, h - 8, 7).stroke({ width: 1, color: PAL.gold, alpha: 0.4 });
    t.position.set(24, 14);
    this.bubble.addChild(bg, t);
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
