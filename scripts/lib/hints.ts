/** Choosing a hint for each target: close, common, and pointing back at the target. */
import { familyKey, sameFamily } from '../../src/game/stem';
import { countCloser } from './parallel';
import { EVERYDAY, similarity, type Vocabulary } from './vocab';

export const HINT_SETTINGS = {
  /** Hints are picked from this window of the target's neighbor ranks. */
  ranks: [20, 80] as const,
  /** A hint should be among the N most frequent vocabulary words when possible. */
  commonness: 12_000,
  /** A new target whose best hint points back more weakly than this isn't used. */
  maxBackRank: 80,
};

export interface Hint {
  word: string;
  /** Where the hint sits in the target's neighbor list. */
  rank: number;
  /** Where the target sits in the hint's own neighbor list. */
  backRank: number;
}

interface Candidate {
  word: number;
  rank: number;
  backRank: number;
}

/** Allowed hints from the rank window, limited to common words when there are any. */
function candidatesFor(
  vocab: Vocabulary,
  neighbors: readonly string[],
  avoid: Set<string>,
): Candidate[] {
  const [lo, hi] = HINT_SETTINGS.ranks;
  const target = neighbors[0];
  // A hint whose own family already appears above it would hand out a bullseye.
  const closerFamilies = new Set(neighbors.slice(0, lo - 1).map(familyKey));
  const all: Candidate[] = [];
  for (let rank = lo; rank <= Math.min(hi, neighbors.length); rank++) {
    const word = neighbors[rank - 1];
    if (avoid.has(word) || sameFamily(word, target) || closerFamilies.has(familyKey(word)))
      continue;
    all.push({ word: vocab.index.get(word)!, rank, backRank: Infinity });
  }
  // Prefer words that are both frequent and everyday English (which screens out names).
  const frequent = all.filter((c) => c.word < HINT_SETTINGS.commonness);
  const everyday = frequent.filter((c) => vocab.commonness.get(vocab.words[c.word])! <= EVERYDAY);
  return everyday.length ? everyday : frequent.length ? frequent : all;
}

/** "holders" reads worse as a hint than "holder" would. */
function isPlural(vocab: Vocabulary, word: string): boolean {
  if (!word.endsWith('s') || word.endsWith('ss')) return false;
  return (
    vocab.index.has(word.slice(0, -1)) ||
    (word.endsWith('es') && vocab.index.has(word.slice(0, -2))) ||
    (word.endsWith('ies') && vocab.index.has(word.slice(0, -3) + 'y'))
  );
}

/** Whether a hint is good enough to give a new target a puzzle. */
export const isUsableHint = (hint: Hint | null): hint is Hint =>
  hint !== null && hint.backRank <= HINT_SETTINGS.maxBackRank;

/**
 * Picks the best hint for every target (null only if no word qualifies). Generic
 * words ("away", "folks") sit close to everything, so the target is far down
 * their own neighbor lists; the best hint is the one that points back hardest.
 */
export async function chooseHints(
  vocab: Vocabulary,
  neighborLists: readonly (readonly string[])[],
  avoid: Set<string>,
): Promise<(Hint | null)[]> {
  const perTarget = neighborLists.map((neighbors) => candidatesFor(vocab, neighbors, avoid));

  // One pass per distinct candidate word, shared by every target that wants it.
  const requests = new Map<number, { threshold: number; candidate: Candidate }[]>();
  perTarget.forEach((candidates, t) => {
    const target = vocab.index.get(neighborLists[t][0])!;
    for (const candidate of candidates) {
      const list = requests.get(candidate.word) ?? [];
      list.push({ threshold: similarity(vocab, candidate.word, target), candidate });
      requests.set(candidate.word, list);
    }
  });
  const entries = [...requests];
  const counts = await countCloser(
    vocab,
    entries.map(([word, list]) => ({ word, thresholds: list.map((r) => r.threshold) })),
  );
  entries.forEach(([, list], e) =>
    list.forEach((r, i) => (r.candidate.backRank = counts[e][i] + 1)),
  );

  return perTarget.map((candidates) => {
    const score = (c: Candidate) => c.backRank * (isPlural(vocab, vocab.words[c.word]) ? 2 : 1);
    const best = [...candidates].sort((a, b) => score(a) - score(b) || a.rank - b.rank)[0];
    if (!best) return null;
    return { word: vocab.words[best.word], rank: best.rank, backRank: best.backRank };
  });
}
