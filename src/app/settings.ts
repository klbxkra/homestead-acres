/**
 * Per-device preferences (PLAN.md Phase 4 "gameplay settings"). Unlike World
 * Rules, these aren't part of a save: they belong to this browser, not the farm.
 */
import { createStore } from './store';
import type { Store } from './store';

export const UI_SCALES = [0.85, 1, 1.15, 1.3] as const;
export type UiScale = (typeof UI_SCALES)[number];

export interface DeviceSettings {
  /** Size of the HUD, toolbar and menus. */
  uiScale: UiScale;
  /** Short vibration on touch actions (where the device supports it). */
  haptics: boolean;
  /** "+35" / "+1 XP" pop-ups over the farm. */
  floatingNumbers: boolean;
  /** Ask before selling decorations or removing growing crops. */
  confirmSell: boolean;
  /** Mouse only: show item info when hovering. */
  hoverTooltips: boolean;
}

export const DEFAULT_SETTINGS: DeviceSettings = {
  uiScale: 1,
  haptics: true,
  floatingNumbers: true,
  confirmSell: true,
  hoverTooltips: true,
};

/** Fills gaps and drops bad values from stored or older settings. */
export function sanitizeSettings(raw: unknown): DeviceSettings {
  const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const bool = (key: keyof DeviceSettings) => (typeof r[key] === 'boolean' ? (r[key] as boolean) : (DEFAULT_SETTINGS[key] as boolean));
  return {
    uiScale: (UI_SCALES as readonly unknown[]).includes(r['uiScale']) ? (r['uiScale'] as UiScale) : DEFAULT_SETTINGS.uiScale,
    haptics: bool('haptics'),
    floatingNumbers: bool('floatingNumbers'),
    confirmSell: bool('confirmSell'),
    hoverTooltips: bool('hoverTooltips'),
  };
}

export interface SettingsPersistence {
  load(): unknown;
  save(settings: DeviceSettings): void;
}

export type SettingsStore = Store<DeviceSettings>;

/** A settings store that loads once and saves after every change. */
export function createSettingsStore(persistence: SettingsPersistence): SettingsStore {
  const store = createStore<DeviceSettings>(sanitizeSettings(persistence.load()));
  store.subscribe((s) => persistence.save(s));
  return store;
}
