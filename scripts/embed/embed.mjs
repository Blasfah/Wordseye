/**
 * Embeds every word in a list with BGE base (an open text-embedding model, run
 * locally) and writes a word2vec-style text file. Called by blend-vectors.ts;
 * the model (~440 MB) is downloaded once into scripts/.cache/models/.
 *
 *   node scripts/embed/embed.mjs <words.txt> <out.vec>
 */
import { env, pipeline } from '@huggingface/transformers';
import { createWriteStream, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MODEL = 'Xenova/bge-base-en-v1.5';
const BATCH = 128;

const [wordsPath, outPath] = process.argv.slice(2);
if (!wordsPath || !outPath) {
  console.error('usage: node scripts/embed/embed.mjs <words.txt> <out.vec>');
  process.exit(1);
}
env.cacheDir = join(dirname(fileURLToPath(import.meta.url)), '..', '.cache', 'models');

const words = readFileSync(wordsPath, 'utf8').split(/\r?\n/).filter(Boolean);
console.log(`Embedding ${words.length.toLocaleString()} words with ${MODEL}…`);
const extract = await pipeline('feature-extraction', MODEL, { dtype: 'fp32' });

const out = createWriteStream(outPath);
const started = Date.now();
for (let i = 0; i < words.length; i += BATCH) {
  const batch = words.slice(i, i + BATCH);
  // BGE's sentence embedding is its [CLS] token.
  const tensor = await extract(batch, { pooling: 'cls', normalize: true });
  const dims = tensor.dims[1];
  if (i === 0) out.write(`${words.length} ${dims}\n`);
  const lines = batch.map((word, b) => {
    const row = Array.from(tensor.data.subarray(b * dims, (b + 1) * dims), (v) => v.toFixed(5));
    return `${word} ${row.join(' ')}`;
  });
  out.write(lines.join('\n') + '\n');
  const done = i + batch.length;
  const rate = done / ((Date.now() - started) / 1000);
  process.stdout.write(`\r  ${done} / ${words.length} (${rate.toFixed(0)} words/s)   `);
}
await new Promise((resolve) => out.end(resolve));
console.log(`\nWrote ${outPath} in ${((Date.now() - started) / 1000).toFixed(0)}s`);
