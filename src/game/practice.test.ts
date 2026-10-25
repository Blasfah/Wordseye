import { describe, expect, it } from 'vitest';
import { pickPracticePuzzle } from './practice';

/** Deterministic stand-in for Math.random. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1103515245 + 12345) % 2147483648;
    return state / 2147483648;
  };
}

describe('pickPracticePuzzle', () => {
  it('plays every puzzle once before repeating any, skipping avoided ones', () => {
    const random = seeded(7);
    let played: number[] = [];
    const picks: number[] = [];
    for (let i = 0; i < 9; i++) {
      const next = pickPracticePuzzle(10, played, [4], random);
      picks.push(next.index);
      played = next.played;
    }
    expect(new Set(picks).size).toBe(9);
    expect(picks).not.toContain(4);
  });

  it('is random, not sequential', () => {
    const picks = Array.from(
      { length: 6 },
      (_, i) => pickPracticePuzzle(86, [], [], seeded(i + 1)).index,
    );
    expect(new Set(picks).size).toBeGreaterThan(1);
  });

  it('starts a new cycle when everything has been played, without repeating the last one', () => {
    const { index, played } = pickPracticePuzzle(3, [1, 2, 3], [3], () => 0);
    expect(index).not.toBe(3);
    expect(played).toEqual([index]);
  });

  it('never picks the puzzle just shown, across many cycles', () => {
    const random = seeded(42);
    let played: number[] = [];
    let last = 0;
    for (let i = 0; i < 50; i++) {
      const next = pickPracticePuzzle(4, played, [last], random);
      expect(next.index).not.toBe(last);
      last = next.index;
      played = next.played;
    }
  });

  it('ignores remembered puzzles that no longer exist', () => {
    expect(pickPracticePuzzle(2, [1, 7, 9], [], () => 0)).toEqual({ index: 2, played: [1, 2] });
  });

  it('still returns something when there is only one puzzle', () => {
    expect(pickPracticePuzzle(1, [1], [1], () => 0.5).index).toBe(1);
  });
});
