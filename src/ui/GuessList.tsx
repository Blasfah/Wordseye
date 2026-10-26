import { sortGuesses } from '../game/game';
import type { Guess, RankedWord } from '../game/types';
import { zoneForRank, zoneInfo } from '../game/zones';
import { cls, rankLabel } from './helpers';

interface Props {
  guesses: readonly Guess[];
  /** Extra hint words revealed this round: shown among the guesses, marked as hints. */
  hints: readonly RankedWord[];
  roundIndex: number;
  latest: Guess | null;
  /** The latest guess reached a warmer zone: give it a little pop. */
  warmer: boolean;
}

type Item = { kind: 'guess'; guess: Guess } | { kind: 'hint'; hint: RankedWord };

const rankOf = (item: Item) =>
  item.kind === 'hint' ? item.hint.rank : (item.guess.rank ?? Infinity);

/** Guesses (closest first) with any hint words slotted in by rank. */
function merge(guesses: readonly Guess[], hints: readonly RankedWord[]): Item[] {
  const items: Item[] = sortGuesses(guesses).map((guess) => ({ kind: 'guess', guess }));
  for (const hint of [...hints].sort((a, b) => a.rank - b.rank)) {
    const at = items.findIndex((item) => rankOf(item) > hint.rank);
    items.splice(at < 0 ? items.length : at, 0, { kind: 'hint', hint });
  }
  return items;
}

export function GuessList({ guesses, hints, roundIndex, latest, warmer }: Props) {
  if (guesses.length === 0 && hints.length === 0) {
    return <p class="guess-empty quiet">Your guesses gather here, closest on top.</p>;
  }
  return (
    <ol class="guess-list" aria-label="Your guesses, closest first">
      {merge(guesses, hints).map((item) => {
        if (item.kind === 'hint') {
          const { word, rank } = item.hint;
          return (
            <li
              key={`${roundIndex}:hint:${word}`}
              class="guess-pill is-hint"
              data-zone={zoneForRank(rank)}
            >
              <span class="guess-word">{word}</span>
              <span class="guess-meta">
                <span class="guess-zone">Extra hint</span>
                <span class="guess-rank">{rankLabel(rank)}</span>
              </span>
            </li>
          );
        }
        const { guess } = item;
        const isLatest = guess === latest;
        return (
          <li
            // Keyed per round, so a word reused in a later round still eases in.
            key={`${roundIndex}:${guess.word}`}
            class={cls('guess-pill', isLatest && 'is-latest', isLatest && warmer && 'is-warmer')}
            data-zone={guess.zone}
          >
            <span class="guess-word">{guess.word}</span>
            <span class="guess-meta">
              <span class="guess-zone">{zoneInfo(guess.zone).label}</span>
              <span class="guess-rank">{rankLabel(guess.rank)}</span>
            </span>
          </li>
        );
      })}
    </ol>
  );
}
