import type { DeviceSettings, SettingsPersistence } from '../app/settings';

const KEY = 'homestead-acres:settings';

/** Device settings live in localStorage: small, synchronous, and per browser. */
export function localSettingsPersistence(storage: Storage | null = safeLocalStorage()): SettingsPersistence {
  return {
    load() {
      try {
        const text = storage?.getItem(KEY);
        return text ? (JSON.parse(text) as unknown) : null;
      } catch {
        return null;
      }
    },
    save(settings: DeviceSettings) {
      try {
        storage?.setItem(KEY, JSON.stringify(settings));
      } catch {
        // storage blocked or full: settings just won't persist
      }
    },
  };
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}
