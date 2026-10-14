import { describe, expect, it } from 'vitest';
import { createSettingsStore, DEFAULT_SETTINGS, sanitizeSettings } from '../../src/app/settings';
import { localSettingsPersistence } from '../../src/persistence';

class FakeStorage {
  m = new Map<string, string>();
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}

describe('device settings', () => {
  it('fills defaults and drops invalid values', () => {
    expect(sanitizeSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(sanitizeSettings({ uiScale: 7, haptics: 'no', floatingNumbers: false })).toEqual({ ...DEFAULT_SETTINGS, floatingNumbers: false });
    expect(sanitizeSettings({ uiScale: 1.3 }).uiScale).toBe(1.3);
  });

  it('persists every change and loads it back', () => {
    const storage = new FakeStorage() as unknown as Storage;
    const store = createSettingsStore(localSettingsPersistence(storage));
    store.set({ uiScale: 1.15, confirmSell: false });
    const reloaded = createSettingsStore(localSettingsPersistence(storage));
    expect(reloaded.get()).toEqual({ ...DEFAULT_SETTINGS, uiScale: 1.15, confirmSell: false });
  });

  it('survives corrupt or blocked storage', () => {
    const storage = new FakeStorage();
    storage.setItem('homestead-acres:settings', '{not json');
    expect(createSettingsStore(localSettingsPersistence(storage as unknown as Storage)).get()).toEqual(DEFAULT_SETTINGS);
    const blocked = createSettingsStore(localSettingsPersistence(null));
    expect(() => blocked.set({ haptics: false })).not.toThrow();
  });
});
