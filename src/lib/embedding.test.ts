import { describe, expect, it } from 'vitest';
import { hashString, mulberry32 } from './prng';
import {
  classicalMds,
  computeEmbedding,
  entryKey,
  formatCoordinates,
  jaccardSimilarity,
  symmetricEigen,
  type EmbeddingInput,
  type EntryKind,
} from './embedding';

const kinds: EntryKind[] = ['project', 'experience', 'education'];
const tagPool = [
  'llm',
  'nlp',
  'cfd',
  'pytorch',
  'python',
  'mobile',
  'privacy',
  'research',
];

/** Seeded random fixture of `count` entries with 1–4 tags each. */
function randomInputs(count: number, seed: string): EmbeddingInput[] {
  const random = mulberry32(hashString(seed));
  return Array.from({ length: count }, (_, index) => {
    const tagCount = 1 + Math.floor(random() * 4);
    const tags = [
      ...new Set(
        Array.from(
          { length: tagCount },
          () => tagPool[Math.floor(random() * tagPool.length)] ?? 'llm',
        ),
      ),
    ];
    return {
      kind: kinds[index % kinds.length] ?? 'project',
      id: `entry-${index}`,
      tags,
      startDate: new Date(
        Date.UTC(
          2015 + Math.floor(random() * 10),
          Math.floor(random() * 12),
          1,
        ),
      ),
    };
  });
}

const serialise = (inputs: EmbeddingInput[]) =>
  JSON.stringify([...computeEmbedding(inputs)]);
const distance = (a: readonly number[], b: readonly number[]) =>
  Math.hypot(...a.map((value, i) => value - (b[i] ?? 0)));

describe('symmetricEigen', () => {
  const matrix = [
    [4, 1, 2],
    [1, 3, 0],
    [2, 0, 5],
  ];
  const { values, vectors } = symmetricEigen(matrix);

  it('satisfies A·v = λ·v with unit vectors, eigenvalues descending', () => {
    vectors.forEach((vector, index) => {
      const lambda = values[index] ?? Number.NaN;
      const product = matrix.map((row) =>
        row.reduce((sum, a, j) => sum + a * (vector[j] ?? 0), 0),
      );
      product.forEach((value, i) =>
        expect(value).toBeCloseTo(lambda * (vector[i] ?? 0), 9),
      );
      expect(Math.hypot(...vector)).toBeCloseTo(1, 12);
    });
    expect([...values].sort((a, b) => b - a)).toEqual(values);
  });

  it('fixes the sign so the largest-magnitude component is positive', () => {
    for (const vector of vectors) {
      const largest = vector.reduce((best, value) =>
        Math.abs(value) > Math.abs(best) ? value : best,
      );
      expect(largest).toBeGreaterThan(0);
    }
  });

  it('is deterministic', () => {
    expect(JSON.stringify(symmetricEigen(matrix))).toBe(
      JSON.stringify({ values, vectors }),
    );
  });
});

describe('classicalMds', () => {
  it('recovers the pairwise distances of points that truly live in 3D', () => {
    const points = [
      [0, 0, 0],
      [1, 0, 0],
      [0, 2, 0],
      [0, 0, 3],
      [1, 1, 1],
    ];
    const distances = points.map((a) => points.map((b) => distance(a, b)));
    const recovered = classicalMds(distances, 3);
    points.forEach((_, i) =>
      points.forEach((_, j) =>
        expect(distance(recovered[i] ?? [], recovered[j] ?? [])).toBeCloseTo(
          distances[i]?.[j] ?? 0,
          9,
        ),
      ),
    );
  });

  it('uses only positive eigenvalues (extra dimensions are zero)', () => {
    const distances = [
      [0, 1],
      [1, 0],
    ];
    const coords = classicalMds(distances, 3);
    expect(coords.map((c) => [c[1], c[2]])).toEqual([
      [0, 0],
      [0, 0],
    ]);
    expect(distance(coords[0] ?? [], coords[1] ?? [])).toBeCloseTo(1, 12);
  });
});

describe('computeEmbedding determinism', () => {
  const inputs = randomInputs(20, 'determinism');

  it('gives byte-identical output on repeated runs', () => {
    expect(serialise(inputs)).toBe(serialise(inputs));
  });

  it('does not depend on input order', () => {
    expect(serialise([...inputs].reverse())).toBe(serialise(inputs));
  });
});

describe('positions', () => {
  it('put entries sharing more tags closer together', () => {
    const date = new Date(Date.UTC(2020, 0, 1));
    const points = computeEmbedding([
      {
        kind: 'project',
        id: 'a',
        tags: ['llm', 'nlp', 'python'],
        startDate: date,
      },
      {
        kind: 'project',
        id: 'b',
        tags: ['llm', 'nlp', 'pytorch'],
        startDate: date,
      },
      { kind: 'project', id: 'c', tags: ['cfd', 'mobile'], startDate: date },
      {
        kind: 'project',
        id: 'd',
        tags: ['privacy', 'research', 'cfd'],
        startDate: date,
      },
    ]);
    const at = (id: string) =>
      points.get(`project/${id}`)?.position3 ?? [0, 0, 0];
    expect(distance(at('a'), at('b'))).toBeLessThan(distance(at('a'), at('c')));
    expect(distance(at('c'), at('d'))).toBeLessThan(distance(at('a'), at('d')));
  });

  it('separate entries with identical tag sets by a small jitter only', () => {
    const date = new Date(Date.UTC(2020, 0, 1));
    const points = computeEmbedding([
      { kind: 'project', id: 'a', tags: ['llm', 'nlp'], startDate: date },
      { kind: 'experience', id: 'b', tags: ['nlp', 'llm'], startDate: date },
      { kind: 'project', id: 'c', tags: ['cfd'], startDate: date },
    ]);
    const a = points.get('project/a')?.position3 ?? [0, 0, 0];
    const b = points.get('experience/b')?.position3 ?? [0, 0, 0];
    expect(distance(a, b)).toBeGreaterThan(0);
    expect(distance(a, b)).toBeLessThan(0.2);
  });

  it('scale so the farthest point is at radius 2', () => {
    const points = [...computeEmbedding(randomInputs(12, 'radius')).values()];
    expect(
      Math.max(...points.map((p) => Math.hypot(...p.position3))),
    ).toBeCloseTo(2, 2);
  });
});

describe('neighbours (Jaccard tag similarity)', () => {
  it('match a brute-force ranking: similarity desc, newer start, then slug; only similarity > 0', () => {
    const inputs = randomInputs(25, 'neighbours');
    const points = computeEmbedding(inputs);
    for (const input of inputs) {
      const key = entryKey(input.kind, input.id);
      const expected = inputs
        .filter((other) => other !== input)
        .map((other) => ({
          other,
          similarity: jaccardSimilarity(
            new Set(input.tags),
            new Set(other.tags),
          ),
        }))
        .filter((candidate) => candidate.similarity > 0)
        .sort(
          (a, b) =>
            b.similarity - a.similarity ||
            b.other.startDate.getTime() - a.other.startDate.getTime() ||
            a.other.id.localeCompare(b.other.id),
        )
        .slice(0, 3);
      expect(points.get(key)?.neighbours.map((n) => n.key)).toEqual(
        expected.map(({ other }) => entryKey(other.kind, other.id)),
      );
    }
  });

  it('breaks similarity ties by newer start date, then slug', () => {
    const points = computeEmbedding([
      {
        kind: 'project',
        id: 'origin',
        tags: ['llm'],
        startDate: new Date(Date.UTC(2020, 0, 1)),
      },
      {
        kind: 'project',
        id: 'old',
        tags: ['llm'],
        startDate: new Date(Date.UTC(2018, 0, 1)),
      },
      {
        kind: 'project',
        id: 'new-b',
        tags: ['llm'],
        startDate: new Date(Date.UTC(2022, 0, 1)),
      },
      {
        kind: 'project',
        id: 'new-a',
        tags: ['llm'],
        startDate: new Date(Date.UTC(2022, 0, 1)),
      },
    ]);
    expect(points.get('project/origin')?.neighbours.map((n) => n.key)).toEqual([
      'project/new-a',
      'project/new-b',
      'project/old',
    ]);
  });

  it('is empty when no other entry shares a tag', () => {
    const date = new Date(Date.UTC(2020, 0, 1));
    const points = computeEmbedding([
      { kind: 'project', id: 'lonely', tags: ['mobile'], startDate: date },
      { kind: 'project', id: 'x', tags: ['llm'], startDate: date },
      { kind: 'project', id: 'y', tags: ['llm', 'nlp'], startDate: date },
    ]);
    expect(points.get('project/lonely')?.neighbours).toEqual([]);
    expect(points.get('project/x')?.neighbours).toEqual([
      { key: 'project/y', similarity: 0.5 },
    ]);
  });
});

describe('morph targets', () => {
  const inputs = randomInputs(12, 'targets');
  const points = [...computeEmbedding(inputs).values()];

  it('2D target is the first two MDS coordinates, uniformly scaled so max |x|,|y| is 1', () => {
    const extent = Math.max(
      ...points.flatMap((p) => [
        Math.abs(p.position2[0]),
        Math.abs(p.position2[1]),
      ]),
    );
    expect(extent).toBeCloseTo(1, 2);
    const reference =
      points.find((p) => Math.abs(p.position3[0]) > 0.5) ?? points[0];
    const scale =
      (reference?.position2[0] ?? 0) / (reference?.position3[0] ?? 1);
    for (const point of points) {
      expect(point.position2[0]).toBeCloseTo(point.position3[0] * scale, 2);
      expect(point.position2[1]).toBeCloseTo(point.position3[1] * scale, 2);
    }
  });

  it('1D target maps earliest start to -1, latest to 1, in date order', () => {
    const byDate = [...inputs].sort(
      (a, b) => a.startDate.getTime() - b.startDate.getTime(),
    );
    const keyed = computeEmbedding(inputs);
    const line = byDate.map(
      (input) =>
        keyed.get(entryKey(input.kind, input.id))?.position1 ?? Number.NaN,
    );
    expect(line[0]).toBe(-1);
    expect(line.at(-1)).toBe(1);
    for (let index = 1; index < line.length; index++) {
      expect(line[index]).toBeGreaterThanOrEqual(line[index - 1] ?? Infinity);
    }
  });
});

describe('errors', () => {
  const date = new Date(Date.UTC(2020, 0, 1));

  it('throws on duplicate keys', () => {
    expect(() =>
      computeEmbedding([
        { kind: 'project', id: 'a', tags: ['llm'], startDate: date },
        { kind: 'project', id: 'a', tags: ['nlp'], startDate: date },
      ]),
    ).toThrow(/duplicate entry project\/a/);
  });

  it('throws on an entry without tags', () => {
    expect(() =>
      computeEmbedding([
        { kind: 'project', id: 'a', tags: [], startDate: date },
      ]),
    ).toThrow(/has no tags/);
  });
});

describe('formatCoordinates', () => {
  it('formats with 2 decimals and no negative zero', () => {
    expect(formatCoordinates([0.4249, -1.17, -0.001])).toBe(
      'z = [0.42, -1.17, 0.00]',
    );
  });
});
