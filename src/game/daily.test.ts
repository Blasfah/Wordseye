import { describe, expect, it } from 'vitest';
import { dateForDay, dateKey, dayNumber, nextRollover, scheduleSlot } from './daily';

const AMS = 'Europe/Amsterdam';

describe('dateKey', () => {
  it('uses the calendar date in the given time zone', () => {
    // 22:30 UTC on Oct 24 is already 00:30 on Oct 25 in Amsterdam (summer time).
    const instant = new Date('2026-10-24T22:30:00Z');
    expect(dateKey(instant, AMS)).toBe('2026-10-25');
    expect(dateKey(instant, 'UTC')).toBe('2026-10-24');
    expect(dateKey(instant, 'America/New_York')).toBe('2026-10-24');
  });
});

describe('dayNumber', () => {
  it('counts days from the first puzzle date', () => {
    expect(dayNumber(new Date('2026-10-25T10:00:00Z'), AMS, '2026-10-25')).toBe(1);
    expect(dayNumber(new Date('2026-10-26T10:00:00Z'), AMS, '2026-10-25')).toBe(2);
    expect(dayNumber(new Date('2027-10-25T10:00:00Z'), AMS, '2026-10-25')).toBe(366);
  });

  it('rolls over at local midnight, not UTC midnight', () => {
    expect(dayNumber(new Date('2026-10-25T22:59:59Z'), AMS, '2026-10-25')).toBe(1);
    expect(dayNumber(new Date('2026-10-25T23:00:00Z'), AMS, '2026-10-25')).toBe(2);
  });

  it('never goes below 1 for dates before the launch', () => {
    expect(dayNumber(new Date('2026-01-01T12:00:00Z'), AMS, '2026-10-25')).toBe(1);
  });
});

describe('scheduleSlot', () => {
  it('repeats the schedule once it runs out', () => {
    expect(scheduleSlot(1, 86)).toBe(1);
    expect(scheduleSlot(86, 86)).toBe(86);
    expect(scheduleSlot(87, 86)).toBe(1);
    expect(scheduleSlot(200, 86)).toBe(28);
  });
});

describe('nextRollover', () => {
  it('finds the next local midnight, across a daylight-saving change', () => {
    // Amsterdam leaves summer time early on Oct 25, so that midnight is 23:00 UTC.
    expect(nextRollover(new Date('2026-10-25T12:00:00Z'), AMS).toISOString()).toBe(
      '2026-10-25T23:00:00.000Z',
    );
    expect(nextRollover(new Date('2026-07-01T12:00:00Z'), AMS).toISOString()).toBe(
      '2026-07-01T22:00:00.000Z',
    );
  });

  it('works right before midnight', () => {
    expect(nextRollover(new Date('2026-07-01T21:59:59Z'), AMS).toISOString()).toBe(
      '2026-07-01T22:00:00.000Z',
    );
  });
});

describe('dateForDay', () => {
  it('counts calendar days from the first puzzle', () => {
    expect(dateForDay(1, '2026-10-01')).toBe('2026-10-01');
    expect(dateForDay(25, '2026-10-01')).toBe('2026-10-25');
    expect(dateForDay(32, '2026-10-01')).toBe('2026-11-01');
    expect(dateForDay(366, '2026-10-01')).toBe('2027-10-01');
  });

  it('round-trips with dayNumber across a daylight-saving change', () => {
    const date = dateForDay(26, '2026-10-01'); // 26 October, the day after the clocks change
    expect(dayNumber(new Date(`${date}T12:00:00Z`), AMS, '2026-10-01')).toBe(26);
  });
});
