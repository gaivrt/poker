// The local player profile: name and rank points (kept in this browser until
// accounts exist on the server).
const KEY = 'poker.profile.v1';

export interface Profile {
  name: string;
  points: number;
  games: number;
}

export const TIERS = [
  { name: '新手', min: 0 },
  { name: '青铜', min: 100 },
  { name: '白银', min: 300 },
  { name: '黄金', min: 600 },
  { name: '铂金', min: 1000 },
  { name: '钻石', min: 1500 },
  { name: '传说', min: 2200 },
];

export function tierOf(points: number) {
  let i = 0;
  while (i + 1 < TIERS.length && points >= TIERS[i + 1].min) i++;
  const next = TIERS[i + 1];
  const progress = next ? (points - TIERS[i].min) / (next.min - TIERS[i].min) : 1;
  return { name: TIERS[i].name, index: i, next: next?.name, toNext: next ? next.min - points : 0, progress };
}

export function loadProfile(): Profile {
  try {
    const p = JSON.parse(localStorage.getItem(KEY) ?? '');
    if (p && typeof p.points === 'number') return { name: String(p.name || '玩家'), points: p.points, games: p.games | 0 };
  } catch {
    /* storage unavailable or empty */
  }
  return { name: '玩家', points: 0, games: 0 };
}

export function saveProfile(p: Profile) {
  try {
    localStorage.setItem(KEY, JSON.stringify(p));
  } catch {
    /* ignore */
  }
}
