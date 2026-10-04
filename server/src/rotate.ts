// Every client sees itself in seat 0: seat numbers in events and state are rotated per viewer.
const N = 6;

/** A seat number as `viewer` sees it (-1 stays -1). */
export function rot(seat: number, viewer: number): number {
  return seat < 0 ? seat : (seat - viewer + N) % N;
}

/** The real seat behind a seat number as `viewer` sees it. */
export function unrot(seat: number, viewer: number): number {
  return seat < 0 ? seat : (seat + viewer) % N;
}

const SEAT_KEYS = new Set(['seat', 'target', 'button', 'toAct']);
const BY_SEAT = new Set(['stacks', 'seats']); // arrays indexed by seat

/** A deep copy of an event (or the table state) with every seat number rotated. */
export function rotate<T>(value: T, viewer: number): T {
  return viewer === 0 ? value : (walk(value, viewer) as T);
}

function walk(v: unknown, viewer: number): unknown {
  if (Array.isArray(v)) return v.map((x) => walk(x, viewer));
  if (v && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, x] of Object.entries(v)) {
      if (SEAT_KEYS.has(k) && typeof x === 'number') out[k] = rot(x, viewer);
      else if (BY_SEAT.has(k) && Array.isArray(x) && x.length === N) out[k] = x.map((_, i) => walk(x[(i + viewer) % N], viewer));
      else out[k] = walk(x, viewer);
    }
    return out;
  }
  return v;
}
