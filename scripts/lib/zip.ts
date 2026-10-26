/**
 * Minimal, dependency-free zip reader: just enough to pull one large deflated
 * entry out as a stream. Entries over 4 GB (zip64 sizes) are fine; archives
 * over 4 GB are not.
 */
import { createReadStream } from 'node:fs';
import { open } from 'node:fs/promises';
import type { Readable } from 'node:stream';
import { createInflateRaw } from 'node:zlib';

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;
const ZIP64_EXTRA_ID = 0x0001;
const ZIP64_MARKER = 0xffffffff;

export interface ZipEntry {
  name: string;
  method: number;
  compressedSize: number;
  size: number;
  localHeaderOffset: number;
}

export async function listZipEntries(zipPath: string): Promise<ZipEntry[]> {
  const file = await open(zipPath, 'r');
  try {
    const { size } = await file.stat();
    const tailLength = Math.min(size, 65_557);
    const tail = Buffer.alloc(tailLength);
    await file.read(tail, 0, tailLength, size - tailLength);

    let eocd = -1;
    for (let i = tailLength - 22; i >= 0; i--) {
      if (tail.readUInt32LE(i) === EOCD_SIG) {
        eocd = i;
        break;
      }
    }
    if (eocd < 0) throw new Error(`${zipPath} is not a zip file (no end-of-directory record)`);

    const entryCount = tail.readUInt16LE(eocd + 10);
    const dirSize = tail.readUInt32LE(eocd + 12);
    const dirOffset = tail.readUInt32LE(eocd + 16);
    if (dirOffset === 0xffffffff) throw new Error('zip64 archives are not supported');

    const dir = Buffer.alloc(dirSize);
    await file.read(dir, 0, dirSize, dirOffset);

    const entries: ZipEntry[] = [];
    let p = 0;
    for (let i = 0; i < entryCount; i++) {
      if (dir.readUInt32LE(p) !== CENTRAL_SIG) throw new Error('Corrupt zip central directory');
      const nameLength = dir.readUInt16LE(p + 28);
      const extraLength = dir.readUInt16LE(p + 30);
      const commentLength = dir.readUInt16LE(p + 32);
      const entry: ZipEntry = {
        method: dir.readUInt16LE(p + 10),
        compressedSize: dir.readUInt32LE(p + 20),
        size: dir.readUInt32LE(p + 24),
        localHeaderOffset: dir.readUInt32LE(p + 42),
        name: dir.toString('utf8', p + 46, p + 46 + nameLength),
      };
      readZip64Sizes(entry, dir.subarray(p + 46 + nameLength, p + 46 + nameLength + extraLength));
      entries.push(entry);
      p += 46 + nameLength + extraLength + commentLength;
    }
    return entries;
  } finally {
    await file.close();
  }
}

/**
 * Fields too big for 32 bits are 0xffffffff in the directory, with the real
 * values in a zip64 extra field, in this order, for just the fields that overflowed.
 */
function readZip64Sizes(entry: ZipEntry, extra: Buffer): void {
  for (let q = 0; q + 4 <= extra.length; q += 4 + extra.readUInt16LE(q + 2)) {
    if (extra.readUInt16LE(q) !== ZIP64_EXTRA_ID) continue;
    let at = q + 4;
    for (const field of ['size', 'compressedSize', 'localHeaderOffset'] as const) {
      if (entry[field] !== ZIP64_MARKER) continue;
      entry[field] = Number(extra.readBigUInt64LE(at));
      at += 8;
    }
    return;
  }
}

/** Returns a stream of the entry's decompressed bytes. */
export async function openZipEntry(zipPath: string, entry: ZipEntry): Promise<Readable> {
  if (entry.method !== 0 && entry.method !== 8) {
    throw new Error(`Unsupported compression method ${entry.method} for ${entry.name}`);
  }
  const file = await open(zipPath, 'r');
  const header = Buffer.alloc(30);
  try {
    await file.read(header, 0, 30, entry.localHeaderOffset);
  } finally {
    await file.close();
  }
  if (header.readUInt32LE(0) !== LOCAL_SIG) throw new Error('Corrupt zip local header');
  const dataStart =
    entry.localHeaderOffset + 30 + header.readUInt16LE(26) + header.readUInt16LE(28);
  const raw = createReadStream(zipPath, {
    start: dataStart,
    end: dataStart + entry.compressedSize - 1,
  });
  return entry.method === 0 ? raw : raw.pipe(createInflateRaw());
}
