import { describe, expect, it } from 'vitest';
import { defaultContent } from '../../src/content';
import { HOUR_MS, newGame } from '../../src/core';
import type { GameEvent } from '../../src/core';
import { LocalTransport } from '../../src/net/LocalTransport';
import { T0 } from '../core/harness';

function setup() {
  let now = T0;
  const state = newGame({ farmName: 'F', playerName: 'P', realNow: T0, seed: 1 }, defaultContent);
  const transport = new LocalTransport(state, defaultContent, () => now);
  return { transport, setNow: (t: number) => (now = t) };
}

describe('LocalTransport', () => {
  it('applies commands and notifies subscribers with the events', () => {
    const { transport } = setup();
    const seen: GameEvent[][] = [];
    transport.subscribe((_s, events) => seen.push([...events]));
    const result = transport.send({ type: 'plow', x: 1, y: 1 });
    expect(result.ok).toBe(true);
    expect(seen).toHaveLength(1);
    expect(seen[0]?.[0]).toMatchObject({ type: 'plowed', x: 1, y: 1 });
    expect(Object.keys(transport.getState().farms[transport.getState().homeFarmId]!.entities)).toHaveLength(1);
  });

  it('returns errors without changing state or notifying', () => {
    const { transport } = setup();
    let calls = 0;
    transport.subscribe(() => calls++);
    const before = transport.getState();
    const result = transport.send({ type: 'harvest', x: 0, y: 0 });
    expect(result).toEqual({ ok: false, error: { code: 'not_plowed', message: 'Plow this spot first.' } });
    expect(transport.getState()).toBe(before);
    expect(calls).toBe(0);
  });

  it('uses the injected clock for commands and ticks', () => {
    const { transport, setNow } = setup();
    transport.send({ type: 'plow', x: 0, y: 0 });
    transport.send({ type: 'plant', x: 0, y: 0, cropId: 'strawberry' });
    setNow(T0 + 4 * HOUR_MS);
    transport.tick(T0 + 4 * HOUR_MS);
    expect(transport.getState().clock.gameNow).toBe(T0 + 4 * HOUR_MS);
    expect(transport.send({ type: 'harvest', x: 0, y: 0 }).ok).toBe(true);
  });

  it('does not notify when a tick changes nothing', () => {
    const { transport } = setup();
    let calls = 0;
    transport.subscribe(() => calls++);
    transport.tick(T0);
    transport.tick(T0 - 1000);
    expect(calls).toBe(0);
  });
});
