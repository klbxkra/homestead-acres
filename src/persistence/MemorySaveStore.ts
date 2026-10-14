import { DEFAULT_WRITE_OPTIONS, rotateBackups, sortSlots } from './SaveStore';
import type { SaveStore, SlotMeta, SlotRecords, WriteOptions } from './SaveStore';
import type { SaveFile } from './serialize';

/** In-memory SaveStore for tests and as a fallback when IndexedDB is unavailable. */
export class MemorySaveStore implements SaveStore {
  private readonly slots = new Map<string, { meta: SlotMeta; main: unknown; backups: unknown[] }>();

  async listSlots(): Promise<SlotMeta[]> {
    return sortSlots([...this.slots.values()].map((s) => structuredClone(s.meta)));
  }

  async read(slotId: string): Promise<SlotRecords | null> {
    const s = this.slots.get(slotId);
    return s ? structuredClone(s) : null;
  }

  async write(slotId: string, file: SaveFile, meta: SlotMeta, options: Partial<WriteOptions> = {}): Promise<void> {
    const opts = { ...DEFAULT_WRITE_OPTIONS, ...options };
    const existing = this.slots.get(slotId);
    const backups = rotateBackups(existing?.main, existing?.backups ?? [], opts);
    this.slots.set(slotId, { meta: structuredClone(meta), main: structuredClone(file), backups });
  }

  async remove(slotId: string): Promise<void> {
    this.slots.delete(slotId);
  }

  /** Test helper: overwrite raw records (e.g. to simulate corruption). */
  poke(slotId: string, patch: Partial<{ main: unknown; backups: unknown[] }>): void {
    const s = this.slots.get(slotId);
    if (s) Object.assign(s, patch);
  }
}
