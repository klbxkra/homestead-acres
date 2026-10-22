/**
 * Per-device preferences (PLAN.md Phase 4 "gameplay settings"). Unlike World
 * Rules, these aren't part of a save: they belong to this browser, not the farm.
 */
import { createStore } from './store';
import type { Store } from './store';

export const UI_SCALES = [0.85, 1, 1.15, 1.3] as const;
export type UiScale = (typeof UI_SCALES)[number];

/** Off, low, medium, high. */
export const VOLUMES = [0, 0.25, 0.5, 1] as const;
export type Volume = (typeof VOLUMES)[number];

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
  /** Skip the farmer walking to each job: plowing, planting and harvesting happen at once. */
  instantActions: boolean;
  sfxVolume: Volume;
  musicVolume: Volume;
  /** 30 fps and fewer effects, for older phones and longer battery life. */
  batterySaver: boolean;
  /** The iPhone/iPad "Add to Home Screen" reminder was dismissed. */
  iosHintDismissed: boolean;
}

export const DEFAULT_SETTINGS: DeviceSettings = {
  uiScale: 1,
  haptics: true,
  floatingNumbers: true,
  confirmSell: true,
  hoverTooltips: true,
  instantActions: false,
  sfxVolume: 0.5,
  musicVolume: 0.25,
  batterySaver: false,
  iosHintDismissed: false,
};

/** Fills gaps and drops bad values from stored or older settings. */
export function sanitizeSettings(raw: unknown): DeviceSettings {
  const r = typeof raw === 'object' && raw !== null ? (raw as Record<string, unknown>) : {};
  const bool = (key: keyof DeviceSettings) => (typeof r[key] === 'boolean' ? (r[key] as boolean) : (DEFAULT_SETTINGS[key] as boolean));
  const volume = (key: 'sfxVolume' | 'musicVolume') =>
    (VOLUMES as readonly unknown[]).includes(r[key]) ? (r[key] as Volume) : DEFAULT_SETTINGS[key];
  return {
    uiScale: (UI_SCALES as readonly unknown[]).includes(r['uiScale']) ? (r['uiScale'] as UiScale) : DEFAULT_SETTINGS.uiScale,
    haptics: bool('haptics'),
    floatingNumbers: bool('floatingNumbers'),
    confirmSell: bool('confirmSell'),
    hoverTooltips: bool('hoverTooltips'),
    instantActions: bool('instantActions'),
    sfxVolume: volume('sfxVolume'),
    musicVolume: volume('musicVolume'),
    batterySaver: bool('batterySaver'),
    iosHintDismissed: bool('iosHintDismissed'),
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
