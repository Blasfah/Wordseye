/** Grouping rounds into games of five, keeping similar targets apart. */
import { sameFamily } from '../../src/game/stem';
import { similarity, type Vocabulary } from './vocab';

/** Two targets at least this similar (cosine) never share a game. */
export const MAX_SAME_GAME_SIMILARITY = 0.4;

export interface RoundInfo {
  target: string;
  hint: { word: string };
}

/** Small seeded PRNG (mulberry32) so a seed always yields the same order. */
export function seededRandom(seed: string): () => number {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  let state = h >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function canShareGame(vocab: Vocabulary, a: RoundInfo, b: RoundInfo): boolean {
  const ia = vocab.index.get(a.target)!;
  const ib = vocab.index.get(b.target)!;
  return (
    similarity(vocab, ia, ib) < MAX_SAME_GAME_SIMILARITY &&
    !sameFamily(a.target, b.target) &&
    !sameFamily(a.hint.word, b.target) &&
    !sameFamily(b.hint.word, a.target) &&
    !sameFamily(a.hint.word, b.hint.word)
  );
}

/**
 * Shuffles rounds and packs them greedily into games of `size`. Leftovers
 * that can't make a full game are returned separately.
 */
export function packGames<T extends RoundInfo>(
  vocab: Vocabulary,
  rounds: readonly T[],
  size: number,
  random: () => number,
): { games: T[][]; leftover: T[] } {
  const pool = shuffle(rounds, random);
  const games: T[][] = [];
  while (pool.length >= size) {
    const game: T[] = [];
    for (let i = 0; i < pool.length && game.length < size;) {
      if (game.every((other) => canShareGame(vocab, pool[i], other)))
        game.push(...pool.splice(i, 1));
      else i++;
    }
    // Leftovers that clash with each other: fill up regardless rather than drop them.
    while (game.length < size) game.push(pool.shift()!);
    games.push(game);
  }
  return { games, leftover: pool };
}
