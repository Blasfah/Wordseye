import { CONFIG, LEVELS, type LevelId } from '../config';
import type { Rules } from './types';

export type { LevelId };

export const isLevelId = (value: unknown): value is LevelId =>
  LEVELS.some((level) => level.id === value);

export function levelInfo(id: LevelId) {
  return LEVELS.find((level) => level.id === id)!;
}

/** The rules a game on this level is played by. */
export function rulesFor(level: LevelId): Rules {
  const { gameSeconds, extraHints } = levelInfo(level);
  return {
    roundsPerGame: CONFIG.roundsPerGame,
    gameSeconds,
    extraHints,
    zones: CONFIG.zones,
    speedBonus: CONFIG.speedBonus,
  };
}

/** The next level up, or null from the top. */
export function harderLevel(id: LevelId): LevelId | null {
  const index = LEVELS.findIndex((level) => level.id === id);
  return LEVELS[index + 1]?.id ?? null;
}
