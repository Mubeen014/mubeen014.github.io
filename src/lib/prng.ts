/**
 * Tiny deterministic pseudo-random helpers. Everything seeded from strings, so the same
 * content always produces the same output on every build.
 */

/**
 * Hashes a string to an unsigned 32-bit integer (FNV-1a).
 *
 * @param text - Any string, e.g. a tag or slug.
 * @returns A 32-bit unsigned integer suitable as a PRNG seed.
 */
export function hashString(text: string): number {
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index++) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Creates a mulberry32 generator.
 *
 * @param seed - 32-bit integer seed.
 * @returns A function returning a new float in [0, 1) on each call.
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
