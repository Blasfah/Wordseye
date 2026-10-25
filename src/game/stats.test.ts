import { describe, expect, it } from 'vitest';
import { newGame, startGame, submitGuess, syncClock } from './game';
import { addRecord, computeStats, gameTier, toRecord, type GameRecord } from './stats';
import { PUZZLE, VOCABULARY, at } from './testing';

const record = (puzzleNumber: number, score: number, bullseyes: number): GameRecord => ({
  puzzleNumber,
  score,
  bullseyes,
  rounds: 5,
  timeUsedMs: 150_000,
  zones: [],
});

describe('toRecord', () => {
  it('summarises a finished game', () => {
    let state = startGame(newGame(PUZZLE.number), at(0));
    state = submitGuess(state, 'antique', { puzzle: PUZZLE, vocabulary: VOCABULARY }, at(4)).state;
    state = syncClock(state, at(150));
    expect(toRecord(state)).toEqual({
      puzzleNumber: 42,
      score: 125,
      bullseyes: 1,
      rounds: 5,
      timeUsedMs: 150_000,
      zones: ['bullseye', 'cold', null, null, null],
    });
  });
});

describe('addRecord', () => {
  it('keeps one record per puzzle, in puzzle order', () => {
    let history = addRecord([], record(3, 100, 1));
    history = addRecord(history, record(1, 50, 0));
    history = addRecord(history, record(3, 300, 3));
    expect(history.map((r) => [r.puzzleNumber, r.score])).toEqual([
      [1, 50],
      [3, 300],
    ]);
  });
});

describe('computeStats', () => {
  it('handles an empty history', () => {
    expect(computeStats([])).toEqual({ played: 0, averageScore: 0, bestScore: 0, bullseyeRate: 0 });
  });

  it('averages scores and counts bullseyes across all rounds', () => {
    const stats = computeStats([record(1, 100, 1), record(2, 301, 4), record(3, 0, 0)]);
    expect(stats).toEqual({ played: 3, averageScore: 134, bestScore: 301, bullseyeRate: 5 / 15 });
  });
});

describe('gameTier', () => {
  it('colours a game by its average points per round', () => {
    expect(gameTier(record(1, 625, 5))).toBe('bullseye'); // perfect
    expect(gameTier(record(1, 400, 3))).toBe('bullseye'); // 80 a round
    expect(gameTier(record(1, 399, 3))).toBe('hot');
    expect(gameTier(record(1, 225, 1))).toBe('hot'); // 45 a round
    expect(gameTier(record(1, 100, 0))).toBe('warm');
    expect(gameTier(record(1, 25, 0))).toBe('cool');
    expect(gameTier(record(1, 0, 0))).toBe('cold');
  });
});
