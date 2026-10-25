/**
 * Today's game and the stats history, kept in localStorage. Storage can be
 * missing, full or blocked (private browsing), so every access is guarded and
 * the game simply plays on without saving.
 */
import { CONFIG, ZONES } from '../config';
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
    isNumberOrNull(value.startMs) &&
    isNumberOrNull(value.endMs)
  );
}

export function isGameState(value: unknown): value is GameState {
  return (
    isRecord(value) &&
    Number.isInteger(value.puzzleNumber) &&
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

export function isGameRecord(value: unknown): value is GameRecord {
  return (
    isRecord(value) &&
    Number.isInteger(value.puzzleNumber) &&
    typeof value.score === 'number' &&
    typeof value.bullseyes === 'number' &&
    typeof value.rounds === 'number' &&
    typeof value.timeUsedMs === 'number' &&
    Array.isArray(value.zones)
  );
}

/** Every daily game played on this device (today's and the calendar's), by puzzle number. */
export function loadGames(): Map<number, GameState> {
  const data = read('games');
  const games = new Map<number, GameState>();
  if (isRecord(data)) {
    for (const value of Object.values(data)) {
      if (isGameState(value)) games.set(value.puzzleNumber, value);
    }
  }
  return games;
}

export function loadGame(puzzleNumber: number): GameState | null {
  return loadGames().get(puzzleNumber) ?? null;
}

export function saveGame(state: GameState): void {
  const games = loadGames();
  games.set(state.puzzleNumber, state);
  write('games', Object.fromEntries(games));
}

export function loadHistory(): GameRecord[] {
  const data = read('history');
  return Array.isArray(data) ? data.filter(isGameRecord) : [];
}

export function saveHistory(history: readonly GameRecord[]): void {
  write('history', history);
}

/** Practice games already played this cycle (practice games themselves aren't saved). */
export function loadPracticePlayed(): number[] {
  const data = read('practice-played');
  return Array.isArray(data) ? data.filter((n): n is number => Number.isInteger(n)) : [];
}

export function savePracticePlayed(files: readonly number[]): void {
  write('practice-played', files);
}
