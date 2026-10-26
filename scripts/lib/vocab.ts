/** Loading the vocabulary and its word vectors, shared by every data script. */
import { createReadStream, existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { createInterface } from 'node:readline';
import { createGunzip } from 'node:zlib';
import { SCRIPTS_DIR } from './paths';

export const VOCAB_SETTINGS = {
  /**
   * Only the N most frequent tokens of the vector file are read (GloVe is
   * frequency-sorted, and the blend keeps GloVe's order).
   */
  frequencyCutoff: 100_000,
  /** SCOWL dictionary size, 10–70. Bigger admits rarer words. */
  dictionarySize: 60,
  minWordLength: 3,
  maxWordLength: 16,
};

export interface Vocabulary {
  /** Words in frequency order: index 0 is the most common. */
  words: string[];
  index: Map<string, number>;
  dims: number;
  /** Row-major, L2-normalized vectors in shared memory, so worker threads can read them. */
  vectors: Float32Array;
  /** 1 for words that get ranked; 0 for stopwords, which are guessable but always cold. */
  rankable: Uint8Array;
  /**
   * SCOWL size of each word: 10 is the most everyday English, 60 the rarest we
   * keep. Unlike corpus frequency, it isn't inflated by names ("oxford": 50).
   */
  commonness: Map<string, number>;
}

/** Every curated target is at this SCOWL size or more common. */
export const EVERYDAY = 35;

export interface WordLists {
  blocklist: Set<string>;
  hintAvoid: Set<string>;
  stopwords: Set<string>;
}

/** One lowercase word per line; blank lines and # comments are skipped. */
export async function readWordList(name: string): Promise<string[]> {
  const path = join(SCRIPTS_DIR, 'data', name);
  if (!existsSync(path)) return [];
  const text = await readFile(path, 'utf8');
  return text
    .split(/\r?\n/)
    .map((line) => line.trim().toLowerCase())
    .filter((line) => line && !line.startsWith('#'));
}

export async function loadWordLists(): Promise<WordLists> {
  const [blocklist, hintAvoid, stopwords] = await Promise.all(
    ['blocklist.txt', 'hint-avoid.txt', 'stopwords.txt'].map(
      async (f) => new Set(await readWordList(f)),
    ),
  );
  return { blocklist, hintAvoid, stopwords };
}

/** Dictionary words mapped to the smallest SCOWL size they appear in. */
function loadDictionary(maxSize: number): Map<string, number> {
  const requireCjs = createRequire(import.meta.url);
  const lists = requireCjs('wordlist-english') as Record<string, string[] | undefined>;
  const dialects = ['english', 'english/american', 'english/british', 'english/canadian'];
  const dictionary = new Map<string, number>();
  for (const size of [10, 20, 35, 40, 50, 55, 60, 70].filter((s) => s <= maxSize)) {
    for (const dialect of dialects) {
      for (const word of lists[`${dialect}/${size}`] ?? []) {
        if (!dictionary.has(word)) dictionary.set(word, size);
      }
    }
  }
  return dictionary;
}

/**
 * Reads the most frequent tokens of a word2vec-style text file and keeps the
 * dictionary words: no proper nouns, abbreviations, numbers or blocklisted words.
 */
export async function loadVocabulary(path: string, lists: WordLists): Promise<Vocabulary> {
  const dictionary = loadDictionary(VOCAB_SETTINGS.dictionarySize);
  const { minWordLength, maxWordLength, frequencyCutoff } = VOCAB_SETTINGS;
  const wordShape = new RegExp(`^[a-z]{${minWordLength},${maxWordLength}}$`);

  const rows: Float32Array[] = [];
  const words: string[] = [];
  const index = new Map<string, number>();
  let dims = 0;
  let lineNumber = 0;

  const lines = createInterface({ input: createReadStream(path), crlfDelay: Infinity });
  for await (const line of lines) {
    // fastText .vec files start with a "count dims" header line.
    if (lineNumber === 0 && /^\d+ \d+$/.test(line.trim())) continue;
    if (++lineNumber > frequencyCutoff) break;

    const space = line.indexOf(' ');
    const word = line.slice(0, space);
    if (index.has(word) || !wordShape.test(word) || !dictionary.has(word)) continue;
    if (lists.blocklist.has(word)) continue;

    const parts = line
      .slice(space + 1)
      .trim()
      .split(' ');
    if (dims === 0) dims = parts.length;
    if (parts.length !== dims) {
      throw new Error(`Line ${lineNumber} (${word}) has ${parts.length} dims, expected ${dims}`);
    }

    const row = new Float32Array(dims);
    let norm = 0;
    for (let k = 0; k < dims; k++) {
      row[k] = Number(parts[k]);
      norm += row[k] * row[k];
    }
    norm = Math.sqrt(norm) || 1;
    for (let k = 0; k < dims; k++) row[k] /= norm;

    index.set(word, words.length);
    words.push(word);
    rows.push(row);
  }
  lines.close();

  const vectors = new Float32Array(new SharedArrayBuffer(words.length * dims * 4));
  rows.forEach((row, i) => vectors.set(row, i * dims));
  const rankable = new Uint8Array(new SharedArrayBuffer(words.length));
  words.forEach((word, i) => (rankable[i] = lists.stopwords.has(word) ? 0 : 1));
  const commonness = new Map(words.map((word) => [word, dictionary.get(word)!]));
  return { words, index, dims, vectors, rankable, commonness };
}

/**
 * Unit-length vectors for just the words in `wanted`, from any word2vec-style
 * text file (gzipped too). ConceptNet's "/c/en/" prefixes are dropped. The first
 * line for a word wins, so a cased file's lowercase entry is the one kept.
 */
export async function readVectorRows(
  path: string,
  wanted: ReadonlySet<string>,
): Promise<Map<string, Float32Array>> {
  const input = createReadStream(path);
  const stream = path.endsWith('.gz') ? input.pipe(createGunzip()) : input;
  const lines = createInterface({ input: stream, crlfDelay: Infinity });
  const found = new Map<string, Float32Array>();
  let first = true;
  for await (const line of lines) {
    if (first && /^\d+ \d+$/.test(line.trim())) {
      first = false;
      continue;
    }
    first = false;
    const space = line.indexOf(' ');
    const word = line.slice(0, space).replace(/^\/c\/en\//, '');
    if (!wanted.has(word) || found.has(word)) continue;
    const row = Float32Array.from(
      line
        .slice(space + 1)
        .trim()
        .split(' '),
      Number,
    );
    let norm = 0;
    for (let k = 0; k < row.length; k++) norm += row[k] * row[k];
    norm = Math.sqrt(norm) || 1;
    for (let k = 0; k < row.length; k++) row[k] /= norm;
    found.set(word, row);
    if (found.size === wanted.size) break;
  }
  lines.close();
  input.destroy();
  return found;
}

export function similarity(vocab: Vocabulary, a: number, b: number): number {
  const { dims, vectors } = vocab;
  let sum = 0;
  for (let k = 0, i = a * dims, j = b * dims; k < dims; k++) sum += vectors[i + k] * vectors[j + k];
  return sum;
}

/** Normalized mean of several word vectors. */
export function centroid(vocab: Vocabulary, members: readonly number[]): Float32Array {
  const { dims, vectors } = vocab;
  const out = new Float32Array(dims);
  for (const m of members) for (let k = 0; k < dims; k++) out[k] += vectors[m * dims + k];
  let norm = 0;
  for (let k = 0; k < dims; k++) norm += out[k] * out[k];
  norm = Math.sqrt(norm) || 1;
  for (let k = 0; k < dims; k++) out[k] /= norm;
  return out;
}

export function similarityTo(vocab: Vocabulary, word: number, vector: Float32Array): number {
  const { dims, vectors } = vocab;
  let sum = 0;
  for (let k = 0, i = word * dims; k < dims; k++) sum += vectors[i + k] * vector[k];
  return sum;
}

/** "holders" or "rescued" next to "holder" or "rescue": an inflected form of another word. */
export function isInflected(vocab: Vocabulary, word: string): boolean {
  const has = (w: string) => w.length >= 3 && vocab.index.has(w);
  const doubled = (stem: string) => stem.length > 3 && stem.at(-1) === stem.at(-2);
  if (word.endsWith('s') && !/(ss|us|is)$/.test(word)) {
    if (has(word.slice(0, -1))) return true;
    if (word.endsWith('es') && has(word.slice(0, -2))) return true;
    if (word.endsWith('ies') && has(word.slice(0, -3) + 'y')) return true;
  }
  for (const suffix of ['ed', 'ing']) {
    if (!word.endsWith(suffix)) continue;
    const stem = word.slice(0, -suffix.length);
    if (has(stem) || has(stem + 'e') || (doubled(stem) && has(stem.slice(0, -1)))) return true;
    if (stem.endsWith('i') && has(stem.slice(0, -1) + 'y')) return true;
  }
  if (word.endsWith('ly') && (has(word.slice(0, -2)) || has(word.slice(0, -3) + 'y'))) return true;
  // Comparatives and superlatives come in pairs: bigger/biggest, later/latest.
  if (word.endsWith('est') && has(word.slice(0, -3) + 'er')) return true;
  if (word.endsWith('er') && has(word.slice(0, -2) + 'est')) return true;
  return false;
}
