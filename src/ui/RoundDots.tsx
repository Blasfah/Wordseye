import type { RoundStatus } from '../game/types';
import { zoneInfo } from '../game/zones';
import { cls } from './helpers';
import { game, score } from './state';

const STATUS_TEXT: Record<RoundStatus, string> = {
  upcoming: 'not started',
  playing: 'in progress',
  bullseye: 'bullseye',
  skipped: 'skipped',
  timeout: 'out of time',
};

/** One soft circle per round, filled with the zone of its best guess once it's done. */
export function RoundDots({ justFinished }: { justFinished: number | null }) {
  const state = game.value;
  const rounds = score.value.rounds;
  return (
    <ol class="round-dots" aria-label="Rounds">
      {state.rounds.map((round, i) => {
        const done = round.status !== 'upcoming' && round.status !== 'playing';
        const zone = done ? rounds[i].zone : null;
        const detail =
          done && zone && round.status !== 'bullseye'
            ? `, best ${zoneInfo(zone).label.toLowerCase()}`
            : '';
        return (
          <li
            key={i}
            class={cls('dot', i === justFinished && 'is-new')}
            data-zone={zone ?? undefined}
            data-current={round.status === 'playing' ? '' : undefined}
          >
            <span class="visually-hidden">
              Round {i + 1}: {STATUS_TEXT[round.status]}
              {detail}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
