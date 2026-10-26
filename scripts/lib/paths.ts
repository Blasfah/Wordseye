import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCRIPTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
export const ROOT_DIR = join(SCRIPTS_DIR, '..');
export const CACHE_DIR = join(SCRIPTS_DIR, '.cache');
export const DATA_OUT_DIR = join(ROOT_DIR, 'public', 'data');
export const SCRIPTS_OUTPUT_DIR = join(SCRIPTS_DIR, 'output');
export const REVIEW_PATH = join(SCRIPTS_OUTPUT_DIR, 'review.md');

/** The source models (see fetch-vectors.ts and blend-vectors.ts). */
export const GLOVE_PATH = join(CACHE_DIR, 'glove.6B.300d.txt');
export const FASTTEXT_PATH = join(CACHE_DIR, 'crawl-300d-2M.vec');
export const NUMBERBATCH_PATH = join(CACHE_DIR, 'numberbatch-en-19.08.txt.gz');
export const BGE_PATH = join(CACHE_DIR, 'bge-base-en-v1.5.vec');
/** What the puzzles are built from: the three models above GloVe, blended. */
export const DEFAULT_VECTORS_PATH = join(CACHE_DIR, 'blend.vec');
