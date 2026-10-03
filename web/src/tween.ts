// Promise-based tweens on the shared Pixi ticker, with a global time scale
// (1 = normal, 0.5 = fast, 0 = instant) used by the speed setting and "skip to results".
import { Ticker } from 'pixi.js';

export type Ease = (t: number) => number;
export const ease = {
  linear: (t: number) => t,
  outCubic: (t: number) => 1 - Math.pow(1 - t, 3),
  inCubic: (t: number) => t * t * t,
  inOutCubic: (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
  outBack: (t: number) => {
    const c1 = 1.70158, c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  },
};

export const timing = { scale: 1 };

type Numeric<T> = { [K in keyof T as T[K] extends number ? K : never]?: number };

export function tween<T extends object>(target: T, to: Numeric<T>, ms: number, e: Ease = ease.outCubic): Promise<void> {
  const rec = target as Record<string, number>;
  const keys = Object.keys(to) as (keyof T & string)[];
  const dur = ms * timing.scale;
  if (dur <= 0) {
    for (const k of keys) rec[k] = (to as Record<string, number>)[k];
    return Promise.resolve();
  }
  const from: Record<string, number> = {};
  for (const k of keys) from[k] = rec[k];
  return new Promise((resolve) => {
    const start = performance.now();
    const step = () => {
      const p = Math.min(1, (performance.now() - start) / dur);
      const v = e(p);
      for (const k of keys) rec[k] = from[k] + ((to as Record<string, number>)[k] - from[k]) * v;
      if (p >= 1) {
        Ticker.shared.remove(step);
        resolve();
      }
    };
    Ticker.shared.add(step);
  });
}

export function wait(ms: number): Promise<void> {
  const dur = ms * timing.scale;
  return dur <= 0 ? Promise.resolve() : new Promise((r) => setTimeout(r, dur));
}

export function all(...ps: Promise<void>[]): Promise<void> {
  return Promise.all(ps).then(() => undefined);
}

/** Calls `fn(progress)` every frame for `ms`, then resolves. */
export function animate(ms: number, fn: (p: number) => void, e: Ease = ease.outCubic): Promise<void> {
  const box = { p: 0 };
  const dur = ms * timing.scale;
  if (dur <= 0) {
    fn(1);
    return Promise.resolve();
  }
  return new Promise((resolve) => {
    const start = performance.now();
    const step = () => {
      box.p = Math.min(1, (performance.now() - start) / dur);
      fn(e(box.p));
      if (box.p >= 1) {
        Ticker.shared.remove(step);
        resolve();
      }
    };
    Ticker.shared.add(step);
  });
}
