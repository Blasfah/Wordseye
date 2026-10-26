import { formatClock } from '../game/share';
import { gameLength, timeLeft } from './state';

/** A thin bar that empties as the shared clock runs, warming in colour near the end. */
export function Timer() {
  const left = timeLeft.value;
  const fraction = left / gameLength.value;
  const mood = fraction > 0.5 ? 'calm' : fraction > 0.2 ? 'warm' : 'hot';
  const clock = formatClock(left);
  return (
    <div class="timer" role="timer" aria-label={`${clock} left`}>
      <div class="timer-track" aria-hidden="true">
        <div class="timer-fill" data-mood={mood} style={{ transform: `scaleX(${fraction})` }} />
      </div>
      <span class="timer-text" aria-hidden="true">
        {clock}
      </span>
    </div>
  );
}
