/**
 * Time model (PLAN.md section 6). Game time advances by real elapsed time x timeScale.
 * Long gaps (game closed, tab in background, device asleep) follow the
 * offlineProgress rule. Timers are absolute game-time stamps, so nothing needs
 * per-frame updates; status is derived whenever it's read.
 */
import type { Clock } from './state';
import type { WorldRules } from './rules';

export const SECOND_MS = 1000;
export const MINUTE_MS = 60 * SECOND_MS;
export const HOUR_MS = 60 * MINUTE_MS;
export const DAY_MS = 24 * HOUR_MS;

/** Real-time gaps longer than this count as "away" and follow offlineProgress. */
export const OFFLINE_GAP_MS = MINUTE_MS;

/** How much of a real-time gap counts toward game time. */
export function creditedRealMs(realDeltaMs: number, rules: WorldRules): number {
  if (realDeltaMs <= 0) return 0;
  if (realDeltaMs <= OFFLINE_GAP_MS) return realDeltaMs;
  switch (rules.offlineProgress) {
    case 'full':
      return realDeltaMs;
    case 'capped':
      return Math.min(realDeltaMs, rules.offlineCapHours * HOUR_MS);
    case 'paused':
      return 0;
  }
}

/**
 * Advances the clock in place to `realNow`. If the system clock went backwards,
 * nothing advances and the anchor stays put, so winding the clock back and forth
 * can't earn extra time.
 */
export function advanceClock(clock: Clock, realNow: number, rules: WorldRules): void {
  const delta = realNow - clock.realNow;
  if (delta <= 0) return;
  clock.gameNow += creditedRealMs(delta, rules) * rules.timeScale;
  clock.realNow = realNow;
}
