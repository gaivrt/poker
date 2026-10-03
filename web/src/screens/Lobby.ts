// The home screen's canvas half: the casino lobby, the featured character in a
// victory pose with chips drifting around her, and her lines when tapped.
import { Container, Graphics, Sprite, Text, type Texture, Ticker } from 'pixi.js';
import { sfx } from '../audio/sfx';
import type { Character } from '../characters';
import type { Particles } from '../fx/particles';
import { FONT } from '../table/layout';
import { ease, tween, wait } from '../tween';

const LINES = ['今天也要赢个痛快！', '要来一局吗？我不会手下留情哦。', '读懂我的破绽了吗？', '本局主役，非我莫属！', '筹码在呼唤我们～'];

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
    // a teal glow where the tables are, the only cool colour
    const glow = new Graphics().ellipse(1350, 760, 520, 120).fill({ color: 0x52c0cf, alpha: 0.35 });
    glow.filters = [];
    this.figure = new Sprite(pose);
    this.figure.anchor.set(0.5, 1);
    const k = 980 / pose.height;
    this.figure.scale.set(k);
    this.figure.position.set(1380, 1120);
    this.figure.eventMode = 'static';
    this.figure.cursor = 'pointer';
    this.figure.on('pointertap', () => this.say());
    this.addChild(back, glow, this.figure, fx, this.bubble);
    Ticker.shared.add(this.tick);
    void wait(900).then(() => this.say(LINES[0]));
  }

  private update() {
    const t = (performance.now() - this.t0) / 1000;
    const k = 980 / this.figure.texture.height;
    this.figure.scale.set(k, k * (1 + Math.sin(t * 1.6) * 0.01));
    this.figure.rotation = Math.sin(t * 0.8) * 0.01;
    if (performance.now() > this.chipTimer) {
      this.chipTimer = performance.now() + 1600;
      this.particles.chipBurst(1380 + (Math.random() - 0.5) * 300, 720, 6, 0.75);
    }
  }

  say(text = LINES[Math.floor(Math.random() * LINES.length)]) {
    sfx.play('chime', 0.4);
    this.bubble.removeChildren().forEach((c) => c.destroy());
    const t = new Text({ text, style: { fontFamily: FONT, fontSize: 30, fontWeight: '700', fill: 0x5b2324 } });
    const w = t.width + 48, h = t.height + 28;
    const bg = new Graphics()
      .roundRect(6, 8, w, h, 22).fill({ color: 0x300b0b, alpha: 0.3 })
      .roundRect(0, 0, w, h, 22).fill(0xffffff).stroke({ width: 5, color: this.char.color })
      .poly([24, h - 2, 60, h - 2, 10, h + 34]).fill(0xffffff);
    t.position.set(24, 14);
    this.bubble.addChild(bg, t);
    this.bubble.position.set(1530, 300);
    this.bubble.rotation = 0.03;
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
