/**
 * Every gameplay knob lives here: daily schedule, timer, zones and scoring.
 * The puzzle build script reads it too, so after changing `roundsPerGame` or
 * the last ranked zone's `maxRank`, run `npm run data:build` again.
 */

export const ZONES = [
  { id: 'bullseye', label: 'Bullseye', maxRank: 10, points: 100, emoji: '🟡' },
  { id: 'hot', label: 'Hot', maxRank: 100, points: 60, emoji: '🔴' },
  { id: 'warm', label: 'Warm', maxRank: 500, points: 30, emoji: '🟠' },
  { id: 'cool', label: 'Cool', maxRank: 2000, points: 10, emoji: '🟢' },
  // Anything ranked beyond the last zone, or not ranked at all.
  { id: 'cold', label: 'Cold', maxRank: null, points: 0, emoji: '🔵' },
] as const;

export type ZoneId = (typeof ZONES)[number]['id'];

export const CONFIG = {
  name: 'Wordseye',

  /** The day rolls over at local midnight in this IANA time zone. */
  timeZone: 'Europe/Amsterdam',
  /**
   * Calendar date (in `timeZone`) of puzzle #1. Set before launch day so the
   * calendar of past puzzles isn't empty when the game goes live.
   */
  firstPuzzleDate: '2026-10-01',
  /** First column of the calendar: 1 = Monday, 0 = Sunday. */
  weekStartsOn: 1,

  roundsPerGame: 5,
  /** One shared clock for the whole game. */
  gameSeconds: 150,

  zones: ZONES,

  /**
   * Extra points for a bullseye, on top of the zone points. Full bonus if the
   * round took at most `fullBonusSeconds`, fading linearly to nothing at
   * `noBonusSeconds`.
   */
  speedBonus: { maxPoints: 25, fullBonusSeconds: 8, noBonusSeconds: 45 },

  /** Share-text circle for a round the clock never reached. */
  unplayedEmoji: '⚪',

  /** Keyboard shortcut for skipping a round (a KeyboardEvent.key value). */
  skipKey: 'Escape',

  /** Bump the version suffix to discard everyone's saved games and stats. */
  storagePrefix: 'wordseye:v2',
} as const;

export type Config = typeof CONFIG;

/** Highest rank that still lands in a scored zone; also the neighbor-list length. */
export const RANKED_NEIGHBORS = Math.max(...ZONES.map((zone) => zone.maxRank ?? 0));
