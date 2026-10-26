import { sameFamily } from './stem';

export type GuessRejection =
  | 'empty'
  | 'not-a-word'
  | 'unknown'
  | 'hint'
  /** An extra hint word already shown this round. */
  | 'revealed'
  | 'duplicate';

/** Trim, lowercase and drop accents ("Café " → "cafe"). */
export function normalizeGuess(raw: string): string {
  return raw.trim().toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

export interface GuessContext {
  vocabulary: ReadonlySet<string>;
  hint: string;
  /** Words already guessed this round. */
  previous: Iterable<string>;
  /** Extra hint words revealed this round. */
  revealed?: Iterable<string>;
}

/** Why a normalized guess can't be played, or null if it's fine. */
export function checkGuess(
  word: string,
  { vocabulary, hint, previous, revealed = [] }: GuessContext,
): GuessRejection | null {
  if (word === '') return 'empty';
  if (!/^[a-z]+$/.test(word)) return 'not-a-word';
  if (!vocabulary.has(word)) return 'unknown';
  if (sameFamily(word, hint)) return 'hint';
  for (const shown of revealed) if (shown === word) return 'revealed';
  for (const earlier of previous) if (earlier === word) return 'duplicate';
  return null;
}
