import { CONFIG, RANKED_NEIGHBORS } from '../config';
import type { Puzzle, ZoneId } from '../game/types';
import { zoneInfo } from '../game/zones';
import type { Feedback } from './state';

export interface Message {
  text: string;
  /** Extra words for screen readers only, e.g. the next hint. */
  spoken?: string;
  zone?: ZoneId;
  celebrate?: boolean;
}

export function feedbackMessage(feedback: Feedback, puzzle: Puzzle): Message | null {
  if (feedback.kind === 'skipped') {
    const next = feedback.roundIndex + 1;
    return {
      text: `Skipped. Round ${next + 1}, fresh hint.`,
      spoken: `The hint is ${puzzle.rounds[next]?.hint}.`,
    };
  }

  const outcome = feedback.outcome;
  if (outcome.kind === 'rejected') {
    switch (outcome.reason) {
      case 'unknown':
        return { text: `“${outcome.word}” isn't in our word list. Try another?` };
      case 'not-a-word':
        return { text: 'Just one word, letters only.' };
      case 'hint':
        return { text: "That's the hint, or a form of it. Try a word near it." };
      case 'duplicate': {
        const earlier = outcome.earlier;
        const where = earlier
          ? ` It was ${zoneInfo(earlier.zone).label.toLowerCase()}, ${rankText(earlier.rank)}.`
          : '';
        return { text: `You already tried “${outcome.word}”.${where}` };
      }
      default:
        return null;
    }
  }

  const { guess, roundIndex } = outcome;
  if (outcome.bullseye) {
    const next = roundIndex + 1;
    const more = next < CONFIG.roundsPerGame;
    return {
      text: `Bullseye! “${guess.word}” is #${guess.rank}.${more ? ` On to round ${next + 1}.` : ''}`,
      spoken: more ? `The new hint is ${puzzle.rounds[next].hint}.` : undefined,
      zone: guess.zone,
      celebrate: true,
    };
  }
  const zone = zoneInfo(guess.zone).label.toLowerCase();
  const nudge = outcome.warmerZone && outcome.previousBest ? ' Getting warmer.' : '';
  return { text: `“${guess.word}” is ${zone}, ${rankText(guess.rank)}.${nudge}`, zone: guess.zone };
}

function rankText(rank: number | null): string {
  return rank === null ? `outside the top ${RANKED_NEIGHBORS}` : `#${rank}`;
}
