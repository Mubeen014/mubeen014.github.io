/**
 * The data contract between the build (home page frontmatter) and the client-side latent
 * space. Serialised into an inline <script type="application/json"> in the hero, parsed once
 * on the client. Kept free of Astro imports so the client bundle can use it.
 */
import type { Entry } from './entries';
import type { EntryKind, Vector2, Vector3 } from './embedding';

/** One entry as the scene needs it. */
export interface LatentSpacePoint {
  key: string;
  kind: EntryKind;
  title: string;
  href: string;
  year: number;
  coords: string;
  position3: Vector3;
  position2: Vector2;
  position1: number;
  /** Keys of neighbouring entries (Jaccard), most similar first. */
  neighbours: string[];
}

export interface LatentSpaceData {
  points: LatentSpacePoint[];
}

/** Id of the inline JSON element in the hero. */
export const LATENT_SPACE_DATA_ID = 'latent-space-data';

const KINDS: readonly EntryKind[] = ['project', 'experience', 'education'];

/**
 * Builds the scene data from entries (build time).
 *
 * @param entries - All entries with their embedding.
 * @returns Serialisable scene data.
 */
export function toLatentSpaceData(entries: Entry[]): LatentSpaceData {
  return {
    points: entries.map((entry) => ({
      key: entry.key,
      kind: entry.kind,
      title: entry.title,
      href: entry.href,
      year: entry.startDate.getUTCFullYear(),
      coords: entry.coords,
      position3: entry.position3,
      position2: entry.position2,
      position1: entry.position1,
      neighbours: entry.neighbours.map((neighbour) => neighbour.key),
    })),
  };
}

/**
 * Serialises scene data for an inline JSON script. "<" is escaped so content can never
 * close the script element.
 *
 * @param data - Scene data.
 * @returns JSON text safe to inline in HTML.
 */
export function serialiseLatentSpaceData(data: LatentSpaceData): string {
  return JSON.stringify(data).replace(/</g, '\\u003c');
}

/**
 * Checks that a value is an array of `length` finite numbers.
 *
 * @param value - Value to check.
 * @param length - Expected length.
 * @returns True when it matches.
 */
function isNumberTuple(value: unknown, length: number): boolean {
  return (
    Array.isArray(value) &&
    value.length === length &&
    value.every((item) => typeof item === 'number' && Number.isFinite(item))
  );
}

/**
 * Parses and checks the inline scene data (client side).
 *
 * @param json - Text content of the inline JSON element.
 * @returns The scene data.
 * @throws Error if the JSON is malformed or a point is missing required fields.
 */
export function parseLatentSpaceData(json: string): LatentSpaceData {
  const data: unknown = JSON.parse(json);
  const points = (data as { points?: unknown }).points;
  if (!Array.isArray(points) || points.length === 0) {
    throw new Error('Latent space data: "points" must be a non-empty array');
  }
  for (const point of points as Partial<LatentSpacePoint>[]) {
    if (
      typeof point.key !== 'string' ||
      typeof point.title !== 'string' ||
      typeof point.href !== 'string' ||
      !KINDS.includes(point.kind as EntryKind) ||
      !isNumberTuple(point.position3, 3) ||
      !isNumberTuple(point.position2, 2) ||
      typeof point.position1 !== 'number' ||
      !Array.isArray(point.neighbours)
    ) {
      throw new Error(
        `Latent space data: invalid point ${JSON.stringify(point).slice(0, 120)}`,
      );
    }
  }
  return data as LatentSpaceData;
}
