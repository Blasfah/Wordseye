import { CONFIG } from '../config';
import { bestGuess, gameDurationMs } from './game';
import { rulesFor } from './levels';
import type { GameState, Guess, RoundState, RoundStatus, Rules, ZoneId } from './types';
import { bullseyeZone, zoneInfo } from './zones';

export interface RoundScore {
  status: RoundStatus;
  best: Guess | null;
  /** Zone of the best guess; null if the round was never reached. */
  zone: ZoneId | null;
  zonePoints: number;
  speedBonus: number;
  total: number;
}

export interface GameScore {
  rounds: RoundScore[];
  total: number;
  bullseyes: number;
  /** Game clock used: the full duration if time ran out. */
  timeUsedMs: number;
}

/** Bonus for a bullseye that took `roundMs` to find. */
export function speedBonus(roundMs: number, rules: Pick<Rules, 'speedBonus'> = CONFIG): number {
  const { maxPoints, fullBonusSeconds, noBonusSeconds } = rules.speedBonus;
  const seconds = roundMs / 1000;
  if (seconds <= fullBonusSeconds) return maxPoints;
  if (seconds >= noBonusSeconds) return 0;
  const fraction = 1 - (seconds - fullBonusSeconds) / (noBonusSeconds - fullBonusSeconds);
  return Math.round(maxPoints * fraction);
}

export function scoreRound(
  round: RoundState,
  rules: Pick<Rules, 'zones' | 'speedBonus'> = CONFIG,
): RoundScore {
  const best = bestGuess(round);
  const reached = round.status !== 'upcoming';
  const zone = reached ? (best?.zone ?? rules.zones[rules.zones.length - 1].id) : null;
  const zonePoints = zone ? zoneInfo(zone, rules.zones).points : 0;
  const bonus =
    zone === bullseyeZone(rules.zones).id && round.startMs !== null && round.endMs !== null
      ? speedBonus(round.endMs - round.startMs, rules)
      : 0;
  return {
    status: round.status,
    best,
    zone,
    zonePoints,
    speedBonus: bonus,
    total: zonePoints + bonus,
  };
}

export function scoreGame(state: GameState, rules: Rules = rulesFor(state.level)): GameScore {
  const rounds = state.rounds.map((round) => scoreRound(round, rules));
  return {
    rounds,
    total: rounds.reduce((sum, r) => sum + r.total, 0),
    bullseyes: rounds.filter((r) => r.status === 'bullseye').length,
    timeUsedMs: Math.min(state.endedMs ?? gameDurationMs(rules), gameDurationMs(rules)),
  };
}
