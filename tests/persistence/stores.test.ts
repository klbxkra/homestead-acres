import 'fake-indexeddb/auto';
import { describe, expect, it } from 'vitest';
import { defaultContent } from '../../src/content';
import { newGame } from '../../src/core';
import { encodeSave, IdbSaveStore, MemorySaveStore, rotateBackups } from '../../src/persistence';
import type { SaveStore, SlotMeta } from '../../src/persistence';
import { T0 } from '../core/harness';

const MIN = 60_000;
let dbCounter = 0;

function meta(slotId: string, lastSavedAt: number): SlotMeta {
  return { slotId, farmName: slotId, playerName: 'P', level: 1, coins: 0, createdAt: T0, lastSavedAt, playtimeMs: 0 };
}

function file(savedAt: number) {
  return encodeSave(newGame({ farmName: 'F', playerName: 'P', realNow: T0, seed: 1 }, defaultContent), savedAt);
}

const savedAts = (records: { backups: unknown[] } | null) => (records?.backups ?? []).map((b) => (b as { savedAt: number }).savedAt);

const stores: [string, () => SaveStore][] = [
  ['MemorySaveStore', () => new MemorySaveStore()],
  ['IdbSaveStore', () => new IdbSaveStore(`test-db-${++dbCounter}`)],
];

describe.each(stores)('%s', (_name, makeStore) => {
  it('writes, reads, lists newest first and removes', async () => {
    const store = makeStore();
    expect(await store.read('a')).toBeNull();
    await store.write('a', file(T0), meta('a', T0));
    await store.write('b', file(T0 + 5), meta('b', T0 + 5));
    expect((await store.listSlots()).map((s) => s.slotId)).toEqual(['b', 'a']);

    const a = await store.read('a');
    expect(a?.meta?.farmName).toBe('a');
    expect((a?.main as { savedAt: number }).savedAt).toBe(T0);
    expect(a?.backups).toEqual([]);

    await store.remove('a');
    expect(await store.read('a')).toBeNull();
    expect((await store.listSlots()).map((s) => s.slotId)).toEqual(['b']);
  });

  it('rotates the previous save into backups at most every interval, keeping the newest few', async () => {
    const store = makeStore();
    const opts = { maxBackups: 3, minBackupIntervalMs: 10 * MIN };
    await store.write('s', file(T0), meta('s', T0), opts);
    await store.write('s', file(T0 + 1 * MIN), meta('s', T0 + MIN), opts); // first backup: T0
    await store.write('s', file(T0 + 2 * MIN), meta('s', T0 + 2 * MIN), opts); // previous (1 min) too close to T0
    expect(savedAts(await store.read('s'))).toEqual([T0]);

    await store.write('s', file(T0 + 11 * MIN), meta('s', T0 + 11 * MIN), opts); // previous (2 min) still too close
    await store.write('s', file(T0 + 12 * MIN), meta('s', T0 + 12 * MIN), opts); // previous (11 min) is 11 min after T0
    expect(savedAts(await store.read('s'))).toEqual([T0 + 11 * MIN, T0]);

    await store.write('s', file(T0 + 13 * MIN), meta('s', T0 + 13 * MIN), { ...opts, forceBackup: true });
    await store.write('s', file(T0 + 14 * MIN), meta('s', T0 + 14 * MIN), { ...opts, forceBackup: true });
    expect(savedAts(await store.read('s'))).toEqual([T0 + 13 * MIN, T0 + 12 * MIN, T0 + 11 * MIN]); // capped at 3
  });
});

describe('rotateBackups', () => {
  const opts = { maxBackups: 5, minBackupIntervalMs: 10 * MIN, forceBackup: false, skipBackup: false };
  it('never keeps a previous save marked as damaged', () => {
    expect(rotateBackups('damaged', [{ savedAt: T0 }], { ...opts, skipBackup: true, forceBackup: true })).toEqual([{ savedAt: T0 }]);
  });
  it('does nothing when there was no previous save', () => {
    expect(rotateBackups(undefined, [], opts)).toEqual([]);
    expect(rotateBackups(null, [{ savedAt: 1 }], opts)).toEqual([{ savedAt: 1 }]);
  });
  it('always keeps a previous save that has no readable timestamp (it might be the only copy)', () => {
    expect(rotateBackups('garbage', [{ savedAt: T0 }], opts)).toEqual(['garbage', { savedAt: T0 }]);
  });
});
