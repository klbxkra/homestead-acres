/**
 * Save migrations (PLAN.md section 7). When GameState changes shape, bump
 * SCHEMA_VERSION in core/state.ts and add a step here that upgrades the previous
 * version's raw JSON. Steps run in order: v1 -> v2 -> v3 ...
 * Never edit an existing step after release; add a new one instead.
 */
import { SCHEMA_VERSION } from '../core';

/** Upgrades raw state of version N (the key) to version N + 1. */
export type Migration = (state: Record<string, unknown>) => Record<string, unknown>;

export const MIGRATIONS: Readonly<Record<number, Migration>> = {
  /**
   * v1 -> v2 (Phase 5): players gain mastery, ribbons, collectibles, gift box,
   * storage, fuel, vehicles and daily-bonus state; stats.plowed moves into
   * stats.counters; rules gain masteryGoal. Mastery stars and ribbon tiers start
   * at 0 and catch up (with their rewards) on the next matching action.
   */
  1: (s) => {
    const clock = (s['clock'] ?? {}) as { gameNow?: number };
    const players = (s['players'] ?? {}) as Record<string, Record<string, unknown>>;
    const upgraded = Object.fromEntries(
      Object.entries(players).map(([id, p]) => {
        const stats = (p['stats'] ?? {}) as { harvested?: Record<string, number>; plowed?: number };
        const harvested = stats.harvested ?? {};
        const cropsHarvested = Object.values(harvested).reduce((a, b) => a + b, 0);
        return [
          id,
          {
            ...p,
            stats: { harvested, counters: { plowed: stats.plowed ?? 0, cropsHarvested } },
            masteryStars: {},
            ribbons: {},
            collectibles: {},
            giftBox: {},
            storage: {},
            fuel: { amount: 10, updatedAt: clock.gameNow ?? 0 },
            vehicles: [],
            daily: { lastClaimRealAt: null, streak: 0 },
          },
        ];
      }),
    );
    return { ...s, players: upgraded, rules: { ...(s['rules'] as object), masteryGoal: 1 } };
  },
};

export type MigrationResult = { ok: true; state: Record<string, unknown> } | { ok: false; error: string };

export function migrate(
  state: Record<string, unknown>,
  fromVersion: number,
  toVersion: number = SCHEMA_VERSION,
  migrations: Readonly<Record<number, Migration>> = MIGRATIONS,
): MigrationResult {
  if (!Number.isInteger(fromVersion) || fromVersion < 1) return { ok: false, error: `Unknown save version ${fromVersion}.` };
  if (fromVersion > toVersion) {
    return { ok: false, error: `This save is from a newer version of the game (save format ${fromVersion}). Update the game to open it.` };
  }
  let current = state;
  for (let v = fromVersion; v < toVersion; v++) {
    const step = migrations[v];
    if (!step) return { ok: false, error: `No upgrade path from save format ${v}.` };
    current = { ...step(current), schemaVersion: v + 1 };
  }
  return { ok: true, state: current };
}
