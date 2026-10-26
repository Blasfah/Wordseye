import { useLayoutEffect, useRef } from 'preact/hooks';
import { CONFIG } from '../config';
import { dateForDay } from '../game/daily';
import { levelInfo } from '../game/levels';
import { LEVEL_BLURB, LevelPicker } from './LevelPicker';
import { NavLinks } from './NavLinks';
import { Stats } from './Stats';
import { focusKeyboardProxy, formatPuzzleDate } from './helpers';
import { game, isPractice, level, start } from './state';

export function Start() {
  const button = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => button.current?.focus(), []);

  const begin = () => {
    focusKeyboardProxy();
    start();
  };

  const number = game.value.puzzleNumber;
  // The level just picked, so the text changes with the picker straight away.
  const { gameSeconds, extraHints } = levelInfo(level.value);
  return (
    <section class="screen start" aria-labelledby="start-title">
      <h1 id="start-title" class="wordmark">
        {CONFIG.name}
      </h1>
      <p class="quiet">
        {isPractice.value
          ? `Practice · puzzle #${number} · not saved`
          : `Puzzle #${number} · ${formatPuzzleDate(dateForDay(number, CONFIG.firstPuzzleDate))}`}
      </p>

      <LevelPicker />
      <p class="level-blurb quiet small">{LEVEL_BLURB[level.value]}</p>

      <div class="howto">
        <p>
          Each round shows a <strong>hint</strong>. A secret word is hiding close to it.
        </p>
        <p>Guess words near the secret. The closer you get, the warmer it reads.</p>
        <p>
          Land in the top {CONFIG.zones[0].maxRank} for a <strong>bullseye</strong> and you move
          straight on.
        </p>
        {extraHints > 0 && (
          <p>
            Stuck? An <strong>extra hint</strong> shows you another word near the secret, with its
            rank.
          </p>
        )}
      </div>

      <ZoneLegend />

      <button ref={button} type="button" class="button button-primary button-big" onClick={begin}>
        Start
      </button>
      <p class="quiet small">
        {CONFIG.roundsPerGame} rounds, one {formatMinutes(gameSeconds / 60)} clock. Skip a round any
        time with <kbd>Esc</kbd>.
      </p>

      <Stats level={level.value} />
      <NavLinks />
    </section>
  );
}

function ZoneLegend() {
  const zones = CONFIG.zones;
  return (
    <ul class="zone-legend" aria-label="How close each zone is">
      {zones.map((zone, i) => {
        const from = i === 0 ? 1 : (zones[i - 1].maxRank ?? 0) + 1;
        const range =
          zone.maxRank === null
            ? `${from}+`
            : i === 0
              ? `top ${zone.maxRank}`
              : `${from}–${zone.maxRank}`;
        return (
          <li key={zone.id} class="zone-chip" data-zone={zone.id}>
            <span class="zone-chip-label">{zone.label}</span>
            <span class="zone-chip-range">{range}</span>
          </li>
        );
      })}
    </ul>
  );
}

function formatMinutes(minutes: number): string {
  const whole = Math.floor(minutes);
  const half = minutes - whole === 0.5;
  if (minutes === whole) return `${whole}-minute`;
  return half ? `${whole}½-minute` : `${minutes.toFixed(1)}-minute`;
}
