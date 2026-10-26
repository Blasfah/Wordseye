/**
 * Saved games, the stats history and preferences, kept in localStorage.
 * Storage can be missing, full or blocked (private browsing), so every access
 * is guarded and the game simply plays on without saving.
 */
import { CONFIG, ZONES, type LevelId } from '../config';
import { isLevelId } from '../game/levels';
import type { GameRecord } from '../game/stats';
import type { GameState, Guess, RoundState } from '../game/types';

const key = (name: string) => `${CONFIG.storagePrefix}:${name}`;

function read(name: string): unknown {
  try {
    const raw = localStorage.getItem(key(name));
    return raw === null ? null : JSON.parse(raw);
  } catch {
    return null;
  }
}

function write(name: string, value: unknown): void {
  try {
    localStorage.setItem(key(name), JSON.stringify(value));
  } catch {
    // Not saving is fine; the game keeps working in memory.
  }
}

/** Games and records from before levels existed were all played on medium. */
const LEVEL_BEFORE_LEVELS: LevelId = 'medium';

const zoneIds: ReadonlySet<unknown> = new Set(ZONES.map((z) => z.id));
const roundStatuses: ReadonlySet<unknown> = new Set([
  'upcoming',
  'playing',
  'bullseye',
  'skipped',
  'timeout',
]);
const gameStatuses: ReadonlySet<unknown> = new Set(['ready', 'playing', 'finished']);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;
const isNumberOrNull = (value: unknown) => value === null || typeof value === 'number';
const isOptional = (value: unknown, check: (v: unknown) => boolean) =>
  value === undefined || check(value);

function isGuess(value: unknown): value is Guess {
  return (
    isRecord(value) &&
    typeof value.word === 'string' &&
    isNumberOrNull(value.rank) &&
    zoneIds.has(value.zone) &&
    typeof value.atMs === 'number'
  );
}

function isRound(value: unknown): value is RoundState {
  return (
    isRecord(value) &&
    roundStatuses.has(value.status) &&
    Array.isArray(value.guesses) &&
    value.guesses.every(isGuess) &&
    isOptional(value.extraHints, Number.isInteger) &&
    isNumberOrNull(value.startMs) &&
    isNumberOrNull(value.endMs)
  );
}

/** A saved game, possibly from before levels and extra hints existed. */
export function isGameState(value: unknown): value is GameState {
  return (
    isRecord(value) &&
    Number.isInteger(value.puzzleNumber) &&
    isOptional(value.level, isLevelId) &&
    gameStatuses.has(value.status) &&
    isNumberOrNull(value.startedAt) &&
    isNumberOrNull(value.endedMs) &&
    Array.isArray(value.rounds) &&
    value.rounds.length === CONFIG.roundsPerGame &&
    value.rounds.every(isRound) &&
    Number.isInteger(value.current) &&
    (value.current as number) >= 0 &&
    (value.current as number) < value.rounds.length
  );
}

/** Fills in what older saved games lack. */
export function upgradeGame(state: GameState): GameState {
  return {
    ...state,
    level: state.level ?? LEVEL_BEFORE_LEVELS,
    rounds: state.rounds.map((round) => ({ ...round, extraHints: round.extraHints ?? 0 })),
  };
}

export function isGameRecord(value: unknown): value is GameRecord {
  return (
    isRecord(value) &&
    Number.isInteger(value.puzzleNumber) &&
    isOptional(value.level, isLevelId) &&
    typeof value.score === 'number' &&
    typeof value.bullseyes === 'number' &&
    typeof value.rounds === 'number' &&
    typeof value.timeUsedMs === 'number' &&
    Array.isArray(value.zones)
  );
}

export const gameKey = (level: LevelId, puzzleNumber: number) => `${level}:${puzzleNumber}`;

/** Every daily game played on this device, by gameKey(level, puzzle number). */
export function loadGames(): Map<string, GameState> {
  const data = read('games');
  const games = new Map<string, GameState>();
  if (isRecord(data)) {
    for (const value of Object.values(data)) {
      if (!isGameState(value)) continue;
      const game = upgradeGame(value);
      games.set(gameKey(game.level, game.puzzleNumber), game);
    }
  }
  return games;
}

export function loadGame(level: LevelId, puzzleNumber: number): GameState | null {
  return loadGames().get(gameKey(level, puzzleNumber)) ?? null;
}

export function saveGame(state: GameState): void {
  const games = loadGames();
  games.set(gameKey(state.level, state.puzzleNumber), state);
  write('games', Object.fromEntries(games));
}

export function loadHistory(): GameRecord[] {
  const data = read('history');
  if (!Array.isArray(data)) return [];
  return data
    .filter(isGameRecord)
    .map((record) => ({ ...record, level: record.level ?? LEVEL_BEFORE_LEVELS }));
}

export function saveHistory(history: readonly GameRecord[]): void {
  write('history', history);
}

/** The level last picked on this device. */
export function loadLevel(): LevelId | null {
  const data = read('level');
  return isLevelId(data) ? data : null;
}

export function saveLevel(level: LevelId): void {
  write('level', level);
}

/** Practice games already played this cycle (practice games themselves aren't saved). */
export function loadPracticePlayed(): number[] {
  const data = read('practice-played');
  return Array.isArray(data) ? data.filter((n): n is number => Number.isInteger(n)) : [];
}

export function savePracticePlayed(files: readonly number[]): void {
  write('practice-played', files);
}
