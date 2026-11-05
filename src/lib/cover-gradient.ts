/** Deterministic decorative cover backgrounds for entries without a cover image. */
import { hashString, mulberry32 } from './prng';

/**
 * Builds a CSS background from palette tokens only (navy shades + orange), seeded by the
 * entry's tags so the same tags always give the same cover.
 *
 * @param tags - The entry's tags (order does not matter).
 * @returns A CSS `background` value made of layered gradients.
 */
export function coverGradient(tags: string[]): string {
  const random = mulberry32(hashString([...tags].sort().join('|')));
  const percent = () => Math.round(15 + random() * 70);
  const angle = Math.round(random() * 360);
  return [
    `radial-gradient(circle at ${percent()}% ${percent()}%, var(--accent-soft), transparent 45%)`,
    `radial-gradient(circle at ${percent()}% ${percent()}%, var(--navy-line), transparent 60%)`,
    `linear-gradient(${angle}deg, var(--bg-raised), var(--bg))`,
  ].join(', ');
}
