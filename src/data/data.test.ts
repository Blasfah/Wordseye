import { describe, expect, it } from 'vitest';
import { newGame, startGame, submitGuess } from '../game/game';
import { PUZZLE, VOCABULARY, at } from '../game/testing';
import { isManifest, isPuzzleIndex, isWordFile } from './load';
import { isGameRecord, isGameState, loadGame, loadGames, loadHistory } from './storage';

describe('saved game validation', () => {
  it('accepts a real game, including after a JSON round trip', () => {
    let state = startGame(newGame(PUZZLE.number), at(0));
    state = submitGuess(state, 'pizza', { puzzle: PUZZLE, vocabulary: VOCABULARY }, at(2)).state;
    expect(isGameState(state)).toBe(true);
    expect(isGameState(JSON.parse(JSON.stringify(state)))).toBe(true);
  });

  it('rejects anything malformed', () => {
    const good = newGame(1);
    expect(isGameState(null)).toBe(false);
    expect(isGameState({ ...good, status: 'paused' })).toBe(false);
    expect(isGameState({ ...good, rounds: good.rounds.slice(1) })).toBe(false);
    expect(isGameState({ ...good, current: 5 })).toBe(false);
    const badGuess = { word: 'x', rank: '3', zone: 'hot', atMs: 0 };
    expect(
      isGameState({ ...good, rounds: good.rounds.map((r) => ({ ...r, guesses: [badGuess] })) }),
    ).toBe(false);
  });

  it('checks history records', () => {
    expect(
      isGameRecord({
        puzzleNumber: 1,
        score: 10,
        bullseyes: 0,
        rounds: 5,
        timeUsedMs: 1,
        zones: [],
      }),
    ).toBe(true);
    expect(isGameRecord({ puzzleNumber: 1, score: '10' })).toBe(false);
  });

  it('falls back quietly when storage is unavailable', () => {
    // Under Node there is no usable localStorage, which must not throw.
    expect(loadGame(1)).toBeNull();
    expect(loadGames().size).toBe(0);
    expect(loadHistory()).toEqual([]);
  });
});

describe('data file validation', () => {
  const day = ['a1', 'b2', 'c3', 'd4', 'e5'];

  it('accepts well-formed files', () => {
    expect(isManifest({ v: 2, vocab: 'vocab.abc.txt', index: 'index.def.json' })).toBe(true);
    expect(isPuzzleIndex({ v: 2, days: [day, day], practice: [day] })).toBe(true);
    expect(isWordFile({ v: 2, hint: 'value', neighbors: ['antique', 'antiques'] })).toBe(true);
  });

  it('rejects the wrong shape', () => {
    expect(isManifest({ v: 1, puzzleCount: 86, vocab: 'x' })).toBe(false);
    expect(isManifest({ v: 2, vocab: 'x' })).toBe(false);
    expect(isPuzzleIndex({ v: 2, days: [], practice: [] })).toBe(false);
    expect(isPuzzleIndex({ v: 2, days: [day.slice(1)], practice: [] })).toBe(false);
    expect(isWordFile({ v: 2, hint: 'value', neighbors: [] })).toBe(false);
    expect(isWordFile({ v: 1, hint: 'value', neighbors: ['antique'] })).toBe(false);
  });
});
