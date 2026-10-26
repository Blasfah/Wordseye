/**
 * Forms of one word: plurals, verb forms and close derivations ("reflect",
 * "reflection", "reflected"), comparatives and adverbs ("heavier", "bitterly"),
 * irregular forms ("sang", "geese"), and British and American spellings
 * ("colour", "color"). Rankings count each group once, so a target's top 10 is
 * ten different words, and guessing any form of the target wins.
 */
import { porterStem } from '../../src/game/stem';
import { nearest } from './parallel';
import { isInflected, similarity, type Vocabulary } from './vocab';

export const FORM_SETTINGS = {
  /**
   * Words sharing a stem are only forms of each other when they also mean much the
   * same: this keeps "general" and "generous", "plane" and "planed", or "timber"
   * and "timbre" apart. Below this, most same-stem pairs are different words.
   */
  minSimilarity: 0.6,
};

/** British spellings rewritten the American way, so both share a key. */
const SPELLING_RULES: [RegExp, string][] = [
  [/our/g, 'or'], // colour, behaviour
  [/is(e|es|ed|ing|ation|ations|er|ers)$/, 'iz$1'], // realise, organisation
  [/ys(e|es|ed|ing)$/, 'yz$1'], // analyse
  [/([bt])re(s|d)?$/, '$1er$2'], // centre, fibre
  [/ogue(s)?$/, 'og$1'], // catalogue
  [/ence(s)?$/, 'ense$1'], // defence, licence
  [/ae/g, 'e'], // anaemia
];
const SPELLING_WORDS: Record<string, string> = {
  aluminium: 'aluminum',
  burnt: 'burned',
  cosy: 'cozy',
  doughnut: 'donut',
  dreamt: 'dreamed',
  grey: 'gray',
  jewellery: 'jewelry',
  kerb: 'curb',
  learnt: 'learned',
  leapt: 'leaped',
  mould: 'mold',
  moustache: 'mustache',
  plough: 'plow',
  programme: 'program',
  pyjamas: 'pajamas',
  sceptic: 'skeptic',
  spelt: 'spelled',
  spoilt: 'spoiled',
  tyre: 'tire',
};

/**
 * The key two forms of a word share: the Porter stem of the American spelling.
 * Unlike the game's familyKey, it keeps "-less" and "-ist" words apart from their
 * roots (sleep, sleepless; art, artist), which are different words to guess.
 */
export function formKey(word: string): string {
  const prefix = Object.keys(SPELLING_WORDS).find((w) => word.startsWith(w));
  let american = prefix ? SPELLING_WORDS[prefix] + word.slice(prefix.length) : word;
  for (const [pattern, replacement] of SPELLING_RULES) {
    american = american.replace(pattern, replacement);
  }
  return porterStem(american);
}

/** Forms no suffix rule finds, base first. */
const IRREGULAR = `
  arise arose arisen · awake awoke awoken · bear bore borne · beat beaten · begin began begun
  bend bent · bite bitten · bleed bled · blow blew blown · break broke broken · breed bred
  bring brought · build built · buy bought · catch caught · choose chose chosen · cling clung
  creep crept · deal dealt · dig dug · draw drew drawn · drink drank drunk · drive drove driven
  eat ate eaten · fall fell fallen · feed fed · feel felt · fight fought · find found · flee fled
  fling flung · fly flew flown · forbid forbade forbidden · forget forgot forgotten
  forgive forgave forgiven · freeze froze frozen · give gave given · grow grew grown · hang hung
  hear heard · hide hid hidden · hold held · keep kept · kneel knelt · know knew known · lay laid
  lead led · leave left · lend lent · lose lost · mean meant · meet met · pay paid · ride rode ridden
  ring rang rung · rise rose risen · seek sought · sell sold · send sent · shake shook shaken
  shine shone · shoot shot · shrink shrank shrunk · sing sang sung · sink sank sunk · sit sat
  sleep slept · slide slid · speak spoke spoken · spend spent · spin spun · spit spat
  spring sprang sprung · stand stood · steal stole stolen · stick stuck · sting stung
  stink stank stunk · strike struck stricken · swear swore sworn · sweep swept · swim swam swum
  swing swung · take took taken · teach taught · tear tore torn · tell told · think thought
  throw threw thrown · wake woke woken · wear wore worn · weave wove woven · weep wept · win won
  write wrote written · man men · woman women · child children · mouse mice · goose geese
  foot feet · tooth teeth · person people · cactus cacti · fungus fungi · crisis crises
  phenomenon phenomena · criterion criteria · louse lice · ox oxen`
  .split('·')
  .map((forms) => forms.trim().split(/\s+/));
const IRREGULAR_BASE = new Map(
  IRREGULAR.flatMap(([base, ...others]) => others.map((form) => [form, base])),
);

/**
 * Words this one may be a form of, beyond what stems catch: comparatives
 * ("heavier", "heaviest" → "heavy"; only where both exist, so "corner" isn't
 * "corn"), adverbs ("bitterly", "gently", "happily"), "-ves" plurals ("shelves")
 * and irregular forms ("sang", "geese").
 */
function basesOf(word: string, has: (w: string) => boolean): string[] {
  const stems = (stem: string) => [
    stem,
    stem + 'e',
    stem.endsWith('i') ? stem.slice(0, -1) + 'y' : '',
    /(.)\1$/.test(stem) ? stem.slice(0, -1) : '',
  ];
  const out: string[] = [];
  if (word.endsWith('er') && has(word.slice(0, -2) + 'est')) out.push(...stems(word.slice(0, -2)));
  if (word.endsWith('est') && has(word.slice(0, -3) + 'er')) out.push(...stems(word.slice(0, -3)));
  if (word.endsWith('ily')) out.push(word.slice(0, -3) + 'y');
  else if (word.endsWith('ly')) out.push(word.slice(0, -2), word.slice(0, -1) + 'e');
  if (word.endsWith('ves')) out.push(word.slice(0, -3) + 'f', word.slice(0, -3) + 'fe');
  out.push(IRREGULAR_BASE.get(word) ?? '');
  return out.filter((base) => base && base !== word && has(base));
}

export interface Forms {
  /** Each word's group, as the index of the group's most common word. */
  groupOf: Int32Array;
  /** Every group with more than one word, main form first: the one shown in lists and hints. */
  members: Map<number, number[]>;
}

/**
 * Groups the vocabulary's forms: words with the same stem, or with a base found
 * by basesOf, that also mean much the same. Ranked words only (stopwords stay alone).
 */
export function groupForms(vocab: Vocabulary): Forms {
  const n = vocab.words.length;
  // Union-find; each group's root is its most common word (vocabulary order).
  const root = Int32Array.from({ length: n }, (_, i) => i);
  const find = (i: number): number => {
    while (root[i] !== i) i = root[i] = root[root[i]];
    return i;
  };
  const join = (a: number, b: number) => {
    const [ra, rb] = [find(a), find(b)];
    if (ra !== rb) root[Math.max(ra, rb)] = Math.min(ra, rb);
  };
  const alike = (a: number, b: number) => similarity(vocab, a, b) >= FORM_SETTINGS.minSimilarity;
  const ranked = (i: number | undefined): i is number => i !== undefined && vocab.rankable[i] === 1;

  const byKey = new Map<string, number[]>();
  vocab.words.forEach((word, i) => {
    if (!ranked(i)) return;
    const key = formKey(word);
    byKey.set(key, [...(byKey.get(key) ?? []), i]);
  });
  for (const words of byKey.values()) {
    // Most common first, so each word joins the most common word it's close to.
    const heads: number[] = [];
    for (const word of words) {
      const head = heads.find((h) => alike(h, word));
      if (head === undefined) heads.push(word);
      else join(head, word);
    }
  }
  const has = (w: string) => ranked(vocab.index.get(w));
  vocab.words.forEach((word, i) => {
    if (!ranked(i)) return;
    for (const base of basesOf(word, has)) {
      const b = vocab.index.get(base)!;
      if (alike(b, i)) join(b, i);
    }
  });

  const groupOf = Int32Array.from({ length: n }, (_, i) => find(i));
  const groups = new Map<number, number[]>();
  for (let i = 0; i < n; i++) {
    const group = groups.get(groupOf[i]);
    if (group) group.push(i);
    else groups.set(groupOf[i], [i]);
  }
  const isForm = (w: number) =>
    isInflected(vocab, vocab.words[w]) || IRREGULAR_BASE.has(vocab.words[w]);
  const members = new Map<number, number[]>();
  for (const [head, group] of groups) {
    if (group.length < 2) continue;
    // Show a base form ("bee", not "bees"), unless it's a rarer word in the
    // dictionary than the most common form ("tongs", not "tong").
    const size = (w: number) => vocab.commonness.get(vocab.words[w])!;
    const base = group.find((w) => !isForm(w));
    const main = base !== undefined && size(base) <= size(head) ? base : head;
    members.set(head, [main, ...group.filter((w) => w !== main)]);
  }
  return { groupOf, members };
}

/** A word's group, main form first (just the word, if it has no other forms). */
export const formsOf = (forms: Forms, word: number): number[] =>
  forms.members.get(forms.groupOf[word]) ?? [word];

export interface RankedForms {
  /** Groups of forms, closest first: the target's own forms, then the rest. */
  groups: number[][];
  /** Each group's similarity to the target (its closest form's). */
  sims: number[];
}

/**
 * Each target's `count` closest groups of forms. A group ranks where its
 * closest form does, and the target's own forms are all rank 1.
 */
export async function rankForms(
  vocab: Vocabulary,
  forms: Forms,
  targets: readonly number[],
  count: number,
  label?: string,
): Promise<RankedForms[]> {
  // Other forms take up places in the plain word list, so read further down it.
  const near = await nearest(vocab, targets, Math.ceil(count * 1.6), label);
  return targets.map((target, t) => {
    const seen = new Set([forms.groupOf[target]]);
    const groups = [[target, ...formsOf(forms, target).filter((w) => w !== target)]];
    const sims = [1];
    const { indices, sims: wordSims } = near[t];
    for (let k = 0; k < indices.length && groups.length < count; k++) {
      const group = forms.groupOf[indices[k]];
      if (seen.has(group)) continue;
      seen.add(group);
      groups.push(formsOf(forms, indices[k]));
      sims.push(wordSims[k]);
    }
    return { groups, sims };
  });
}
