/**
 * Choosing hints: a first hint per level and a few extra hint words, all
 * close to the target and pointing back at it.
 */
import { CONFIG, LEVELS, type LevelId } from '../../src/config';
import { familyKey, sameFamily } from '../../src/game/stem';
import { countCloser } from './parallel';
import {
  centroid,
  EVERYDAY,
  isInflected,
  similarity,
  similarityTo,
  type Vocabulary,
} from './vocab';

export const HINT_SETTINGS = {
  /** Prefer hints among the N most frequent vocabulary words. */
  commonness: 12_000,
  /** A new target needs a first hint at least this good (back rank) to be used on a level. */
  maxBackRank: { easy: 80, medium: 80, hard: 2000 } satisfies Record<LevelId, number>,
  /** Extra hint words per target; a game can reveal up to the easy level's allowance. */
  extras: Math.max(...LEVELS.map((level) => level.extraHints)),
};

export interface Hint {
  word: string;
  /** Where the hint sits in the target's neighbor list. */
  rank: number;
  /** Where the target sits in the hint's own neighbor list. */
  backRank: number;
}

export interface TargetHints {
  /** First hint per level; null where none is good enough. */
  levels: Record<LevelId, Hint | null>;
  /** Extra hint words from the top 100, best first. */
  extras: Hint[];
}

interface Candidate {
  word: number;
  rank: number;
  backRank: number;
}

/**
 * Allowed words from a rank window, preferring frequent, everyday ones.
 * `everyday` is the SCOWL size counted as everyday English.
 */
function candidatesFor(
  vocab: Vocabulary,
  neighbors: readonly string[],
  [lo, hi]: readonly [number, number],
  avoid: Set<string>,
  everyday = EVERYDAY,
): Candidate[] {
  const target = neighbors[0];
  // A hint whose own family already appears above it would hand out a closer word.
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
  const common = frequent.filter((c) => vocab.commonness.get(vocab.words[c.word])! <= everyday);
  return common.length ? common : frequent.length ? frequent : all;
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

/** Best hint first: the one that points back hardest at the target. */
const byQuality = (vocab: Vocabulary) => (a: Candidate, b: Candidate) => {
  const score = (c: Candidate) => c.backRank * (isPlural(vocab, vocab.words[c.word]) ? 2 : 1);
  return score(a) - score(b) || a.rank - b.rank;
};

/**
 * Best vague hint first: the one closest to the centre of the target's nearest
 * words, so it fits the topic. Far down the list, "points back at the target"
 * is unreliable: words get there through coincidences in the news text.
 */
const byTopic = (vocab: Vocabulary, center: Float32Array) => {
  const fit = (c: Candidate) =>
    similarityTo(vocab, c.word, center) - (isPlural(vocab, vocab.words[c.word]) ? 0.05 : 0);
  return (a: Candidate, b: Candidate) => fit(b) - fit(a) || a.rank - b.rank;
};

/**
 * An order that weighs two orders equally: each candidate's positions in both
 * are added up. On their own, "points back" lets in coincidental words and
 * "fits the topic" lets in bland ones ("sauce", "day"); a hint good on both counts
 * is specific and on topic.
 */
function bothWays(
  candidates: readonly Candidate[],
  ...orders: ((a: Candidate, b: Candidate) => number)[]
): (a: Candidate, b: Candidate) => number {
  const position = new Map<Candidate, number>();
  for (const order of orders) {
    [...candidates].sort(order).forEach((c, i) => position.set(c, (position.get(c) ?? 0) + i));
  }
  return (a, b) => position.get(a)! - position.get(b)! || a.rank - b.rank;
}

const toHint = (vocab: Vocabulary, c: Candidate): Hint => ({
  word: vocab.words[c.word],
  rank: c.rank,
  backRank: c.backRank,
});

/**
 * Fills in back ranks: where the target sits in each candidate's own neighbor
 * list. Generic words ("away", "folks") sit close to everything, so the target
 * is far down their lists; a good hint points back at its target. One pass per
 * distinct candidate word, shared by every target that wants it.
 */
async function scoreBackRanks(
  vocab: Vocabulary,
  perTarget: readonly { target: number; candidates: Candidate[] }[],
): Promise<void> {
  const requests = new Map<number, { threshold: number; candidate: Candidate }[]>();
  for (const { target, candidates } of perTarget) {
    for (const candidate of candidates) {
      const list = requests.get(candidate.word) ?? [];
      list.push({ threshold: similarity(vocab, candidate.word, target), candidate });
      requests.set(candidate.word, list);
    }
  }
  const entries = [...requests];
  const counts = await countCloser(
    vocab,
    entries.map(([word, list]) => ({ word, thresholds: list.map((r) => r.threshold) })),
  );
  entries.forEach(([, list], e) =>
    list.forEach((r, i) => (r.candidate.backRank = counts[e][i] + 1)),
  );
}

/**
 * Picks every target's hints. Medium is chosen first and exactly as it always
 * was, so published puzzles keep their hints; easy and hard then avoid its word
 * family (and each other's), and the extras avoid all three.
 */
export async function chooseAllHints(
  vocab: Vocabulary,
  neighborLists: readonly (readonly string[])[],
  avoid: Set<string>,
): Promise<TargetHints[]> {
  const windows = Object.fromEntries(
    LEVELS.map((level) => [level.id, level.hintRanks as readonly [number, number]]),
  ) as Record<LevelId, readonly [number, number]>;
  const extraWindow = CONFIG.extraHintRanks as readonly [number, number];

  const perTarget = neighborLists.map((neighbors) => {
    const levels = Object.fromEntries(
      LEVELS.map((level) => [
        level.id,
        // Vague hints need to be very common words, or they read as random.
        candidatesFor(
          vocab,
          neighbors,
          windows[level.id],
          avoid,
          level.id === 'hard' ? 20 : EVERYDAY,
        ),
      ]),
    ) as Record<LevelId, Candidate[]>;
    const extras = candidatesFor(vocab, neighbors, extraWindow, avoid).filter(
      (c) => !isInflected(vocab, vocab.words[c.word]),
    );
    const center = centroid(
      vocab,
      neighbors.slice(1, 21).map((w) => vocab.index.get(w)!),
    );
    return { target: vocab.index.get(neighbors[0])!, levels, extras, center };
  });
  await scoreBackRanks(
    vocab,
    perTarget.flatMap(({ target, levels, extras }) => [
      ...Object.values(levels).map((candidates) => ({ target, candidates })),
      { target, candidates: extras },
    ]),
  );

  return perTarget.map(({ levels, extras, center }) => {
    const taken: string[] = [];
    const pick = (candidates: Candidate[], order = byQuality(vocab)) => {
      const best = candidates
        .filter((c) => !taken.some((word) => sameFamily(word, vocab.words[c.word])))
        .sort(order)[0];
      if (best) taken.push(vocab.words[best.word]);
      return best ? toHint(vocab, best) : null;
    };
    const medium = pick(levels.medium);
    const easy = pick(levels.easy);
    const hard = pick(levels.hard, bothWays(levels.hard, byQuality(vocab), byTopic(vocab, center)));
    const extraHints: Hint[] = [];
    while (extraHints.length < HINT_SETTINGS.extras) {
      const next = pick(extras);
      if (!next) break;
      extraHints.push(next);
    }
    return { levels: { easy, medium, hard }, extras: extraHints };
  });
}

/** Whether a first hint is good enough to give a new target a puzzle on a level. */
export const isUsableHint = (level: LevelId, hint: Hint | null): hint is Hint =>
  hint !== null && hint.backRank <= HINT_SETTINGS.maxBackRank[level];
