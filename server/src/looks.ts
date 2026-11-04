// Who looks like whom at an online table. A bot's look is its personality, so it
// never changes; people get what they picked when they can, else a look nobody uses.
const PRESETS = 6;

/** A look from the client: a valid preset index, or undefined. */
export function cleanLook(raw: unknown): number | undefined {
  return Number.isInteger(raw) && (raw as number) >= 0 && (raw as number) < PRESETS ? (raw as number) : undefined;
}

/** No bot on this roster (preset per seat, -1 for a person) holds a look someone picked. */
export function picksFree(roster: number[], picks: (number | undefined)[]): boolean {
  return picks.every((p) => p === undefined || !roster.includes(p));
}

/** Look per seat. `picks`: each person's choice, in seat order; on a tie the earlier seat keeps it. */
export function assignLooks(roster: number[], picks: (number | undefined)[]): number[] {
  const taken = new Set(roster.filter((r) => r >= 0));
  const served = picks.map((p) => {
    if (p === undefined || taken.has(p)) return undefined;
    taken.add(p);
    return p;
  });
  const spare = [...Array(PRESETS).keys()].filter((p) => !taken.has(p));
  let person = 0;
  return roster.map((r) => (r >= 0 ? r : served[person++] ?? spare.shift() ?? 0));
}
