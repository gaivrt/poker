// Hot-swappable art: real PNGs from public/art/ when present, otherwise the
// procedural placeholders from painter.ts. See public/art/README.md.
import { Assets, Texture } from 'pixi.js';
import files from 'virtual:art-manifest';
import type { Character } from '../characters';
import { type HairStyle, type Pose, paintBust, paintRoom } from './painter';

const available = new Set(files);
const url = (path: string) => `${import.meta.env.BASE_URL}art/${path}`;

export function hasArt(path: string): boolean {
  return available.has(path);
}
export function artUrl(path: string): string | null {
  return available.has(path) ? url(path) : null;
}

/** Folder names under art/characters/ (index = personality preset; -1 = the player). */
export const CHARACTER_IDS = ['rin', 'dango', 'homura', 'shizuka', 'aoi', 'kitsune'];
export const PLAYER_ID = 'player';
const HAIR: HairStyle[] = ['long', 'twin', 'short', 'bob', 'long', 'fox'];

export function characterId(rosterIndex: number): string {
  return rosterIndex < 0 ? PLAYER_ID : CHARACTER_IDS[rosterIndex % CHARACTER_IDS.length];
}

export const POSES: Pose[] = ['idle', 'smug', 'nervous', 'angry', 'shock', 'cry', 'win'];

const cache = new Map<string, Texture>();

/** Textures for every pose of one character, real art first. */
export async function loadPoses(id: string, char: Character): Promise<Record<Pose, Texture>> {
  const out = {} as Record<Pose, Texture>;
  const idx = CHARACTER_IDS.indexOf(id);
  const hair: HairStyle = idx >= 0 ? HAIR[idx] : 'bob';
  await Promise.all(
    POSES.map(async (pose) => {
      const key = `${id}/${pose}`;
      let tex = cache.get(key);
      if (!tex) {
        const path = `characters/${id}/${pose}.png`;
        if (available.has(path)) {
          try {
            tex = await Assets.load<Texture>(url(path));
          } catch {
            tex = undefined;
          }
        }
        tex ??= Texture.from(paintBust({ color: char.color, hair }, pose));
        cache.set(key, tex);
      }
      out[pose] = tex;
    }),
  );
  return out;
}

/** A background: the PNG if present, else a painted room with the given vanishing point. */
export async function loadBackground(name: 'table' | 'lobby', vp: { x: number; y: number }): Promise<Texture> {
  const key = `bg/${name}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let tex: Texture | undefined;
  const path = `backgrounds/${name}.png`;
  if (available.has(path)) {
    try {
      tex = await Assets.load<Texture>(url(path));
    } catch {
      tex = undefined;
    }
  }
  tex ??= Texture.from(paintRoom(1920, 1080, vp, name === 'table' ? 7 : 13));
  cache.set(key, tex);
  return tex;
}
