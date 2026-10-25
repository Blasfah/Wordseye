import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { CONFIG } from '../config';
import { addMonths, compareMonths, monthDays, monthOf, type Month } from '../game/calendar';
import { dateForDay, dayForDate } from '../game/daily';
import { gameTier, type GameRecord } from '../game/stats';
import { NavLinks } from './NavLinks';
import { Stats } from './Stats';
import { formatPuzzleDate } from './helpers';
import { hrefFor } from './route';
import { history, today } from './state';

const monthFormat = new Intl.DateTimeFormat('en-GB', { month: 'long', timeZone: 'UTC' });
const monthName = ({ year, month }: Month) =>
  monthFormat.format(new Date(Date.UTC(year, month - 1, 15)));

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

/** Every past puzzle, a month at a time. */
export function Calendar() {
  const todayNumber = today.value;
  const todayDate = dateForDay(todayNumber, CONFIG.firstPuzzleDate);
  const first = monthOf(CONFIG.firstPuzzleDate);
  const last = monthOf(todayDate);
  const [shown, setShown] = useState(last);

  const heading = useRef<HTMLHeadingElement>(null);
  useLayoutEffect(() => heading.current?.focus(), []);

  const records = new Map(history.value.map((r) => [r.puzzleNumber, r]));
  const pastDays = todayNumber - 1;
  const playedPast = history.value.filter((r) => r.puzzleNumber < todayNumber).length;
  const todayPlayed = records.has(todayNumber);
  const prev = addMonths(shown, -1);
  const next = addMonths(shown, 1);
  const weekdays = Array.from({ length: 7 }, (_, i) => WEEKDAYS[(i + CONFIG.weekStartsOn) % 7]);

  return (
    <section class="screen calendar" aria-labelledby="calendar-title">
      <p class="quiet">{CONFIG.name}</p>
      <h1 id="calendar-title" class="calendar-title" tabIndex={-1} ref={heading}>
        Past puzzles
      </h1>
      <p class="quiet">
        {pastDays === 0
          ? 'Today is the very first puzzle. Earlier ones will collect here.'
          : `You've played ${playedPast} of ${pastDays}. Pick any day to play it.`}
      </p>

      <div class="calendar-month">
        <div class="calendar-nav">
          <button
            type="button"
            class="calendar-step"
            hidden={compareMonths(prev, first) < 0}
            onClick={() => setShown(prev)}
          >
            <span aria-hidden="true">‹ </span>
            {monthName(prev)}
          </button>
          <h2 class="calendar-month-name" aria-live="polite">
            {monthName(shown)} {shown.year}
          </h2>
          <button
            type="button"
            class="calendar-step calendar-step-next"
            hidden={compareMonths(next, last) > 0}
            onClick={() => setShown(next)}
          >
            {monthName(next)}
            <span aria-hidden="true"> ›</span>
          </button>
        </div>

        <ol class="calendar-weekdays" aria-hidden="true">
          {weekdays.map((name) => (
            <li key={name}>{name[0]}</li>
          ))}
        </ol>
        <ol class="calendar-days">
          {monthDays(shown, CONFIG.weekStartsOn).map((date, i) =>
            date ? (
              <DayCell
                key={date}
                date={date}
                todayNumber={todayNumber}
                record={records.get(dayForDate(date, CONFIG.firstPuzzleDate))}
              />
            ) : (
              <li key={`pad-${i}`} aria-hidden="true" />
            ),
          )}
        </ol>

        <p class="calendar-legend" aria-hidden="true">
          {CONFIG.zones.map((zone) => (
            <span key={zone.id} data-zone={zone.id}>
              {zone.label}
            </span>
          ))}
        </p>
      </div>

      <a class="button button-primary" href={hrefFor({ view: 'today' }, location.pathname)}>
        {todayPlayed ? "See today's result" : "Play today's puzzle"}
      </a>

      <div class="calendar-stats">
        <Stats />
      </div>
      <NavLinks />
    </section>
  );
}

function DayCell({
  date,
  todayNumber,
  record,
}: {
  date: string;
  todayNumber: number;
  record: GameRecord | undefined;
}) {
  const day = dayForDate(date, CONFIG.firstPuzzleDate);
  const dayOfMonth = Number(date.slice(8));
  if (day < 1 || day > todayNumber) {
    return (
      <li class="calendar-day is-closed" aria-hidden={day < 1 || undefined}>
        <span>
          <span class="calendar-date">{dayOfMonth}</span>
          {day > todayNumber && <span class="visually-hidden">, not out yet</span>}
        </span>
      </li>
    );
  }

  const isToday = day === todayNumber;
  const state = record ? `played, ${record.score} points` : 'not played yet';
  const label = `Puzzle #${day}, ${formatPuzzleDate(date)}${isToday ? ', today' : ''}: ${state}`;
  const href = hrefFor(isToday ? { view: 'today' } : { view: 'day', day }, location.pathname);
  return (
    <li
      class="calendar-day"
      data-zone={record ? gameTier(record) : undefined}
      data-today={isToday || undefined}
    >
      <a href={href} aria-label={label}>
        <span class="calendar-date">{dayOfMonth}</span>
        {record && <span class="calendar-score">{record.score}</span>}
      </a>
    </li>
  );
}
