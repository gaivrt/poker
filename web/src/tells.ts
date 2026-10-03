// The "tells found" collection (docs/06-mind-games.md): kept in this browser.
const KEY = 'poker.tells.v1';

/** Sightings needed before a tell goes into the collection. */
export const TELL_UNLOCK = 2;
/** How many tells each cast member has (ai/src/mind.cpp), by roster index. */
export const TELL_COUNT = [2, 3, 2, 3, 1, 3];

export interface TellRecord {
  count: number;
  text: string;
  character: string;
}

export function loadTells(): Record<string, TellRecord> {
  try {
    return JSON.parse(localStorage.getItem(KEY) ?? '{}') ?? {};
  } catch {
    return {};
  }
}

export function saveTells(t: Record<string, TellRecord>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(t));
  } catch {
    /* storage unavailable */
  }
}
