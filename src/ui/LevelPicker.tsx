import { LEVELS, type LevelId } from '../config';
import { levelInfo } from '../game/levels';
import { chooseLevel, dayProgress, game } from './state';

/** What each level is like, in one line. */
export const LEVEL_BLURB: Record<LevelId, string> = {
  easy: 'A close first hint, and 3 extra hints to spend over the game.',
  medium: 'A looser first hint, and 1 extra hint for the whole game.',
  hard: 'A vague first hint and no extras. Good luck.',
};

/** "5 min · 3 hints" */
export function levelSummary(id: LevelId): string {
  const { gameSeconds, extraHints } = levelInfo(id);
  const hints = extraHints === 0 ? 'no hints' : extraHints === 1 ? '1 hint' : `${extraHints} hints`;
  return `${gameSeconds / 60} min · ${hints}`;
}

/** The three levels of the puzzle in view, with how far you got on each. */
export function LevelPicker() {
  const current = game.value.level;
  const progress = dayProgress.value;
  return (
    <div class="level-picker" role="group" aria-label="Difficulty">
      {LEVELS.map(({ id, label }) => {
        const { status, score } = progress[id];
        const detail =
          status === 'finished'
            ? `Done · ${score ?? 0} pts`
            : status === 'playing'
              ? 'In progress'
              : levelSummary(id);
        return (
          <button
            key={id}
            type="button"
            class="level-option"
            data-level={id}
            data-done={status === 'finished' || undefined}
            aria-pressed={id === current}
            onClick={() => id !== current && void chooseLevel(id)}
          >
            <span class="level-name">{label}</span>
            <span class="level-detail">{detail}</span>
          </button>
        );
      })}
    </div>
  );
}
