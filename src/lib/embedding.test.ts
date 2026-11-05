import { describe, expect, it } from 'vitest';
import { hashString, mulberry32 } from './prng';
import {
  computeEmbedding,
  distance3,
  entryKey,
  formatCoordinates,
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

/** Plain-object form of the embedding for deep comparison. */
function serialise(inputs: EmbeddingInput[]) {
  return JSON.stringify([...computeEmbedding(inputs)]);
}

describe('computeEmbedding determinism', () => {
  const inputs = randomInputs(20, 'determinism');

  it('gives identical output on repeated runs', () => {
    expect(serialise(inputs)).toBe(serialise(inputs));
  });

  it('does not depend on input order', () => {
    expect(serialise([...inputs].reverse())).toBe(serialise(inputs));
  });

  it('keeps an entry fixed when unrelated entries are added', () => {
    const before = computeEmbedding(inputs).get('project/entry-0');
    const after = computeEmbedding([
      ...inputs,
      {
        kind: 'project',
        id: 'new',
        tags: ['mobile'],
        startDate: new Date(Date.UTC(2020, 0, 1)),
      },
    ]).get('project/entry-0');
    expect(after?.position3).toEqual(before?.position3);
  });
});

describe('nearest neighbours', () => {
  it('match a brute-force search, closest first, ties broken by key', () => {
    const points = computeEmbedding(randomInputs(25, 'neighbours'));
    for (const point of points.values()) {
      const expected = [...points.values()]
        .filter((other) => other.key !== point.key)
        .map((other) => ({
          key: other.key,
          distance: distance3(point.position3, other.position3),
        }))
        .sort((a, b) => a.distance - b.distance || a.key.localeCompare(b.key))
        .slice(0, 3);
      expect(point.neighbours.map((n) => n.key)).toEqual(
        expected.map((n) => n.key),
      );
      point.neighbours.forEach((neighbour, index) => {
        expect(neighbour.distance).toBeCloseTo(
          expected[index]?.distance ?? Number.NaN,
          2,
        );
      });
    }
  });

  it('never include the entry itself and return min(3, n - 1) neighbours', () => {
    const points = computeEmbedding(randomInputs(3, 'small'));
    for (const point of points.values()) {
      expect(point.neighbours).toHaveLength(2);
      expect(point.neighbours.map((n) => n.key)).not.toContain(point.key);
    }
  });

  it('put entries with shared tags closer than entries without', () => {
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
        tags: ['llm', 'nlp', 'python'],
        startDate: date,
      },
      { kind: 'project', id: 'c', tags: ['cfd', 'mobile'], startDate: date },
      {
        kind: 'project',
        id: 'd',
        tags: ['privacy', 'research'],
        startDate: date,
      },
    ]);
    expect(points.get('project/a')?.neighbours[0]?.key).toBe('project/b');
    expect(points.get('project/b')?.neighbours[0]?.key).toBe('project/a');
  });
});

describe('morph targets', () => {
  const inputs = randomInputs(12, 'targets');
  const points = [...computeEmbedding(inputs).values()];

  it('2D target flattens z and scales so the largest |x| or |y| is 1', () => {
    const extent = Math.max(
      ...points.flatMap((p) => [
        Math.abs(p.position2[0]),
        Math.abs(p.position2[1]),
      ]),
    );
    expect(extent).toBeCloseTo(1, 2);
    const scale =
      (points[0]?.position2[0] ?? 0) / (points[0]?.position3[0] ?? 1);
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
