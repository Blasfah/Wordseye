/**
 * Where the player is, read from the URL. Each view is one path segment below
 * the game's folder, so relative asset and data paths work from all of them:
 *
 *   ./           today's puzzle, on the level last played here
 *   ./hard       today's puzzle on a level
 *   ./12         puzzle #12 (./12-easy on a level)
 *   ./calendar   every past day
 *   ./practice   past puzzles back to back (./practice-hard on a level)
 *
 * Links are plain links, which the game follows without reloading the page
 * (see navigate in state.ts), so the back button and shared links just work.
 * Addresses from before, like ?day=12&level=easy, still work too.
 */
import type { LevelId } from '../config';
import { isLevelId } from '../game/levels';

export type Route =
  | { view: 'today'; level?: LevelId }
  /** A past puzzle opened from the calendar. */
  | { view: 'day'; day: number; level?: LevelId }
  | { view: 'calendar' }
  | { view: 'practice'; level?: LevelId };

/** The route a path segment names, or null if it isn't one. */
function routeFromSegment(segment: string): Route | null {
  if (segment === '') return { view: 'today' };
  if (segment === 'calendar') return { view: 'calendar' };
  if (isLevelId(segment)) return { view: 'today', level: segment };
  const match = /^(practice|\d+)(?:-(\w+))?$/.exec(segment);
  if (!match) return null;
  const [, view, levelName] = match;
  if (levelName !== undefined && !isLevelId(levelName)) return null;
  const level = levelName === undefined ? {} : { level: levelName };
  if (view === 'practice') return { view: 'practice', ...level };
  const day = Number(view);
  return day >= 1 ? { view: 'day', day, ...level } : null;
}

/** Addresses from before views had paths: ?calendar, ?practice, ?day=12, ?level=hard. */
function routeFromQuery(search: string): Route | null {
  const params = new URLSearchParams(search);
  const levelParam = params.get('level');
  const level = isLevelId(levelParam) ? { level: levelParam } : {};
  if (params.has('practice')) return { view: 'practice', ...level };
  if (params.has('calendar')) return { view: 'calendar' };
  const day = Number(params.get('day'));
  if (params.has('day') && Number.isInteger(day) && day >= 1) return { view: 'day', day, ...level };
  return params.has('level') ? { view: 'today', ...level } : null;
}

const lastSegment = (pathname: string) => pathname.slice(pathname.lastIndexOf('/') + 1);

/** The route an address names, or null if it isn't one of the game's. */
export function matchRoute(pathname: string, search = ''): Route | null {
  return routeFromQuery(search) ?? routeFromSegment(lastSegment(pathname));
}

/** The route an address names; anything unknown shows today's puzzle. */
export function readRoute(pathname: string, search = ''): Route {
  return matchRoute(pathname, search) ?? { view: 'today' };
}

/**
 * The game's folder, "/Wordseye/" on GitHub Pages: the path minus its view.
 * A path whose last part is a folder name without the trailing slash keeps it.
 */
export function appRoot(pathname: string): string {
  const last = lastSegment(pathname);
  const folder = pathname.slice(0, pathname.length - last.length);
  return routeFromSegment(last) || last.includes('.') ? folder : `${pathname}/`;
}

export function hrefFor(route: Route, root: string): string {
  const level = 'level' in route && route.level ? route.level : null;
  switch (route.view) {
    case 'today':
      return root + (level ?? '');
    case 'calendar':
      return `${root}calendar`;
    case 'practice':
      return `${root}practice${level ? `-${level}` : ''}`;
    case 'day':
      return `${root}${route.day}${level ? `-${level}` : ''}`;
  }
}
