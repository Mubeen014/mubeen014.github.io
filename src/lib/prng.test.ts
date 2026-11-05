import { describe, expect, it } from 'vitest';
import { hashString, mulberry32 } from './prng';

describe('hashString', () => {
  it('matches known FNV-1a values', () => {
    expect(hashString('')).toBe(0x811c9dc5);
    expect(hashString('a')).toBe(0xe40c292c);
    expect(hashString('foobar')).toBe(0xbf9cf968);
  });

  it('is deterministic and an unsigned 32-bit integer', () => {
    for (const text of ['llm', 'project/project-alpha', 'tag:cfd']) {
      const hash = hashString(text);
      expect(hashString(text)).toBe(hash);
      expect(Number.isInteger(hash)).toBe(true);
      expect(hash).toBeGreaterThanOrEqual(0);
      expect(hash).toBeLessThan(2 ** 32);
    }
  });
});

describe('mulberry32', () => {
  it('produces the same sequence for the same seed', () => {
    const first = mulberry32(42);
    const second = mulberry32(42);
    const a = Array.from({ length: 100 }, () => first());
    const b = Array.from({ length: 100 }, () => second());
    expect(a).toEqual(b);
  });

  it('produces different sequences for different seeds', () => {
    const a = Array.from({ length: 10 }, mulberry32(1));
    const b = Array.from({ length: 10 }, mulberry32(2));
    expect(a).not.toEqual(b);
  });

  it('stays in [0, 1) with a roughly uniform mean', () => {
    const random = mulberry32(7);
    const values = Array.from({ length: 10_000 }, () => random());
    expect(Math.min(...values)).toBeGreaterThanOrEqual(0);
    expect(Math.max(...values)).toBeLessThan(1);
    const mean = values.reduce((sum, value) => sum + value, 0) / values.length;
    expect(mean).toBeGreaterThan(0.48);
    expect(mean).toBeLessThan(0.52);
  });
});
