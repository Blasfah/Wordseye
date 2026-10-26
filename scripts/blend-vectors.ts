/**
 * Blends three word-vector models into the one file the puzzles are built from:
 *
 *   fastText Common Crawl   everyday web writing
 *   ConceptNet Numberbatch  word vectors corrected by a network of common-sense facts
 *   BGE base                a modern text-embedding model, given each word on its own
 *
 * Each word's three vectors are put side by side, so the blend's similarity is
 * the average of the three models' similarities. Each model has its own blind
 * spots (fastText and Numberbatch can follow the news, BGE can follow spelling:
 * "fox" → "foxtrot"), and they rarely share them.
 *
 *   npm run data:vectors
 *
 * Needs `npm run data:fetch` first. The vocabulary, and its frequency order, still
 * come from GloVe (see loadVocabulary). The first run also installs the embedding
 * package in scripts/embed/ and embeds the vocabulary with BGE (a few minutes).
 * Writes scripts/.cache/blend.vec.
 */
import { spawn } from 'node:child_process';
import { createWriteStream, existsSync } from 'node:fs';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { familyKey } from '../src/game/stem';
import {
  BGE_PATH,
  CACHE_DIR,
  DEFAULT_VECTORS_PATH,
  FASTTEXT_PATH,
  GLOVE_PATH,
  NUMBERBATCH_PATH,
  SCRIPTS_DIR,
} from './lib/paths';
import { loadVocabulary, loadWordLists, readVectorRows } from './lib/vocab';

const MODELS = [
  { name: 'fastText', path: FASTTEXT_PATH },
  { name: 'Numberbatch', path: NUMBERBATCH_PATH },
  { name: 'BGE', path: BGE_PATH },
];
const EMBED_DIR = join(SCRIPTS_DIR, 'embed');

function run(command: string, args: string[], cwd: string, shell = false): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd, stdio: 'inherit', shell });
    child.on('error', reject);
    child.on('exit', (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited with code ${code}`)),
    );
  });
}

/** Embeds the vocabulary with BGE, unless an earlier run already covered every word. */
async function ensureBge(words: readonly string[]): Promise<void> {
  if (existsSync(BGE_PATH)) {
    const have = await readVectorRows(BGE_PATH, new Set(words));
    if (have.size === words.length) return;
  }
  if (!existsSync(join(EMBED_DIR, 'node_modules'))) {
    console.log('Installing the embedding package in scripts/embed/…');
    await run('npm', ['install', '--no-audit', '--no-fund'], EMBED_DIR, true);
  }
  const listPath = join(CACHE_DIR, 'vocabulary.txt');
  await writeFile(listPath, words.join('\n') + '\n');
  await run(process.execPath, [join(EMBED_DIR, 'embed.mjs'), listPath, BGE_PATH], EMBED_DIR);
}

/**
 * Stands in for words a model lacks (Numberbatch skips many rare inflections,
 * "abolishes", "airfares"): the average of their family's vectors in that
 * model ("abolish"). Words with no family there are left out of that model.
 */
function fillGaps(words: readonly string[], rows: Map<string, Float32Array>): number {
  const families = new Map<string, Float32Array[]>();
  for (const [word, row] of rows) {
    const key = familyKey(word);
    families.set(key, [...(families.get(key) ?? []), row]);
  }
  let filled = 0;
  for (const word of words) {
    if (rows.has(word)) continue;
    const members = families.get(familyKey(word));
    if (!members) continue;
    const mean = new Float32Array(members[0].length);
    for (const row of members) for (let k = 0; k < mean.length; k++) mean[k] += row[k];
    const norm = Math.hypot(...mean) || 1;
    for (let k = 0; k < mean.length; k++) mean[k] /= norm;
    rows.set(word, mean);
    filled++;
  }
  return filled;
}

async function main(): Promise<void> {
  const started = Date.now();
  const lists = await loadWordLists();
  console.log('Reading GloVe for the vocabulary…');
  const { words } = await loadVocabulary(GLOVE_PATH, lists);
  const wanted = new Set(words);
  console.log(`Vocabulary: ${words.length.toLocaleString()} words`);

  await ensureBge(words);
  const models: { rows: Map<string, Float32Array>; dims: number }[] = [];
  for (const model of MODELS) {
    console.log(`Reading ${model.name}…`);
    const rows = await readVectorRows(model.path, wanted);
    const found = rows.size;
    const filled = fillGaps(words, rows);
    const dims = rows.values().next().value!.length;
    console.log(
      `  ${found.toLocaleString()} words found, ${filled} filled in from their family, ` +
        `${words.length - rows.size} left out`,
    );
    models.push({ rows, dims });
  }

  // Side by side, each part scaled so a word's whole vector has length 1.
  const dims = models.reduce((sum, m) => sum + m.dims, 0);
  const out = createWriteStream(DEFAULT_VECTORS_PATH);
  const write = (text: string) =>
    out.write(text) ? Promise.resolve() : new Promise((resolve) => out.once('drain', resolve));
  await write(`${words.length} ${dims}\n`);
  for (const word of words) {
    const parts = models.map((m) => m.rows.get(word));
    const scale = 1 / Math.sqrt(parts.filter(Boolean).length);
    const values: string[] = [];
    parts.forEach((row, p) => {
      for (let k = 0; k < models[p].dims; k++) values.push(row ? (row[k] * scale).toFixed(5) : '0');
    });
    await write(`${word} ${values.join(' ')}\n`);
  }
  await new Promise((resolve) => out.end(resolve));
  console.log(
    `\nWrote ${DEFAULT_VECTORS_PATH} (${dims} dims) in ${((Date.now() - started) / 1000).toFixed(0)}s`,
  );
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
