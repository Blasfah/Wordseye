import { describe, expect, it } from 'vitest';
import { familyKey, porterStem, sameFamily } from './stem';

describe('porterStem', () => {
  // Examples from Porter's 1980 paper, grouped by the step they exercise.
  const cases: [string, string][] = [
    ['caresses', 'caress'],
    ['ponies', 'poni'],
    ['ties', 'ti'],
    ['caress', 'caress'],
    ['cats', 'cat'],
    ['feed', 'feed'],
    ['agreed', 'agre'],
    ['plastered', 'plaster'],
    ['bled', 'bled'],
    ['motoring', 'motor'],
    ['sing', 'sing'],
    ['conflated', 'conflat'],
    ['troubled', 'troubl'],
    ['sized', 'size'],
    ['hopping', 'hop'],
    ['tanned', 'tan'],
    ['falling', 'fall'],
    ['hissing', 'hiss'],
    ['fizzed', 'fizz'],
    ['failing', 'fail'],
    ['filing', 'file'],
    ['happy', 'happi'],
    ['sky', 'sky'],
    ['relational', 'relat'],
    ['conditional', 'condit'],
    ['rational', 'ration'],
    ['digitizer', 'digit'],
    ['operator', 'oper'],
    ['feudalism', 'feudal'],
    ['decisiveness', 'decis'],
    ['hopefulness', 'hope'],
    ['callousness', 'callous'],
    ['formaliti', 'formal'],
    ['sensitiviti', 'sensit'],
    ['sensibiliti', 'sensibl'],
    ['triplicate', 'triplic'],
    ['formative', 'form'],
    ['formalize', 'formal'],
    ['electriciti', 'electr'],
    ['electrical', 'electr'],
    ['hopeful', 'hope'],
    ['goodness', 'good'],
    ['revival', 'reviv'],
    ['allowance', 'allow'],
    ['inference', 'infer'],
    ['airliner', 'airlin'],
    ['gyroscopic', 'gyroscop'],
    ['adjustable', 'adjust'],
    ['defensible', 'defens'],
    ['irritant', 'irrit'],
    ['replacement', 'replac'],
    ['adjustment', 'adjust'],
    ['dependent', 'depend'],
    ['adoption', 'adopt'],
    ['homologous', 'homolog'],
    ['communism', 'commun'],
    ['activate', 'activ'],
    ['angulariti', 'angular'],
    ['effective', 'effect'],
    ['bowdlerize', 'bowdler'],
    ['probate', 'probat'],
    ['rate', 'rate'],
    ['cease', 'ceas'],
    ['controll', 'control'],
    ['roll', 'roll'],
  ];

  it.each(cases)('%s → %s', (word, stem) => {
    expect(porterStem(word)).toBe(stem);
  });

  it('leaves very short words alone', () => {
    expect(porterStem('is')).toBe('is');
    expect(porterStem('a')).toBe('a');
  });
});

describe('sameFamily', () => {
  it('groups obvious variants of a word', () => {
    for (const variant of ['values', 'valued', 'valuable', 'valuables', 'valuing']) {
      expect(sameFamily('value', variant), variant).toBe(true);
    }
    expect(sameFamily('art', 'artist')).toBe(true);
    expect(sameFamily('care', 'careless')).toBe(true);
    expect(sameFamily('taste', 'tasteless')).toBe(true);
    expect(sameFamily('run', 'running')).toBe(true);
    expect(sameFamily('happy', 'happiness')).toBe(true);
  });

  it('keeps unrelated words that merely share letters apart', () => {
    expect(sameFamily('plan', 'planet')).toBe(false);
    expect(sameFamily('star', 'start')).toBe(false);
    expect(sameFamily('car', 'carpet')).toBe(false);
    expect(sameFamily('cat', 'catalog')).toBe(false);
    expect(sameFamily('list', 'lid')).toBe(false);
    expect(sameFamily('value', 'valley')).toBe(false);
  });

  it('does not strip a family suffix that would leave too little', () => {
    expect(familyKey('table')).toBe('tabl');
    expect(familyKey('bless')).toBe('bless');
    expect(familyKey('list')).toBe('list');
  });
});
