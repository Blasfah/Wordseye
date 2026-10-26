import { describe, expect, it } from 'vitest';
import { newGame, startGame, submitGuess } from '../game/game';
import { PUZZLE, VOCABULARY, at } from '../game/testing';
import { isManifest, isPuzzleIndex, isWordFile } from './load';
import { isGameRecord, isGameState, loadGame, loadGames, loadHistory } from './storage';

describe('saved game validation', () => {
  it('accepts a real game, including after a JSON round trip', () => {
    let state = startGame(newGame(PUZZLE.number, PUZZLE.level), at(0));
    state = submitGuess(state, 'pizza', { puzzle: PUZZLE, vocabulary: VOCABULARY }, at(2)).state;
    expect(isGameState(state)).toBe(true);
    expect(isGameState(JSON.parse(JSON.stringify(state)))).toBe(true);
  });

  it('rejects anything malformed', () => {
    const good = newGame(1, 'easy');
    expect(isGameState(null)).toBe(false);
    expect(isGameState({ ...good, status: 'paused' })).toBe(false);
    expect(isGameState({ ...good, rounds: good.rounds.slice(1) })).toBe(false);
    expect(isGameState({ ...good, current: 5 })).toBe(false);
    expect(isGameState({ ...good, level: undefined })).toBe(false);
    const badGuess = { word: 'x', rank: '3', zone: 'hot', atMs: 0 };
    expect(
      isGameState({ ...good, rounds: good.rounds.map((r) => ({ ...r, guesses: [badGuess] })) }),
    ).toBe(false);
  });

  it('checks history records', () => {
    const record = {
      puzzleNumber: 1,
      score: 10,
      bullseyes: 0,
      rounds: 5,
      timeUsedMs: 1,
      zones: [],
    };
    expect(isGameRecord({ ...record, level: 'easy' })).toBe(true);
    expect(isGameRecord(record)).toBe(false);
    expect(isGameRecord({ ...record, level: 'extreme' })).toBe(false);
    expect(isGameRecord({ puzzleNumber: 1, score: '10' })).toBe(false);
  });

  it('falls back quietly when storage is unavailable', () => {
    // Under Node there is no usable localStorage, which must not throw.
    expect(loadGame('easy', 1)).toBeNull();
    expect(loadGames().size).toBe(0);
    expect(loadHistory()).toEqual([]);
  });
});

describe('data file validation', () => {
  const day = ['a1', 'b2', 'c3', 'd4', 'e5'];

  const days = { easy: [day, day], medium: [day, day], hard: [day, day] };
  const word = {
    v: 4,
    hints: { easy: 'old', medium: 'value' },
    extras: ['furniture'],
    neighbors: ['antique antiques', 'furniture'],
  };

  it('accepts well-formed files', () => {
    expect(isManifest({ v: 4, vocab: 'vocab.abc.txt', index: 'index.def.json' })).toBe(true);
    expect(isPuzzleIndex({ v: 4, days })).toBe(true);
    expect(isWordFile(word)).toBe(true);
  });

  it('rejects the wrong shape', () => {
    expect(isManifest({ v: 3, vocab: 'x', index: 'y' })).toBe(false);
    expect(isManifest({ v: 4, vocab: 'x' })).toBe(false);
    expect(isPuzzleIndex({ v: 4, days: { ...days, hard: [day] } })).toBe(false);
    expect(isPuzzleIndex({ v: 4, days: { easy: [], medium: [], hard: [] } })).toBe(false);
    expect(isPuzzleIndex({ v: 4, days: { ...days, easy: [day.slice(1), day] } })).toBe(false);
    expect(isWordFile({ ...word, neighbors: [] })).toBe(false);
    expect(isWordFile({ ...word, hints: { easy: 3 } })).toBe(false);
    expect(isWordFile({ ...word, v: 3 })).toBe(false);
  });
});
