import { describe, expect, it } from 'vitest';
import { rulesForPreset } from '../../src/core';
import { checksumOf, decodeSave, migrate, MIGRATIONS } from '../../src/persistence';
import type { Migration } from '../../src/persistence';

const steps: Record<number, Migration> = {
  1: (s) => ({ ...s, addedInV2: true }),
  2: (s) => {
    const { oldName, ...rest } = s as { oldName?: string };
    return { ...rest, newName: oldName ?? 'none' };
  },
};

describe('migrate', () => {
  it('runs each step in order and stamps the version', () => {
    const result = migrate({ schemaVersion: 1, oldName: 'Sunny' }, 1, 3, steps);
    expect(result).toEqual({ ok: true, state: { schemaVersion: 3, addedInV2: true, newName: 'Sunny' } });
  });

  it('starts from the save version, skipping earlier steps', () => {
    const result = migrate({ schemaVersion: 2, oldName: 'X' }, 2, 3, steps);
    expect(result).toEqual({ ok: true, state: { schemaVersion: 3, newName: 'X' } });
  });

  it('is a no-op for current saves', () => {
    expect(migrate({ schemaVersion: 3, a: 1 }, 3, 3, steps)).toEqual({ ok: true, state: { schemaVersion: 3, a: 1 } });
  });

  it('fails on gaps, newer saves and nonsense versions', () => {
    expect(migrate({}, 1, 4, steps).ok).toBe(false); // no step 3
    expect(migrate({}, 5, 3, steps).ok).toBe(false);
    expect(migrate({}, 0, 3, steps).ok).toBe(false);
    expect(migrate({}, 1.5, 3, steps).ok).toBe(false);
  });

  it('upgrades a real v1 save (Phases 1-4) to the current format', () => {
    // A v1 save as Phases 1-4 wrote it: no Phase 5 player fields, stats.plowed, no masteryGoal.
    const v1Rules: Record<string, unknown> = { ...rulesForPreset('relaxed') };
    delete v1Rules['masteryGoal'];
    const v1State = {
      schemaVersion: 1,
      rules: v1Rules,
      clock: { gameNow: 5_000_000, realNow: 5_000_000 },
      rng: 42,
      nextId: 4,
      players: {
        player1: { id: 'player1', name: 'Old Timer', coins: 321, cash: 7, xp: 99, level: 5, stats: { harvested: { strawberry: 12, wheat: 3 }, plowed: 20 } },
      },
      farms: {
        farm2: {
          id: 'farm2',
          ownerId: 'player1',
          name: 'Legacy Farm',
          width: 12,
          height: 12,
          entities: {
            plot3: { kind: 'plot', id: 'plot3', ownerId: 'player1', x: 1, y: 1, plowed: true, crop: { cropId: 'wheat', plantedAt: 1, readyAt: 2 } },
          },
        },
      },
      localPlayerId: 'player1',
      homeFarmId: 'farm2',
    };
    const file = { format: 'homestead-acres-save', schemaVersion: 1, gameVersion: '0.1.0', savedAt: 5_000_000, checksum: checksumOf(v1State), state: v1State };

    const decoded = decodeSave(JSON.parse(JSON.stringify(file)));
    expect(decoded.ok, decoded.ok ? '' : decoded.error).toBe(true);
    if (!decoded.ok) return;
    expect(decoded.migratedFrom).toBe(1);
    const p = decoded.state.players['player1']!;
    expect(p).toMatchObject({ coins: 321, cash: 7, level: 5, giftBox: {}, storage: {}, vehicles: [], masteryStars: {} });
    expect(p.stats).toEqual({ harvested: { strawberry: 12, wheat: 3 }, counters: { plowed: 20, cropsHarvested: 15 } });
    expect(p.fuel).toEqual({ amount: 10, updatedAt: 5_000_000 });
    expect(decoded.state.rules.masteryGoal).toBe(1);
    expect(decoded.state.rules.preset).toBe('relaxed');
    expect(decoded.state.farms['farm2']!.entities['plot3']).toMatchObject({ kind: 'plot', crop: { cropId: 'wheat' } });
  });

  it('has a step for every version below the current one', async () => {
    const { SCHEMA_VERSION } = await import('../../src/core');
    for (let v = 1; v < SCHEMA_VERSION; v++) expect(MIGRATIONS[v], `missing migration ${v} -> ${v + 1}`).toBeTypeOf('function');
  });
});
