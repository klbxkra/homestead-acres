export type PlayerId = string;
export type FarmId = string;
export type EntityId = string;

/**
 * Allocates a new id from the counter stored in state. Ids are strings, never
 * array indexes, so entities can be added and removed without renumbering.
 * In co-op the host allocates ids, so a single counter stays unique.
 */
export function allocateId(counter: { nextId: number }, prefix: string): string {
  const id = `${prefix}${counter.nextId}`;
  counter.nextId += 1;
  return id;
}

/** Safe record lookup for keys that come from commands or saves (ignores inherited keys like "constructor"). */
export function lookup<T>(record: Readonly<Record<string, T>>, key: string): T | undefined {
  return Object.hasOwn(record, key) ? record[key] : undefined;
}
