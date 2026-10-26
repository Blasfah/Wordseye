import { LEVELS, type LevelId } from '../config';
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

/** Every level's stats in one board, for the calendar; nothing until a game is finished. */
export function StatsBoard() {
  const rows = LEVELS.map(({ id, label }) => ({
    id,
    label,
    stats: computeStats(history.value.filter((r) => r.level === id)),
  }));
  if (rows.every((row) => row.stats.played === 0)) return null;
  return (
    <section class="stats-board" aria-labelledby="stats-board-title">
      <h2 id="stats-board-title" class="section-title">
        Your stats
      </h2>
      <table class="stats-table">
        <thead>
          <tr>
            <td />
            <th scope="col">Played</th>
            <th scope="col">Average</th>
            <th scope="col">Best</th>
            <th scope="col">Bullseyes</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(({ id, label, stats }) => {
            const none = stats.played === 0;
            const rate = Math.round(stats.bullseyeRate * 100);
            return (
              <tr key={id} data-level={id} data-empty={none || undefined}>
                <th scope="row">
                  <span class="stats-level">{label}</span>
                </th>
                <td>{stats.played}</td>
                <td>{none ? '–' : stats.averageScore}</td>
                <td>{none ? '–' : stats.bestScore}</td>
                <td>
                  {none ? '–' : `${rate}%`}
                  {!none && (
                    <span class="stats-meter" aria-hidden="true">
                      <span style={{ width: `${rate}%` }} />
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p class="stats-note quiet small">Bullseyes: the share of rounds you landed in the top 10.</p>
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
