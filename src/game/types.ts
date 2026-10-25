import type { ZoneId } from '../config';

export type { ZoneId };

export interface Zone {
  id: ZoneId;
  label: string;
  /** Highest rank in this zone, or null for the catch-all cold zone. */
  maxRank: number | null;
  points: number;
  emoji: string;
}

/** The subset of CONFIG the game logic depends on, so tests can vary it. */
export interface Rules {
  roundsPerGame: number;
  gameSeconds: number;
  zones: readonly Zone[];
  speedBonus: { maxPoints: number; fullBonusSeconds: number; noBonusSeconds: number };
}

/** One round of a day's puzzle, ready for rank lookups. */
export interface PuzzleRound {
  hint: string;
  target: string;
  /** word → rank, where rank 1 is the target. Anything missing is cold. */
  ranks: ReadonlyMap<string, number>;
}

export interface Puzzle {
  /** Puzzle number shown to players (#1 on the first day). */
  number: number;
  rounds: PuzzleRound[];
}

export interface Guess {
  word: string;
  /** null when the word is outside the target's ranked neighbors. */
  rank: number | null;
  zone: ZoneId;
  /** Game clock (ms since the game started) when it was made. */
  atMs: number;
}

export type RoundStatus = 'upcoming' | 'playing' | 'bullseye' | 'skipped' | 'timeout';

export interface RoundState {
  status: RoundStatus;
  /** In the order they were made. */
  guesses: Guess[];
  startMs: number | null;
  endMs: number | null;
}

export type GameStatus = 'ready' | 'playing' | 'finished';

/** Plain JSON-safe data, so it can be saved as-is. */
export interface GameState {
  puzzleNumber: number;
  status: GameStatus;
  /** Wall-clock time the game started (epoch ms). The clock keeps running across reloads. */
  startedAt: number | null;
  /** Game clock when the game ended. */
  endedMs: number | null;
  current: number;
  rounds: RoundState[];
}
