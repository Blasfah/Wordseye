import { stats } from './state';

export function Stats() {
  const { played, averageScore, bestScore, bullseyeRate } = stats.value;
  if (played === 0) return null;
  return (
    <section class="stats" aria-labelledby="stats-title">
      <h2 id="stats-title" class="section-title">
        Your stats
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
