import type { SaveFile } from './serialize';

/** What the farm list shows without loading the whole save. */
export interface SlotMeta {
  slotId: string;
  farmName: string;
  playerName: string;
  level: number;
  coins: number;
  createdAt: number;
  lastSavedAt: number;
  playtimeMs: number;
}

/** Raw records for a slot; decoding and fallback happen in loadSlot.ts. Backups are newest first. */
export interface SlotRecords {
  meta: SlotMeta | null;
  main: unknown;
  backups: unknown[];
}

export interface WriteOptions {
  /** Most backups kept per slot. */
  maxBackups: number;
  /** Only rotate the previous save into the backups if the newest backup is at least this old. */
  minBackupIntervalMs: number;
  /** Rotate regardless of age (e.g. the first save of a session). */
  forceBackup: boolean;
  /** Don't keep the previous save at all (it's known to be damaged). Wins over forceBackup. */
  skipBackup: boolean;
}

export const DEFAULT_WRITE_OPTIONS: WriteOptions = {
  maxBackups: 5,
  minBackupIntervalMs: 10 * 60 * 1000,
  forceBackup: false,
  skipBackup: false,
};

/**
 * Local save storage (PLAN.md principle 7). The browser uses IndexedDB; tests use
 * memory; a desktop build can add a file-system store with the same interface.
 * write() is atomic: the save, backup rotation and metadata all commit or none do.
 */
export interface SaveStore {
  listSlots(): Promise<SlotMeta[]>;
  read(slotId: string): Promise<SlotRecords | null>;
  write(slotId: string, file: SaveFile, meta: SlotMeta, options?: Partial<WriteOptions>): Promise<void>;
  remove(slotId: string): Promise<void>;
}

/** Shared backup policy: returns the new backup list after `previousMain` is replaced. */
export function rotateBackups(
  previousMain: unknown,
  backups: readonly unknown[],
  options: WriteOptions,
): unknown[] {
  if (previousMain === undefined || previousMain === null || options.skipBackup) return [...backups];
  const newest = backups[0];
  const newestAt = savedAtOf(newest);
  const prevAt = savedAtOf(previousMain);
  const due = options.forceBackup || newest === undefined || newestAt === null || prevAt === null || prevAt - newestAt >= options.minBackupIntervalMs;
  if (!due) return [...backups];
  return [previousMain, ...backups].slice(0, options.maxBackups);
}

function savedAtOf(file: unknown): number | null {
  if (typeof file !== 'object' || file === null) return null;
  const at = (file as { savedAt?: unknown }).savedAt;
  return typeof at === 'number' ? at : null;
}

export function sortSlots(slots: SlotMeta[]): SlotMeta[] {
  return [...slots].sort((a, b) => b.lastSavedAt - a.lastSavedAt);
}
