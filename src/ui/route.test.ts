import { describe, expect, it } from 'vitest';
import { appRoot, hrefFor, matchRoute, readRoute, type Route } from './route';

describe('routes', () => {
  const root = '/Wordseye/';
  const cases: [string, Route][] = [
    ['', { view: 'today' }],
    ['hard', { view: 'today', level: 'hard' }],
    ['12', { view: 'day', day: 12 }],
    ['12-easy', { view: 'day', day: 12, level: 'easy' }],
    ['calendar', { view: 'calendar' }],
    ['practice', { view: 'practice' }],
    ['practice-medium', { view: 'practice', level: 'medium' }],
  ];

  it.each(cases)('reads and writes "%s"', (segment, route) => {
    expect(readRoute(root + segment)).toEqual(route);
    expect(hrefFor(route, root)).toBe(root + segment);
  });

  it('still reads the old ?query addresses', () => {
    expect(readRoute(root, '?day=12&level=easy')).toEqual({ view: 'day', day: 12, level: 'easy' });
    expect(readRoute(root, '?calendar')).toEqual({ view: 'calendar' });
    expect(readRoute(root, '?level=hard')).toEqual({ view: 'today', level: 'hard' });
    expect(readRoute(root, '?practice')).toEqual({ view: 'practice' });
    expect(readRoute(root, '?level=extreme')).toEqual({ view: 'today' });
    for (const search of ['?day=', '?day=0', '?day=-3', '?day=2.5', '?day=abc']) {
      expect(readRoute(root, search), search).toEqual({ view: 'today' });
    }
  });

  it("knows what isn't one of its addresses", () => {
    expect(matchRoute(`${root}favicon.svg`)).toBeNull();
    expect(matchRoute(`${root}12-extreme`)).toBeNull();
    expect(matchRoute(`${root}0`)).toBeNull();
    expect(readRoute(`${root}nonsense`)).toEqual({ view: 'today' });
  });

  it("finds the game's folder from any of its views", () => {
    expect(appRoot('/Wordseye/')).toBe('/Wordseye/');
    expect(appRoot('/Wordseye/hard')).toBe('/Wordseye/');
    expect(appRoot('/Wordseye/12-easy')).toBe('/Wordseye/');
    expect(appRoot('/Wordseye/index.html')).toBe('/Wordseye/');
    expect(appRoot('/Wordseye')).toBe('/Wordseye/');
    expect(appRoot('/')).toBe('/');
    expect(appRoot('/calendar')).toBe('/');
  });
});
