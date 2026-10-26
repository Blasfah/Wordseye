/** Shared fixtures for the game logic tests. */
import { createPuzzleRound } from './puzzle';
import type { Puzzle } from './types';

function letters(n: number): string {
  let out = '';
  do {
    out = String.fromCharCode(97 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
}

/** A 2000-long neighbor list with `placed` words at exact ranks and filler elsewhere. */
export function neighborsFor(
  target: string,
  placed: Record<string, number>,
  size = 2000,
): string[] {
  const list = Array.from({ length: size }, (_, i) => `${target}${letters(i)}`);
  list[0] = target;
  for (const [word, rank] of Object.entries(placed)) list[rank - 1] = word;
  return list;
}

export const PUZZLE: Puzzle = {
  number: 42,
  level: 'medium',
  rounds: [
    createPuzzleRound(
      'value',
      neighborsFor('antique', {
        antiques: 2,
        heirloom: 10,
        vintage: 11,
        furniture: 100,
        auction: 101,
        dusty: 500,
        attic: 501,
        museum: 2000,
      }),
      ['furniture', 'auction', 'dusty'],
    ),
    createPuzzleRound('kitty', neighborsFor('kitten', { puppy: 3, cat: 6, cute: 50 }), ['cute']),
    createPuzzleRound('odyssey', neighborsFor('journey', { voyage: 3, trip: 4 })),
    createPuzzleRound('banana', neighborsFor('potato', { tomato: 3, soup: 40 })),
    createPuzzleRound('majesty', neighborsFor('king', { queen: 2, throne: 30 })),
  ],
};

const EXTRA_WORDS = [
  'value',
  'values',
  'valued',
  'valuable',
  'kitty',
  'kitties',
  'odyssey',
  'banana',
  'majesty',
];
const COLD_WORDS = ['cloud', 'pizza', 'ocean'];

export const VOCABULARY: ReadonlySet<string> = new Set([
  ...PUZZLE.rounds.flatMap((round) => [...round.ranks.keys()]),
  ...EXTRA_WORDS,
  ...COLD_WORDS,
]);

export const T0 = Date.UTC(2026, 9, 25, 12, 0, 0);
export const at = (seconds: number) => T0 + seconds * 1000;
