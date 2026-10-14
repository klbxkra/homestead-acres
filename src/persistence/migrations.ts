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
  // 1: (s) => ({ ...s, schemaVersion: 2, newField: defaultValue }),
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
