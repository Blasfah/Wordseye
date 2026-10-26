import type { LevelId } from '../config';
import { levelInfo } from '../game/levels';
import { computeStats } from '../game/stats';
import { history } from './state';

/** Your stats on one level; nothing until you've finished a game on it. */
export function Stats({ level }: { level: LevelId }) {
  const { played, averageScore, bestScore, bullseyeRate } = computeStats(
    history.value.filter((r) => r.level === level),
  );
  if (played === 0) return null;
  const titleId = `stats-title-${level}`;
  return (
    <section class="stats" aria-labelledby={titleId}>
      <h2 id={titleId} class="section-title">
        Your {levelInfo(level).label} stats
      </h2>
      <dl class="stats-list">
        <Stat label="Played" value={played} />
        <Stat label="Average" value={averageScore} />
        <Stat label="Best" value={bestScore} />
        <Stat label="Bullseye rate" value={`${Math.round(bullseyeRate * 100)}%`} />
      </dl>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div class="stat">
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}
