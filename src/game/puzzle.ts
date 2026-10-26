import type { PuzzleRound } from './types';

/**
 * `neighbors` is in rank order and starts with the target itself. Each entry is
 * one word, or several forms of one word separated by spaces ("bee bees"),
 * which share a rank; the first is the one shown. `extras` are the extra hint
 * words, which must be among the neighbors.
 */
export function createPuzzleRound(
  hint: string,
  neighbors: readonly string[],
  extras: readonly string[] = [],
): PuzzleRound {
  if (neighbors.length === 0) throw new Error('A round needs at least its target word');
  const ranks = new Map<string, number>();
  const words: string[] = [];
  neighbors.forEach((entry, i) => {
    const forms = entry.split(' ');
    words.push(forms[0]);
    for (const form of forms) if (!ranks.has(form)) ranks.set(form, i + 1);
  });
  const ranked = extras
    .filter((word) => ranks.has(word))
    .map((word) => ({ word, rank: ranks.get(word)! }));
  return { hint, target: words[0], ranks, words, extras: ranked };
}

export function rankOf(round: PuzzleRound, word: string): number | null {
  return round.ranks.get(word) ?? null;
}

/** The round's ranked words up to `limit`, closest first: one form per rank. */
export function topWords(round: PuzzleRound, limit: number): { word: string; rank: number }[] {
  return (
    round.words
      .slice(0, limit)
      .map((word, i) => ({ word, rank: i + 1 }))
      // A word listed twice keeps its first, closer rank.
      .filter(({ word, rank }) => round.ranks.get(word) === rank)
  );
}
