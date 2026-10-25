import { describe, expect, it } from 'vitest';
import { addMonths, compareMonths, monthDays, monthOf } from './calendar';
import { dayForDate } from './daily';

describe('months', () => {
  it('reads the month of a date and steps across years', () => {
    expect(monthOf('2026-10-25')).toEqual({ year: 2026, month: 10 });
    expect(addMonths({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
    expect(addMonths({ year: 2027, month: 1 }, -1)).toEqual({ year: 2026, month: 12 });
    expect(addMonths({ year: 2026, month: 10 }, -14)).toEqual({ year: 2025, month: 8 });
  });

  it('orders months', () => {
    expect(compareMonths({ year: 2026, month: 10 }, { year: 2027, month: 1 })).toBeLessThan(0);
    expect(compareMonths({ year: 2026, month: 10 }, { year: 2026, month: 10 })).toBe(0);
  });
});

describe('monthDays', () => {
  it('pads the first week so dates line up under their weekday', () => {
    // 1 October 2026 is a Thursday.
    const monday = monthDays({ year: 2026, month: 10 }, 1);
    expect(monday.slice(0, 4)).toEqual([null, null, null, '2026-10-01']);
    expect(monday.filter(Boolean)).toHaveLength(31);
    expect(monday.at(-1)).toBe('2026-10-31');

    const sunday = monthDays({ year: 2026, month: 10 }, 0);
    expect(sunday.indexOf('2026-10-01')).toBe(4);
  });

  it('handles leap years', () => {
    expect(monthDays({ year: 2028, month: 2 }, 1).filter(Boolean)).toHaveLength(29);
    expect(monthDays({ year: 2027, month: 2 }, 1).filter(Boolean)).toHaveLength(28);
  });
});

describe('dayForDate', () => {
  it('numbers dates from the first puzzle', () => {
    expect(dayForDate('2026-10-01', '2026-10-01')).toBe(1);
    expect(dayForDate('2026-10-25', '2026-10-01')).toBe(25);
    expect(dayForDate('2026-09-30', '2026-10-01')).toBe(0);
  });
});
