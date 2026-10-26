import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { sortGuesses } from '../game/game';
import { topWords } from '../game/puzzle';
import type { RoundScore } from '../game/scoring';
import type { Guess, PuzzleRound, RankedWord } from '../game/types';
import { rankBands, zoneInfo } from '../game/zones';
import { cls, rankLabel } from './helpers';

interface Props {
  index: number;
  puzzleRound: PuzzleRound;
  score: RoundScore;
  guesses: readonly Guess[];
  /** Extra hint words revealed in this round. */
  revealed: readonly RankedWord[];
  onClose: () => void;
}

const BANDS = rankBands();
const LIMITS = BANDS.map((band) => band.to);
const LISTED_GUESSES = 8;

/** A pop-up in the round's colour showing the words that sat closest to its secret. */
export function WordsDialog({ index, puzzleRound, score, guesses, revealed, onClose }: Props) {
  const dialog = useRef<HTMLDialogElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const [limit, setLimit] = useState(LIMITS[0]);

  useLayoutEffect(() => {
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog.current?.showModal();
    return () => opener?.focus();
  }, []);

  // Any click outside the sheet closes it. That includes the backdrop and the
  // reserved scrollbar gutters at the window's edges, which the backdrop can't cover.
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      if (!(event.target instanceof Node) || !sheet.current?.contains(event.target)) {
        dialog.current?.close();
      }
    };
    window.addEventListener('click', onClick);
    return () => window.removeEventListener('click', onClick);
  }, []);

  const close = () => dialog.current?.close();
  const guessed = new Set(guesses.map((g) => g.word));
  const hinted = new Set(revealed.map((h) => h.word));
  const words = topWords(puzzleRound, limit);
  const found = words.filter((w) => guessed.has(w.word)).length;
  const sorted = sortGuesses(guesses);
  const extra = sorted.length - LISTED_GUESSES;

  return (
    <dialog
      ref={dialog}
      class="words-dialog"
      data-zone={score.zone ?? 'none'}
      aria-labelledby="words-title"
      onClose={onClose}
    >
      <div class="words-sheet" ref={sheet}>
        <header class="words-header">
          <div>
            <p class="words-eyebrow">
              Round {index + 1} · hint “{puzzleRound.hint}”
            </p>
            <h2 id="words-title" class="words-target">
              {puzzleRound.target}
            </h2>
          </div>
          <button type="button" class="words-close" onClick={close}>
            Close
          </button>
        </header>

        <div class="words-summary">
          {score.best ? (
            <p>
              Your closest: <strong>{score.best.word}</strong>,{' '}
              {zoneInfo(score.best.zone).label.toLowerCase()} {rankLabel(score.best.rank)}
            </p>
          ) : (
            <p>{score.zone ? 'No guesses this round.' : 'The clock ran out before this round.'}</p>
          )}
          {sorted.length > 1 && (
            <p class="words-guesses">
              You tried{' '}
              {sorted
                .slice(0, LISTED_GUESSES)
                .map((g) => `${g.word} ${rankLabel(g.rank)}`)
                .join(' · ')}
              {extra > 0 && ` and ${extra} more`}
            </p>
          )}
          {revealed.length > 0 && (
            <p class="words-guesses">
              Extra {revealed.length === 1 ? 'hint' : 'hints'}{' '}
              {revealed.map((h) => `${h.word} #${h.rank}`).join(' · ')}
            </p>
          )}
        </div>

        <div class="words-tabs" role="group" aria-label="How many words to show">
          <span class="words-tabs-label" aria-hidden="true">
            Top
          </span>
          {LIMITS.map((value) => (
            <button
              key={value}
              type="button"
              class="words-tab"
              aria-pressed={value === limit}
              onClick={() => setLimit(value)}
            >
              <span class="visually-hidden">Top </span>
              {value}
            </button>
          ))}
        </div>

        <div class="words-scroll" data-limit={limit}>
          {guesses.length > 0 && (
            <p class="words-found">
              {found === 0
                ? `None of your guesses made the top ${limit}.`
                : `${found} of your guesses ${found === 1 ? 'is' : 'are'} in here, highlighted.`}
            </p>
          )}
          {BANDS.filter((band) => band.from <= limit).map((band) => (
            <section key={band.zone.id} class="words-band">
              <h3 class="words-band-title" data-zone={band.zone.id}>
                <span class="words-band-dot" aria-hidden="true" />
                {band.zone.label}
                <span class="words-band-range">
                  {band.from}–{band.to}
                </span>
              </h3>
              <ol class="words-list">
                {words
                  .filter((w) => w.rank >= band.from && w.rank <= band.to)
                  .map(({ word, rank }) => (
                    <li
                      key={word}
                      class={cls(
                        'words-item',
                        guessed.has(word) && 'is-guessed',
                        hinted.has(word) && 'is-hinted',
                        rank === 1 && 'is-target',
                      )}
                    >
                      <span class="words-rank">{rank}</span>
                      <span class="words-word">{word}</span>
                      {guessed.has(word) && <span class="visually-hidden"> (your guess)</span>}
                      {hinted.has(word) && <span class="visually-hidden"> (extra hint)</span>}
                    </li>
                  ))}
              </ol>
            </section>
          ))}
        </div>
      </div>
    </dialog>
  );
}
