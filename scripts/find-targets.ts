/**
 * Proposes more target words, using the curated list as the model of a good one.
 *
 *   npm run data:targets                   # writes scripts/data/targets-auto.txt
 *   npm run data:targets -- --count 2000   # how many new words to propose
 *
 * Every common, base-form word in the vocabulary is scored on:
 *   likeness   close to curated targets (targets.txt), far from rejected ones (rejected.txt)
 *   tightness  how close its nearest neighbors sit (abstract words have loose, generic ones)
 *   off-topic  how much its neighborhood leans to sports, business, politics, war or computing
 *   hint       whether a good hint exists (same rules as the puzzle build)
 * Thresholds are calibrated on the curated list, and each curated word "anchors" at
 * most a few new ones so the list stays varied. Review scripts/output/candidates.md;
 * delete bad lines from targets-auto.txt and add them to rejected.txt.
 */
import { existsSync } from 'node:fs';
import { appendFile, mkdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { LEVELS } from '../src/config';
import { groupForms, rankForms } from './lib/forms';
import { chooseAllHints, isUsableHint } from './lib/hints';
import { DEFAULT_VECTORS_PATH, SCRIPTS_DIR, SCRIPTS_OUTPUT_DIR } from './lib/paths';
import { seededRandom, shuffle } from './lib/schedule';
import {
  centroid,
  EVERYDAY,
  isInflected,
  loadVocabulary,
  loadWordLists,
  readWordList,
  similarityTo,
  type Vocabulary,
} from './lib/vocab';

const SETTINGS = {
  /** Only words this common are considered (vocabulary frequency rank). */
  maxFrequencyRank: 16_000,
  maxLength: 12,
  /** At most this many new words may have the same nearest curated word. */
  maxPerAnchor: 10,
  /** Gates, as percentiles of the curated targets' own scores. */
  minTightnessPercentile: 0.1,
  maxOffTopicPercentile: 0.9,
};

/** Seed words for senses that make poor targets for this game. */
const OFF_TOPIC: Record<string, string[]> = {
  sports: [
    'season',
    'league',
    'coach',
    'championship',
    'scored',
    'tournament',
    'playoffs',
    'innings',
  ],
  business: [
    'shares',
    'investors',
    'percent',
    'profit',
    'revenue',
    'stocks',
    'quarterly',
    'analysts',
  ],
  politics: [
    'election',
    'parliament',
    'minister',
    'senator',
    'legislation',
    'opposition',
    'voters',
  ],
  conflict: ['troops', 'militants', 'rebels', 'killed', 'insurgents', 'casualties', 'offensive'],
  computing: ['software', 'internet', 'user', 'database', 'online', 'download', 'server'],
};

/**
 * Logistic regression on the word vectors: curated targets against rejected
 * words and a sample of ordinary vocabulary. Curated targets are mostly
 * concrete, everyday nouns, so this learns "looks like a good target".
 */
function trainClassifier(
  vocab: Vocabulary,
  positives: readonly number[],
  negatives: readonly { word: number; weight: number }[],
): (word: number) => number {
  const dims = vocab.dims;
  const negativeWeight = negatives.reduce((sum, n) => sum + n.weight, 0);
  const samples = [
    // Balance the classes so the positives count as much as all negatives together.
    ...positives.map((word) => ({ word, label: 1, weight: negativeWeight / positives.length })),
    ...negatives.map(({ word, weight }) => ({ word, label: 0, weight })),
  ];
  const totalWeight = 2 * negativeWeight;
  const weights = new Float64Array(dims);
  let bias = 0;
  const logit = (word: number) => {
    let z = bias;
    for (let k = 0, o = word * dims; k < dims; k++) z += weights[k] * vocab.vectors[o + k];
    return z;
  };
  const sigmoid = (z: number) => 1 / (1 + Math.exp(-z));

  const gradient = new Float64Array(dims);
  for (let epoch = 0; epoch < 400; epoch++) {
    gradient.fill(0);
    let biasGradient = 0;
    for (const { word, label, weight } of samples) {
      const g = (sigmoid(logit(word)) - label) * weight;
      for (let k = 0, o = word * dims; k < dims; k++) gradient[k] += g * vocab.vectors[o + k];
      biasGradient += g;
    }
    for (let k = 0; k < dims; k++)
      weights[k] -= 2 * (gradient[k] / totalWeight + 1e-3 * weights[k]);
    bias -= (2 * biasGradient) / totalWeight;
  }
  return (word) => sigmoid(logit(word));
}

interface Scored {
  word: number;
  score: number;
  likeness: number;
  anchor: number;
  tightness: number;
  offTopic: number;
  offTopicArea: string;
}

/** Each item's position in the sorted scores, 0 (lowest) to 1 (highest). */
function percentileRanks(
  items: readonly number[],
  score: (item: number) => number,
): Map<number, number> {
  const sorted = items.map((item) => ({ item, s: score(item) })).sort((a, b) => a.s - b.s);
  return new Map(sorted.map(({ item }, i) => [item, i / Math.max(1, sorted.length - 1)]));
}

function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
}

function topMean(values: Float64Array, k: number): number {
  const sorted = Float64Array.from(values).sort();
  let sum = 0;
  for (let i = 1; i <= k; i++) sum += sorted[sorted.length - i];
  return sum / k;
}

/** Mean similarity to the k closest words of a set, and which one is closest. */
function closeness(vocab: Vocabulary, word: number, set: readonly number[], k: number) {
  const sims = new Float64Array(set.length);
  let best = -1;
  set.forEach((other, i) => {
    sims[i] = other === word ? -Infinity : similarityTo(vocab, other, rowOf(vocab, word));
    if (best < 0 || sims[i] > sims[best]) best = i;
  });
  return { mean: topMean(sims, k), closest: set[best] };
}

function rowOf(vocab: Vocabulary, word: number): Float32Array {
  return vocab.vectors.subarray(word * vocab.dims, (word + 1) * vocab.dims);
}

async function main(): Promise<void> {
  const { values: args } = parseArgs({
    options: {
      vectors: { type: 'string', default: DEFAULT_VECTORS_PATH },
      count: { type: 'string', default: '1600' },
    },
  });
  const wanted = Number(args.count);
  const lists = await loadWordLists();
  console.log(`Reading ${args.vectors}…`);
  const vocab = await loadVocabulary(args.vectors, lists);

  const forms = groupForms(vocab);
  const known = (words: string[]) =>
    words.map((w) => vocab.index.get(w)).filter((i): i is number => i !== undefined);
  const curated = known(await readWordList('targets.txt'));
  // Earlier proposals that survived review count as good examples too.
  const accepted = known(await readWordList('targets-auto.txt'));
  const rejected = known(await readWordList('rejected.txt'));
  const excluded = new Set([...curated, ...accepted, ...rejected]);
  console.log(
    `Curated: ${curated.length}, accepted proposals: ${accepted.length}, rejected: ${rejected.length}`,
  );

  const pool = vocab.words
    .map((word, i) => ({ word, i }))
    .filter(
      ({ word, i }) =>
        i < SETTINGS.maxFrequencyRank &&
        vocab.commonness.get(word)! <= EVERYDAY &&
        vocab.rankable[i] &&
        word.length <= SETTINGS.maxLength &&
        !excluded.has(i) &&
        !lists.hintAvoid.has(word) &&
        !isInflected(vocab, word),
    )
    .map(({ i }) => i);
  console.log(`Pool after frequency, form and list filters: ${pool.length}`);

  const random = seededRandom('find-targets');
  const sample = shuffle(pool, random).slice(0, 4000);
  const targetness = trainClassifier(
    vocab,
    [...curated, ...accepted],
    [
      ...rejected.map((word) => ({ word, weight: 3 })),
      ...sample.map((word) => ({ word, weight: 1 })),
    ],
  );

  // Likeness: near good examples, away from bad ones.
  const likeness = (word: number) => {
    const good = closeness(vocab, word, curated, 5);
    const bad = closeness(vocab, word, rejected, 3);
    return { likeness: good.mean - 0.5 * bad.mean, anchor: good.closest };
  };

  // Tightness and off-topic need each word's neighborhood (other forms of a word count once).
  const areas = Object.entries(OFF_TOPIC).map(([area, seeds]) => ({
    area,
    center: centroid(vocab, known(seeds)),
  }));
  const describe = async (words: number[], label: string): Promise<Scored[]> => {
    const near = await rankForms(vocab, forms, words, 21, label);
    return words.map((word, w) => {
      const { groups, sims } = near[w];
      const tightness = sims.slice(1, 11).reduce((a, b) => a + b, 0) / 10;
      const hood = centroid(
        vocab,
        groups.slice(1).map((group) => group[0]),
      );
      let offTopic = -1;
      let offTopicArea = '';
      for (const { area, center } of areas) {
        const s = similarityTo(vocab, word, center) * 0.3 + dot(hood, center) * 0.7;
        if (s > offTopic) [offTopic, offTopicArea] = [s, area];
      }
      return {
        word,
        score: targetness(word),
        ...likeness(word),
        tightness,
        offTopic,
        offTopicArea,
      };
    });
  };

  // Calibrate the gates on the curated words.
  const reference = await describe(curated, 'measuring curated targets');
  const minTightness = percentile(
    reference.map((r) => r.tightness),
    SETTINGS.minTightnessPercentile,
  );
  const maxOffTopic = percentile(
    reference.map((r) => r.offTopic),
    SETTINGS.maxOffTopicPercentile,
  );
  console.log(
    `Gates: tightness ≥ ${minTightness.toFixed(3)}, off-topic ≤ ${maxOffTopic.toFixed(3)}`,
  );

  // Score the whole pool (cheap): the classifier and plain likeness each catch
  // things the other misses, so rank by the average of both percentiles.
  const byClassifier = percentileRanks(pool, targetness);
  const byLikeness = percentileRanks(pool, (word) => likeness(word).likeness);
  const combined = (word: number) => (byClassifier.get(word)! + byLikeness.get(word)!) / 2;
  const ranked = [...pool].sort((a, b) => combined(b) - combined(a)).slice(0, wanted * 2);
  const described = await describe(ranked, 'measuring candidates');
  const passing = described
    .map((d) => ({ ...d, score: combined(d.word) }))
    .filter((d) => d.tightness >= minTightness && d.offTopic <= maxOffTopic)
    .sort((a, b) => b.score - a.score);

  // Keep it varied: a few words per curated anchor (earlier proposals included), best first.
  const perAnchor = new Map<number, number>();
  for (const word of accepted) {
    const { anchor } = likeness(word);
    perAnchor.set(anchor, (perAnchor.get(anchor) ?? 0) + 1);
  }
  const shortlist: Scored[] = [];
  for (const candidate of passing) {
    const used = perAnchor.get(candidate.anchor) ?? 0;
    if (used >= SETTINGS.maxPerAnchor) continue;
    perAnchor.set(candidate.anchor, used + 1);
    shortlist.push(candidate);
    if (shortlist.length >= wanted * 1.2) break;
  }

  // Only words that get a decent hint.
  const forHints = await rankForms(
    vocab,
    forms,
    shortlist.map((s) => s.word),
    // Deep enough for the hard level's hint window.
    Math.max(...LEVELS.map((level) => level.hintRanks[1])),
    'ranking for hints',
  );
  const hints = await chooseAllHints(
    vocab,
    forHints.map(({ groups }) => groups.map((group) => vocab.words[group[0]])),
    lists.hintAvoid,
  );
  // The medium hint is the bar a new target must clear.
  const chosen = shortlist
    .map((s, i) => ({ ...s, hint: hints[i].levels.medium }))
    .filter((s) => isUsableHint('medium', s.hint))
    .slice(0, wanted);

  // Append, so earlier reviewed proposals are never touched.
  const words = chosen.map((c) => vocab.words[c.word]).sort();
  const autoPath = join(SCRIPTS_DIR, 'data', 'targets-auto.txt');
  const header = existsSync(autoPath)
    ? []
    : [
        '# Targets proposed by `npm run data:targets` (see scripts/output/candidates.md).',
        '# Delete any that disappoint, and add them to rejected.txt so they stay out.',
      ];
  const today = new Date().toISOString().slice(0, 10);
  await appendFile(
    autoPath,
    [...header, '', `# Proposed ${today}, not yet reviewed`, ...words].join('\n') + '\n',
  );

  const reportPath = join(SCRIPTS_OUTPUT_DIR, 'candidates.md');
  const fmt = (n: number) => n.toFixed(3);
  await mkdir(dirname(reportPath), { recursive: true });
  await writeFile(
    reportPath,
    [
      '# Proposed targets',
      '',
      `${chosen.length} words, best first. Gates: tightness ≥ ${fmt(minTightness)}, off-topic ≤ ${fmt(maxOffTopic)}.`,
      '',
      '| word | score | likeness | tightness | off-topic | nearest curated | hint |',
      '| --- | --- | --- | --- | --- | --- | --- |',
      ...chosen.map(
        (c) =>
          `| ${vocab.words[c.word]} | ${fmt(c.score)} | ${fmt(c.likeness)} | ${fmt(c.tightness)} | ${fmt(c.offTopic)} (${c.offTopicArea}) | ${vocab.words[c.anchor]} | ${c.hint!.word} (#${c.hint!.rank}, back #${c.hint!.backRank}) |`,
      ),
    ].join('\n') + '\n',
  );
  console.log(`\nAppended ${chosen.length} new proposals to scripts/data/targets-auto.txt`);
  console.log(`Report → ${reportPath}`);
}

function dot(a: Float32Array, b: Float32Array): number {
  let sum = 0;
  for (let k = 0; k < a.length; k++) sum += a[k] * b[k];
  return sum;
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
