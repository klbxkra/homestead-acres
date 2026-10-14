import { describe, expect, it } from 'vitest';
import { migrate, MIGRATIONS } from '../../src/persistence';
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

  it('has a step for every version below the current one', async () => {
    const { SCHEMA_VERSION } = await import('../../src/core');
    for (let v = 1; v < SCHEMA_VERSION; v++) expect(MIGRATIONS[v], `missing migration ${v} -> ${v + 1}`).toBeTypeOf('function');
  });
});
