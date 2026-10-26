/**
 * Builds all puzzle data from pretrained word vectors.
 *
 *   npm run data:build                      # scripts/.cache/glove.6B.300d.txt
 *   npm run data:build -- --vectors my.vec  # any word2vec-style text file
 *
 * Targets come from scripts/data/targets.txt (hand-picked) and targets-auto.txt
 * (proposed by `npm run data:targets`, then reviewed). Every day has a puzzle
 * per level (easy, medium, hard; see LEVELS in src/config.ts), scheduled in
 * scripts/data/schedule-<level>.txt. Schedules only ever grow: days already in
 * them are never changed (they may be published), and new days are appended
 * while there are words left. A word is used at most once per level and comes
 * back on another level only after CONFIG.levelReuseGapDays, with a different hint.
 *
 * Writes, under public/data/:
 *   manifest.json        names of the current vocabulary and index files
 *   vocab.<hash>.txt     every guessable word, one per line
 *   index.<hash>.json    each level's schedule, as word ids
 *   words/<id>.json      one per target: first hint per level, extra hints, ranked neighbors
 * and scripts/output/review.md for checking quality.
 */
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { gzipSync } from 'node:zlib';
import { CONFIG, LEVELS, RANKED_NEIGHBORS, type LevelId } from '../src/config';
import { dateForDay } from '../src/game/daily';
import { chooseAllHints, isUsableHint } from './lib/hints';
import { nearest } from './lib/parallel';
import { DATA_OUT_DIR, DEFAULT_VECTORS_PATH, REVIEW_PATH, SCRIPTS_DIR } from './lib/paths';
import { checkSchedules, extendSchedules, type Schedulable, type Schedules } from './lib/schedule';
import {
  EVERYDAY,
  loadVocabulary,
  loadWordLists,
  readWordList,
  type Vocabulary,
} from './lib/vocab';

const FORMAT_VERSION = 3;
const LEVEL_IDS = LEVELS.map((level) => level.id);
const WORDS_DIR = join(DATA_OUT_DIR, 'words');
const scheduleFile = (level: LevelId) => join(SCRIPTS_DIR, 'data', `schedule-${level}.txt`);

/** Stable, opaque file name for a target word. */
const wordId = (word: string) =>
  createHash('sha256').update(`wordseye:${word}`).digest('hex').slice(0, 12);

const hashName = (prefix: string, content: string, ext: string) =>
  `${prefix}.${createHash('sha256').update(content).digest('hex').slice(0, 10)}.${ext}`;

async function readSchedule(level: LevelId): Promise<string[][]> {
  const path = scheduleFile(level);
  if (!existsSync(path)) return [];
  const days: string[][] = [];
  for (const line of (await readFile(path, 'utf8')).split(/\r?\n/)) {
    const match = line.match(/^\s*(\d+):\s*(.+)$/);
    if (!match) continue;
    const day = Number(match[1]);
    if (day !== days.length + 1) {
      throw new Error(`schedule-${level}.txt: expected day ${days.length + 1}, found ${day}`);
    }
    const words = match[2].trim().split(/\s+/);
    if (words.length !== CONFIG.roundsPerGame) {
      throw new Error(`schedule-${level}.txt: day ${day} has ${words.length} words`);
    }
    days.push(words);
  }
  return days;
}

async function writeSchedule(level: LevelId, days: string[][]): Promise<void> {
  await writeFile(
    scheduleFile(level),
    [
      `# ${level} puzzles: "day: five targets". Maintained by \`npm run data:build\`.`,
      '# Never change a day that has been published; new days are appended at the end.',
      `# Day 1 is ${CONFIG.firstPuzzleDate} (CONFIG.firstPuzzleDate in src/config.ts).`,
      ...days.map((words, i) => `${i + 1}: ${words.join(' ')}`),
    ].join('\n') + '\n',
  );
}

/** Deletes generated files that the new build no longer references. */
async function removeStale(keep: Set<string>): Promise<void> {
  await mkdir(WORDS_DIR, { recursive: true });
  for (const file of await readdir(DATA_OUT_DIR)) {
    if (/^(vocab|index)\..+\.(txt|json)$/.test(file) && !keep.has(file)) {
      await rm(join(DATA_OUT_DIR, file));
    }
  }
  for (const file of await readdir(WORDS_DIR)) {
    if (!keep.has(`words/${file}`)) await rm(join(WORDS_DIR, file));
  }
}

/**
 * Rough "how gettable is this word": common, everyday words with tight
 * neighborhoods are easier; hand-picked targets lean concrete, so easier too.
 */
function easinessScores(
  vocab: Vocabulary,
  words: readonly string[],
  tightness: readonly number[],
  curated: ReadonlySet<string>,
): number[] {
  const zscore = (values: number[]) => {
    const mean = values.reduce((a, b) => a + b, 0) / values.length;
    const sd = Math.sqrt(values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length) || 1;
    return values.map((v) => (v - mean) / sd);
  };
  const tight = zscore([...tightness]);
  const frequent = zscore(words.map((w) => -Math.log(1 + vocab.index.get(w)!)));
  return words.map((w, i) => {
    const size = vocab.commonness.get(w)!;
    const everyday = size <= 10 ? 0.6 : size <= 20 ? 0.3 : size <= EVERYDAY ? 0 : -0.3;
    return tight[i] + frequent[i] + everyday + (curated.has(w) ? 0.5 : 0);
  });
}

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;
const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

async function main(): Promise<void> {
  const { values: args } = parseArgs({
    options: { vectors: { type: 'string', default: DEFAULT_VECTORS_PATH } },
  });
  const started = Date.now();
  const lists = await loadWordLists();
  console.log(`Reading ${args.vectors}…`);
  const vocab = await loadVocabulary(args.vectors, lists);
  console.log(`Vocabulary: ${vocab.words.length.toLocaleString()} words, ${vocab.dims} dims`);

  // Every word that needs a puzzle: listed targets plus anything already scheduled.
  const curated = new Set(await readWordList('targets.txt'));
  const listed = [...new Set([...curated, ...(await readWordList('targets-auto.txt'))])];
  const existing = Object.fromEntries(
    await Promise.all(LEVEL_IDS.map(async (level) => [level, await readSchedule(level)])),
  ) as Schedules;
  const scheduled = new Set(LEVEL_IDS.flatMap((level) => existing[level].flat()));
  const usable = (word: string) =>
    vocab.index.has(word) && vocab.rankable[vocab.index.get(word)!] === 1;
  const missing = listed.filter((w) => !usable(w));
  const broken = [...scheduled].filter((w) => !usable(w));
  if (broken.length)
    throw new Error(`Scheduled words missing from the vocabulary: ${broken.join(', ')}`);
  const words = [...new Set([...scheduled, ...listed.filter(usable)])];

  // Neighbors and hints for all of them, spread over every core.
  const near = await nearest(
    vocab,
    words.map((w) => vocab.index.get(w)!),
    RANKED_NEIGHBORS - 1,
  );
  const neighborLists = words.map((w, i) => [
    w,
    ...Array.from(near[i].indices, (j) => vocab.words[j]),
  ]);
  const hints = await chooseAllHints(vocab, neighborLists, lists.hintAvoid);
  const tightness = near.map(({ sims }) => sims.slice(0, 10).reduce((a, b) => a + b, 0) / 10);
  const easiness = easinessScores(vocab, words, tightness, curated);
  const byWord = new Map(
    words.map((w, i) => [
      w,
      { hints: hints[i], neighbors: neighborLists[i], easiness: easiness[i] },
    ]),
  );

  // Scheduled days must still have a hint on their level.
  for (const level of LEVEL_IDS) {
    for (const w of existing[level].flat()) {
      if (!byWord.get(w)!.hints.levels[level])
        throw new Error(`${w} has no ${level} hint any more`);
    }
  }

  const schedulable: Schedulable[] = words
    .filter((w) => listed.includes(w))
    .map((w) => {
      const { hints: h, easiness: e } = byWord.get(w)!;
      const levelHints = Object.fromEntries(
        LEVEL_IDS.map((level) => [
          level,
          isUsableHint(level, h.levels[level]) ? h.levels[level]!.word : null,
        ]),
      ) as Record<LevelId, string | null>;
      return { target: w, hints: levelHints, easiness: e };
    });
  const schedules = extendSchedules(vocab, schedulable, existing, {
    levels: LEVEL_IDS,
    roundsPerGame: CONFIG.roundsPerGame,
    gapDays: CONFIG.levelReuseGapDays,
  });
  const problems = checkSchedules(schedules, LEVEL_IDS, CONFIG.levelReuseGapDays);
  if (problems.length)
    throw new Error(`Schedule rules broken:\n${problems.slice(0, 20).join('\n')}`);

  // Write everything.
  const used = new Set(LEVEL_IDS.flatMap((level) => schedules[level].flat()));
  const vocabText = [...vocab.words].sort().join('\n') + '\n';
  const vocabFile = hashName('vocab', vocabText, 'txt');
  const index = JSON.stringify({
    v: FORMAT_VERSION,
    days: Object.fromEntries(
      LEVEL_IDS.map((level) => [level, schedules[level].map((day) => day.map(wordId))]),
    ),
  });
  const indexFile = hashName('index', index, 'json');
  const keep = new Set([vocabFile, indexFile, ...[...used].map((w) => `words/${wordId(w)}.json`)]);
  await removeStale(keep);
  await writeFile(join(DATA_OUT_DIR, vocabFile), vocabText);
  await writeFile(join(DATA_OUT_DIR, indexFile), index);

  let gzipBytes = 0;
  for (const word of used) {
    const { hints: h, neighbors } = byWord.get(word)!;
    const json = JSON.stringify({
      v: FORMAT_VERSION,
      hints: Object.fromEntries(
        LEVEL_IDS.filter((level) => h.levels[level]).map((level) => [level, h.levels[level]!.word]),
      ),
      extras: h.extras.map((e) => e.word),
      neighbors,
    });
    await writeFile(join(WORDS_DIR, `${wordId(word)}.json`), json);
    gzipBytes += gzipSync(json).length;
  }
  const manifest = { v: FORMAT_VERSION, vocab: vocabFile, index: indexFile };
  await writeFile(join(DATA_OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  for (const level of LEVEL_IDS) await writeSchedule(level, schedules[level]);

  // Report.
  const totalDays = schedules[LEVEL_IDS[0]].length;
  const newDays = Object.fromEntries(
    LEVEL_IDS.map((level) => [level, schedules[level].length - existing[level].length]),
  );
  const lastDate = dateForDay(totalDays, CONFIG.firstPuzzleDate);
  const fewExtras = [...used].filter((w) => byWord.get(w)!.hints.extras.length < 3);
  const summary = [
    `Vocabulary: ${vocab.words.length.toLocaleString()} words (${kb(gzipSync(vocabText).length)} gzipped)`,
    `Targets: ${used.size} in use (${listed.length} listed)`,
    `Days: ${totalDays} per level, ${CONFIG.firstPuzzleDate} to ${lastDate} (new this build: ${LEVEL_IDS.map((l) => `${l} ${newDays[l]}`).join(', ')})`,
    ...LEVEL_IDS.map(
      (level) =>
        `Usable for ${level}: ${schedulable.filter((s) => s.hints[level]).length} words (hint ranks ${LEVELS.find((l) => l.id === level)!.hintRanks.join('–')})`,
    ),
    `Word files: ${used.size}, ${mb(gzipBytes)} gzipped (~${kb(gzipBytes / used.size)} each)`,
    fewExtras.length ? `Fewer than 3 extra hints: ${fewExtras.join(', ')}` : '',
    missing.length ? `Not in the vocabulary (skipped): ${missing.join(', ')}` : '',
  ].filter(Boolean);

  const describe = (word: string, level: LevelId) => {
    const { hints: h, neighbors } = byWord.get(word)!;
    const hint = h.levels[level]!;
    const extras =
      level === 'hard'
        ? ''
        : ` · extras: ${h.extras.map((e) => `${e.word} #${e.rank}`).join(', ')}`;
    return `- **${word}** ← _${hint.word}_ (#${hint.rank}, back #${hint.backRank})${extras} · ${neighbors.slice(1, 9).join(', ')}`;
  };
  const dayLines = Array.from({ length: totalDays }, (_, i) => [
    '',
    `## Day ${i + 1} · ${dateForDay(i + 1, CONFIG.firstPuzzleDate)}`,
    ...LEVEL_IDS.flatMap((level) => [
      `**${level}**`,
      ...schedules[level][i].map((w) => describe(w, level)),
    ]),
  ]).flat();
  await mkdir(dirname(REVIEW_PATH), { recursive: true });
  await writeFile(
    REVIEW_PATH,
    [
      '# Puzzle review',
      '',
      'Generated by `npm run data:build`. Each line: target ← first hint (its rank, and where the',
      "target ranks in the hint's own list), the extra hint words, then ranks 2–9.",
      '',
      ...summary.map((line) => `- ${line}`),
      ...dayLines,
    ].join('\n') + '\n',
  );

  console.log('');
  for (const line of summary) console.log(line);
  console.log(
    `\nWrote public/data/, the schedules and ${REVIEW_PATH} in ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
