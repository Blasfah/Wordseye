import { RANKED_NEIGHBORS } from '../config';

/** Joins truthy class names. */
export function cls(...names: (string | false | null | undefined)[]): string {
  return names.filter(Boolean).join(' ');
}

export function rankLabel(rank: number | null): string {
  return rank === null ? `${RANKED_NEIGHBORS}+` : `#${rank}`;
}

/** 26_100_000 → "7h 15m" */
export function formatCountdown(ms: number): string {
  const minutes = Math.ceil(ms / 60_000);
  if (minutes <= 1) return 'under a minute';
  const hours = Math.floor(minutes / 60);
  return hours ? `${hours}h ${minutes % 60}m` : `${minutes}m`;
}

/**
 * On phones the keyboard only opens if an input is focused inside the tap
 * handler itself. Focus an invisible stand-in now; the real input takes focus
 * (and keeps the keyboard) as soon as it mounts.
 */
export function focusKeyboardProxy(): void {
  document.getElementById('keyboard-proxy')?.focus({ preventScroll: true });
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // Older browsers, or no permission: try the selection-based fallback.
  }
  try {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const copied = document.execCommand('copy');
    area.remove();
    return copied;
  } catch {
    return false;
  }
}

const puzzleDateFormat = new Intl.DateTimeFormat('en-GB', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  timeZone: 'UTC',
});

/** "2026-10-25" → "Sunday 25 October" */
export function formatPuzzleDate(date: string): string {
  return puzzleDateFormat.format(new Date(`${date}T12:00:00Z`));
}
