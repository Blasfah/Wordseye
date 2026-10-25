import type { PuzzleRound } from './types';

/** `neighbors` is in rank order and starts with the target itself. */
export function createPuzzleRound(hint: string, neighbors: readonly string[]): PuzzleRound {
  if (neighbors.length === 0) throw new Error('A round needs at least its target word');
  const ranks = new Map<string, number>();
  neighbors.forEach((word, i) => {
    if (!ranks.has(word)) ranks.set(word, i + 1);
  });
  return { hint, target: neighbors[0], ranks };
}

export function rankOf(round: PuzzleRound, word: string): number | null {
  return round.ranks.get(word) ?? null;
}

/** The round's ranked words up to `limit`, closest first. */
export function topWords(round: PuzzleRound, limit: number): { word: string; rank: number }[] {
  const words: { word: string; rank: number }[] = [];
  // The map was filled in rank order, so iteration order is rank order.
  for (const [word, rank] of round.ranks) {
    if (rank > limit) break;
    words.push({ word, rank });
  }
  return words;
}
