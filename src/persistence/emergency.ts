/**
 * Last-chance synchronous save. IndexedDB writes are async and may not finish
 * when a phone kills a backgrounded tab, so on `pagehide` we also write the save
 * synchronously to localStorage. loadSlot() prefers it only when it's newer than
 * the IndexedDB save, and it's cleared after every successful IndexedDB write.
 */
import type { SaveFile } from './serialize';

const PREFIX = 'homestead-acres:emergency:';

export interface EmergencyStore {
  write(slotId: string, file: SaveFile): void;
  read(slotId: string): unknown;
  clear(slotId: string): void;
}

export function createEmergencyStore(storage: Storage | null = safeLocalStorage()): EmergencyStore {
  return {
    write(slotId, file) {
      try {
        storage?.setItem(PREFIX + slotId, JSON.stringify(file));
      } catch {
        // Quota exceeded or storage disabled: the IndexedDB save is still the main copy.
      }
    },
    read(slotId) {
      try {
        const text = storage?.getItem(PREFIX + slotId);
        return text ? (JSON.parse(text) as unknown) : null;
      } catch {
        return null;
      }
    },
    clear(slotId) {
      try {
        storage?.removeItem(PREFIX + slotId);
      } catch {
        // ignore
      }
    },
  };
}

function safeLocalStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null; // accessing localStorage throws when site data is blocked
  }
}
