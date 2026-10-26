import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'preact/hooks';
import { CONFIG } from '../config';
import { nextRollover } from '../game/daily';
import { revealedHints } from '../game/game';
import { harderLevel, levelInfo } from '../game/levels';
import type { RoundScore } from '../game/scoring';
import { formatClock, shareText } from '../game/share';
import type { PuzzleRound } from '../game/types';
import { zoneInfo } from '../game/zones';
import { LevelPicker } from './LevelPicker';
import { NavLinks } from './NavLinks';
import { Stats } from './Stats';
import { WordsDialog } from './WordsDialog';
import { copyText, focusKeyboardProxy, formatCountdown, rankLabel } from './helpers';
import {
  chooseLevel,
  dayProgress,
  game,
  isPractice,
  load,
  playAnother,
  puzzle,
  route,
  score,
} from './state';

export function Results() {
  const state = game.value;
  const today = puzzle.value!;
  const result = score.value;
  const timedOut = state.rounds.some((r) => r.status === 'timeout');

  const practice = isPractice.value;
  // Nudge towards the next level up, if it's still to play.
  const next = harderLevel(state.level);
  const tryNext =
    !practice && next !== null && dayProgress.value[next].status !== 'finished' ? next : null;
  const [openRound, setOpenRound] = useState<number | null>(null);

  const heading = useRef<HTMLHeadingElement>(null);
  // In practice the "Play another" button takes focus instead, so Enter goes again.
  useLayoutEffect(() => {
    if (!practice) heading.current?.focus();
  }, [practice]);

  return (
    <section class="screen results" aria-labelledby="results-title">
      <p class="quiet">
        {practice ? 'Practice' : CONFIG.name} #{state.puzzleNumber} · {levelInfo(state.level).label}
      </p>
      <h1 id="results-title" class="score" tabIndex={-1} ref={heading}>
        <span class="score-number">{result.total}</span>
        <span class="score-unit">points</span>
      </h1>
      <p class="score-summary">
        {result.bullseyes} of {state.rounds.length} bullseyes ·{' '}
        {timedOut ? 'the clock ran out' : `done in ${formatClock(result.timeUsedMs)}`}
      </p>

      {practice && <PlayAnother />}
      {tryNext && (
        <button
          type="button"
          class="button button-primary button-big try-next"
          onClick={() => void chooseLevel(tryNext)}
        >
          Try {levelInfo(tryNext).label}
        </button>
      )}
      <ShareButton
        quiet={practice || tryNext !== null}
        text={shareText(state, undefined, {
          name: practice ? `${CONFIG.name} practice` : CONFIG.name,
          unplayedEmoji: CONFIG.unplayedEmoji,
        })}
      />

      <ol class="breakdown" aria-label="Your rounds">
        {result.rounds.map((round, i) => (
          <BreakdownRow
            key={i}
            index={i}
            round={round}
            puzzleRound={today.rounds[i]}
            onOpen={() => setOpenRound(i)}
          />
        ))}
      </ol>
      <p class="breakdown-tip quiet small">Tap a round to see the words around its secret.</p>

      {openRound !== null && (
        <WordsDialog
          index={openRound}
          puzzleRound={today.rounds[openRound]}
          score={result.rounds[openRound]}
          guesses={state.rounds[openRound].guesses}
          revealed={revealedHints(state.rounds[openRound], today.rounds[openRound].extras)}
          onClose={() => setOpenRound(null)}
        />
      )}

      <section class="results-levels" aria-labelledby="levels-title">
        <h2 id="levels-title" class="section-title">
          {practice ? 'Practise another level' : 'This puzzle on every level'}
        </h2>
        <LevelPicker />
      </section>

      <Stats level={state.level} />
      {route.value.view === 'today' && <NextPuzzle puzzleNumber={state.puzzleNumber} />}
      <NavLinks />
    </section>
  );
}

const STATUS_NOTE: Partial<Record<RoundScore['status'], string>> = {
  skipped: 'skipped',
  timeout: 'time ran out',
};

function BreakdownRow({
  index,
  round,
  puzzleRound,
  onOpen,
}: {
  index: number;
  round: RoundScore;
  puzzleRound: PuzzleRound;
  onOpen: () => void;
}) {
  const zone = round.zone ? zoneInfo(round.zone) : null;
  const closest = round.best
    ? `closest: ${round.best.word} ${rankLabel(round.best.rank)}`
    : round.zone
      ? 'no guesses'
      : 'not reached';
  const note = STATUS_NOTE[round.status];
  return (
    <li>
      <button
        type="button"
        class="breakdown-row"
        data-zone={round.zone ?? 'none'}
        onClick={onOpen}
        aria-haspopup="dialog"
      >
        <span class="breakdown-dot" aria-hidden="true" />
        <span class="breakdown-words">
          <span class="breakdown-target">
            <span class="visually-hidden">Round {index + 1}, the word was </span>
            {puzzleRound.target}
          </span>
          <span class="breakdown-detail">hint “{puzzleRound.hint}”</span>
          <span class="breakdown-detail">
            {closest}
            {note && ` · ${note}`}
          </span>
        </span>
        <span class="breakdown-points">
          <span class="breakdown-total">{round.total}</span>
          <span class="breakdown-zone">{zone ? zone.label : '—'}</span>
          {round.speedBonus > 0 && <span class="breakdown-zone">+{round.speedBonus} speed</span>}
        </span>
      </button>
    </li>
  );
}

function PlayAnother() {
  const button = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => button.current?.focus(), []);
  const next = () => {
    focusKeyboardProxy();
    void playAnother();
  };
  return (
    <button
      ref={button}
      type="button"
      class="button button-primary button-big play-another"
      onClick={next}
    >
      Play another
    </button>
  );
}

function ShareButton({ text, quiet }: { text: string; quiet: boolean }) {
  const [status, setStatus] = useState<'idle' | 'copied' | 'failed'>('idle');
  const share = async () => setStatus((await copyText(text)) ? 'copied' : 'failed');
  return (
    <div class="share">
      <button
        type="button"
        class={quiet ? 'button button-quiet' : 'button button-primary'}
        onClick={() => void share()}
      >
        Share result
      </button>
      <p class="share-status quiet small" aria-live="polite">
        {status === 'copied' && 'Copied. Paste it anywhere.'}
        {status === 'failed' && "Couldn't reach the clipboard. Copy this instead:"}
      </p>
      {status === 'failed' && <pre class="share-fallback">{text}</pre>}
    </div>
  );
}

function NextPuzzle({ puzzleNumber }: { puzzleNumber: number }) {
  const rollover = useMemo(() => nextRollover(new Date(), CONFIG.timeZone).getTime(), []);
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 15_000);
    return () => clearInterval(timer);
  }, []);

  if (now < rollover) {
    return <p class="next-puzzle quiet">Next puzzle in {formatCountdown(rollover - now)}</p>;
  }
  return (
    <div class="next-puzzle">
      <p>A new puzzle is ready.</p>
      <button type="button" class="button button-primary" onClick={() => void load()}>
        Play #{puzzleNumber + 1}
      </button>
    </div>
  );
}
