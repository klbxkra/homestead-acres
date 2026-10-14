import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AUTOSAVE_INTERVAL_MS, Autosaver, SAVE_DEBOUNCE_MS } from '../../src/app/Autosaver';
import { defaultContent } from '../../src/content';
import { newGame } from '../../src/core';
import { LocalTransport } from '../../src/net/LocalTransport';
import { decodeSave, MemorySaveStore } from '../../src/persistence';
import type { EmergencyStore, SlotMeta } from '../../src/persistence';
import { T0 } from '../core/harness';

let now = T0;

function setup() {
  const transport = new LocalTransport(newGame({ farmName: 'Auto', playerName: 'P', realNow: T0, seed: 1 }, defaultContent), defaultContent, () => now);
  const store = new MemorySaveStore();
  const emergencyWrites: number[] = [];
  let emergencyCleared = 0;
  const emergency: EmergencyStore = {
    write: (_slot, file) => emergencyWrites.push(file.savedAt),
    read: () => null,
    clear: () => emergencyCleared++,
  };
  const meta: SlotMeta = { slotId: 's', farmName: 'Auto', playerName: 'P', level: 1, coins: 200, createdAt: T0, lastSavedAt: T0, playtimeMs: 0 };
  const statuses: string[] = [];
  const saver = new Autosaver({ transport, store, emergency, slotId: 's', meta, now: () => now, onStatus: (s) => statuses.push(s) });
  return { transport, store, saver, statuses, emergencyWrites, emergencyCleared: () => emergencyCleared };
}

/** Advance fake timers and the injected clock together. */
async function advance(ms: number) {
  now += ms;
  await vi.advanceTimersByTimeAsync(ms);
}

beforeEach(() => {
  vi.useFakeTimers();
  now = T0;
});

afterEach(() => {
  vi.useRealTimers();
});

describe('Autosaver', () => {
  it('saves a short while after a change, batching bursts of actions', async () => {
    const { transport, store, saver } = setup();
    saver.start();
    transport.send({ type: 'plow', x: 0, y: 0 });
    await advance(SAVE_DEBOUNCE_MS / 2);
    transport.send({ type: 'plow', x: 1, y: 0 });
    await advance(SAVE_DEBOUNCE_MS - 10);
    expect(await store.read('s')).toBeNull(); // debounce restarted by the second action
    await advance(20);
    const records = await store.read('s');
    const decoded = decodeSave(records?.main);
    expect(decoded.ok && Object.keys(decoded.state.farms[decoded.state.homeFarmId]!.entities)).toHaveLength(2);
    expect(records?.meta?.coins).toBe(170);
    saver.stop();
  });

  it('saves on the interval even without actions, so the clock anchor stays fresh', async () => {
    const { store, saver } = setup();
    saver.start();
    await advance(AUTOSAVE_INTERVAL_MS);
    const first = decodeSave((await store.read('s'))?.main);
    expect(first.ok && first.state.clock.realNow).toBe(T0 + AUTOSAVE_INTERVAL_MS);
    await advance(AUTOSAVE_INTERVAL_MS);
    const second = decodeSave((await store.read('s'))?.main);
    expect(second.ok && second.state.clock.realNow).toBe(T0 + 2 * AUTOSAVE_INTERVAL_MS);
    saver.stop();
  });

  it('backs up the on-disk copy on the first write of a session only', async () => {
    const { store, saver } = setup();
    saver.start();
    await saver.saveNow();
    await advance(1000);
    await saver.saveNow(); // first write already happened; interval rule applies now
    await advance(1000);
    await saver.saveNow();
    expect((await store.read('s'))?.backups).toHaveLength(1);
    saver.stop();
  });

  it('reports status, tracks playtime only while visible, and clears the emergency copy after saving', async () => {
    const { store, saver, statuses, emergencyCleared } = setup();
    saver.start();
    await advance(10_000);
    saver.pausePlaytime();
    await advance(50_000); // hidden: not counted
    saver.resumePlaytime();
    await advance(5_000);
    await saver.saveNow();
    expect((await store.read('s'))?.meta?.playtimeMs).toBe(15_000);
    expect(statuses.slice(-2)).toEqual(['saving', 'saved']);
    expect(emergencyCleared()).toBeGreaterThan(0);
    saver.stop();
  });

  it('writes the synchronous emergency copy with the current time', async () => {
    const { saver, emergencyWrites } = setup();
    saver.start();
    await advance(1234);
    saver.saveEmergencyCopy();
    expect(emergencyWrites).toEqual([T0 + 1234]);
    saver.stop();
  });

  it('reports errors and keeps working after a failed write', async () => {
    const { store, saver, statuses } = setup();
    const original = store.write.bind(store);
    let fail = true;
    store.write = async (...args) => {
      if (fail) throw new Error('disk full');
      return original(...args);
    };
    saver.start();
    await expect(saver.saveNow()).rejects.toThrow('disk full');
    expect(statuses.at(-1)).toBe('error');
    fail = false;
    await saver.saveNow();
    expect(statuses.at(-1)).toBe('saved');
    saver.stop();
  });

  it('stops saving after stop()', async () => {
    const { store, saver, transport } = setup();
    saver.start();
    saver.stop();
    transport.send({ type: 'plow', x: 0, y: 0 });
    await advance(AUTOSAVE_INTERVAL_MS * 2);
    expect(await store.read('s')).toBeNull();
  });
});
