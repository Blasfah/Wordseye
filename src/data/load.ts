/** Fetches the files written by `npm run data:build` (see public/data/). */
import { CONFIG } from '../config';
import { createPuzzleRound } from '../game/puzzle';
import type { Puzzle, PuzzleRound } from '../game/types';

export interface Manifest {
  v: 2;
  /** Content-hashed file names, so browsers can cache them for good. */
  vocab: string;
  index: string;
}

/** Which words make up each day and each practice game, as word-file ids. */
export interface PuzzleIndex {
  v: 2;
  days: string[][];
  practice: string[][];
}

interface WordFile {
  v: 2;
  hint: string;
  /** Rank order, starting with the target itself. */
  neighbors: string[];
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
    value.v === 2 &&
    typeof value.vocab === 'string' &&
    typeof value.index === 'string'
  );
}

export function isPuzzleIndex(value: unknown): value is PuzzleIndex {
  return (
    isRecord(value) &&
    value.v === 2 &&
    isGameList(value.days) &&
    value.days.length > 0 &&
    isGameList(value.practice)
  );
}

export function isWordFile(value: unknown): value is WordFile {
  return (
    isRecord(value) &&
    value.v === 2 &&
    typeof value.hint === 'string' &&
    isStringArray(value.neighbors) &&
    value.neighbors.length > 0
  );
}

export async function loadManifest(): Promise<Manifest> {
  // Always revalidate: every build points it at new vocabulary and index files.
  const data: unknown = await (await fetchData('manifest.json', { cache: 'no-cache' })).json();
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

async function loadRound(id: string): Promise<PuzzleRound> {
  const data: unknown = await (await fetchData(`words/${id}.json`)).json();
  if (!isWordFile(data)) throw new Error(`Puzzle file ${id} looks damaged.`);
  return createPuzzleRound(data.hint, data.neighbors);
}

/** A game's five rounds, fetched in parallel. */
export async function loadPuzzle(ids: readonly string[], number: number): Promise<Puzzle> {
  return { number, rounds: await Promise.all(ids.map(loadRound)) };
}
