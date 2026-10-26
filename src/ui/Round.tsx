import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import { CONFIG } from '../config';
import { revealedHints } from '../game/game';
import { levelInfo } from '../game/levels';
import { GuessList } from './GuessList';
import { RoundDots } from './RoundDots';
import { Timer } from './Timer';
import { feedbackMessage } from './messages';
import {
  feedback,
  game,
  guess,
  hintsLeft,
  isPractice,
  puzzle,
  revealExtraHint,
  skip,
} from './state';

export function Round() {
  const state = game.value;
  const today = puzzle.value!;
  const index = state.current;
  const round = state.rounds[index];
  const { hint, extras } = today.rounds[index];
  const level = levelInfo(state.level);
  const revealed = revealedHints(round, extras);
  const left = hintsLeft.value;
  const canReveal = left > 0 && revealed.length < extras.length;

  const latestFeedback = feedback.value;
  const message = latestFeedback ? feedbackMessage(latestFeedback, today) : null;
  const accepted =
    latestFeedback?.kind === 'outcome' && latestFeedback.outcome.kind === 'accepted'
      ? latestFeedback.outcome
      : null;
  const latest = round.guesses.at(-1) ?? null;
  const justFinished = accepted?.bullseye
    ? accepted.roundIndex
    : latestFeedback?.kind === 'skipped'
      ? latestFeedback.roundIndex
      : null;

  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState('');

  const onSkip = useCallback(() => {
    skip();
    setText('');
    input.current?.focus();
  }, []);

  const onHint = () => {
    revealExtraHint();
    input.current?.focus();
  };

  useLayoutEffect(() => input.current?.focus(), []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === CONFIG.skipKey) {
        event.preventDefault();
        if (!event.repeat) onSkip();
        return;
      }
      // Typing anywhere goes into the guess box.
      const typing = event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
      if (typing && document.activeElement !== input.current) input.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onSkip]);

  function onSubmit(event: Event) {
    event.preventDefault();
    const outcome = guess(text);
    if (!outcome) return;
    // Keep a typo around so it can be fixed; clear everything else.
    if (
      outcome.kind === 'rejected' &&
      (outcome.reason === 'unknown' || outcome.reason === 'not-a-word')
    ) {
      input.current?.select();
    } else {
      setText('');
    }
  }

  return (
    <section class="screen round" aria-label={`Round ${index + 1} of ${state.rounds.length}`}>
      <div class="round-top">
        <div class="round-bar">
          <RoundDots justFinished={justFinished} />
          <Timer />
        </div>

        <div class="hint-block">
          {message?.celebrate && (
            <span key={`bloom-${latestFeedback!.id}`} class="bloom" aria-hidden="true" />
          )}
          <p class="hint-label">
            Round {index + 1} of {state.rounds.length} · {level.label}
            {isPractice.value && ' practice'}
          </p>
          <p
            key={`hint-${index}`}
            class={message?.celebrate ? 'hint-word is-fresh is-celebrated' : 'hint-word is-fresh'}
            style={`--chars: ${hint.length}`}
          >
            {hint}
          </p>
        </div>

        <form class="guess-form" onSubmit={onSubmit} autocomplete="off">
          <div class="guess-field">
            <label class="visually-hidden" for="guess-input">
              A word near the hint {hint}
            </label>
            <input
              ref={input}
              id="guess-input"
              class="guess-input"
              value={text}
              onInput={(event) => setText(event.currentTarget.value)}
              placeholder="a nearby word"
              autocomplete="off"
              autocapitalize="none"
              autocorrect="off"
              spellcheck={false}
              enterkeyhint="go"
              maxLength={40}
            />
            <button type="submit" class="guess-submit">
              Guess
            </button>
          </div>
        </form>

        <p class="feedback" aria-live="polite" data-zone={message?.zone}>
          {message && (
            <span key={latestFeedback!.id} class="feedback-text">
              {message.text}
              {message.spoken && <span class="visually-hidden"> {message.spoken}</span>}
            </span>
          )}
        </p>

        <div class="round-actions">
          <button
            type="button"
            class="button button-quiet"
            onClick={onSkip}
            aria-keyshortcuts={CONFIG.skipKey}
          >
            Skip round <kbd>{CONFIG.skipKey === 'Escape' ? 'Esc' : CONFIG.skipKey}</kbd>
          </button>
          {level.extraHints > 0 && (
            <button
              type="button"
              class="button button-quiet extra-hint-button"
              onClick={onHint}
              disabled={!canReveal}
            >
              Extra hint <span class="hint-count">{left} left</span>
            </button>
          )}
        </div>
      </div>

      <GuessList
        guesses={round.guesses}
        hints={revealed}
        roundIndex={index}
        latest={latest}
        warmer={!!accepted && accepted.guess === latest && accepted.warmerZone}
      />
    </section>
  );
}
