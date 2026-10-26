/**
 * The daily schedules: five targets per day for each level. A word is used at
 * most once per level, comes back on another level only after a long gap, and
 * never shares a day (or a game) with a near relative.
 */
import type { LevelId } from '../../src/config';
import { familyKey } from '../../src/game/stem';
import { similarity, type Vocabulary } from './vocab';

/** Two targets at least this similar (cosine) never share a game. */
export const MAX_SAME_GAME_SIMILARITY = 0.4;

export type Schedules = Record<LevelId, string[][]>;

export interface Schedulable {
  target: string;
  /** The first hint per level, or null where the word can't be used. */
  hints: Record<LevelId, string | null>;
  /** Higher is easier: the easy level prefers these, hard the opposite. */
  easiness: number;
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

interface Word extends Schedulable {
  family: string;
  hintFamilies: Record<LevelId, string | null>;
  index: number;
}

interface Options {
  levels: readonly LevelId[];
  roundsPerGame: number;
  gapDays: number;
}

/**
 * Extends every level's schedule day by day until some level can't fill a
 * day. Existing days are kept exactly; all levels end on the same day.
 */
export function extendSchedules(
  vocab: Vocabulary,
  candidates: readonly Schedulable[],
  existing: Schedules,
  { levels, roundsPerGame, gapDays }: Options,
): Schedules {
  const words: Word[] = candidates.map((c) => ({
    ...c,
    family: familyKey(c.target),
    hintFamilies: Object.fromEntries(
      levels.map((level) => [level, c.hints[level] ? familyKey(c.hints[level]!) : null]),
    ) as Record<LevelId, string | null>,
    index: vocab.index.get(c.target)!,
  }));

  // Who has been used where.
  const uses = new Map<string, { level: LevelId; day: number }[]>();
  const register = (word: string, level: LevelId, day: number) =>
    uses.set(word, [...(uses.get(word) ?? []), { level, day }]);
  const unregister = (word: string, level: LevelId, day: number) =>
    uses.set(
      word,
      (uses.get(word) ?? []).filter((u) => u.level !== level || u.day !== day),
    );
  const schedules = Object.fromEntries(
    levels.map((level) => [level, existing[level].map((game) => [...game])]),
  ) as Schedules;
  for (const level of levels) {
    schedules[level].forEach((game, i) => game.forEach((w) => register(w, level, i + 1)));
  }

  // Each level's order of preference: easy takes easy words first, hard the
  // hardest, medium an even mix. Some noise keeps neighbours in the list apart.
  const preference = Object.fromEntries(
    levels.map((level) => {
      const random = seededRandom(`schedule-${level}`);
      const keyed = words
        .filter((w) => w.hints[level])
        .map((w) => {
          const noise = random() * 1.5;
          const key =
            level === 'easy' ? -w.easiness + noise : level === 'hard' ? w.easiness + noise : noise;
          return { w, key };
        });
      return [level, keyed.sort((a, b) => a.key - b.key).map(({ w }) => w)];
    }),
  ) as Record<LevelId, Word[]>;

  const canShareGame = (level: LevelId, a: Word, b: Word) =>
    similarity(vocab, a.index, b.index) < MAX_SAME_GAME_SIMILARITY &&
    a.family !== b.family &&
    a.hintFamilies[level] !== b.family &&
    b.hintFamilies[level] !== a.family &&
    a.hintFamilies[level] !== b.hintFamilies[level];

  const pickGame = (level: LevelId, day: number, todayFamilies: Set<string>): string[] | null => {
    const available = preference[level].filter(
      (w) =>
        !todayFamilies.has(w.family) &&
        (uses.get(w.target) ?? []).every(
          (u) => u.level !== level && Math.abs(u.day - day) >= gapDays,
        ),
    );
    const game: Word[] = [];
    for (const w of available) {
      if (game.every((other) => canShareGame(level, w, other))) game.push(w);
      if (game.length === roundsPerGame) break;
    }
    // Clashing leftovers: fill up regardless rather than end the schedule early.
    for (const w of available) {
      if (game.length === roundsPerGame) break;
      if (!game.includes(w)) game.push(w);
    }
    return game.length === roundsPerGame ? game.map((w) => w.target) : null;
  };

  const familyOf = (word: string) => familyKey(word);
  for (let day = Math.min(...levels.map((l) => schedules[l].length)) + 1; ; day++) {
    const todayFamilies = new Set(
      levels.flatMap((l) => (schedules[l][day - 1] ?? []).map(familyOf)),
    );
    const added: LevelId[] = [];
    let complete = true;
    for (const level of levels) {
      if (schedules[level].length >= day) continue;
      const game = pickGame(level, day, todayFamilies);
      if (!game) {
        complete = false;
        break;
      }
      schedules[level].push(game);
      added.push(level);
      for (const w of game) {
        register(w, level, day);
        todayFamilies.add(familyOf(w));
      }
    }
    if (!complete) {
      // Some level ran dry: drop this half-filled day so all levels end together.
      for (const level of added) {
        for (const w of schedules[level].pop()!) unregister(w, level, day);
      }
      break;
    }
  }
  return schedules;
}

/** Checks the rules above on a finished schedule; returns problems found. */
export function checkSchedules(
  schedules: Schedules,
  levels: readonly LevelId[],
  gapDays: number,
): string[] {
  const problems: string[] = [];
  const seen = new Map<string, { level: LevelId; day: number }[]>();
  for (const level of levels) {
    schedules[level].forEach((game, i) => {
      for (const w of game) seen.set(w, [...(seen.get(w) ?? []), { level, day: i + 1 }]);
    });
  }
  for (const [word, list] of seen) {
    for (let a = 0; a < list.length; a++) {
      for (let b = a + 1; b < list.length; b++) {
        const [x, y] = [list[a], list[b]];
        if (x.level === y.level)
          problems.push(`${word} twice on ${x.level} (days ${x.day}, ${y.day})`);
        else if (Math.abs(x.day - y.day) < gapDays) {
          problems.push(`${word} on ${x.level} day ${x.day} and ${y.level} day ${y.day}`);
        }
      }
    }
  }
  return problems;
}
