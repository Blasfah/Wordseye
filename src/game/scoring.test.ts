import { describe, expect, it } from 'vitest';
import { newGame, skipRound, startGame, submitGuess, syncClock } from './game';
import { scoreGame, scoreRound, speedBonus } from './scoring';
import { PUZZLE, VOCABULARY, at } from './testing';
import type { GameState } from './types';

const input = { puzzle: PUZZLE, vocabulary: VOCABULARY };

function play(steps: ([word: string, seconds: number] | ['skip', number])[]): GameState {
  let state = startGame(newGame(PUZZLE.number), at(0));
  for (const [word, seconds] of steps) {
    state =
      word === 'skip'
        ? skipRound(state, at(seconds))
        : submitGuess(state, word, input, at(seconds)).state;
  }
  return state;
}

describe('speedBonus', () => {
  it('gives the full bonus for quick rounds and fades to zero', () => {
    expect(speedBonus(0)).toBe(25);
    expect(speedBonus(8_000)).toBe(25);
    expect(speedBonus(26_500)).toBe(13);
    expect(speedBonus(45_000)).toBe(0);
    expect(speedBonus(90_000)).toBe(0);
  });
});

describe('scoreRound', () => {
  it('scores a bullseye with its speed bonus, timed from the round start', () => {
    const state = play([
      ['antique', 5],
      ['puppy', 31.5], // round 2 took 26.5s
    ]);
    expect(scoreRound(state.rounds[0])).toMatchObject({
      zone: 'bullseye',
      zonePoints: 100,
      speedBonus: 25,
      total: 125,
    });
    expect(scoreRound(state.rounds[1])).toMatchObject({
      zone: 'bullseye',
      speedBonus: 13,
      total: 113,
    });
  });

  it('gives partial credit for the best guess of a skipped round', () => {
    const state = play([
      ['dusty', 2],
      ['furniture', 3],
      ['pizza', 4],
      ['skip', 5],
    ]);
    expect(scoreRound(state.rounds[0])).toMatchObject({
      status: 'skipped',
      zone: 'hot',
      zonePoints: 60,
      speedBonus: 0,
      total: 60,
      best: { word: 'furniture' },
    });
  });

  it('scores each zone', () => {
    const cases = [
      ['vintage', 'hot', 60],
      ['auction', 'warm', 30],
      ['attic', 'cool', 10],
      ['pizza', 'cold', 0],
    ] as const;
    for (const [word, zone, points] of cases) {
      const state = play([
        [word, 1],
        ['skip', 2],
      ]);
      expect(scoreRound(state.rounds[0]), word).toMatchObject({ zone, total: points });
    }
  });

  it('counts a reached round with no guesses as cold, and an unreached one as unplayed', () => {
    const state = play([['skip', 1]]);
    expect(scoreRound(state.rounds[0])).toMatchObject({ zone: 'cold', total: 0, best: null });
    expect(scoreRound(state.rounds[2])).toMatchObject({ zone: null, total: 0 });
  });
});

describe('scoreGame', () => {
  it('adds up the rounds and the time used', () => {
    const state = play([
      ['antique', 5], // 125
      ['cute', 10], // hot, then skipped: 60
      ['skip', 12],
      ['voyage', 20], // 8s: 125
      ['skip', 21], // cold: 0
      ['queen', 100], // 79s: 100
    ]);
    const score = scoreGame(state);
    expect(score.rounds.map((r) => r.total)).toEqual([125, 60, 125, 0, 100]);
    expect(score.total).toBe(410);
    expect(score.bullseyes).toBe(3);
    expect(score.timeUsedMs).toBe(100_000);
  });

  it('uses the full clock when time runs out', () => {
    const state = syncClock(play([['antique', 5]]), at(200));
    const score = scoreGame(state);
    expect(score.timeUsedMs).toBe(150_000);
    expect(score.rounds.map((r) => r.zone)).toEqual(['bullseye', 'cold', null, null, null]);
  });
});
