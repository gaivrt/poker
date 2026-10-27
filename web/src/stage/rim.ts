// Rim light for real character art, baked once per texture and colour from the art's
// alpha (docs/11 §1: the art itself comes without coloured rim light).
//
// - rim: a thin band just inside the silhouette, strongest on the top edges (the light
//   is behind and above her), added on top of the art.
// - halo: the silhouette blurred into a soft glow, drawn behind the art so she lifts off
//   the dark room.
import { Texture } from 'pixi.js';

export interface Rim {
  rim: Texture;
  halo: Texture;
}

const cache = new Map<string, Rim>();

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

export function rimFor(tex: Texture, color: number): Rim | null {
  const key = `${tex.uid}/${color}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const src = tex.source.resource as CanvasImageSource | undefined;
  if (!src) return null;
  const w = tex.source.pixelWidth, h = tex.source.pixelHeight;
  const css = '#' + color.toString(16).padStart(6, '0');

  // the silhouette in her colour
  const [sil, s] = canvas(w, h);
  s.drawImage(src, 0, 0, w, h);
  s.globalCompositeOperation = 'source-in';
  s.fillStyle = css;
  s.fillRect(0, 0, w, h);

  // rim: erode the silhouette with a blurred copy pushed down, so the band that is left
  // is thickest along the top edges, then fade it toward the bottom
  const r = Math.max(3, h * 0.012);
  const [rimC, rg] = canvas(w, h);
  rg.drawImage(sil, 0, 0);
  rg.globalCompositeOperation = 'destination-out';
  rg.filter = `blur(${r}px)`;
  rg.drawImage(sil, 0, r * 0.9);
  rg.filter = 'none';
  rg.globalCompositeOperation = 'destination-in';
  const fade = rg.createLinearGradient(0, 0, 0, h);
  fade.addColorStop(0, 'rgba(0,0,0,1)');
  fade.addColorStop(0.55, 'rgba(0,0,0,0.75)');
  fade.addColorStop(1, 'rgba(0,0,0,0.2)');
  rg.fillStyle = fade;
  rg.fillRect(0, 0, w, h);

  // halo: the silhouette, blurred wide
  const [haloC, hg] = canvas(w, h);
  hg.filter = `blur(${h * 0.022}px)`;
  hg.drawImage(sil, 0, 0);

  const out = { rim: Texture.from(rimC), halo: Texture.from(haloC) };
  cache.set(key, out);
  return out;
}
