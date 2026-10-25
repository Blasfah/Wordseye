/**
 * All app state lives in these signals. Components read them; the actions
 * below are the only writers.
 */
import { batch, computed, effect, signal } from '@preact/signals';
import { CONFIG } from '../config';
import {
  loadIndex,
  loadManifest,
  loadPuzzle,
  loadVocabulary,
  type PuzzleIndex,
} from '../data/load';
import {
  loadGames,
  loadHistory,
  loadPracticePlayed,
  saveGame,
  saveHistory,
  savePracticePlayed,
} from '../data/storage';
import { dayNumber, scheduleSlot } from '../game/daily';
import { pickPracticePuzzle } from '../game/practice';
import {
  newGame,
  skipRound,
  startGame,
  submitGuess,
  syncClock,
  timeLeftMs,
  type GuessOutcome,
} from '../game/game';
import { scoreGame } from '../game/scoring';
import { addRecord, computeStats, toRecord, type GameRecord } from '../game/stats';
import type { GameState, Puzzle } from '../game/types';
import { hrefFor, readRoute, type Route } from './route';

export type LoadStatus =
  { kind: 'loading' } | { kind: 'ready' } | { kind: 'error'; message: string };

/** The latest thing worth telling the player about. `id` changes every time. */
export type Feedback =
  | { id: number; kind: 'outcome'; outcome: GuessOutcome }
  | { id: number; kind: 'skipped'; roundIndex: number };

const currentDay = () => dayNumber(new Date(), CONFIG.timeZone, CONFIG.firstPuzzleDate);

export const route = signal<Route>(readRoute(location.search));
/** Today's puzzle number. */
export const today = signal(currentDay());
export const loadStatus = signal<LoadStatus>({ kind: 'loading' });
export const puzzleIndex = signal<PuzzleIndex | null>(null);
export const puzzle = signal<Puzzle | null>(null);
export const vocabulary = signal<ReadonlySet<string>>(new Set());
export const game = signal<GameState>(newGame(1));
/** Daily games on this device (today's and the calendar's), for the calendar. */
export const savedGames = signal<ReadonlyMap<number, GameState>>(new Map());
export const history = signal<GameRecord[]>([]);
export const now = signal(Date.now());
export const feedback = signal<Feedback | null>(null);

/** Practice plays other puzzles back to back, without saving or counting them. */
export const isPractice = computed(() => route.value.view === 'practice');
/** Today's puzzle or a past one: saved, and counted in the stats. */
const isDailyGame = computed(() => route.value.view === 'today' || route.value.view === 'day');
export const score = computed(() => scoreGame(game.value));
export const stats = computed(() => computeStats(history.value));
export const timeLeft = computed(() => timeLeftMs(game.value, now.value));
const isPlaying = computed(() => game.value.status === 'playing');

const nextFeedbackId = () => (feedback.peek()?.id ?? 0) + 1;

/** Loads whatever the URL asks for. */
export function load(): Promise<void> {
  // A tab left open overnight should move on to the new day.
  today.value = currentDay();
  const current = route.peek();
  if (current.view === 'day' && current.day >= today.peek()) {
    // Today's or a future puzzle: show today's, at its own address.
    route.value = { view: 'today' };
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

async function withLoading(task: () => Promise<void>): Promise<void> {
  loadStatus.value = { kind: 'loading' };
  try {
    await task();
  } catch (error) {
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

/**
 * Brings saved daily games up to date: a game left running kept its clock
 * going, so it may have finished while away. Every finished game is recorded.
 */
function settleSavedGames(): { games: Map<number, GameState>; records: GameRecord[] } {
  const games = loadGames();
  let records = loadHistory();
  const recorded = new Set(records.map((r) => r.puzzleNumber));
  const t = Date.now();
  for (const [number, saved] of games) {
    const synced = syncClock(saved, t);
    if (synced !== saved) {
      games.set(number, synced);
      saveGame(synced);
    }
    if (synced.status === 'finished' && !recorded.has(number)) {
      records = addRecord(records, toRecord(synced));
    }
  }
  if (records.length !== recorded.size) saveHistory(records);
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

/** Loads a daily puzzle, today's or a past one, and restores its saved game. */
function loadDay(day: number): Promise<void> {
  return withLoading(async () => {
    const { words, index } = await loadBasics();
    const dayPuzzle = await loadPuzzle(index.days[scheduleSlot(day, index.days.length) - 1], day);
    const { games, records } = settleSavedGames();

    batch(() => {
      vocabulary.value = words;
      puzzleIndex.value = index;
      puzzle.value = dayPuzzle;
      history.value = records;
      savedGames.value = games;
      game.value = games.get(day) ?? newGame(day);
      feedback.value = null;
      now.value = Date.now();
      loadStatus.value = { kind: 'ready' };
    });
  });
}

/**
 * Loads a random practice game you haven't had yet (remembered across
 * reloads), never the one just shown. Practice words never appear in dailies.
 */
function loadPractice(): Promise<void> {
  return withLoading(async () => {
    const { words, index } = await loadBasics();
    const avoid = puzzle.peek() ? [game.peek().puzzleNumber] : [];
    const pick = pickPracticePuzzle(index.practice.length, loadPracticePlayed(), avoid);
    savePracticePlayed(pick.played);
    const next = await loadPuzzle(index.practice[pick.index - 1], pick.index);

    batch(() => {
      vocabulary.value = words;
      puzzleIndex.value = index;
      puzzle.value = next;
      game.value = newGame(pick.index);
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
