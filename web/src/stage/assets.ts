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

/** The first existing file for a path without extension: WebP first, then PNG. */
function findImage(stem: string): string | null {
  for (const ext of ['webp', 'png']) if (available.has(`${stem}.${ext}`)) return `${stem}.${ext}`;
  return null;
}

async function loadImage(stem: string): Promise<Texture | undefined> {
  const path = findImage(stem);
  if (!path) return undefined;
  try {
    return await Assets.load<Texture>(url(path));
  } catch {
    return undefined;
  }
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

/** Textures for every pose of one character, real art first. A pose without its own
 *  file uses the real idle art if there is one, so a character never mixes real art
 *  with placeholder silhouettes; with no art at all, every pose is painted. */
export async function loadPoses(id: string, char: Character): Promise<Record<Pose, Texture>> {
  const idx = CHARACTER_IDS.indexOf(id);
  const hair: HairStyle = idx >= 0 ? HAIR[idx] : 'bob';
  const load = async (pose: Pose) => {
    const key = `${id}/${pose}`;
    if (!cache.has(key)) {
      const tex = await loadImage(`characters/${id}/${pose}`);
      if (tex) cache.set(key, tex);
    }
    return cache.get(key);
  };
  const idle = await load('idle');
  const out = {} as Record<Pose, Texture>;
  await Promise.all(
    POSES.map(async (pose) => {
      let tex = await load(pose);
      if (!tex && idle) tex = idle;
      if (!tex) {
        const key = `${id}/${pose}/painted`;
        tex = cache.get(key) ?? Texture.from(paintBust({ color: char.color, hair }, pose));
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
  let tex = await loadImage(`backgrounds/${name}`);
  tex ??= Texture.from(paintRoom(1920, 1080, vp, name === 'table' ? 7 : 13));
  cache.set(key, tex);
  return tex;
}
