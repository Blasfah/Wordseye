/**
 * Picks the next practice game (1-based): random, but never one already played this
 * cycle and never one in `avoid` (the game just shown). Once
 * everything has been played, a fresh cycle starts.
 */
export function pickPracticePuzzle(
  count: number,
  played: readonly number[],
  avoid: readonly number[],
  random: () => number = Math.random,
): { index: number; played: number[] } {
  const all = Array.from({ length: count }, (_, i) => i + 1);
  // The puzzles may have been rebuilt with fewer games since.
  let history = played.filter((n) => n >= 1 && n <= count);
  const skip = new Set([...history, ...avoid]);
  let pool = all.filter((n) => !skip.has(n));

  if (pool.length === 0) {
    history = [];
    pool = all.filter((n) => !avoid.includes(n));
    if (pool.length === 0) pool = all;
  }

  const index = pool[Math.floor(random() * pool.length)];
  return { index, played: [...history, index] };
}
