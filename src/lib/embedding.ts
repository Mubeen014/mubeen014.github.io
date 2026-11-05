/**
 * Build-time latent-space embedding. Pure TypeScript with no Astro imports, so it is unit
 * testable and runs identically on every build.
 *
 * Each tag gets a fixed random 3D direction (seeded by the tag). An entry's position is the
 * normalised sum of its tags' directions scaled to a radius, plus a small per-kind offset
 * and seeded jitter. Shared tags therefore put entries near each other.
 */
import { hashString, mulberry32 } from './prng';

export type EntryKind = 'project' | 'experience' | 'education';
export type Vector3 = readonly [number, number, number];
export type Vector2 = readonly [number, number];

/** The fields the embedding needs from an entry. */
export interface EmbeddingInput {
  kind: EntryKind;
  id: string;
  tags: readonly string[];
  startDate: Date;
}

/** Another entry close to this one. */
export interface Neighbour {
  key: string;
  distance: number;
}

/** Where an entry sits in each view of the latent space. */
export interface EmbeddedPoint {
  key: string;
  /** 3D cloud position, world units. */
  position3: Vector3;
  /** 2D scatter target: 3D with z flattened, scaled so the largest |x| or |y| is 1. */
  position2: Vector2;
  /** 1D timeline target in [-1, 1]: earliest start date is -1, latest is 1. */
  position1: number;
  /** The nearest other entries, closest first. */
  neighbours: Neighbour[];
}

const RADIUS = 2;
const JITTER = 0.15;
const NEIGHBOUR_COUNT = 3;
const KIND_OFFSETS: Record<EntryKind, Vector3> = {
  project: [0.3, 0, 0],
  experience: [-0.2, 0.3, 0],
  education: [-0.2, -0.3, 0.2],
};

/**
 * Unique key for an entry across collections.
 *
 * @param kind - Entry kind.
 * @param id - Entry id within its collection.
 * @returns Key such as "project/project-alpha".
 */
export function entryKey(kind: EntryKind, id: string): string {
  return `${kind}/${id}`;
}

/**
 * Rounds to 3 decimals so serialised positions are short and stable.
 *
 * @param value - Any number.
 * @returns The value rounded to 3 decimals (never -0).
 */
function round3(value: number): number {
  return Math.round(value * 1000) / 1000 + 0;
}

/**
 * Fixed, uniformly random unit direction for a tag.
 *
 * @param tag - Tag string (the seed).
 * @returns A unit vector.
 */
function tagDirection(tag: string): Vector3 {
  const random = mulberry32(hashString(`tag:${tag}`));
  const z = random() * 2 - 1;
  const angle = random() * 2 * Math.PI;
  const ring = Math.sqrt(1 - z * z);
  return [ring * Math.cos(angle), ring * Math.sin(angle), z];
}

/**
 * Small deterministic offset from an entry's key, so entries with identical tags don't overlap.
 *
 * @param key - Entry key (the seed).
 * @returns A vector with each component in [-JITTER, JITTER].
 */
function jitter(key: string): Vector3 {
  const random = mulberry32(hashString(`jitter:${key}`));
  return [
    (random() * 2 - 1) * JITTER,
    (random() * 2 - 1) * JITTER,
    (random() * 2 - 1) * JITTER,
  ];
}

/**
 * Euclidean distance between two 3D points.
 *
 * @param a - First point.
 * @param b - Second point.
 * @returns The distance.
 */
export function distance3(a: Vector3, b: Vector3): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/**
 * 3D position of one entry.
 *
 * @param input - The entry.
 * @returns Its position, rounded to 3 decimals.
 * @throws Error if the entry has no tags or its tag directions cancel out.
 */
function position3For(input: EmbeddingInput): Vector3 {
  const key = entryKey(input.kind, input.id);
  if (input.tags.length === 0) {
    throw new Error(`embedding: ${key} has no tags`);
  }
  let sumX = 0;
  let sumY = 0;
  let sumZ = 0;
  for (const tag of input.tags) {
    const [x, y, z] = tagDirection(tag);
    sumX += x;
    sumY += y;
    sumZ += z;
  }
  const length = Math.hypot(sumX, sumY, sumZ);
  if (length < 1e-6) {
    throw new Error(
      `embedding: tag directions of ${key} cancel out; add or change a tag`,
    );
  }
  const offset = KIND_OFFSETS[input.kind];
  const noise = jitter(key);
  return [
    round3((sumX / length) * RADIUS + offset[0] + noise[0]),
    round3((sumY / length) * RADIUS + offset[1] + noise[1]),
    round3((sumZ / length) * RADIUS + offset[2] + noise[2]),
  ];
}

/**
 * The nearest other points to one point, closest first (ties broken by key).
 *
 * @param key - The point's key.
 * @param positions - Every point's 3D position, by key.
 * @returns Up to NEIGHBOUR_COUNT neighbours with rounded distances.
 */
function nearestNeighbours(
  key: string,
  positions: Map<string, Vector3>,
): Neighbour[] {
  const origin = positions.get(key);
  if (!origin) {
    throw new Error(`embedding: unknown key ${key}`);
  }
  return [...positions]
    .filter(([otherKey]) => otherKey !== key)
    .map(([otherKey, position]) => ({
      key: otherKey,
      distance: distance3(origin, position),
    }))
    .sort((a, b) => a.distance - b.distance || a.key.localeCompare(b.key))
    .slice(0, NEIGHBOUR_COUNT)
    .map(({ key: otherKey, distance }) => ({
      key: otherKey,
      distance: round3(distance),
    }));
}

/**
 * Computes every entry's position in the 3D cloud, the 2D scatter and the 1D timeline, plus
 * its nearest neighbours. Output depends only on the entries' kinds, ids, tags and dates.
 *
 * @param inputs - All entries, in any order.
 * @returns Points keyed by entry key, in key order.
 * @throws Error on duplicate keys, entries without tags, or cancelling tag directions.
 */
export function computeEmbedding(
  inputs: readonly EmbeddingInput[],
): Map<string, EmbeddedPoint> {
  const sorted = [...inputs].sort((a, b) =>
    entryKey(a.kind, a.id).localeCompare(entryKey(b.kind, b.id)),
  );
  const positions = new Map<string, Vector3>();
  for (const input of sorted) {
    const key = entryKey(input.kind, input.id);
    if (positions.has(key)) {
      throw new Error(`embedding: duplicate entry ${key}`);
    }
    positions.set(key, position3For(input));
  }

  const scale2 =
    1 /
    Math.max(
      ...[...positions.values()].flatMap(([x, y]) => [
        Math.abs(x),
        Math.abs(y),
      ]),
    );
  const times = sorted.map((input) => input.startDate.getTime());
  const earliest = Math.min(...times);
  const span = Math.max(...times) - earliest;

  const points = new Map<string, EmbeddedPoint>();
  for (const input of sorted) {
    const key = entryKey(input.kind, input.id);
    const position3 = positions.get(key);
    if (!position3) {
      throw new Error(`embedding: missing position for ${key}`);
    }
    points.set(key, {
      key,
      position3,
      position2: [round3(position3[0] * scale2), round3(position3[1] * scale2)],
      // A single date (span 0) maps everything to the middle of the line.
      position1:
        span === 0
          ? 0
          : round3(((input.startDate.getTime() - earliest) / span) * 2 - 1),
      neighbours: nearestNeighbours(key, positions),
    });
  }
  return points;
}

/**
 * Mono readout for a 3D position, e.g. "z = [0.42, -1.17, 0.88]".
 *
 * @param position - A 3D position.
 * @returns The formatted coordinate string with 2 decimals.
 */
export function formatCoordinates(position: Vector3): string {
  const format = (value: number) =>
    (Math.round(value * 100) / 100 + 0).toFixed(2);
  return `z = [${position.map(format).join(', ')}]`;
}
