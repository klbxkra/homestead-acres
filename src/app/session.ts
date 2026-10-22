import { PRESET_IDS, rulesForPreset } from '../core';
import type { PresetId, WorldRules } from '../core';
import type { Transport } from '../net/Transport';
import type { GameAudio } from '../platform/audio';
import type { SettingsStore } from './settings';
import type { UiStore } from './uiState';

/** What the farm renderer and in-game UI work with while a farm is open. */
export interface Session {
  transport: Transport;
  ui: UiStore;
  settings: SettingsStore;
  audio: GameAudio;
}

/**
 * Rules for a new farm: the chosen preset, plus dev/testing URL overrides
 * (?timeScale=600, ?coins=5000) until the Phase 4 settings screen exists.
 */
export function rulesForNewFarm(preset: PresetId, search: string = currentSearch()): WorldRules {
  const params = new URLSearchParams(search);
  const rules = rulesForPreset(preset);
  const timeScale = Number(params.get('timeScale'));
  if (timeScale > 0) rules.timeScale = timeScale;
  const coins = Number(params.get('coins'));
  if (params.has('coins') && coins >= 0) rules.startingCoins = Math.floor(coins);
  if (timeScale > 0 || params.has('coins')) rules.preset = 'custom';
  return rules;
}

/** Preset pre-selected in the new-farm form (?preset=speedrun for testing). */
export function defaultPresetFromQuery(search: string = currentSearch()): PresetId {
  const preset = new URLSearchParams(search).get('preset');
  return preset !== null && (PRESET_IDS as string[]).includes(preset) ? (preset as PresetId) : 'classic';
}

function currentSearch(): string {
  return typeof window === 'undefined' ? '' : window.location.search;
}
