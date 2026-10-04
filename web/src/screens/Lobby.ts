// The home screen's canvas half (docs/10): the featured character as a big court
// card, two more cards fanned out behind her, and her lines when tapped.
import { Container, Graphics, Sprite, Text, type Texture, Ticker } from 'pixi.js';
import { sfx } from '../audio/sfx';
import type { Character } from '../characters';
import { CourtCard, cardBack, courtParts } from '../stage/court';
import { PAL } from '../stage/painter';
import { FONT } from '../table/layout';
import { ease, tween, wait } from '../tween';

const LINES = ['今晚，想赢点什么？', '坐下吧。牌桌可不等人。', '看穿我，你就赢了。', '本局主役，非我莫属。', '筹码会说话——你听得见吗？'];
const SUIT_NAME: Record<string, string> = { '♠': '黑桃', '♥': '红心', '♣': '梅花', '♦': '方块' };
const RANK_NAME: Record<string, string> = { Q: '皇后', J: '杰克', K: '国王', A: 'A' };

export interface LobbyCard {
  char: Character;
  pose: Texture;
}

export class Lobby extends Container {
  private hand = new Container();
  private featured: CourtCard;
  private bubble = new Container();
  private t0 = performance.now();
  private tick = () => this.update();

  constructor(bg: Texture, private main: LobbyCard, second: LobbyCard, fx: Container) {
    super();
    const back = new Sprite(bg);
    back.width = 1920;
    back.height = 1080;
    const W = 560, H = 784;
    // the fan pivots on a point below the cards, like a hand of cards
    this.hand.position.set(1290, 530 + H * 0.7);
    const fan = (child: Container, angle: number) => {
      const holder = new Container();
      child.y = -H * 0.7;
      holder.addChild(child);
      holder.rotation = angle;
      return holder;
    };
    const shadow = () => new Graphics().roundRect(-W / 2 + 14, -H / 2 + 30, W, H, 42).fill({ color: 0x000000, alpha: 0.45 });
    const behind = new Container();
    behind.addChild(shadow(), cardBack(W, H, 42));
    const other = new Container();
    other.addChild(shadow(), new CourtCard({ w: W, h: H, court: second.char.court, texture: second.pose }));
    this.featured = new CourtCard({ w: W, h: H, court: main.char.court, texture: main.pose, mirrored: true });
    const front = new Container();
    front.addChild(shadow(), this.featured);
    front.eventMode = 'static';
    front.cursor = 'pointer';
    front.on('pointertap', () => this.say());
    this.hand.addChild(fan(behind, -0.26), fan(other, 0.24), fan(front, 0.035));
    this.addChild(back, this.hand, fx, this.bubble);
    // deal the hand in
    this.hand.children.forEach((c, i) => {
      const r = c.rotation;
      c.rotation = r - 0.5;
      c.alpha = 0;
      void wait(120 + i * 110).then(() => Promise.all([tween(c, { rotation: r }, 420, ease.outBack), tween(c, { alpha: 1 }, 160)]));
    });
    Ticker.shared.add(this.tick);
    void wait(900).then(() => this.say(LINES[0]));
  }

  private update() {
    const t = (performance.now() - this.t0) / 1000;
    this.hand.y = 530 + 784 * 0.7 + Math.sin(t * 1.1) * 6;
    this.featured.setTexture(this.main.pose, 1 + Math.sin(t * 1.6) * 0.008);
  }

  say(text = LINES[Math.floor(Math.random() * LINES.length)]) {
    sfx.play('chime', 0.4);
    this.bubble.removeChildren().forEach((c) => c.destroy());
    const t = new Text({ text, style: { fontFamily: FONT, fontSize: 24, fontWeight: '900', fill: PAL.ink, wordWrap: true, wordWrapWidth: 220, breakWords: true, lineHeight: 34 } });
    const { rank, suit, color } = courtParts(this.main.char.court);
    const who = new Text({ text: `${suit}${rank} ${this.main.char.name} · ${SUIT_NAME[suit] ?? ''}${RANK_NAME[rank] ?? rank}`, style: { fontFamily: FONT, fontSize: 14, fontWeight: '700', fill: color === PAL.red ? PAL.red : PAL.cobalt } });
    const w = Math.max(t.width, who.width) + 44, h = t.height + who.height + 44;
    const bg = new Graphics()
      .roundRect(6, 12, w, h, 16).fill({ color: 0x000000, alpha: 0.4 })
      .roundRect(0, 0, w, h, 16).fill(PAL.ivory);
    t.position.set(22, 18);
    who.position.set(22, 18 + t.height + 8);
    this.bubble.addChild(bg, t, who);
    this.bubble.position.set(1600, 200);
    this.bubble.rotation = -0.02;
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
