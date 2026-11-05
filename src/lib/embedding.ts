/**
 * Build-time latent-space embedding. Pure TypeScript with no Astro imports, so it is unit
 * testable and runs identically on every build.
 *
 * Method: classical multidimensional scaling (MDS) on Jaccard tag distance. Entries that
 * share more tags end up closer together. Nearest neighbours come straight from Jaccard tag
 * similarity (not from 3D distance), so they always reflect shared tags.
 *
 * Determinism: same content → same positions. Adding or editing entries may move every
 * point, because MDS positions depend on all pairwise distances.
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

/** A related entry and how many tags it shares (Jaccard similarity in (0, 1]). */
export interface Neighbour {
  key: string;
  similarity: number;
}

/** Where an entry sits in each view of the latent space. */
export interface EmbeddedPoint {
  key: string;
  /** 3D cloud position, world units (the farthest point is RADIUS from the centre). */
  position3: Vector3;
  /** 2D scatter target: the first two MDS coordinates, scaled so the largest |x| or |y| is 1. */
  position2: Vector2;
  /** 1D timeline target in [-1, 1]: earliest start date is -1, latest is 1. */
  position1: number;
  /** Up to NEIGHBOUR_COUNT entries sharing tags, most similar first. May be empty. */
  neighbours: Neighbour[];
}

/** Eigenvalues (descending) and matching unit eigenvectors of a symmetric matrix. */
export interface EigenDecomposition {
  values: number[];
  vectors: number[][];
}

const RADIUS = 2;
const DIMENSIONS = 3;
const NEIGHBOUR_COUNT = 3;
/** Only separates entries with identical tag sets, which MDS would otherwise stack. */
const DUPLICATE_JITTER = 0.05;
const POSITIVE_EIGENVALUE = 1e-9;
const JACOBI_MAX_SWEEPS = 100;

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
 * Jaccard similarity of two tag sets: |A ∩ B| / |A ∪ B|.
 *
 * @param a - First tag set.
 * @param b - Second tag set.
 * @returns Similarity in [0, 1].
 */
export function jaccardSimilarity(
  a: ReadonlySet<string>,
  b: ReadonlySet<string>,
): number {
  let shared = 0;
  for (const tag of a) {
    if (b.has(tag)) shared++;
  }
  return shared / (a.size + b.size - shared);
}

/**
 * Eigen-decomposition of a small symmetric matrix by the cyclic Jacobi method. Fully
 * deterministic: fixed sweep order, eigenvalues sorted descending (ties by original index),
 * and each eigenvector's sign fixed so its largest-magnitude component (first on ties) is
 * positive.
 *
 * @param matrix - Symmetric n×n matrix (not modified).
 * @returns Eigenvalues descending and their unit eigenvectors.
 * @throws Error if the matrix is not square or does not converge.
 */
export function symmetricEigen(
  matrix: readonly (readonly number[])[],
): EigenDecomposition {
  const size = matrix.length;
  const a = matrix.map((row) => {
    if (row.length !== size)
      throw new Error('symmetricEigen: matrix must be square');
    return [...row];
  });
  const v = Array.from({ length: size }, (_, i) =>
    Array.from({ length: size }, (_, j) => (i === j ? 1 : 0)),
  );
  const at = (m: number[][], i: number, j: number) => m[i]?.[j] ?? Number.NaN;
  const set = (m: number[][], i: number, j: number, value: number) => {
    const row = m[i];
    if (row) row[j] = value;
  };

  let converged = false;
  for (let sweep = 0; sweep < JACOBI_MAX_SWEEPS && !converged; sweep++) {
    let offDiagonal = 0;
    for (let p = 0; p < size; p++) {
      for (let q = p + 1; q < size; q++) offDiagonal += at(a, p, q) ** 2;
    }
    if (offDiagonal < 1e-22) {
      converged = true;
      break;
    }
    for (let p = 0; p < size; p++) {
      for (let q = p + 1; q < size; q++) {
        const apq = at(a, p, q);
        if (Math.abs(apq) < 1e-300) continue;
        const theta = (at(a, q, q) - at(a, p, p)) / (2 * apq);
        const t =
          (theta >= 0 ? 1 : -1) /
          (Math.abs(theta) + Math.sqrt(theta * theta + 1));
        const c = 1 / Math.sqrt(t * t + 1);
        const s = t * c;
        for (let k = 0; k < size; k++) {
          const akp = at(a, k, p);
          const akq = at(a, k, q);
          set(a, k, p, c * akp - s * akq);
          set(a, k, q, s * akp + c * akq);
        }
        for (let k = 0; k < size; k++) {
          const apk = at(a, p, k);
          const aqk = at(a, q, k);
          set(a, p, k, c * apk - s * aqk);
          set(a, q, k, s * apk + c * aqk);
        }
        for (let k = 0; k < size; k++) {
          const vkp = at(v, k, p);
          const vkq = at(v, k, q);
          set(v, k, p, c * vkp - s * vkq);
          set(v, k, q, s * vkp + c * vkq);
        }
      }
    }
  }
  if (!converged) {
    throw new Error('symmetricEigen: Jacobi iteration did not converge');
  }

  const order = Array.from({ length: size }, (_, i) => i).sort(
    (i, j) => at(a, j, j) - at(a, i, i) || i - j,
  );
  return {
    values: order.map((i) => at(a, i, i)),
    vectors: order.map((column) => {
      const vector = v.map((row) => row[column] ?? Number.NaN);
      let pivot = 0;
      vector.forEach((value, index) => {
        if (Math.abs(value) > Math.abs(vector[pivot] ?? 0) + 1e-12)
          pivot = index;
      });
      const sign = (vector[pivot] ?? 0) < 0 ? -1 : 1;
      return vector.map((value) => value * sign + 0);
    }),
  };
}

/**
 * Classical MDS: coordinates whose Euclidean distances best match the given distances.
 * Uses only positive eigenvalues; missing dimensions are 0.
 *
 * @param distances - Symmetric n×n distance matrix with a zero diagonal.
 * @param dimensions - Number of output dimensions.
 * @returns One coordinate array of length `dimensions` per row.
 */
export function classicalMds(
  distances: readonly (readonly number[])[],
  dimensions: number,
): number[][] {
  const size = distances.length;
  const squared = distances.map((row) => row.map((d) => d * d));
  const rowMeans = squared.map(
    (row) => row.reduce((sum, value) => sum + value, 0) / size,
  );
  const grandMean = rowMeans.reduce((sum, value) => sum + value, 0) / size;
  // Double centring: B = -1/2 · J · D² · J.
  const centred = squared.map((row, i) =>
    row.map(
      (value, j) =>
        -0.5 * (value - (rowMeans[i] ?? 0) - (rowMeans[j] ?? 0) + grandMean),
    ),
  );
  const { values, vectors } = symmetricEigen(centred);
  return Array.from({ length: size }, (_, row) =>
    Array.from({ length: dimensions }, (_, dimension) => {
      const value = values[dimension] ?? 0;
      return value > POSITIVE_EIGENVALUE
        ? (vectors[dimension]?.[row] ?? 0) * Math.sqrt(value)
        : 0;
    }),
  );
}

/**
 * Small seeded offset from an entry's key.
 *
 * @param key - Entry key (the seed).
 * @returns A vector with each component in [-DUPLICATE_JITTER, DUPLICATE_JITTER].
 */
function duplicateJitter(key: string): Vector3 {
  const random = mulberry32(hashString(`jitter:${key}`));
  return [
    (random() * 2 - 1) * DUPLICATE_JITTER,
    (random() * 2 - 1) * DUPLICATE_JITTER,
    (random() * 2 - 1) * DUPLICATE_JITTER,
  ];
}

/**
 * Computes every entry's position in the 3D cloud, the 2D scatter and the 1D timeline, plus
 * its tag neighbours. Output depends only on the entries' kinds, ids, tags and dates.
 *
 * @param inputs - All entries, in any order.
 * @returns Points keyed by entry key, in key order.
 * @throws Error on duplicate keys or entries without tags.
 */
export function computeEmbedding(
  inputs: readonly EmbeddingInput[],
): Map<string, EmbeddedPoint> {
  const sorted = [...inputs].sort((a, b) =>
    entryKey(a.kind, a.id).localeCompare(entryKey(b.kind, b.id)),
  );
  const keys = sorted.map((input) => entryKey(input.kind, input.id));
  if (new Set(keys).size !== keys.length) {
    const duplicate = keys.find((key, index) => keys.indexOf(key) !== index);
    throw new Error(`embedding: duplicate entry ${duplicate}`);
  }
  const tagSets = sorted.map((input, index) => {
    if (input.tags.length === 0)
      throw new Error(`embedding: ${keys[index]} has no tags`);
    return new Set(input.tags);
  });

  const similarity = tagSets.map((a) =>
    tagSets.map((b) => jaccardSimilarity(a, b)),
  );
  const raw = classicalMds(
    similarity.map((row) => row.map((value) => 1 - value)),
    DIMENSIONS,
  );

  // Scale so the farthest point sits at RADIUS, then separate identical tag sets.
  const farthest = Math.max(...raw.map((coords) => Math.hypot(...coords)));
  const scale = farthest > 0 ? RADIUS / farthest : 0;
  const signatures = sorted.map((input) =>
    [...new Set(input.tags)].sort().join('|'),
  );
  const position3s: Vector3[] = raw.map((coords, index) => {
    const isDuplicate =
      signatures.filter((s) => s === signatures[index]).length > 1;
    const jitter = isDuplicate
      ? duplicateJitter(keys[index] ?? '')
      : ([0, 0, 0] as const);
    return [
      round3((coords[0] ?? 0) * scale + jitter[0]),
      round3((coords[1] ?? 0) * scale + jitter[1]),
      round3((coords[2] ?? 0) * scale + jitter[2]),
    ];
  });

  const extent2 = Math.max(
    ...position3s.flatMap(([x, y]) => [Math.abs(x), Math.abs(y)]),
  );
  const times = sorted.map((input) => input.startDate.getTime());
  const earliest = Math.min(...times);
  const span = Math.max(...times) - earliest;

  const points = new Map<string, EmbeddedPoint>();
  sorted.forEach((input, index) => {
    const key = keys[index] ?? '';
    const position3 = position3s[index] ?? [0, 0, 0];
    const neighbours = sorted
      .map((other, otherIndex) => ({
        other,
        key: keys[otherIndex] ?? '',
        similarity: similarity[index]?.[otherIndex] ?? 0,
      }))
      .filter((candidate) => candidate.key !== key && candidate.similarity > 0)
      .sort(
        (a, b) =>
          b.similarity - a.similarity ||
          b.other.startDate.getTime() - a.other.startDate.getTime() ||
          a.other.id.localeCompare(b.other.id) ||
          a.key.localeCompare(b.key),
      )
      .slice(0, NEIGHBOUR_COUNT)
      .map((candidate) => ({
        key: candidate.key,
        similarity: round3(candidate.similarity),
      }));
    points.set(key, {
      key,
      position3,
      position2:
        extent2 > 0
          ? [round3(position3[0] / extent2), round3(position3[1] / extent2)]
          : [0, 0],
      // A single date (span 0) maps everything to the middle of the line.
      position1:
        span === 0
          ? 0
          : round3(((input.startDate.getTime() - earliest) / span) * 2 - 1),
      neighbours,
    });
  });
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
