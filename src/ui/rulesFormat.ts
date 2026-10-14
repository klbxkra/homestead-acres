/** Slider stops and labels for the World Rules editor. */

export const STOPS = {
  timeScale: [1, 2, 5, 10, 30, 60, 120, 300, 600, 1000, 3600],
  cropGrowth: [0.05, 0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 5],
  witherWindowFactor: [0.25, 0.5, 1, 1.5, 2, 3, 5, 10],
  reward: [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 5, 10],
  cost: [0, 0.25, 0.5, 0.75, 1, 1.5, 2, 3, 5],
  offlineCapHours: [1, 2, 4, 8, 12, 24, 48, 72, 168],
  startingCoins: [0, 100, 200, 500, 1000, 2000, 5000, 10_000, 100_000],
  startingCash: [0, 5, 10, 25, 50, 100, 1000],
} as const satisfies Record<string, readonly number[]>;

/** Index of the stop closest to `value` (values from imported rules may fall between stops). */
export function nearestStopIndex(stops: readonly number[], value: number): number {
  let best = 0;
  for (let i = 1; i < stops.length; i++) {
    if (Math.abs(stops[i]! - value) < Math.abs(stops[best]! - value)) best = i;
  }
  return best;
}

export function formatMultiplier(v: number): string {
  return `×${trim(v)}`;
}

/** Grow-time multiplier as players think about it: "×0.5 (2× faster)". */
export function formatGrowth(v: number): string {
  if (v === 1) return '×1 (normal)';
  return v < 1 ? `×${trim(v)} (${trim(1 / v)}× faster)` : `×${trim(v)} (${trim(v)}× slower)`;
}

export function formatTimeScale(v: number): string {
  if (v === 1) return 'Real time';
  const minutesPerHour = 60 / v;
  const per = minutesPerHour >= 1 ? `1 game hour = ${trim(minutesPerHour)} min` : `1 game hour = ${trim(minutesPerHour * 60)} s`;
  return `×${trim(v)} (${per})`;
}

export function formatHours(h: number): string {
  if (h < 24) return `${trim(h)} h`;
  return `${trim(h / 24)} d`;
}

function trim(v: number): string {
  return Number.isInteger(v) ? String(v) : String(Number(v.toFixed(2)));
}
