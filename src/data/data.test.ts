import { describe, expect, it } from 'vitest';
import { newGame, startGame, submitGuess } from '../game/game';
import { PUZZLE, VOCABULARY, at } from '../game/testing';
import { isManifest, isPuzzleIndex, isWordFile } from './load';
import {
  isGameRecord,
  isGameState,
  loadGame,
  loadGames,
  loadHistory,
  upgradeGame,
} from './storage';

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
    expect(loadGame('easy', 1)).toBeNull();
    expect(loadGames().size).toBe(0);
    expect(loadHistory()).toEqual([]);
  });
});

describe('data file validation', () => {
  const day = ['a1', 'b2', 'c3', 'd4', 'e5'];

  const days = { easy: [day, day], medium: [day, day], hard: [day, day] };
  const word = {
    v: 3,
    hints: { easy: 'old', medium: 'value' },
    extras: ['furniture'],
    neighbors: ['antique', 'antiques', 'furniture'],
  };

  it('accepts well-formed files', () => {
    expect(isManifest({ v: 3, vocab: 'vocab.abc.txt', index: 'index.def.json' })).toBe(true);
    expect(isPuzzleIndex({ v: 3, days })).toBe(true);
    expect(isWordFile(word)).toBe(true);
  });

  it('rejects the wrong shape', () => {
    expect(isManifest({ v: 2, vocab: 'x', index: 'y' })).toBe(false);
    expect(isManifest({ v: 3, vocab: 'x' })).toBe(false);
    expect(isPuzzleIndex({ v: 3, days: { ...days, hard: [day] } })).toBe(false);
    expect(isPuzzleIndex({ v: 3, days: { easy: [], medium: [], hard: [] } })).toBe(false);
    expect(isPuzzleIndex({ v: 3, days: { ...days, easy: [day.slice(1), day] } })).toBe(false);
    expect(isWordFile({ ...word, neighbors: [] })).toBe(false);
    expect(isWordFile({ ...word, hints: { easy: 3 } })).toBe(false);
    expect(isWordFile({ ...word, v: 2 })).toBe(false);
  });
});

describe('saved data from before levels', () => {
  it('reads an old saved game as a medium game with no extra hints used', () => {
    // What a game saved before levels looked like.
    const oldGame = JSON.parse(JSON.stringify(newGame(4, 'medium')));
    delete oldGame.level;
    for (const round of oldGame.rounds) delete round.extraHints;
    expect(isGameState(oldGame)).toBe(true);
    const upgraded = upgradeGame(oldGame as Parameters<typeof upgradeGame>[0]);
    expect(upgraded.level).toBe('medium');
    expect(upgraded.rounds.every((round) => round.extraHints === 0)).toBe(true);
  });

  it('accepts old history records without a level', () => {
    const old = { puzzleNumber: 2, score: 300, bullseyes: 2, rounds: 5, timeUsedMs: 9, zones: [] };
    expect(isGameRecord(old)).toBe(true);
    expect(isGameRecord({ ...old, level: 'extreme' })).toBe(false);
  });
});
