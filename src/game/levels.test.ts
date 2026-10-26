import { describe, expect, it } from 'vitest';
import {
  extraHintsLeft,
  newGame,
  revealedHints,
  startGame,
  submitGuess,
  syncClock,
  takeExtraHint,
  timeLeftMs,
} from './game';
import { harderLevel, isLevelId, rulesFor } from './levels';
import { PUZZLE, VOCABULARY, at } from './testing';
import type { LevelId } from './types';

const input = { puzzle: PUZZLE, vocabulary: VOCABULARY };
const started = (level: LevelId) => startGame(newGame(PUZZLE.number, level), at(0));

describe('levels', () => {
  it('gives each level its own clock and extra hint allowance', () => {
    expect(rulesFor('easy')).toMatchObject({ gameSeconds: 300, extraHints: 3 });
    expect(rulesFor('medium')).toMatchObject({ gameSeconds: 180, extraHints: 1 });
    expect(rulesFor('hard')).toMatchObject({ gameSeconds: 120, extraHints: 0 });
  });

  it('runs the game clock by the level', () => {
    expect(timeLeftMs(started('easy'), at(0))).toBe(300_000);
    expect(syncClock(started('hard'), at(120)).status).toBe('finished');
    expect(syncClock(started('easy'), at(120)).status).toBe('playing');
  });

  it('knows the next level up', () => {
    expect(harderLevel('easy')).toBe('medium');
    expect(harderLevel('medium')).toBe('hard');
    expect(harderLevel('hard')).toBeNull();
  });

  it('recognises level ids', () => {
    expect(isLevelId('hard')).toBe(true);
    expect(isLevelId('extreme')).toBe(false);
    expect(isLevelId(undefined)).toBe(false);
  });
});

describe('extra hints', () => {
  it('reveals the round’s hint words in order, from a pool shared by the whole game', () => {
    let state = started('easy');
    expect(extraHintsLeft(state)).toBe(3);
    state = takeExtraHint(state, PUZZLE, at(5));
    state = takeExtraHint(state, PUZZLE, at(6));
    expect(revealedHints(state.rounds[0], PUZZLE.rounds[0].extras)).toEqual([
      { word: 'furniture', rank: 100 },
      { word: 'auction', rank: 101 },
    ]);
    expect(extraHintsLeft(state)).toBe(1);

    // The last one can be spent in a later round.
    state = submitGuess(state, 'antique', input, at(7)).state;
    state = takeExtraHint(state, PUZZLE, at(8));
    expect(state.rounds[1].extraHints).toBe(1);
    expect(extraHintsLeft(state)).toBe(0);
    expect(takeExtraHint(state, PUZZLE, at(9))).toBe(state);
  });

  it('stops when a round has no more hint words, without using up the pool', () => {
    let state = submitGuess(started('easy'), 'antique', input, at(1)).state; // round 2 has one extra
    state = takeExtraHint(state, PUZZLE, at(2));
    const before = state;
    state = takeExtraHint(state, PUZZLE, at(3));
    expect(state).toBe(before);
    expect(extraHintsLeft(state)).toBe(2);
  });

  it('gives medium one and hard none', () => {
    let medium = started('medium');
    medium = takeExtraHint(medium, PUZZLE, at(1));
    expect(medium.rounds[0].extraHints).toBe(1);
    expect(takeExtraHint(medium, PUZZLE, at(2))).toBe(medium);

    const hard = started('hard');
    expect(takeExtraHint(hard, PUZZLE, at(1))).toBe(hard);
  });

  it('won’t take a revealed hint word as a guess, and doesn’t score it', () => {
    const state = takeExtraHint(started('easy'), PUZZLE, at(1));
    const { outcome } = submitGuess(state, 'furniture', input, at(2));
    expect(outcome).toMatchObject({ kind: 'rejected', reason: 'revealed' });
  });

  it('needs a running game', () => {
    const ready = newGame(PUZZLE.number, 'easy');
    expect(takeExtraHint(ready, PUZZLE, at(1))).toBe(ready);
    const over = takeExtraHint(started('easy'), PUZZLE, at(400));
    expect(over.status).toBe('finished');
    expect(over.rounds[0].extraHints).toBe(0);
  });
});
