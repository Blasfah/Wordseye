import { describe, expect, it } from 'vitest';
import { RANKED_NEIGHBORS } from '../config';
import { createPuzzleRound, rankOf, topWords } from './puzzle';
import { rankBands, zoneForRank, zoneInfo, zoneOrder } from './zones';

describe('zoneForRank', () => {
  it.each([
    [1, 'bullseye'],
    [10, 'bullseye'],
    [11, 'hot'],
    [100, 'hot'],
    [101, 'warm'],
    [500, 'warm'],
    [501, 'cool'],
    [2000, 'cool'],
    [2001, 'cold'],
    [null, 'cold'],
  ] as const)('rank %s is %s', (rank, zone) => {
    expect(zoneForRank(rank)).toBe(zone);
  });

  it('follows custom zone tables', () => {
    const zones = [
      { id: 'bullseye', label: 'B', maxRank: 3, points: 1, emoji: '' },
      { id: 'cold', label: 'C', maxRank: null, points: 0, emoji: '' },
    ] as const;
    expect(zoneForRank(3, zones)).toBe('bullseye');
    expect(zoneForRank(4, zones)).toBe('cold');
  });
});

describe('zone helpers', () => {
  it('orders zones from warmest to coldest', () => {
    expect(zoneOrder('bullseye')).toBeLessThan(zoneOrder('hot'));
    expect(zoneOrder('cool')).toBeLessThan(zoneOrder('cold'));
    expect(zoneInfo('warm').points).toBe(30);
  });

  it('ranks as many neighbors as the coldest scored zone reaches', () => {
    expect(RANKED_NEIGHBORS).toBe(2000);
  });
});

describe('puzzle rounds', () => {
  const round = createPuzzleRound('value', ['antique', 'antiques', 'furniture', 'antiques']);

  it('uses the first word as the target', () => {
    expect(round.target).toBe('antique');
    expect(rankOf(round, 'antique')).toBe(1);
  });

  it('looks up ranks, keeping the first occurrence', () => {
    expect(rankOf(round, 'antiques')).toBe(2);
    expect(rankOf(round, 'furniture')).toBe(3);
    expect(rankOf(round, 'pizza')).toBeNull();
  });

  it('gives every form of a word the same rank, and shows the first', () => {
    const forms = createPuzzleRound('value', ['bee bees', 'honey', 'hive hives', 'wax']);
    expect(forms.target).toBe('bee');
    expect(rankOf(forms, 'bees')).toBe(1);
    expect(rankOf(forms, 'hive')).toBe(3);
    expect(rankOf(forms, 'hives')).toBe(3);
    expect(topWords(forms, 3)).toEqual([
      { word: 'bee', rank: 1 },
      { word: 'honey', rank: 2 },
      { word: 'hive', rank: 3 },
    ]);
  });
});

describe('rankBands', () => {
  it('turns the ranked zones into rank ranges, leaving out cold', () => {
    expect(rankBands().map((b) => [b.zone.id, b.from, b.to])).toEqual([
      ['bullseye', 1, 10],
      ['hot', 11, 100],
      ['warm', 101, 500],
      ['cool', 501, 2000],
    ]);
  });
});

describe('topWords', () => {
  const round = createPuzzleRound('hint', ['a', 'b', 'c', 'b', 'd', 'e']);

  it('lists words with their ranks, closest first, up to the limit', () => {
    expect(topWords(round, 3)).toEqual([
      { word: 'a', rank: 1 },
      { word: 'b', rank: 2 },
      { word: 'c', rank: 3 },
    ]);
  });

  it('keeps true ranks when the source list had a duplicate', () => {
    expect(topWords(round, 10).map((w) => w.rank)).toEqual([1, 2, 3, 5, 6]);
  });
});
