/**
 * Seeded PRNG (mulberry32). The RNG state is a plain number stored in GameState,
 * so a save plus a command list always replays to the same result.
 */

export interface RngResult<T> {
  value: T;
  state: number;
}

/** Next float in [0, 1) and the advanced state. */
export function nextFloat(state: number): RngResult<number> {
  const next = (state + 0x6d2b79f5) | 0;
  let t = next;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  const value = ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  return { value, state: next };
}

/** Integer in [min, max] inclusive. */
export function nextInt(state: number, min: number, max: number): RngResult<number> {
  const r = nextFloat(state);
  return { value: min + Math.floor(r.value * (max - min + 1)), state: r.state };
}

/** True with the given probability (0..1). */
export function chance(state: number, probability: number): RngResult<boolean> {
  const r = nextFloat(state);
  return { value: r.value < probability, state: r.state };
}

/** Turn any string (e.g. a farm name + creation time) into a 32-bit seed. */
export function seedFromString(text: string): number {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h | 0;
}
