import { openDB } from 'idb';
import type { DBSchema, IDBPDatabase } from 'idb';
import { DEFAULT_WRITE_OPTIONS, rotateBackups, sortSlots } from './SaveStore';
import type { SaveStore, SlotMeta, SlotRecords, WriteOptions } from './SaveStore';
import type { SaveFile } from './serialize';

const DB_NAME = 'homestead-acres';
const DB_VERSION = 1;

interface FarmDb extends DBSchema {
  slots: { key: string; value: SlotMeta };
  saves: { key: string; value: unknown };
  backups: { key: string; value: unknown[] };
}

/** IndexedDB SaveStore (PLAN.md section 7). One transaction per write keeps saves atomic. */
export class IdbSaveStore implements SaveStore {
  private readonly dbPromise: Promise<IDBPDatabase<FarmDb>>;

  constructor(dbName: string = DB_NAME) {
    this.dbPromise = openDB<FarmDb>(dbName, DB_VERSION, {
      upgrade(db) {
        // Future DB_VERSION bumps add stores here; never delete user data in an upgrade.
        if (!db.objectStoreNames.contains('slots')) db.createObjectStore('slots');
        if (!db.objectStoreNames.contains('saves')) db.createObjectStore('saves');
        if (!db.objectStoreNames.contains('backups')) db.createObjectStore('backups');
      },
    });
  }

  /** Resolves once the database is open; rejects if IndexedDB is unavailable (e.g. some private modes). */
  ready(): Promise<void> {
    return this.dbPromise.then(() => undefined);
  }

  async listSlots(): Promise<SlotMeta[]> {
    const db = await this.dbPromise;
    return sortSlots(await db.getAll('slots'));
  }

  async read(slotId: string): Promise<SlotRecords | null> {
    const db = await this.dbPromise;
    const tx = db.transaction(['slots', 'saves', 'backups'], 'readonly');
    const [meta, main, backups] = await Promise.all([
      tx.objectStore('slots').get(slotId),
      tx.objectStore('saves').get(slotId),
      tx.objectStore('backups').get(slotId),
      tx.done,
    ]);
    if (meta === undefined && main === undefined) return null;
    return { meta: meta ?? null, main: main ?? null, backups: backups ?? [] };
  }

  async write(slotId: string, file: SaveFile, meta: SlotMeta, options: Partial<WriteOptions> = {}): Promise<void> {
    const opts = { ...DEFAULT_WRITE_OPTIONS, ...options };
    const db = await this.dbPromise;
    const tx = db.transaction(['slots', 'saves', 'backups'], 'readwrite');
    const saves = tx.objectStore('saves');
    const backupStore = tx.objectStore('backups');
    const [previous, backups] = await Promise.all([saves.get(slotId), backupStore.get(slotId)]);
    await Promise.all([
      backupStore.put(rotateBackups(previous, backups ?? [], opts), slotId),
      saves.put(file, slotId),
      tx.objectStore('slots').put(meta, slotId),
    ]);
    await tx.done;
  }

  async remove(slotId: string): Promise<void> {
    const db = await this.dbPromise;
    const tx = db.transaction(['slots', 'saves', 'backups'], 'readwrite');
    await Promise.all([
      tx.objectStore('slots').delete(slotId),
      tx.objectStore('saves').delete(slotId),
      tx.objectStore('backups').delete(slotId),
      tx.done,
    ]);
  }
}
