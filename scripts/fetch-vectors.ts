/**
 * Downloads the GloVe 6B word vectors (Wikipedia 2014 + Gigaword 5, uncased)
 * and extracts the 300-dimensional file into scripts/.cache/.
 *
 *   npm run data:fetch
 *
 * The zip is ~860 MB and the extracted text file ~1 GB. Both are gitignored.
 */
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { CACHE_DIR, DEFAULT_VECTORS_PATH as VECTORS_PATH } from './lib/paths';
import { listZipEntries, openZipEntry } from './lib/zip';

const ZIP_PATH = join(CACHE_DIR, 'glove.6B.zip');
const ENTRY_NAME = 'glove.6B.300d.txt';

const MIRRORS = [
  'https://huggingface.co/stanfordnlp/glove/resolve/main/glove.6B.zip',
  'https://nlp.stanford.edu/data/glove.6B.zip',
];

function progress(label: string, total: number): Transform {
  let seen = 0;
  let lastPrinted = 0;
  return new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      seen += chunk.length;
      const now = Date.now();
      if (now - lastPrinted > 1000) {
        lastPrinted = now;
        const pct = total ? ` (${((seen / total) * 100).toFixed(1)}%)` : '';
        process.stdout.write(`\r${label}: ${(seen / 1e6).toFixed(0)} MB${pct}   `);
      }
      callback(null, chunk);
    },
    flush(callback) {
      process.stdout.write(`\r${label}: ${(seen / 1e6).toFixed(0)} MB, done.        \n`);
      callback();
    },
  });
}

async function download(): Promise<void> {
  const partPath = `${ZIP_PATH}.part`;
  for (const url of MIRRORS) {
    try {
      console.log(`Downloading ${url}`);
      const response = await fetch(url, { signal: AbortSignal.timeout(60 * 60 * 1000) });
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
      const total = Number(response.headers.get('content-length') ?? 0);
      await pipeline(
        Readable.fromWeb(response.body as import('node:stream/web').ReadableStream),
        progress('glove.6B.zip', total),
        createWriteStream(partPath),
      );
      await rename(partPath, ZIP_PATH);
      return;
    } catch (error) {
      console.warn(`  failed: ${(error as Error).message}`);
      await rm(partPath, { force: true });
    }
  }
  throw new Error('Could not download GloVe from any mirror. See README for manual steps.');
}

async function main(): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });

  if (existsSync(VECTORS_PATH)) {
    const { size } = await stat(VECTORS_PATH);
    console.log(`${ENTRY_NAME} already present (${(size / 1e6).toFixed(0)} MB). Nothing to do.`);
    return;
  }

  if (!existsSync(ZIP_PATH)) await download();

  const entry = (await listZipEntries(ZIP_PATH)).find((e) => e.name === ENTRY_NAME);
  if (!entry) throw new Error(`${ENTRY_NAME} not found inside ${ZIP_PATH}`);

  const partPath = `${VECTORS_PATH}.part`;
  await pipeline(
    await openZipEntry(ZIP_PATH, entry),
    progress(`Extracting ${ENTRY_NAME}`, entry.size),
    createWriteStream(partPath),
  );
  await rename(partPath, VECTORS_PATH);
  console.log(`Wrote ${VECTORS_PATH}`);
  console.log('You can delete glove.6B.zip now if you want the disk space back.');
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
