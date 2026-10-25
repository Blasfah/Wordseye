/** Month grids for the calendar of past puzzles. */

export interface Month {
  year: number;
  /** 1–12 */
  month: number;
}

/** The month a YYYY-MM-DD date falls in. */
export function monthOf(date: string): Month {
  const [year, month] = date.split('-').map(Number);
  return { year, month };
}

export function addMonths({ year, month }: Month, delta: number): Month {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

export function compareMonths(a: Month, b: Month): number {
  return a.year - b.year || a.month - b.month;
}

/**
 * The month's dates (YYYY-MM-DD) laid out in weeks: null pads the first week
 * so each date sits under its weekday. `weekStartsOn`: 0 Sunday, 1 Monday.
 */
export function monthDays({ year, month }: Month, weekStartsOn: number): (string | null)[] {
  const first = new Date(Date.UTC(year, month - 1, 1));
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const lead = (first.getUTCDay() - weekStartsOn + 7) % 7;
  const pad = (n: number) => String(n).padStart(2, '0');
  return [
    ...Array<null>(lead).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => `${year}-${pad(month)}-${pad(i + 1)}`),
  ];
}
