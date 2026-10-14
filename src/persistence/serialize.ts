/**
 * Save file format (PLAN.md section 7). The same envelope is stored in IndexedDB
 * and written to exported .farm files.
 */
import { GAME_VERSION } from '../config';
import { SCHEMA_VERSION } from '../core';
import type { GameState } from '../core';
import { migrate } from './migrations';
import { parseGameState } from './schema';

export const SAVE_FORMAT = 'homestead-acres-save';

export interface SaveFile {
  format: typeof SAVE_FORMAT;
  schemaVersion: number;
  gameVersion: string;
  /** Real (wall-clock) ms when written. */
  savedAt: number;
  /** Hash of JSON.stringify(state), to detect corruption (not tampering). */
  checksum: string;
  state: GameState;
}

export function encodeSave(state: GameState, savedAt: number): SaveFile {
  return {
    format: SAVE_FORMAT,
    schemaVersion: state.schemaVersion,
    gameVersion: GAME_VERSION,
    savedAt,
    checksum: checksumOf(state),
    state,
  };
}

export type DecodeResult =
  | { ok: true; state: GameState; savedAt: number; migratedFrom: number | null }
  | { ok: false; error: string };

/** Checks, upgrades and validates a save envelope from storage or a file. Never throws. */
export function decodeSave(raw: unknown): DecodeResult {
  if (!isRecord(raw) || raw['format'] !== SAVE_FORMAT) return { ok: false, error: 'This is not a Homestead Acres save.' };
  const version = raw['schemaVersion'];
  const state = raw['state'];
  const savedAt = raw['savedAt'];
  if (typeof version !== 'number' || !isRecord(state) || typeof savedAt !== 'number') {
    return { ok: false, error: 'The save is incomplete.' };
  }
  if (raw['checksum'] !== checksumOf(state)) return { ok: false, error: 'The save is damaged (checksum mismatch).' };

  const migrated = migrate(state, version);
  if (!migrated.ok) return migrated;
  const parsed = parseGameState(migrated.state);
  if (!parsed.ok) return { ok: false, error: `The save is invalid: ${parsed.error}` };
  return { ok: true, state: parsed.state, savedAt, migratedFrom: version === SCHEMA_VERSION ? null : version };
}

export function checksumOf(state: unknown): string {
  return cyrb53(JSON.stringify(state)).toString(36);
}

/** cyrb53: fast 53-bit string hash with good distribution (public domain, bryc). */
function cyrb53(text: string, seed = 0): number {
  let h1 = 0xdeadbeef ^ seed;
  let h2 = 0x41c6ce57 ^ seed;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}
