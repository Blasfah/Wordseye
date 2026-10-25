/** Which puzzle is today's, given a time zone for the midnight rollover. */

const DAY_MS = 86_400_000;

/** The calendar date at `date` in `timeZone`, as YYYY-MM-DD. */
export function dateKey(date: Date, timeZone: string): string {
  const format = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  const parts = Object.fromEntries(format.formatToParts(date).map((p) => [p.type, p.value]));
  return `${parts.year}-${parts.month}-${parts.day}`;
}

function keyToUtcDay(key: string): number {
  const [year, month, day] = key.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / DAY_MS;
}

/** 1 on `firstDate`, 2 the day after, and so on (never below 1). */
export function dayNumber(date: Date, timeZone: string, firstDate: string): number {
  return Math.max(1, keyToUtcDay(dateKey(date, timeZone)) - keyToUtcDay(firstDate) + 1);
}

/** The puzzle number for a calendar date (YYYY-MM-DD); below 1 before the first puzzle. */
export function dayForDate(date: string, firstDate: string): number {
  return keyToUtcDay(date) - keyToUtcDay(firstDate) + 1;
}

/** The calendar date (YYYY-MM-DD) of puzzle `day`, with `firstDate` as day 1. */
export function dateForDay(day: number, firstDate: string): string {
  return new Date((keyToUtcDay(firstDate) + day - 1) * DAY_MS).toISOString().slice(0, 10);
}

/** Which scheduled day (1-based) a puzzle uses; the schedule repeats if it runs out. */
export function scheduleSlot(day: number, scheduledDays: number): number {
  return ((((day - 1) % scheduledDays) + scheduledDays) % scheduledDays) + 1;
}

/** The first moment after `date` when the date in `timeZone` changes. */
export function nextRollover(date: Date, timeZone: string): Date {
  const today = dateKey(date, timeZone);
  let lo = date.getTime();
  let hi = lo + 2 * DAY_MS;
  while (hi - lo > 1000) {
    const mid = Math.floor((lo + hi) / 2);
    if (dateKey(new Date(mid), timeZone) === today) lo = mid;
    else hi = mid;
  }
  // The rollover is a whole second in (lo, hi], and that span holds only one.
  return new Date(Math.floor(hi / 1000) * 1000);
}
