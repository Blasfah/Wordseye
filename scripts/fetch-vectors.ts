/**
 * Downloads the pretrained word vectors into scripts/.cache/ (gitignored):
 *
 *   GloVe 6B 300d          ~860 MB zip, ~1 GB extracted. Sets the vocabulary and word frequency.
 *   fastText Common Crawl  ~1.5 GB zip, ~4.5 GB extracted.
 *   ConceptNet Numberbatch ~330 MB, read as it is (gzipped).
 *
 *   npm run data:fetch
 *
 * Files already present are skipped. Afterwards, `npm run data:vectors` adds the
 * third model (BGE) and blends them.
 */
import { createWriteStream, existsSync } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { basename, join } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { CACHE_DIR, FASTTEXT_PATH, GLOVE_PATH, NUMBERBATCH_PATH } from './lib/paths';
import { listZipEntries, openZipEntry } from './lib/zip';

interface Source {
  name: string;
  /** Tried in order. */
  urls: string[];
  /** The file the scripts read. */
  path: string;
  /** Set when the download is a zip holding that file. */
  zip?: { path: string; entry: string };
}

const SOURCES: Source[] = [
  {
    name: 'GloVe 6B',
    urls: [
      'https://huggingface.co/stanfordnlp/glove/resolve/main/glove.6B.zip',
      'https://nlp.stanford.edu/data/glove.6B.zip',
    ],
    path: GLOVE_PATH,
    zip: { path: join(CACHE_DIR, 'glove.6B.zip'), entry: 'glove.6B.300d.txt' },
  },
  {
    name: 'fastText Common Crawl',
    urls: ['https://dl.fbaipublicfiles.com/fasttext/vectors-english/crawl-300d-2M.vec.zip'],
    path: FASTTEXT_PATH,
    zip: { path: join(CACHE_DIR, 'crawl-300d-2M.vec.zip'), entry: 'crawl-300d-2M.vec' },
  },
  {
    name: 'ConceptNet Numberbatch',
    urls: [
      'https://conceptnet.s3.amazonaws.com/downloads/2019/numberbatch/numberbatch-en-19.08.txt.gz',
    ],
    path: NUMBERBATCH_PATH,
  },
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

async function download(urls: readonly string[], path: string): Promise<void> {
  const partPath = `${path}.part`;
  for (const url of urls) {
    try {
      console.log(`Downloading ${url}`);
      const response = await fetch(url, { signal: AbortSignal.timeout(2 * 60 * 60 * 1000) });
      if (!response.ok || !response.body) throw new Error(`HTTP ${response.status}`);
      const total = Number(response.headers.get('content-length') ?? 0);
      await pipeline(
        Readable.fromWeb(response.body as import('node:stream/web').ReadableStream),
        progress(basename(path), total),
        createWriteStream(partPath),
      );
      await rename(partPath, path);
      return;
    } catch (error) {
      console.warn(`  failed: ${(error as Error).message}`);
      await rm(partPath, { force: true });
    }
  }
  throw new Error(`Could not download ${basename(path)}. See README for manual steps.`);
}

async function fetchSource({ name, urls, path, zip }: Source): Promise<void> {
  if (existsSync(path)) {
    const { size } = await stat(path);
    console.log(`${name}: ${basename(path)} already present (${(size / 1e6).toFixed(0)} MB).`);
    return;
  }
  if (!zip) return download(urls, path);

  if (!existsSync(zip.path)) await download(urls, zip.path);
  const entry = (await listZipEntries(zip.path)).find((e) => e.name === zip.entry);
  if (!entry) throw new Error(`${zip.entry} not found inside ${zip.path}`);
  const partPath = `${path}.part`;
  await pipeline(
    await openZipEntry(zip.path, entry),
    progress(`Extracting ${zip.entry}`, entry.size),
    createWriteStream(partPath),
  );
  await rename(partPath, path);
  console.log(`Wrote ${path}. You can delete ${basename(zip.path)} to get the disk space back.`);
}

async function main(): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  for (const source of SOURCES) await fetchSource(source);
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
