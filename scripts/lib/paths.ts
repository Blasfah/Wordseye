import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const SCRIPTS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..');
export const ROOT_DIR = join(SCRIPTS_DIR, '..');
export const CACHE_DIR = join(SCRIPTS_DIR, '.cache');
export const DEFAULT_VECTORS_PATH = join(CACHE_DIR, 'glove.6B.300d.txt');
export const DATA_OUT_DIR = join(ROOT_DIR, 'public', 'data');
export const SCRIPTS_OUTPUT_DIR = join(SCRIPTS_DIR, 'output');
export const REVIEW_PATH = join(SCRIPTS_OUTPUT_DIR, 'review.md');
