// 表情包: placeholder stickers drawn procedurally (a chibi face in the character's
// colour plus a caption). To be replaced by illustrated stickers per character.
import { Container, Graphics, Text } from 'pixi.js';
import { STICKER_LABEL } from '../characters';
import { Sticker } from '../engine';
import { FONT } from '../table/layout';

/** Face variants: every player sticker plus the "nervous" face used for AI expressions. */
export type Face = Sticker | 'nervous';

const SKIN = 0xffe6d5;
const INK = 0x3a2a3a;

function face(g: Graphics, kind: Face, color: number) {
  // Hair, face, blush
  g.circle(0, -6, 56).fill(color);
  g.ellipse(0, 8, 48, 44).fill(SKIN).stroke({ width: 3, color: INK, alpha: 0.6 });
  g.ellipse(-28, 22, 9, 5).fill({ color: 0xff8fa3, alpha: 0.6 });
  g.ellipse(28, 22, 9, 5).fill({ color: 0xff8fa3, alpha: 0.6 });
  const dotEyes = (dy = 0, r = 5) => g.circle(-17, 4 + dy, r).fill(INK).circle(17, 4 + dy, r).fill(INK);
  const arcEye = (x: number, up: boolean) => {
    g.moveTo(x - 9, up ? 8 : 2).quadraticCurveTo(x, up ? -4 : 12, x + 9, up ? 8 : 2).stroke({ width: 4, color: INK, cap: 'round' });
  };
  switch (kind) {
    case Sticker.Smug:
      g.moveTo(-26, 4).lineTo(-9, 4).moveTo(9, 4).lineTo(26, 4).stroke({ width: 4, color: INK, cap: 'round' });
      g.moveTo(-6, 28).quadraticCurveTo(8, 36, 18, 22).stroke({ width: 4, color: INK, cap: 'round' });
      break;
    case Sticker.Taunt:
      arcEye(-17, true);
      g.circle(17, 4, 6).fill(INK);
      g.moveTo(-12, 26).lineTo(12, 26).stroke({ width: 4, color: INK, cap: 'round' });
      g.ellipse(4, 33, 7, 8).fill(0xe0506a);
      break;
    case Sticker.Question:
      dotEyes();
      g.moveTo(-8, 30).lineTo(8, 28).stroke({ width: 4, color: INK, cap: 'round' });
      break;
    case Sticker.Shock:
    case 'nervous':
      g.circle(-17, 4, 10).fill(0xffffff).stroke({ width: 3, color: INK }).circle(-17, 4, 4).fill(INK);
      g.circle(17, 4, 10).fill(0xffffff).stroke({ width: 3, color: INK }).circle(17, 4, 4).fill(INK);
      if (kind === 'nervous') {
        g.moveTo(-10, 30).quadraticCurveTo(-4, 24, 0, 30).quadraticCurveTo(4, 36, 10, 30).stroke({ width: 3, color: INK });
        g.moveTo(40, -18).quadraticCurveTo(48, -4, 40, 4).quadraticCurveTo(32, -4, 40, -18).fill(0x7ec8ff);
      } else {
        g.ellipse(0, 31, 7, 9).fill(INK);
      }
      break;
    case Sticker.Cry:
      arcEye(-17, false);
      arcEye(17, false);
      g.moveTo(-12, 32).quadraticCurveTo(0, 22, 12, 32).stroke({ width: 4, color: INK, cap: 'round' });
      g.ellipse(-24, 22, 5, 12).fill(0x7ec8ff).ellipse(24, 22, 5, 12).fill(0x7ec8ff);
      break;
    case Sticker.Angry:
      dotEyes(2);
      g.moveTo(-28, -10).lineTo(-8, -2).moveTo(28, -10).lineTo(8, -2).stroke({ width: 5, color: INK, cap: 'round' });
      g.moveTo(-12, 32).quadraticCurveTo(0, 22, 12, 32).stroke({ width: 4, color: INK, cap: 'round' });
      g.moveTo(30, -36).lineTo(42, -24).moveTo(42, -36).lineTo(30, -24).stroke({ width: 4, color: 0xe0304a, cap: 'round' });
      break;
    case Sticker.GoodHand:
      arcEye(-17, true);
      arcEye(17, true);
      g.moveTo(-16, 22).quadraticCurveTo(0, 44, 16, 22).closePath().fill(0xe0506a).stroke({ width: 3, color: INK });
      g.star(46, -30, 4, 9, 4).fill(0xffd166).star(-46, -24, 4, 7, 3).fill(0xffd166);
      break;
    case Sticker.Thinking:
      dotEyes(-6, 5);
      g.circle(-6, 30, 4).fill(INK);
      break;
  }
}

/** A sticker card: white die-cut border, the face, and its caption. Pivot is the centre. */
export function makeSticker(kind: Face, color: number): Container {
  const c = new Container();
  const caption = kind === 'nervous' ? '汗……' : STICKER_LABEL[kind];
  const card = new Graphics().roundRect(-78, -84, 156, 176, 26).fill(0xffffff).stroke({ width: 5, color });
  const g = new Graphics();
  g.position.set(0, -14);
  face(g, kind, color);
  const t = new Text({ text: caption, style: { fontFamily: FONT, fontSize: 30, fontWeight: '900', fill: color, stroke: { color: 0xffffff, width: 6 } } });
  t.anchor.set(0.5);
  t.position.set(0, 64);
  c.addChild(card, g, t);
  return c;
}
