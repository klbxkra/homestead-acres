import type { GameState } from '../core';
import type { EmergencyStore } from './emergency';
import type { SaveStore, SlotMeta } from './SaveStore';
import { decodeSave } from './serialize';

export type LoadSource = 'main' | 'emergency' | 'backup';

export type LoadResult =
  | {
      ok: true;
      state: GameState;
      meta: SlotMeta | null;
      source: LoadSource;
      /** Real ms the loaded copy was saved. */
      savedAt: number;
      /** Why newer copies were skipped (empty when the main save loaded fine). */
      problems: string[];
    }
  | { ok: false; error: string; problems: string[] };

/**
 * Loads a slot, falling back through the copies until one is valid:
 * emergency copy (only if newer than the main save) -> main save -> backups, newest first.
 */
export async function loadSlot(store: SaveStore, slotId: string, emergency?: EmergencyStore): Promise<LoadResult> {
  const records = await store.read(slotId);
  const emergencyRaw = emergency?.read(slotId) ?? null;
  if (!records && !emergencyRaw) return { ok: false, error: 'That farm was not found.', problems: [] };

  const candidates: { source: LoadSource; raw: unknown }[] = [];
  const mainAt = savedAtOf(records?.main);
  const emergencyAt = savedAtOf(emergencyRaw);
  if (emergencyRaw && (mainAt === null || (emergencyAt !== null && emergencyAt > mainAt))) {
    candidates.push({ source: 'emergency', raw: emergencyRaw });
  }
  if (records?.main) candidates.push({ source: 'main', raw: records.main });
  for (const b of records?.backups ?? []) candidates.push({ source: 'backup', raw: b });

  const problems: string[] = [];
  for (const c of candidates) {
    const decoded = decodeSave(c.raw);
    if (decoded.ok) {
      return { ok: true, state: decoded.state, meta: records?.meta ?? null, source: c.source, savedAt: decoded.savedAt, problems };
    }
    problems.push(`${c.source}: ${decoded.error}`);
  }
  return { ok: false, error: 'No readable copy of this farm was found.', problems };
}

function savedAtOf(file: unknown): number | null {
  if (typeof file !== 'object' || file === null) return null;
  const at = (file as { savedAt?: unknown }).savedAt;
  return typeof at === 'number' ? at : null;
}
