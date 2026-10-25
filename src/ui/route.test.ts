import { describe, expect, it } from 'vitest';
import { hrefFor, readRoute, type Route } from './route';

describe('readRoute', () => {
  it('reads each view from the query string', () => {
    expect(readRoute('')).toEqual({ view: 'today' });
    expect(readRoute('?practice')).toEqual({ view: 'practice' });
    expect(readRoute('?calendar')).toEqual({ view: 'calendar' });
    expect(readRoute('?day=12')).toEqual({ view: 'day', day: 12 });
  });

  it('falls back to today for a bad day number', () => {
    for (const search of ['?day=', '?day=0', '?day=-3', '?day=2.5', '?day=abc']) {
      expect(readRoute(search), search).toEqual({ view: 'today' });
    }
  });
});

describe('hrefFor', () => {
  it('builds links that read back as the same route', () => {
    const routes: Route[] = [
      { view: 'today' },
      { view: 'day', day: 7 },
      { view: 'calendar' },
      { view: 'practice' },
    ];
    for (const route of routes) {
      const href = hrefFor(route, '/wordseye/');
      expect(href.startsWith('/wordseye/')).toBe(true);
      expect(readRoute(href.slice('/wordseye/'.length))).toEqual(route);
    }
  });
});
