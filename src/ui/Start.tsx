import { useLayoutEffect, useRef } from 'preact/hooks';
import { CONFIG } from '../config';
import { dateForDay } from '../game/daily';
import { NavLinks } from './NavLinks';
import { Stats } from './Stats';
import { focusKeyboardProxy, formatPuzzleDate } from './helpers';
import { game, isPractice, start } from './state';

export function Start() {
  const button = useRef<HTMLButtonElement>(null);
  useLayoutEffect(() => button.current?.focus(), []);

  const begin = () => {
    focusKeyboardProxy();
    start();
  };

  const number = game.value.puzzleNumber;
  const minutes = CONFIG.gameSeconds / 60;
  return (
    <section class="screen start" aria-labelledby="start-title">
      <h1 id="start-title" class="wordmark">
        {CONFIG.name}
      </h1>
      <p class="quiet">
        {isPractice.value
          ? `Practice game #${number} · not saved`
          : `Puzzle #${number} · ${formatPuzzleDate(dateForDay(number, CONFIG.firstPuzzleDate))}`}
      </p>

      <div class="howto">
        <p>
          Each round shows a <strong>hint</strong>. A secret word is hiding close to it.
        </p>
        <p>Guess words near the secret. The closer you get, the warmer it reads.</p>
        <p>
          Land in the top {CONFIG.zones[0].maxRank} for a <strong>bullseye</strong> and you move
          straight on.
        </p>
      </div>

      <ZoneLegend />

      <button ref={button} type="button" class="button button-primary button-big" onClick={begin}>
        Start
      </button>
      <p class="quiet small">
        {CONFIG.roundsPerGame} rounds, one {formatMinutes(minutes)} clock. Skip a round any time
        with <kbd>Esc</kbd>.
      </p>

      <Stats />
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
