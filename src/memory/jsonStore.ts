import fs from 'node:fs/promises';
import path from 'node:path';
import type { MemoryState, Storage } from './types.js';

const EMPTY: MemoryState = { version: 1, conversations: [], preferences: {} };

export class JsonStore implements Storage {
  constructor(private readonly file: string) {}

  location(): string {
    return this.file;
  }

  async load(): Promise<MemoryState> {
    try {
      const raw = await fs.readFile(this.file, 'utf8');
      const parsed = JSON.parse(raw) as MemoryState;
      if (parsed.version !== 1) return EMPTY;
      return parsed;
    } catch (err) {
      if (isNotFound(err)) return structuredClone(EMPTY);
      // Corrupt file → don't crash; surface empty state but don't overwrite yet.
      return structuredClone(EMPTY);
    }
  }

  /** Atomic write: serialize → write temp → rename. */
  async save(state: MemoryState): Promise<void> {
    await fs.mkdir(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.${process.pid}.tmp`;
    await fs.writeFile(tmp, JSON.stringify(state, null, 2), 'utf8');
    await fs.rename(tmp, this.file);
  }

  async clear(): Promise<void> {
    try {
      await fs.unlink(this.file);
    } catch (err) {
      if (!isNotFound(err)) throw err;
    }
  }
}

function isNotFound(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === 'ENOENT'
  );
}
