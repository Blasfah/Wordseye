/**
 * Porter stemmer (M.F. Porter, 1980) plus a slightly more aggressive
 * "family" key used to spot obvious variants of the hint word.
 */

const VOWELS = new Set(['a', 'e', 'i', 'o', 'u']);

function isConsonant(word: string, i: number): boolean {
  const c = word[i];
  if (VOWELS.has(c)) return false;
  if (c === 'y') return i === 0 || !isConsonant(word, i - 1);
  return true;
}

/** Porter's m: the number of vowel-consonant sequences in the stem. */
function measure(stem: string): number {
  let m = 0;
  let i = 0;
  const n = stem.length;
  while (i < n && isConsonant(stem, i)) i++;
  while (i < n) {
    while (i < n && !isConsonant(stem, i)) i++;
    if (i >= n) break;
    while (i < n && isConsonant(stem, i)) i++;
    m++;
  }
  return m;
}

function hasVowel(stem: string): boolean {
  for (let i = 0; i < stem.length; i++) if (!isConsonant(stem, i)) return true;
  return false;
}

function endsWithDoubleConsonant(word: string): boolean {
  const n = word.length;
  return n >= 2 && word[n - 1] === word[n - 2] && isConsonant(word, n - 1);
}

/** Consonant-vowel-consonant ending, where the last consonant is not w, x or y. */
function endsCvc(word: string): boolean {
  const n = word.length;
  if (n < 3) return false;
  const last = word[n - 1];
  return (
    isConsonant(word, n - 3) &&
    !isConsonant(word, n - 2) &&
    isConsonant(word, n - 1) &&
    last !== 'w' &&
    last !== 'x' &&
    last !== 'y'
  );
}

type Rule = readonly [suffix: string, replacement: string];

/** Applies the longest matching rule whose stem has measure > minMeasure. */
function applyRules(word: string, rules: readonly Rule[], minMeasure: number): string {
  for (const [suffix, replacement] of rules) {
    if (!word.endsWith(suffix)) continue;
    const stem = word.slice(0, -suffix.length);
    return measure(stem) > minMeasure ? stem + replacement : word;
  }
  return word;
}

// Rule lists are ordered so longer suffixes are tried before their tails.
const STEP2_RULES: Rule[] = [
  ['ational', 'ate'],
  ['tional', 'tion'],
  ['enci', 'ence'],
  ['anci', 'ance'],
  ['izer', 'ize'],
  ['bli', 'ble'],
  ['alli', 'al'],
  ['entli', 'ent'],
  ['eli', 'e'],
  ['ousli', 'ous'],
  ['ization', 'ize'],
  ['ation', 'ate'],
  ['ator', 'ate'],
  ['alism', 'al'],
  ['iveness', 'ive'],
  ['fulness', 'ful'],
  ['ousness', 'ous'],
  ['aliti', 'al'],
  ['iviti', 'ive'],
  ['biliti', 'ble'],
  ['logi', 'log'],
];
const STEP2 = STEP2_RULES.sort((a, b) => b[0].length - a[0].length);

const STEP3: readonly Rule[] = [
  ['icate', 'ic'],
  ['ative', ''],
  ['alize', 'al'],
  ['iciti', 'ic'],
  ['ical', 'ic'],
  ['ful', ''],
  ['ness', ''],
];

const STEP4_SUFFIXES = [
  'ement',
  'ance',
  'ence',
  'able',
  'ible',
  'ment',
  'ant',
  'ent',
  'ion',
  'ism',
  'ate',
  'iti',
  'ous',
  'ive',
  'ize',
  'al',
  'er',
  'ic',
  'ou',
];

function step1a(w: string): string {
  if (w.endsWith('sses')) return w.slice(0, -2);
  if (w.endsWith('ies')) return w.slice(0, -2);
  if (w.endsWith('ss')) return w;
  if (w.endsWith('s')) return w.slice(0, -1);
  return w;
}

function step1b(w: string): string {
  if (w.endsWith('eed')) {
    return measure(w.slice(0, -3)) > 0 ? w.slice(0, -1) : w;
  }
  let stem: string | null = null;
  if (w.endsWith('ed') && hasVowel(w.slice(0, -2))) stem = w.slice(0, -2);
  else if (w.endsWith('ing') && hasVowel(w.slice(0, -3))) stem = w.slice(0, -3);
  if (stem === null) return w;

  if (stem.endsWith('at') || stem.endsWith('bl') || stem.endsWith('iz')) return stem + 'e';
  if (endsWithDoubleConsonant(stem) && !/[lsz]$/.test(stem)) return stem.slice(0, -1);
  if (measure(stem) === 1 && endsCvc(stem)) return stem + 'e';
  return stem;
}

function step1c(w: string): string {
  return w.endsWith('y') && hasVowel(w.slice(0, -1)) ? w.slice(0, -1) + 'i' : w;
}

function step4(w: string): string {
  for (const suffix of STEP4_SUFFIXES) {
    if (!w.endsWith(suffix)) continue;
    const stem = w.slice(0, -suffix.length);
    if (measure(stem) <= 1) return w;
    if (suffix === 'ion' && !/[st]$/.test(stem)) return w;
    return stem;
  }
  return w;
}

function step5(w: string): string {
  let out = w;
  if (out.endsWith('e')) {
    const stem = out.slice(0, -1);
    const m = measure(stem);
    if (m > 1 || (m === 1 && !endsCvc(stem))) out = stem;
  }
  if (out.endsWith('ll') && measure(out) > 1) out = out.slice(0, -1);
  return out;
}

export function porterStem(word: string): string {
  if (word.length <= 2) return word;
  let w = step1a(word);
  w = step1b(w);
  w = step1c(w);
  w = applyRules(w, STEP2, 0);
  w = applyRules(w, STEP3, 0);
  w = step4(w);
  return step5(w);
}

/**
 * Derivational endings Porter leaves alone (or only strips from long words)
 * but which still make an obvious relative: valuable/value, artist/art,
 * careless/care.
 */
const FAMILY_SUFFIXES = ['less', 'abl', 'ibl', 'ist'];
const MIN_FAMILY_ROOT = 3;

export function familyKey(word: string): string {
  const stem = porterStem(word.toLowerCase());
  for (const suffix of FAMILY_SUFFIXES) {
    if (stem.endsWith(suffix) && stem.length - suffix.length >= MIN_FAMILY_ROOT) {
      return porterStem(stem.slice(0, -suffix.length));
    }
  }
  return stem;
}

/** True when two words are the same word or obvious variants of each other. */
export function sameFamily(a: string, b: string): boolean {
  return a === b || familyKey(a) === familyKey(b);
}
