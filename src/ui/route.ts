/**
 * Where the player is, read from the URL. Plain links move between views, so
 * the browser's back button and shared links just work.
 */
export type Route =
  | { view: 'today' }
  /** A past puzzle opened from the calendar: ?day=12 */
  | { view: 'day'; day: number }
  /** ?calendar */
  | { view: 'calendar' }
  /** ?practice */
  | { view: 'practice' };

export function readRoute(search: string): Route {
  const params = new URLSearchParams(search);
  if (params.has('practice')) return { view: 'practice' };
  if (params.has('calendar')) return { view: 'calendar' };
  const day = Number(params.get('day'));
  if (params.has('day') && Number.isInteger(day) && day >= 1) return { view: 'day', day };
  return { view: 'today' };
}

export function hrefFor(route: Route, pathname: string): string {
  switch (route.view) {
    case 'today':
      return pathname;
    case 'day':
      return `${pathname}?day=${route.day}`;
    case 'calendar':
      return `${pathname}?calendar`;
    case 'practice':
      return `${pathname}?practice`;
  }
}
