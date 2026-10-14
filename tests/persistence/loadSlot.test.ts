import { describe, expect, it } from 'vitest';
import { createEmergencyStore, encodeSave, loadSlot, MemorySaveStore } from '../../src/persistence';
import type { SlotMeta } from '../../src/persistence';
import { Harness, T0 } from '../core/harness';

/** Minimal Storage stand-in for the emergency copy. */
class FakeStorage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  clear() {
    this.m.clear();
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
}

function stateWithCoins(coins: number) {
  const h = new Harness({ startingCoins: coins });
  return h.state;
}

const coinsOf = (r: Awaited<ReturnType<typeof loadSlot>>) => (r.ok ? r.state.players[r.state.localPlayerId]!.coins : null);
const meta: SlotMeta = { slotId: 's', farmName: 'F', playerName: 'P', level: 1, coins: 0, createdAt: T0, lastSavedAt: T0, playtimeMs: 0 };

async function storeWithHistory() {
  const store = new MemorySaveStore();
  await store.write('s', encodeSave(stateWithCoins(100), T0), meta);
  await store.write('s', encodeSave(stateWithCoins(200), T0 + 1000), meta, { forceBackup: true });
  await store.write('s', encodeSave(stateWithCoins(300), T0 + 2000), meta, { forceBackup: true });
  return store; // main = 300, backups = [200, 100]
}

describe('loadSlot', () => {
  it('loads the main save when it is fine', async () => {
    const r = await loadSlot(await storeWithHistory(), 's');
    expect(r.ok && r.source).toBe('main');
    expect(coinsOf(r)).toBe(300);
    expect(r.problems).toEqual([]);
  });

  it('falls back to the newest readable backup when the main save is corrupted', async () => {
    const store = await storeWithHistory();
    const records = await store.read('s');
    const broken = structuredClone(records!.main) as { state: { rng: number } };
    broken.state.rng += 1; // silent corruption: checksum no longer matches
    store.poke('s', { main: broken });
    const r = await loadSlot(store, 's');
    expect(r.ok && r.source).toBe('backup');
    expect(coinsOf(r)).toBe(200);
    expect(r.problems[0]).toMatch(/main: .*checksum/);
  });

  it('skips several bad copies', async () => {
    const store = await storeWithHistory();
    const records = await store.read('s');
    store.poke('s', { main: 'garbage', backups: [{ junk: true }, records!.backups[1]] });
    const r = await loadSlot(store, 's');
    expect(coinsOf(r)).toBe(100);
    expect(r.problems).toHaveLength(2);
  });

  it('uses the emergency copy only when it is newer than the main save', async () => {
    const store = await storeWithHistory();
    const emergency = createEmergencyStore(new FakeStorage());

    emergency.write('s', encodeSave(stateWithCoins(999), T0 + 5000));
    const newer = await loadSlot(store, 's', emergency);
    expect(newer.ok && newer.source).toBe('emergency');
    expect(coinsOf(newer)).toBe(999);

    emergency.write('s', encodeSave(stateWithCoins(1), T0 + 1)); // older than main
    const older = await loadSlot(store, 's', emergency);
    expect(older.ok && older.source).toBe('main');
    expect(coinsOf(older)).toBe(300);
  });

  it('reports failure when nothing is readable', async () => {
    const store = new MemorySaveStore();
    await store.write('s', encodeSave(stateWithCoins(5), T0), meta);
    store.poke('s', { main: { format: 'homestead-acres-save' }, backups: [] });
    const r = await loadSlot(store, 's');
    expect(r.ok).toBe(false);
    expect((await loadSlot(store, 'missing')).ok).toBe(false);
  });

  it('emergency store tolerates broken storage', () => {
    const throwing = {
      getItem: () => {
        throw new Error('blocked');
      },
      setItem: () => {
        throw new Error('quota');
      },
      removeItem: () => {
        throw new Error('blocked');
      },
    } as unknown as Storage;
    const e = createEmergencyStore(throwing);
    expect(() => e.write('s', encodeSave(stateWithCoins(1), T0))).not.toThrow();
    expect(e.read('s')).toBeNull();
    expect(() => e.clear('s')).not.toThrow();
    expect(createEmergencyStore(null).read('s')).toBeNull();
  });
});
