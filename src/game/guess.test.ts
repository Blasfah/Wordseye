import { describe, expect, it } from 'vitest';
import { checkGuess, normalizeGuess } from './guess';
import { VOCABULARY } from './testing';

describe('normalizeGuess', () => {
  it('trims, lowercases and strips accents', () => {
    expect(normalizeGuess('  Antique ')).toBe('antique');
    expect(normalizeGuess('CAFÉ')).toBe('cafe');
    expect(normalizeGuess('\tnaïve\n')).toBe('naive');
  });
});

describe('checkGuess', () => {
  const context = { vocabulary: VOCABULARY, hint: 'value', previous: ['vintage'] };

  it('accepts a fresh vocabulary word', () => {
    expect(checkGuess('furniture', context)).toBeNull();
  });

  it('ignores empty input', () => {
    expect(checkGuess('', context)).toBe('empty');
  });

  it('wants a single word of letters', () => {
    expect(checkGuess('ice cream', context)).toBe('not-a-word');
    expect(checkGuess("rock'n'roll", context)).toBe('not-a-word');
    expect(checkGuess('route66', context)).toBe('not-a-word');
  });

  it('rejects words outside the vocabulary', () => {
    expect(checkGuess('zzyzx', context)).toBe('unknown');
  });

  it('rejects the hint and its obvious variants', () => {
    for (const word of ['value', 'values', 'valued', 'valuable']) {
      expect(checkGuess(word, context), word).toBe('hint');
    }
  });

  it('rejects a repeat within the round', () => {
    expect(checkGuess('vintage', context)).toBe('duplicate');
  });
});
