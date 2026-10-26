/**
 * All app state lives in these signals. Components read them; the actions
 * below are the only writers.
 */
import { batch, computed, effect, signal } from '@preact/signals';
import { CONFIG, LEVELS, type LevelId } from '../config';
import {
  loadIndex,
  loadManifest,
  loadPuzzle,
  loadVocabulary,
  NewerDataError,
  type PuzzleIndex,
} from '../data/load';
import {
  gameKey,
  loadGames,
  loadHistory,
  loadLevel,
  loadPracticePlayed,
  saveGame,
  saveHistory,
  saveLevel,
  savePracticePlayed,
} from '../data/storage';
import { dayNumber, scheduleSlot } from '../game/daily';
import {
  extraHintsLeft,
  newGame,
  skipRound,
  startGame,
  submitGuess,
  syncClock,
  takeExtraHint,
  timeLeftMs,
  type GuessOutcome,
} from '../game/game';
import { rulesFor } from '../game/levels';
import { pickPracticePuzzle } from '../game/practice';
import { scoreGame } from '../game/scoring';
import { addRecord, toRecord, type GameRecord } from '../game/stats';
import type { GameState, GameStatus, Puzzle } from '../game/types';
import { hrefFor, readRoute, type Route } from './route';

export type LoadStatus =
  { kind: 'loading' } | { kind: 'ready' } | { kind: 'error'; message: string };

/** The latest thing worth telling the player about. `id` changes every time. */
export type Feedback =
  | { id: number; kind: 'outcome'; outcome: GuessOutcome }
  | { id: number; kind: 'skipped'; roundIndex: number }
  | { id: number; kind: 'extra-hint'; word: string; rank: number; left: number };

const currentDay = () => dayNumber(new Date(), CONFIG.timeZone, CONFIG.firstPuzzleDate);

export const route = signal<Route>(readRoute(location.search));
/** The level in view: from the URL, else the last one picked here, else the default. */
export const level = signal<LevelId>(
  ('level' in route.peek() && (route.peek() as { level?: LevelId }).level) ||
    loadLevel() ||
    CONFIG.defaultLevel,
);
/** Today's puzzle number. */
export const today = signal(currentDay());
export const loadStatus = signal<LoadStatus>({ kind: 'loading' });
export const puzzleIndex = signal<PuzzleIndex | null>(null);
export const puzzle = signal<Puzzle | null>(null);
export const vocabulary = signal<ReadonlySet<string>>(new Set());
export const game = signal<GameState>(newGame(1, CONFIG.defaultLevel));
/** Daily games on this device, by gameKey(level, day): for the calendar and level picker. */
export const savedGames = signal<ReadonlyMap<string, GameState>>(new Map());
export const history = signal<GameRecord[]>([]);
export const now = signal(Date.now());
export const feedback = signal<Feedback | null>(null);

/** Practice replays past puzzles back to back, without saving or counting them. */
export const isPractice = computed(() => route.value.view === 'practice');
/** Today's puzzle or a past one: saved, and counted in the stats. */
const isDailyGame = computed(() => route.value.view === 'today' || route.value.view === 'day');
export const score = computed(() => scoreGame(game.value));
export const timeLeft = computed(() => timeLeftMs(game.value, now.value));
/** The whole clock of the game in view, which depends on its level. */
export const gameLength = computed(() => rulesFor(game.value.level).gameSeconds * 1000);
export const hintsLeft = computed(() => extraHintsLeft(game.value));
const isPlaying = computed(() => game.value.status === 'playing');

export interface LevelProgress {
  status: GameStatus;
  score: number | null;
}

/** How each level of the day in view stands on this device. */
export const dayProgress = computed(() => {
  const day = game.value.puzzleNumber;
  return Object.fromEntries(
    LEVELS.map(({ id }) => {
      const saved = id === game.value.level ? game.value : savedGames.value.get(gameKey(id, day));
      const record = history.value.find((r) => r.level === id && r.puzzleNumber === day);
      return [id, { status: saved?.status ?? 'ready', score: record?.score ?? null }];
    }),
  ) as Record<LevelId, LevelProgress>;
});

const nextFeedbackId = () => (feedback.peek()?.id ?? 0) + 1;

/** Loads whatever the URL asks for. */
export function load(): Promise<void> {
  // A tab left open overnight should move on to the new day.
  today.value = currentDay();
  const current = route.peek();
  if (current.view === 'day' && current.day >= today.peek()) {
    // Today's or a future puzzle: show today's, at its own address.
    route.value = { view: 'today', level: current.level };
    window.history.replaceState(null, '', hrefFor(route.value, location.pathname));
  }
  const target = route.peek();
  switch (target.view) {
    case 'practice':
      return loadPractice();
    case 'calendar':
      return withLoading(async () => showCalendar());
    case 'day':
      return loadDay(target.day);
    case 'today':
      return loadDay(today.peek());
  }
}

/** Switches the puzzle in view to another level, and remembers the choice. */
export function chooseLevel(next: LevelId): Promise<void> {
  saveLevel(next);
  level.value = next;
  const current = route.peek();
  if (current.view !== 'calendar') {
    route.value = { ...current, level: next };
    window.history.replaceState(null, '', hrefFor(route.value, location.pathname));
  }
  return load();
}

async function withLoading(task: () => Promise<void>): Promise<void> {
  loadStatus.value = { kind: 'loading' };
  try {
    await task();
  } catch (error) {
    if (error instanceof NewerDataError && !sessionStorage.getItem('wordseye-reloaded')) {
      // This copy of the game is older than the puzzles on the server: fetch the new one.
      sessionStorage.setItem('wordseye-reloaded', '1');
      location.reload();
      return;
    }
    const message = error instanceof Error ? error.message : String(error);
    loadStatus.value = { kind: 'error', message };
  }
}

/** The vocabulary and the puzzle index, fetched once per page. */
async function loadBasics(): Promise<{ words: ReadonlySet<string>; index: PuzzleIndex }> {
  const words = vocabulary.peek();
  const index = puzzleIndex.peek();
  if (words.size > 0 && index) return { words, index };
  const manifest = await loadManifest();
  const [loadedWords, loadedIndex] = await Promise.all([
    loadVocabulary(manifest.vocab),
    loadIndex(manifest.index),
  ]);
  return { words: loadedWords, index: loadedIndex };
}

/** A day's puzzle on a level; the schedule repeats if it ever runs out. */
function dayIds(index: PuzzleIndex, day: number, onLevel: LevelId): string[] {
  const days = index.days[onLevel];
  return days[scheduleSlot(day, days.length) - 1];
}

/**
 * Brings saved daily games up to date: a game left running kept its clock
 * going, so it may have finished while away. Every finished game is recorded.
 */
function settleSavedGames(): { games: Map<string, GameState>; records: GameRecord[] } {
  const games = loadGames();
  let records = loadHistory();
  const recorded = new Set(records.map((r) => gameKey(r.level, r.puzzleNumber)));
  const t = Date.now();
  for (const [key, saved] of games) {
    const synced = syncClock(saved, t);
    if (synced !== saved) {
      games.set(key, synced);
      saveGame(synced);
    }
    if (synced.status === 'finished' && !recorded.has(key)) {
      records = addRecord(records, toRecord(synced));
    }
  }
  // Also rewrites records saved before levels existed, now marked as medium.
  saveHistory(records);
  return { games, records };
}

function showCalendar(): void {
  const { games, records } = settleSavedGames();
  batch(() => {
    history.value = records;
    savedGames.value = games;
    loadStatus.value = { kind: 'ready' };
  });
}

/** Loads a daily puzzle, today's or a past one, on the current level. */
function loadDay(day: number): Promise<void> {
  return withLoading(async () => {
    const onLevel = level.peek();
    const { words, index } = await loadBasics();
    const dayPuzzle = await loadPuzzle(dayIds(index, day, onLevel), day, onLevel);
    const { games, records } = settleSavedGames();

    batch(() => {
      vocabulary.value = words;
      puzzleIndex.value = index;
      puzzle.value = dayPuzzle;
      history.value = records;
      savedGames.value = games;
      game.value = games.get(gameKey(onLevel, day)) ?? newGame(day, onLevel);
      feedback.value = null;
      now.value = Date.now();
      loadStatus.value = { kind: 'ready' };
    });
  });
}

/**
 * Loads a random past puzzle on the current level, one you haven't had in
 * practice yet (remembered across reloads), never the one just shown.
 */
function loadPractice(): Promise<void> {
  return withLoading(async () => {
    const onLevel = level.peek();
    const { words, index } = await loadBasics();
    // Only puzzles that are already out (on day 1, that's today's).
    const pastDays = Math.max(1, today.peek() - 1);
    const avoid = puzzle.peek() ? [game.peek().puzzleNumber] : [];
    const pick = pickPracticePuzzle(pastDays, loadPracticePlayed(), avoid);
    savePracticePlayed(pick.played);
    const next = await loadPuzzle(dayIds(index, pick.index, onLevel), pick.index, onLevel);

    batch(() => {
      vocabulary.value = words;
      puzzleIndex.value = index;
      puzzle.value = next;
      game.value = newGame(pick.index, onLevel);
      feedback.value = null;
      now.value = Date.now();
      loadStatus.value = { kind: 'ready' };
    });
  });
}

/** Practice only: load the next puzzle and start playing it right away. */
export async function playAnother(): Promise<void> {
  await loadPractice();
  if (loadStatus.peek().kind === 'ready') start();
}

export function start(): void {
  const t = Date.now();
  saveLevel(game.value.level);
  batch(() => {
    now.value = t;
    game.value = startGame(game.value, t);
  });
}

export function guess(raw: string): GuessOutcome | null {
  const current = puzzle.value;
  if (!current) return null;
  const t = Date.now();
  const { state, outcome } = submitGuess(
    game.value,
    raw,
    { puzzle: current, vocabulary: vocabulary.value },
    t,
  );
  batch(() => {
    now.value = t;
    game.value = state;
    if (outcome.kind === 'accepted' || outcome.reason !== 'empty') {
      feedback.value = { id: nextFeedbackId(), kind: 'outcome', outcome };
    }
  });
  return outcome;
}

export function skip(): void {
  const before = game.value;
  const after = skipRound(before, Date.now());
  if (after === before) return;
  batch(() => {
    game.value = after;
    if (after.status === 'playing') {
      feedback.value = { id: nextFeedbackId(), kind: 'skipped', roundIndex: before.current };
    }
  });
}

/** Reveals the current round's next extra hint word, if any are left. */
export function revealExtraHint(): void {
  const current = puzzle.value;
  if (!current) return;
  const before = game.value;
  const after = takeExtraHint(before, current, Date.now());
  if (after === before) return;
  const round = after.rounds[after.current];
  const shown = current.rounds[after.current].extras[round.extraHints - 1];
  batch(() => {
    game.value = after;
    // The clock may have run out instead, in which case there's nothing to show.
    if (after.status === 'playing' && round.extraHints > before.rounds[after.current].extraHints) {
      feedback.value = {
        id: nextFeedbackId(),
        kind: 'extra-hint',
        word: shown.word,
        rank: shown.rank,
        left: extraHintsLeft(after),
      };
    }
  });
}

/** Persistence, stats and the game clock. Returns a function that stops them. */
export function connectEffects(): () => void {
  const stops = [
    effect(() => {
      const state = game.value;
      // A puzzle that was only opened, never started, isn't worth remembering.
      if (loadStatus.value.kind !== 'ready' || !isDailyGame.value || state.status === 'ready')
        return;
      saveGame(state);
    }),

    effect(() => {
      const state = game.value;
      if (!isDailyGame.value || state.status !== 'finished') return;
      const records = addRecord(history.peek(), toRecord(state));
      history.value = records;
      saveHistory(records);
    }),

    effect(() => {
      if (!isPlaying.value) return;
      const tick = () => {
        const t = Date.now();
        batch(() => {
          now.value = t;
          game.value = syncClock(game.peek(), t);
        });
      };
      const timer = setInterval(tick, 250);
      // Background tabs throttle intervals; catch up as soon as we're visible.
      document.addEventListener('visibilitychange', tick);
      return () => {
        clearInterval(timer);
        document.removeEventListener('visibilitychange', tick);
      };
    }),
  ];
  return () => stops.forEach((stop) => stop());
}
