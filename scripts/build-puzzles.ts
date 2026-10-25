/**
 * Builds all puzzle data from pretrained word vectors.
 *
 *   npm run data:build                      # scripts/.cache/glove.6B.300d.txt
 *   npm run data:build -- --vectors my.vec  # any word2vec-style text file
 *
 * Targets come from scripts/data/targets.txt (hand-picked) and targets-auto.txt
 * (proposed by `npm run data:targets`, then reviewed). Each target belongs to
 * one pool for good, decided by a hash of the word:
 *   daily     scheduled five per day in scripts/data/schedule.txt
 *   practice  shuffled into practice games, so practice never spoils a daily
 * The schedule only ever grows. Days already in it are never changed (they may
 * be published); new daily targets are appended as new days at the end.
 *
 * Writes, under public/data/:
 *   manifest.json        names of the current vocabulary and index files
 *   vocab.<hash>.txt     every guessable word, one per line
 *   index.<hash>.json    the day schedule and the practice games, as word ids
 *   words/<id>.json      one per target: its hint and ranked neighbor list
 * and scripts/output/review.md for checking quality.
 */
import { existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { mkdir, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { parseArgs } from 'node:util';
import { gzipSync } from 'node:zlib';
import { CONFIG, RANKED_NEIGHBORS } from '../src/config';
import { dateForDay } from '../src/game/daily';
import { chooseHints, isUsableHint, type Hint } from './lib/hints';
import { nearest } from './lib/parallel';
import { DATA_OUT_DIR, DEFAULT_VECTORS_PATH, REVIEW_PATH, SCRIPTS_DIR } from './lib/paths';
import { packGames, seededRandom } from './lib/schedule';
import { loadVocabulary, loadWordLists, readWordList } from './lib/vocab';

const FORMAT_VERSION = 2;
/** One in this many targets goes to the practice pool. */
const PRACTICE_SHARE = 4;
/** Practice games are dealt this many times over, each time in a new mix. */
const PRACTICE_CYCLES = 4;
const SCHEDULE_PATH = join(SCRIPTS_DIR, 'data', 'schedule.txt');
const WORDS_DIR = join(DATA_OUT_DIR, 'words');

interface Round {
  target: string;
  id: string;
  hint: Hint;
  neighbors: string[];
}

/** Stable, opaque file name for a target word. */
const wordId = (word: string) =>
  createHash('sha256').update(`wordseye:${word}`).digest('hex').slice(0, 12);

const isPracticeWord = (word: string) =>
  parseInt(wordId(word).slice(0, 8), 16) % PRACTICE_SHARE === 0;

const hashName = (prefix: string, content: string, ext: string) =>
  `${prefix}.${createHash('sha256').update(content).digest('hex').slice(0, 10)}.${ext}`;

async function readSchedule(): Promise<string[][]> {
  if (!existsSync(SCHEDULE_PATH)) return [];
  const days: string[][] = [];
  for (const line of (await readFile(SCHEDULE_PATH, 'utf8')).split(/\r?\n/)) {
    const match = line.match(/^\s*(\d+):\s*(.+)$/);
    if (!match) continue;
    const day = Number(match[1]);
    if (day !== days.length + 1)
      throw new Error(`schedule.txt: expected day ${days.length + 1}, found ${day}`);
    const words = match[2].trim().split(/\s+/);
    if (words.length !== CONFIG.roundsPerGame) {
      throw new Error(
        `schedule.txt: day ${day} has ${words.length} words, not ${CONFIG.roundsPerGame}`,
      );
    }
    days.push(words);
  }
  return days;
}

async function writeSchedule(days: string[][]): Promise<void> {
  await writeFile(
    SCHEDULE_PATH,
    [
      '# Daily puzzles: "day: five targets". Maintained by `npm run data:build`.',
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
  // The day-per-file format used before version 2.
  await rm(join(DATA_OUT_DIR, 'puzzles'), { recursive: true, force: true });
}

const kb = (bytes: number) => `${(bytes / 1024).toFixed(1)} KB`;
const mb = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;

function describeRound(round: Round): string {
  const { hint } = round;
  const weak = hint.backRank > 40 ? ' ⚠' : '';
  return `- **${round.target}** ← _${hint.word}_ (#${hint.rank}, back #${hint.backRank}${weak}) · ${round.neighbors.slice(1, 13).join(', ')}`;
}

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
  const listed = [
    ...new Set([
      ...(await readWordList('targets.txt')),
      ...(await readWordList('targets-auto.txt')),
    ]),
  ];
  const schedule = await readSchedule();
  const scheduled = new Set(schedule.flat());
  const usable = (word: string) =>
    vocab.index.has(word) && vocab.rankable[vocab.index.get(word)!] === 1;
  const missing = listed.filter((w) => !usable(w));
  const brokenSchedule = [...scheduled].filter((w) => !usable(w));
  if (brokenSchedule.length) {
    throw new Error(`Scheduled words missing from the vocabulary: ${brokenSchedule.join(', ')}`);
  }
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
  const hints = await chooseHints(vocab, neighborLists, lists.hintAvoid);

  const rounds = new Map<string, Round>();
  const hintless: string[] = [];
  words.forEach((target, i) => {
    const hint = hints[i];
    // Scheduled days keep their word even if its hint got weaker; new words need a good one.
    if (scheduled.has(target) ? hint : isUsableHint(hint)) {
      rounds.set(target, { target, id: wordId(target), hint: hint!, neighbors: neighborLists[i] });
    } else hintless.push(target);
  });
  if (hintless.some((w) => scheduled.has(w)))
    throw new Error('A scheduled word has no hint at all.');

  // Daily: append new days for daily targets that aren't scheduled yet.
  const unscheduledDaily = [...rounds.values()].filter(
    (r) => !scheduled.has(r.target) && !isPracticeWord(r.target),
  );
  const { games: newDays, leftover } = packGames(
    vocab,
    unscheduledDaily,
    CONFIG.roundsPerGame,
    seededRandom(`days-${schedule.length}`),
  );
  const days = [...schedule, ...newDays.map((day) => day.map((r) => r.target))];

  // Practice: several shuffled deals of the practice pool.
  const practicePool = [...rounds.values()].filter(
    (r) => !scheduled.has(r.target) && isPracticeWord(r.target),
  );
  const practice: Round[][] = [];
  for (let cycle = 0; cycle < PRACTICE_CYCLES; cycle++) {
    const { games } = packGames(
      vocab,
      practicePool,
      CONFIG.roundsPerGame,
      seededRandom(`practice-${cycle}`),
    );
    practice.push(...games);
  }

  // Write everything.
  const used = new Set([...days.flat(), ...practicePool.map((r) => r.target)]);
  const vocabText = [...vocab.words].sort().join('\n') + '\n';
  const vocabFile = hashName('vocab', vocabText, 'txt');
  const index = JSON.stringify({
    v: FORMAT_VERSION,
    days: days.map((day) => day.map((w) => rounds.get(w)!.id)),
    practice: practice.map((game) => game.map((r) => r.id)),
  });
  const indexFile = hashName('index', index, 'json');
  const keep = new Set([
    vocabFile,
    indexFile,
    ...[...used].map((w) => `words/${rounds.get(w)!.id}.json`),
  ]);
  await removeStale(keep);
  await writeFile(join(DATA_OUT_DIR, vocabFile), vocabText);
  await writeFile(join(DATA_OUT_DIR, indexFile), index);

  let rawBytes = 0;
  let gzipBytes = 0;
  for (const word of used) {
    const round = rounds.get(word)!;
    const json = JSON.stringify({
      v: FORMAT_VERSION,
      hint: round.hint.word,
      neighbors: round.neighbors,
    });
    await writeFile(join(WORDS_DIR, `${round.id}.json`), json);
    rawBytes += json.length;
    gzipBytes += gzipSync(json).length;
  }
  const manifest = { v: FORMAT_VERSION, vocab: vocabFile, index: indexFile };
  await writeFile(join(DATA_OUT_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
  await writeSchedule(days);

  // Report.
  const lastDate = dateForDay(days.length, CONFIG.firstPuzzleDate);
  const weak = [...used].map((w) => rounds.get(w)!).filter((r) => r.hint.backRank > 40);
  const summary = [
    `Vocabulary: ${vocab.words.length.toLocaleString()} words (${kb(gzipSync(vocabText).length)} gzipped)`,
    `Targets: ${used.size} with puzzles (${listed.length} listed)`,
    `Daily: ${days.length} days (${newDays.length} new this build), ${CONFIG.firstPuzzleDate} to ${lastDate}`,
    leftover.length ? `Waiting for a full day: ${leftover.map((r) => r.target).join(', ')}` : '',
    `Practice: ${practicePool.length} words dealt into ${practice.length} games`,
    `Word files: ${used.size}, ${mb(rawBytes)} raw, ${mb(gzipBytes)} gzipped (~${kb(gzipBytes / used.size)} each)`,
    `Weak hints (target ranks below #40 in the hint's own list): ${weak.length}`,
    missing.length ? `Not in the vocabulary (skipped): ${missing.join(', ')}` : '',
    hintless.length ? `No good hint (skipped): ${hintless.join(', ')}` : '',
  ].filter(Boolean);

  const dayLines = days.flatMap((day, i) => [
    '',
    `## Day ${i + 1} · ${dateForDay(i + 1, CONFIG.firstPuzzleDate)}`,
    ...day.map((w) => describeRound(rounds.get(w)!)),
  ]);
  await mkdir(dirname(REVIEW_PATH), { recursive: true });
  await writeFile(
    REVIEW_PATH,
    [
      '# Puzzle review',
      '',
      'Generated by `npm run data:build`. Each line: target ← hint (its rank, and where the target',
      "ranks in the hint's own list; ⚠ when that is weak), then ranks 2–13.",
      '',
      ...summary.map((line) => `- ${line}`),
      '',
      '# Practice words',
      '',
      ...practicePool.map(describeRound).sort(),
      '',
      '# Daily schedule',
      ...dayLines,
    ].join('\n') + '\n',
  );

  console.log('');
  for (const line of summary) console.log(line);
  console.log(
    `\nWrote public/data/, schedule.txt and ${REVIEW_PATH} in ${((Date.now() - started) / 1000).toFixed(1)}s`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
