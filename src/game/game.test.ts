import { describe, expect, it } from 'vitest';
import {
  bestGuess,
  gameClock,
  newGame,
  skipRound,
  sortGuesses,
  startGame,
  submitGuess,
  syncClock,
  timeLeftMs,
} from './game';
import { createPuzzleRound } from './puzzle';
import { PUZZLE, VOCABULARY, at, neighborsFor } from './testing';
import type { GameState, Guess } from './types';

const input = { puzzle: PUZZLE, vocabulary: VOCABULARY };

function started(): GameState {
  return startGame(newGame(PUZZLE.number, PUZZLE.level), at(0));
}

function guess(state: GameState, word: string, seconds: number) {
  return submitGuess(state, word, input, at(seconds));
}

describe('starting a game', () => {
  it('creates five upcoming rounds', () => {
    const game = newGame(7, 'easy');
    expect(game.status).toBe('ready');
    expect(game.rounds).toHaveLength(5);
    expect(game.rounds.every((r) => r.status === 'upcoming')).toBe(true);
  });

  it('starts the clock and the first round', () => {
    const game = started();
    expect(game.status).toBe('playing');
    expect(game.startedAt).toBe(at(0));
    expect(game.rounds[0]).toMatchObject({ status: 'playing', startMs: 0 });
  });

  it('ignores a second start', () => {
    const game = started();
    expect(startGame(game, at(30))).toBe(game);
  });
});

describe('guessing', () => {
  it('records rank, zone and time', () => {
    const { state, outcome } = guess(started(), ' Furniture ', 12);
    expect(outcome).toMatchObject({
      kind: 'accepted',
      previousBest: null,
      newBest: true,
      warmerZone: true,
      bullseye: false,
    });
    expect(state.rounds[0].guesses).toEqual([
      { word: 'furniture', rank: 100, zone: 'hot', atMs: 12_000 },
    ]);
  });

  it('treats vocabulary words outside the neighbor list as cold', () => {
    const { outcome } = guess(started(), 'pizza', 3);
    expect(outcome).toMatchObject({
      kind: 'accepted',
      guess: { rank: null, zone: 'cold' },
      warmerZone: false,
    });
  });

  it('flags a new best only when the guess is closer', () => {
    let { state } = guess(started(), 'auction', 1); // warm, 101
    let result = guess(state, 'dusty', 2); // warm, 500
    expect(result.outcome).toMatchObject({
      newBest: false,
      warmerZone: false,
      previousBest: { word: 'auction' },
    });
    state = result.state;
    result = guess(state, 'furniture', 3); // hot, 100
    expect(result.outcome).toMatchObject({ newBest: true, warmerZone: true });
  });

  it('rejects bad guesses without counting them', () => {
    const base = guess(started(), 'vintage', 1).state;
    const cases: [string, string][] = [
      ['', 'empty'],
      ['two words', 'not-a-word'],
      ['zzyzx', 'unknown'],
      ['values', 'hint'],
      ['VINTAGE', 'duplicate'],
    ];
    for (const [word, reason] of cases) {
      const { state, outcome } = guess(base, word, 2);
      expect(outcome, word).toMatchObject({ kind: 'rejected', reason });
      expect(state.rounds[0].guesses).toHaveLength(1);
    }
  });

  it('points a duplicate back at the earlier guess', () => {
    const base = guess(started(), 'vintage', 1).state;
    const { outcome } = guess(base, 'vintage', 2);
    expect(outcome).toMatchObject({ kind: 'rejected', earlier: { word: 'vintage', rank: 11 } });
  });

  it('allows the same word again in a later round', () => {
    let { state } = guess(started(), 'antique', 5); // bullseye, round 2 starts
    ({ state } = guess(state, 'pizza', 6));
    expect(state.rounds[1].guesses.map((g) => g.word)).toEqual(['pizza']);
  });
});

describe('forms of a word', () => {
  // British and American spellings are forms too, which word stems alone miss.
  const round = createPuzzleRound(
    'colour',
    neighborsFor('paint', { 'paint paints': 1, 'brush brushes': 12, 'colour color': 30 }),
  );
  const puzzle = { ...PUZZLE, rounds: [round, ...PUZZLE.rounds.slice(1)] };
  const vocabulary = new Set([...VOCABULARY, ...round.ranks.keys()]);
  const play = (state: GameState, word: string, seconds: number) =>
    submitGuess(state, word, { puzzle, vocabulary }, at(seconds));

  it('wins the round with any form of the secret word', () => {
    const { outcome } = play(started(), 'paints', 2);
    expect(outcome).toMatchObject({ kind: 'accepted', bullseye: true, guess: { rank: 1 } });
  });

  it('counts another form of an earlier guess as a repeat', () => {
    const { state } = play(started(), 'brush', 2);
    const { outcome } = play(state, 'brushes', 3);
    expect(outcome).toMatchObject({
      kind: 'rejected',
      reason: 'duplicate',
      earlier: { word: 'brush', rank: 12 },
    });
  });

  it('rejects any form of the hint', () => {
    const { outcome } = play(started(), 'color', 2);
    expect(outcome).toMatchObject({ kind: 'rejected', reason: 'hint' });
  });
});

describe('bullseyes and skips', () => {
  it('ends the round on a top-10 guess and starts the next one at once', () => {
    const { state, outcome } = guess(started(), 'heirloom', 20); // rank 10
    expect(outcome).toMatchObject({ kind: 'accepted', bullseye: true, roundIndex: 0 });
    expect(state.rounds[0]).toMatchObject({ status: 'bullseye', endMs: 20_000 });
    expect(state.current).toBe(1);
    expect(state.rounds[1]).toMatchObject({ status: 'playing', startMs: 20_000 });
  });

  it('moves on after a skip, keeping the guesses', () => {
    let { state } = guess(started(), 'furniture', 4);
    state = skipRound(state, at(9));
    expect(state.rounds[0]).toMatchObject({ status: 'skipped', endMs: 9_000 });
    expect(state.rounds[0].guesses).toHaveLength(1);
    expect(state.rounds[1]).toMatchObject({ status: 'playing', startMs: 9_000 });
  });

  it('finishes the game after the last round', () => {
    let state = started();
    const winners = ['antique', 'kitten', 'journey', 'potato'];
    winners.forEach((word, i) => ({ state } = guess(state, word, 10 * (i + 1))));
    ({ state } = guess(state, 'queen', 61));
    expect(state.status).toBe('finished');
    expect(state.endedMs).toBe(61_000);
    expect(state.rounds.map((r) => r.status)).toEqual(Array(5).fill('bullseye'));
    expect(gameClock(state, at(140))).toBe(61_000);
  });

  it('does not mutate the previous state', () => {
    const before = started();
    const snapshot = structuredClone(before);
    guess(before, 'antique', 3);
    skipRound(before, at(4));
    expect(before).toEqual(snapshot);
  });
});

describe('the shared clock', () => {
  it("counts down from the level's 3 minutes", () => {
    const game = started();
    expect(timeLeftMs(game, at(0))).toBe(180_000);
    expect(timeLeftMs(game, at(179.5))).toBe(500);
    expect(gameClock(newGame(1, 'medium'), at(10))).toBe(0);
  });

  it('never runs backwards or past the end', () => {
    const game = started();
    expect(gameClock(game, at(-5))).toBe(0);
    expect(gameClock(game, at(400))).toBe(180_000);
  });

  it('times out the current round and leaves the rest unplayed', () => {
    let { state } = guess(started(), 'antique', 30);
    ({ state } = guess(state, 'cute', 40));
    state = syncClock(state, at(180));
    expect(state.status).toBe('finished');
    expect(state.endedMs).toBe(180_000);
    expect(state.rounds.map((r) => r.status)).toEqual([
      'bullseye',
      'timeout',
      'upcoming',
      'upcoming',
      'upcoming',
    ]);
  });

  it('refuses guesses once time is up, even without a tick', () => {
    const { state, outcome } = guess(started(), 'antique', 181);
    expect(outcome).toMatchObject({ kind: 'rejected', reason: 'not-playing' });
    expect(state.status).toBe('finished');
    expect(state.rounds[0].status).toBe('timeout');
  });

  it('leaves a running game alone while time remains', () => {
    const game = started();
    expect(syncClock(game, at(179))).toBe(game);
  });
});

describe('guess lists', () => {
  const make = (word: string, rank: number | null): Guess => ({
    word,
    rank,
    zone: 'cold',
    atMs: 0,
  });

  it('sorts closest first, then cold guesses newest first', () => {
    const guesses = [
      make('a', 300),
      make('b', null),
      make('c', 12),
      make('d', null),
      make('e', 300),
    ];
    expect(sortGuesses(guesses).map((g) => g.word)).toEqual(['c', 'e', 'a', 'd', 'b']);
  });

  it('picks the closest guess, earliest on ties', () => {
    const round = {
      status: 'playing' as const,
      startMs: 0,
      endMs: null,
      extraHints: 0,
      guesses: [make('a', 50), make('b', 50)],
    };
    expect(bestGuess(round)?.word).toBe('a');
    expect(bestGuess({ ...round, guesses: [] })).toBeNull();
  });
});
