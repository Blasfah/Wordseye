import { CONFIG } from '../config';
import { rulesFor } from './levels';
import { scoreGame } from './scoring';
import type { GameState, LevelId, Rules, ZoneId } from './types';

/** What we keep about a finished game in the stats history. */
export interface GameRecord {
  puzzleNumber: number;
  level: LevelId;
  score: number;
  bullseyes: number;
  rounds: number;
  timeUsedMs: number;
  zones: (ZoneId | null)[];
}

export interface Stats {
  played: number;
  averageScore: number;
  bestScore: number;
  /** Share of all rounds played that ended in a bullseye, 0–1. */
  bullseyeRate: number;
}

export function toRecord(state: GameState, rules: Rules = rulesFor(state.level)): GameRecord {
  const score = scoreGame(state, rules);
  return {
    puzzleNumber: state.puzzleNumber,
    level: state.level,
    score: score.total,
    bullseyes: score.bullseyes,
    rounds: state.rounds.length,
    timeUsedMs: score.timeUsedMs,
    zones: score.rounds.map((r) => r.zone),
  };
}

/** Adds a record, replacing any earlier one for the same puzzle and level. */
export function addRecord(history: readonly GameRecord[], record: GameRecord): GameRecord[] {
  const same = (r: GameRecord) =>
    r.puzzleNumber === record.puzzleNumber && r.level === record.level;
  return [...history.filter((r) => !same(r)), record].sort(
    (a, b) => a.puzzleNumber - b.puzzleNumber,
  );
}

export function computeStats(history: readonly GameRecord[]): Stats {
  const played = history.length;
  if (played === 0) return { played: 0, averageScore: 0, bestScore: 0, bullseyeRate: 0 };
  const totalScore = history.reduce((sum, r) => sum + r.score, 0);
  const rounds = history.reduce((sum, r) => sum + r.rounds, 0);
  const bullseyes = history.reduce((sum, r) => sum + r.bullseyes, 0);
  return {
    played,
    averageScore: Math.round(totalScore / played),
    bestScore: Math.max(...history.map((r) => r.score)),
    bullseyeRate: rounds ? bullseyes / rounds : 0,
  };
}

/**
 * A zone that sums up a whole game, for colouring it in the calendar: the
 * average points per round, measured against the midpoints between zones.
 */
export function gameTier(record: GameRecord, rules: Pick<Rules, 'zones'> = CONFIG): ZoneId {
  const average = record.score / Math.max(1, record.rounds);
  const zones = rules.zones;
  for (let i = 0; i < zones.length - 1; i++) {
    if (average >= (zones[i].points + zones[i + 1].points) / 2) return zones[i].id;
  }
  return zones[zones.length - 1].id;
}
