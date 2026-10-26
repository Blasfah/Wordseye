/**
 * Where the player is, read from the URL. Plain links move between views, so
 * the browser's back button and shared links just work. A level in the URL
 * (?level=hard) picks the day's puzzle on that level; without one, the level
 * last played on this device is used.
 */
import type { LevelId } from '../config';
import { isLevelId } from '../game/levels';

export type Route =
  | { view: 'today'; level?: LevelId }
  /** A past puzzle opened from the calendar: ?day=12 */
  | { view: 'day'; day: number; level?: LevelId }
  /** ?calendar */
  | { view: 'calendar' }
  /** ?practice */
  | { view: 'practice'; level?: LevelId };

export function readRoute(search: string): Route {
  const params = new URLSearchParams(search);
  const levelParam = params.get('level');
  const level = isLevelId(levelParam) ? { level: levelParam } : {};
  if (params.has('practice')) return { view: 'practice', ...level };
  if (params.has('calendar')) return { view: 'calendar' };
  const day = Number(params.get('day'));
  if (params.has('day') && Number.isInteger(day) && day >= 1) return { view: 'day', day, ...level };
  return { view: 'today', ...level };
}

export function hrefFor(route: Route, pathname: string): string {
  const params: string[] = [];
  if (route.view === 'practice') params.push('practice');
  if (route.view === 'calendar') params.push('calendar');
  if (route.view === 'day') params.push(`day=${route.day}`);
  if (route.view !== 'calendar' && route.level) params.push(`level=${route.level}`);
  return params.length ? `${pathname}?${params.join('&')}` : pathname;
}
