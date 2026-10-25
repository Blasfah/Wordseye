import { describe, expect, it } from 'vitest';
import { newGame, skipRound, startGame, submitGuess, syncClock } from './game';
import { formatClock, shareText } from './share';
import { PUZZLE, VOCABULARY, at } from './testing';

const input = { puzzle: PUZZLE, vocabulary: VOCABULARY };

describe('formatClock', () => {
  it('formats minutes and seconds, rounding up', () => {
    expect(formatClock(0)).toBe('0:00');
    expect(formatClock(999)).toBe('0:01');
    expect(formatClock(125_000)).toBe('2:05');
    expect(formatClock(150_000)).toBe('2:30');
    expect(formatClock(-50)).toBe('0:00');
  });
});

describe('shareText', () => {
  it('shows the score, a circle per round and the time, without spoilers', () => {
    let state = startGame(newGame(PUZZLE.number), at(0));
    const moves: [string, number][] = [
      ['antique', 5], // bullseye
      ['cute', 10], // hot
      ['skip', 11],
      ['skip', 12], // cold
    ];
    for (const [word, seconds] of moves) {
      state =
        word === 'skip'
          ? skipRound(state, at(seconds))
          : submitGuess(state, word, input, at(seconds)).state;
    }
    state = syncClock(state, at(150)); // round 4 times out with no guesses, round 5 never starts

    const text = shareText(state);
    expect(text).toBe('Wordseye #42 · 185 pts\n🟡🔴🔵🔵⚪ · 2:30');
    for (const secret of ['antique', 'kitten', 'cute', 'value']) expect(text).not.toContain(secret);
  });

  it('uses the configured name', () => {
    const state = startGame(newGame(3), at(0));
    expect(shareText(state, undefined, { name: 'Warmer', unplayedEmoji: '·' })).toMatch(
      /^Warmer #3 · 0 pts\n🔵····/,
    );
  });
});
