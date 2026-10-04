// Kinetic typography: stamps that slam down and settle (ALL IN, 胜负揭晓, BLUFF! ...).
import { Container, Text } from 'pixi.js';
import { FONT_DISPLAY } from '../table/layout';
import { ease, tween, wait } from '../tween';

export interface StampOpts {
  size?: number;
  color?: number;
  stroke?: number;
  rotate?: number;
  hold?: number;
  font?: string;
}

/** A word stamped onto the screen: drops in big, hits, settles, then fades. */
export async function stamp(layer: Container, text: string, x: number, y: number, o: StampOpts = {}) {
  const c = new Container();
  const t = new Text({
    text,
    style: {
      fontFamily: o.font ?? FONT_DISPLAY, fontWeight: o.font?.includes('Archivo') ? 'normal' : '900', fontSize: o.size ?? 110, fill: o.color ?? 0xf2ecdf,
      stroke: { color: o.stroke ?? 0x121117, width: 14 }, letterSpacing: 4,
      dropShadow: { color: 0x000000, alpha: 0.5, distance: 6, angle: Math.PI / 2, blur: 4 },
    },
  });
  t.anchor.set(0.5);
  c.addChild(t);
  c.position.set(x, y);
  c.rotation = o.rotate ?? -0.08;
  c.scale.set(2.6);
  c.alpha = 0;
  layer.addChild(c);
  await Promise.all([tween(c.scale, { x: 1, y: 1 }, 220, ease.inCubic), tween(c, { alpha: 1 }, 120)]);
  await tween(c.scale, { x: 1.08, y: 1.08 }, 80, ease.outCubic);
  await tween(c.scale, { x: 1, y: 1 }, 120, ease.outBack);
  await wait(o.hold ?? 600);
  await tween(c, { alpha: 0 }, 250);
  c.destroy({ children: true });
}
