/**
 * The heavy lifting (one full pass over the vocabulary per word) spread over
 * worker threads. Vectors live in shared memory, so workers don't copy them.
 */
import { availableParallelism } from 'node:os';
import { Worker } from 'node:worker_threads';
import type { Vocabulary } from './vocab';

type Job =
  { op: 'top'; word: number; count: number } | { op: 'count'; word: number; thresholds: number[] };

/** Plain JavaScript, evaluated inside each worker. */
const WORKER_SOURCE = `
const { parentPort, workerData } = require('node:worker_threads');
const { vectorsBuffer, rankableBuffer, dims, jobs } = workerData;
const vectors = new Float32Array(vectorsBuffer);
const rankable = new Uint8Array(rankableBuffer);
const n = rankable.length;
const sims = new Float32Array(n);

function fill(word) {
  const base = word * dims;
  for (let j = 0; j < n; j++) {
    if (!rankable[j] || j === word) { sims[j] = -Infinity; continue; }
    let s = 0;
    for (let k = 0, o = j * dims; k < dims; k++) s += vectors[base + k] * vectors[o + k];
    sims[j] = s;
  }
}

const results = [];
for (let q = 0; q < jobs.length; q++) {
  const job = jobs[q];
  fill(job.word);
  if (job.op === 'top') {
    const want = Math.min(job.count, n);
    const threshold = Float32Array.from(sims).sort()[Math.max(0, n - want)];
    const top = [];
    for (let j = 0; j < n; j++) if (sims[j] >= threshold && sims[j] > -Infinity) top.push(j);
    top.sort((a, b) => sims[b] - sims[a] || a - b);
    const chosen = top.slice(0, want);
    results.push({ indices: Int32Array.from(chosen), sims: Float32Array.from(chosen, (j) => sims[j]) });
  } else {
    const counts = new Int32Array(job.thresholds.length);
    for (let j = 0; j < n; j++) {
      const s = sims[j];
      for (let r = 0; r < job.thresholds.length; r++) if (s > job.thresholds[r]) counts[r]++;
    }
    results.push(counts);
  }
  if (q % 25 === 24) parentPort.postMessage({ progress: 25 });
}
parentPort.postMessage({ results });
`;

async function run<T>(vocab: Vocabulary, jobs: Job[], label: string): Promise<T[]> {
  if (jobs.length === 0) return [];
  const threads = Math.max(1, Math.min(availableParallelism() - 1, Math.ceil(jobs.length / 20)));
  // Interleave jobs so every worker gets a similar mix.
  const slices: { job: Job; at: number }[][] = Array.from({ length: threads }, () => []);
  jobs.forEach((job, at) => slices[at % threads].push({ job, at }));

  const results = new Array<T>(jobs.length);
  let done = 0;
  const report = () => process.stdout.write(`\r  ${label}: ${done} / ${jobs.length}   `);

  await Promise.all(
    slices.map(
      (slice) =>
        new Promise<void>((resolve, reject) => {
          const worker = new Worker(WORKER_SOURCE, {
            eval: true,
            workerData: {
              vectorsBuffer: vocab.vectors.buffer,
              rankableBuffer: vocab.rankable.buffer,
              dims: vocab.dims,
              jobs: slice.map((s) => s.job),
            },
          });
          worker.on('message', (message: { progress?: number; results?: T[] }) => {
            if (message.progress) {
              done += message.progress;
              report();
            }
            if (message.results) {
              message.results.forEach((result, i) => (results[slice[i].at] = result));
              void worker.terminate();
              resolve();
            }
          });
          worker.on('error', reject);
        }),
    ),
  );
  process.stdout.write(`\r  ${label}: ${jobs.length} done.          \n`);
  return results;
}

/** Each word's `count` nearest rankable words (itself excluded), closest first. */
export function nearest(
  vocab: Vocabulary,
  words: readonly number[],
  count: number,
  label = 'ranking neighbors',
): Promise<{ indices: Int32Array; sims: Float32Array }[]> {
  return run(
    vocab,
    words.map((word) => ({ op: 'top', word, count })),
    label,
  );
}

/** For each job, how many rankable words are more similar to `word` than each threshold. */
export function countCloser(
  vocab: Vocabulary,
  jobs: readonly { word: number; thresholds: number[] }[],
  label = 'scoring hints',
): Promise<Int32Array[]> {
  return run(
    vocab,
    jobs.map((job) => ({ op: 'count', ...job })),
    label,
  );
}
