/**
 * Asks the browser not to evict this site's data under storage pressure
 * (PLAN.md section 7). Some browsers grant it silently, some only for installed
 * apps or engaged sites; it's always safe to ask.
 */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    if (await navigator.storage.persisted()) return true;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
