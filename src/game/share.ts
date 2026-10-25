import { CONFIG } from '../config';
import { scoreGame } from './scoring';
import type { GameState, Rules } from './types';
import { zoneInfo } from './zones';

/** 125000 → "2:05" */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
}

interface ShareOptions {
  name: string;
  unplayedEmoji: string;
}

/** Spoiler-free result: "Wordseye #42 · 380 pts", then a circle per round and the time. */
export function shareText(
  state: GameState,
  rules: Rules = CONFIG,
  { name, unplayedEmoji }: ShareOptions = CONFIG,
): string {
  const score = scoreGame(state, rules);
  const circles = score.rounds
    .map((round) => (round.zone ? zoneInfo(round.zone, rules.zones).emoji : unplayedEmoji))
    .join('');
  return `${name} #${state.puzzleNumber} · ${score.total} pts\n${circles} · ${formatClock(score.timeUsedMs)}`;
}
