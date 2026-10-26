/** Fetches the files written by `npm run data:build` (see public/data/). */
import { CONFIG, LEVELS, type LevelId } from '../config';
import { createPuzzleRound } from '../game/puzzle';
import type { Puzzle, PuzzleRound } from '../game/types';

/** The data format this code understands. */
export const DATA_VERSION = 3;

export interface Manifest {
  v: typeof DATA_VERSION;
  /** Content-hashed file names, so browsers can cache them for good. */
  vocab: string;
  index: string;
}

/** Each level's daily schedule, as word-file ids. All levels have the same number of days. */
export interface PuzzleIndex {
  v: typeof DATA_VERSION;
  days: Record<LevelId, string[][]>;
}

interface WordFile {
  v: typeof DATA_VERSION;
  /** First hint per level the word is used on. */
  hints: Partial<Record<LevelId, string>>;
  /** Extra hint words, in the order they're revealed. */
  extras: string[];
  /** Rank order, starting with the target itself. */
  neighbors: string[];
}

/** The data on the server is newer than this copy of the game: it needs a reload. */
export class NewerDataError extends Error {
  constructor() {
    super('A new version of Wordseye is out. Reload the page to play it.');
  }
}

const dataUrl = (path: string) => `${import.meta.env.BASE_URL}data/${path}`;

async function fetchData(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(dataUrl(path), init);
  if (!response.ok) throw new Error(`Couldn't load ${path} (HTTP ${response.status}).`);
  return response;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const isStringArray = (value: unknown): value is string[] =>
  Array.isArray(value) && value.every((item) => typeof item === 'string');

const isGameList = (value: unknown): value is string[][] =>
  Array.isArray(value) &&
  value.every((game) => isStringArray(game) && game.length === CONFIG.roundsPerGame);

export function isManifest(value: unknown): value is Manifest {
  return (
    isRecord(value) &&
    value.v === DATA_VERSION &&
    typeof value.vocab === 'string' &&
    typeof value.index === 'string'
  );
}

export function isPuzzleIndex(value: unknown): value is PuzzleIndex {
  if (!isRecord(value) || value.v !== DATA_VERSION || !isRecord(value.days)) return false;
  const days = value.days;
  const lengths = LEVELS.map((level) => {
    const list = days[level.id];
    return isGameList(list) ? list.length : -1;
  });
  return lengths[0] > 0 && lengths.every((length) => length === lengths[0]);
}

export function isWordFile(value: unknown): value is WordFile {
  return (
    isRecord(value) &&
    value.v === DATA_VERSION &&
    isRecord(value.hints) &&
    Object.values(value.hints).every((hint) => typeof hint === 'string') &&
    isStringArray(value.extras) &&
    isStringArray(value.neighbors) &&
    value.neighbors.length > 0
  );
}

export async function loadManifest(): Promise<Manifest> {
  // Always revalidate: every build points it at new vocabulary and index files.
  const data: unknown = await (await fetchData('manifest.json', { cache: 'no-cache' })).json();
  if (isRecord(data) && typeof data.v === 'number' && data.v > DATA_VERSION) {
    throw new NewerDataError();
  }
  if (!isManifest(data)) throw new Error('The puzzle list looks damaged.');
  return data;
}

export async function loadVocabulary(file: string): Promise<Set<string>> {
  const text = await (await fetchData(file)).text();
  return new Set(text.split(/\r?\n/).filter(Boolean));
}

export async function loadIndex(file: string): Promise<PuzzleIndex> {
  const data: unknown = await (await fetchData(file)).json();
  if (!isPuzzleIndex(data)) throw new Error('The puzzle schedule looks damaged.');
  return data;
}

async function loadRound(id: string, level: LevelId): Promise<PuzzleRound> {
  const data: unknown = await (await fetchData(`words/${id}.json`)).json();
  const hint = isWordFile(data) ? data.hints[level] : undefined;
  if (!isWordFile(data) || !hint) throw new Error(`Puzzle file ${id} looks damaged.`);
  return createPuzzleRound(hint, data.neighbors, data.extras);
}

/** A game's five rounds, fetched in parallel. */
export async function loadPuzzle(
  ids: readonly string[],
  number: number,
  level: LevelId,
): Promise<Puzzle> {
  return { number, level, rounds: await Promise.all(ids.map((id) => loadRound(id, level))) };
}
