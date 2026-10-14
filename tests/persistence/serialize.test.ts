import { describe, expect, it } from 'vitest';
import { defaultContent } from '../../src/content';
import { newGame, SCHEMA_VERSION } from '../../src/core';
import { checksumOf, decodeSave, encodeSave, parseGameState, SAVE_FORMAT } from '../../src/persistence';
import { Harness, T0 } from '../core/harness';

function playedState() {
  const h = new Harness({ xpGain: 1.5, overrides: { strawberry: { growMs: 1000 } } });
  h.ok({ type: 'plow', x: 0, y: 0 });
  h.ok({ type: 'plant', x: 0, y: 0, cropId: 'strawberry' });
  h.ok({ type: 'buy', itemId: 'hay_bale', x: 3, y: 3, rotated: true });
  h.advance(5000);
  return h.state;
}

describe('save encoding', () => {
  it('round-trips a played game through JSON exactly', () => {
    const state = playedState();
    const file = JSON.parse(JSON.stringify(encodeSave(state, T0 + 10)));
    const decoded = decodeSave(file);
    expect(decoded.ok).toBe(true);
    if (decoded.ok) {
      expect(decoded.state).toEqual(state);
      expect(decoded.savedAt).toBe(T0 + 10);
      expect(decoded.migratedFrom).toBeNull();
    }
  });

  it('writes the envelope fields', () => {
    const file = encodeSave(playedState(), 123);
    expect(file).toMatchObject({ format: SAVE_FORMAT, schemaVersion: SCHEMA_VERSION, savedAt: 123 });
    expect(file.checksum).toBe(checksumOf(file.state));
  });

  it('schema keeps every field of a fresh game (catches the schema falling behind GameState)', () => {
    const fresh = newGame({ farmName: 'F', playerName: 'P', realNow: T0, seed: 7 }, defaultContent);
    const parsed = parseGameState(JSON.parse(JSON.stringify(fresh)));
    expect(parsed.ok && parsed.state).toEqual(fresh);
    const played = playedState();
    const parsedPlayed = parseGameState(JSON.parse(JSON.stringify(played)));
    expect(parsedPlayed.ok && parsedPlayed.state).toEqual(played);
  });
});

describe('save decoding rejects bad data', () => {
  const good = () => JSON.parse(JSON.stringify(encodeSave(playedState(), T0)));

  it('rejects things that are not saves', () => {
    for (const raw of [null, 42, 'save', [], {}, { format: 'other-game' }]) {
      expect(decodeSave(raw).ok).toBe(false);
    }
  });

  it('detects corruption with the checksum', () => {
    const file = good();
    file.state.players[file.state.localPlayerId].coins = 999_999;
    const result = decodeSave(file);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/checksum/);
  });

  it('refuses saves from a newer version', () => {
    const file = good();
    file.schemaVersion = SCHEMA_VERSION + 1;
    const result = decodeSave(file);
    expect(!result.ok && result.error).toMatch(/newer version/);
  });

  it('validates structure even when the checksum matches (e.g. a hand-edited import)', () => {
    const file = good();
    file.state.players[file.state.localPlayerId].coins = 'lots';
    file.checksum = checksumOf(file.state);
    const result = decodeSave(file);
    expect(!result.ok && result.error).toMatch(/invalid/);

    const missingFarm = good();
    missingFarm.state.homeFarmId = 'nowhere';
    missingFarm.checksum = checksumOf(missingFarm.state);
    expect(decodeSave(missingFarm).ok).toBe(false);

    const badEntity = good();
    const farm = badEntity.state.farms[badEntity.state.homeFarmId];
    farm.entities['x'] = { kind: 'spaceship', id: 'x', ownerId: 'p', x: 0, y: 0 };
    badEntity.checksum = checksumOf(badEntity.state);
    expect(decodeSave(badEntity).ok).toBe(false);
  });
});
