/**
 * The game as a pure state machine. Every function takes the current state
 * and the wall-clock time, and returns a new state without mutating the old.
 */
import { checkGuess, normalizeGuess, type GuessRejection } from './guess';
import { rulesFor } from './levels';
import { rankOf } from './puzzle';
import type {
  GameState,
  Guess,
  LevelId,
  Puzzle,
  RankedWord,
  RoundState,
  RoundStatus,
  Rules,
} from './types';
import { bullseyeZone, zoneForRank, zoneOrder } from './zones';

/** Rules default to the game's own level everywhere below. */
export function newGame(
  puzzleNumber: number,
  level: LevelId,
  rules: Rules = rulesFor(level),
): GameState {
  return {
    puzzleNumber,
    level,
    status: 'ready',
    startedAt: null,
    endedMs: null,
    current: 0,
    rounds: Array.from({ length: rules.roundsPerGame }, () => ({
      status: 'upcoming',
      guesses: [],
      extraHints: 0,
      startMs: null,
      endMs: null,
    })),
  };
}

export function startGame(state: GameState, now: number): GameState {
  if (state.status !== 'ready') return state;
  return {
    ...state,
    status: 'playing',
    startedAt: now,
    rounds: replaceAt(state.rounds, 0, { ...state.rounds[0], status: 'playing', startMs: 0 }),
  };
}

export const gameDurationMs = (rules: Rules) => rules.gameSeconds * 1000;

/** Milliseconds on the game clock: 0 before the start, frozen once finished. */
export function gameClock(
  state: GameState,
  now: number,
  rules: Rules = rulesFor(state.level),
): number {
  if (state.endedMs !== null) return state.endedMs;
  if (state.startedAt === null) return 0;
  return clamp(now - state.startedAt, 0, gameDurationMs(rules));
}

export function timeLeftMs(
  state: GameState,
  now: number,
  rules: Rules = rulesFor(state.level),
): number {
  return gameDurationMs(rules) - gameClock(state, now, rules);
}

/** Ends the game if the clock has run out. Call it on every tick. */
export function syncClock(
  state: GameState,
  now: number,
  rules: Rules = rulesFor(state.level),
): GameState {
  if (state.status !== 'playing' || timeLeftMs(state, now, rules) > 0) return state;
  return finishRound(state, 'timeout', gameDurationMs(rules));
}

export type GuessOutcome =
  | { kind: 'rejected'; word: string; reason: GuessRejection | 'not-playing'; earlier?: Guess }
  | {
      kind: 'accepted';
      guess: Guess;
      roundIndex: number;
      /** The round's closest guess before this one. */
      previousBest: Guess | null;
      /** Closer than any earlier guess this round. */
      newBest: boolean;
      /** Reached a warmer zone than any earlier guess this round. */
      warmerZone: boolean;
      bullseye: boolean;
    };

export interface GuessInput {
  puzzle: Puzzle;
  vocabulary: ReadonlySet<string>;
}

export function submitGuess(
  previous: GameState,
  raw: string,
  { puzzle, vocabulary }: GuessInput,
  now: number,
  rules: Rules = rulesFor(previous.level),
): { state: GameState; outcome: GuessOutcome } {
  const state = syncClock(previous, now, rules);
  const word = normalizeGuess(raw);
  if (state.status !== 'playing') {
    return { state, outcome: { kind: 'rejected', word, reason: 'not-playing' } };
  }

  const index = state.current;
  const round = state.rounds[index];
  const puzzleRound = puzzle.rounds[index];
  const revealed = revealedHints(round, puzzleRound.extras);
  const rank = rankOf(puzzleRound, word);
  // Another form of a word already on the board ("bees" after "bee") shares its rank.
  const sameRank = (other: { rank: number | null }) => rank !== null && other.rank === rank;
  const reason =
    checkGuess(word, {
      vocabulary,
      hint: puzzleRound.hint,
      previous: round.guesses.map((g) => g.word),
      revealed: revealed.map((h) => h.word),
    }) ??
    (sameRank({ rank: rankOf(puzzleRound, puzzleRound.hint) })
      ? 'hint'
      : revealed.some(sameRank)
        ? 'revealed'
        : round.guesses.some(sameRank)
          ? 'duplicate'
          : null);
  if (reason) {
    const earlier =
      reason === 'duplicate'
        ? round.guesses.find((g) => g.word === word || sameRank(g))
        : undefined;
    return { state, outcome: { kind: 'rejected', word, reason, earlier } };
  }

  const guess: Guess = {
    word,
    rank,
    zone: zoneForRank(rank, rules.zones),
    atMs: gameClock(state, now, rules),
  };
  const best = bestGuess(round);
  const newBest = best === null || rankValue(guess) < rankValue(best);
  const warmerZone =
    guess.rank !== null &&
    (best === null || zoneOrder(guess.zone, rules.zones) < zoneOrder(best.zone, rules.zones));
  const bullseye = guess.zone === bullseyeZone(rules.zones).id;

  let next: GameState = {
    ...state,
    rounds: replaceAt(state.rounds, index, { ...round, guesses: [...round.guesses, guess] }),
  };
  if (bullseye) next = finishRound(next, 'bullseye', guess.atMs);

  return {
    state: next,
    outcome: {
      kind: 'accepted',
      guess,
      roundIndex: index,
      previousBest: best,
      newBest,
      warmerZone,
      bullseye,
    },
  };
}

export function skipRound(
  previous: GameState,
  now: number,
  rules: Rules = rulesFor(previous.level),
): GameState {
  const state = syncClock(previous, now, rules);
  if (state.status !== 'playing') return state;
  return finishRound(state, 'skipped', gameClock(state, now, rules));
}

/** Extra hints left for the rest of the game: one shared allowance, not per round. */
export function extraHintsLeft(state: GameState, rules: Rules = rulesFor(state.level)): number {
  return rules.extraHints - state.rounds.reduce((sum, round) => sum + round.extraHints, 0);
}

/** The extra hint words shown so far in a round. */
export function revealedHints(round: RoundState, extras: readonly RankedWord[]): RankedWord[] {
  return extras.slice(0, round.extraHints);
}

/**
 * Reveals the current round's next extra hint word, if the game has any left
 * and the round has another to give. Hint words don't count as guesses.
 */
export function takeExtraHint(
  previous: GameState,
  puzzle: Puzzle,
  now: number,
  rules: Rules = rulesFor(previous.level),
): GameState {
  const state = syncClock(previous, now, rules);
  if (state.status !== 'playing' || extraHintsLeft(state, rules) <= 0) return state;
  const round = state.rounds[state.current];
  if (round.extraHints >= puzzle.rounds[state.current].extras.length) return state;
  return {
    ...state,
    rounds: replaceAt(state.rounds, state.current, { ...round, extraHints: round.extraHints + 1 }),
  };
}

/** Closes the current round and opens the next one, or ends the game. */
function finishRound(state: GameState, status: RoundStatus, atMs: number): GameState {
  const index = state.current;
  let rounds = replaceAt(state.rounds, index, { ...state.rounds[index], status, endMs: atMs });
  const nextIndex = index + 1;
  if (status === 'timeout' || nextIndex >= rounds.length) {
    return { ...state, rounds, status: 'finished', endedMs: atMs };
  }
  rounds = replaceAt(rounds, nextIndex, { ...rounds[nextIndex], status: 'playing', startMs: atMs });
  return { ...state, rounds, current: nextIndex };
}

const rankValue = (guess: Guess) => guess.rank ?? Infinity;

/** The closest guess of a round (earliest wins ties), or null with no guesses. */
export function bestGuess(round: RoundState): Guess | null {
  let best: Guess | null = null;
  for (const guess of round.guesses) {
    if (best === null || rankValue(guess) < rankValue(best)) best = guess;
  }
  return best;
}

/** Closest first; cold guesses last, newest first among them. */
export function sortGuesses(guesses: readonly Guess[]): Guess[] {
  return guesses
    .map((guess, order) => ({ guess, order }))
    .sort((a, b) => rankValue(a.guess) - rankValue(b.guess) || b.order - a.order)
    .map(({ guess }) => guess);
}

function replaceAt<T>(items: readonly T[], index: number, item: T): T[] {
  return items.map((existing, i) => (i === index ? item : existing));
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
