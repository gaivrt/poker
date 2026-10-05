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

/** characters/<id>/meta.json: where things are in that character's art. */
export interface ArtMeta {
  /** Centre of the face in the idle art, as fractions of its width and height. */
  head: [number, number];
  /** Which way her body turns in the art; she is mirrored so she turns toward the table's middle. */
  facing: 'left' | 'right' | 'front';
  /** Centre of the eyes in cutin art, as fractions (default the middle). */
  cutinEyes?: [number, number];
}

/** Real (not painted) art for a character, beyond the poses. */
export interface RealArt {
  meta: ArtMeta;
  /** Close-up for the ALL IN band and other cut-ins. */
  cutin?: Texture;
  /** The idle art with closed eyes, same framing. */
  blink?: Texture;
}

/** Every pose's texture, plus `art` when the character has real art. */
export type PoseSet = Record<Pose, Texture> & { art?: RealArt };

const DEFAULT_META: ArtMeta = { head: [0.5, 0.3], facing: 'front' };

async function loadMeta(id: string): Promise<ArtMeta> {
  const path = `characters/${id}/meta.json`;
  if (!available.has(path)) return DEFAULT_META;
  try {
    return { ...DEFAULT_META, ...((await (await fetch(url(path))).json()) as Partial<ArtMeta>) };
  } catch {
    return DEFAULT_META;
  }
}

const cache = new Map<string, Texture>();

/** Textures for every pose of one character, real art first. A pose without its own
 *  file uses the real idle art if there is one, so a character never mixes real art
 *  with placeholder silhouettes; with no art at all, every pose is painted. */
export async function loadPoses(id: string, char: Character): Promise<PoseSet> {
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
  const out = {} as PoseSet;
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
  if (idle) {
    const [meta, cutin, blink] = await Promise.all([loadMeta(id), loadImage(`characters/${id}/cutin`), loadImage(`characters/${id}/blink`)]);
    out.art = { meta, cutin, blink };
  }
  return out;
}

/** The painted table (docs/11 §4.3), or null to draw it in code. */
export async function loadTableArt(): Promise<Texture | null> {
  const key = 'bg/table-top';
  if (!cache.has(key)) {
    const tex = await loadImage('backgrounds/table-top');
    if (!tex) return null;
    cache.set(key, tex);
  }
  return cache.get(key)!;
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
