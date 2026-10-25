import { sortGuesses } from '../game/game';
import type { Guess } from '../game/types';
import { zoneInfo } from '../game/zones';
import { cls, rankLabel } from './helpers';

interface Props {
  guesses: readonly Guess[];
  roundIndex: number;
  latest: Guess | null;
  /** The latest guess reached a warmer zone: give it a little pop. */
  warmer: boolean;
}

export function GuessList({ guesses, roundIndex, latest, warmer }: Props) {
  if (guesses.length === 0) {
    return <p class="guess-empty quiet">Your guesses gather here, closest on top.</p>;
  }
  return (
    <ol class="guess-list" aria-label="Your guesses, closest first">
      {sortGuesses(guesses).map((guess) => {
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
