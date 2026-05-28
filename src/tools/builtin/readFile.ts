import fs from 'node:fs/promises';
import { z } from 'zod';
import { expandPath } from '../../utils/expandPath.js';
import { truncate } from '../../utils/format.js';
import type { Tool } from '../types.js';

const MAX_BYTES = 200_000;

const schema = z.object({
  path: z.string().describe('Path to the file (absolute or relative to the working directory).'),
  maxBytes: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Maximum bytes to read. Defaults to 200000.'),
});

export const readFileTool: Tool<typeof schema> = {
  name: 'read_file',
  description:
    'Read the contents of a text file from disk. Use this when the user asks about a file, refers to a note, or needs to inspect content. Returns a head-truncated view for very large files.',
  schema,
  async execute({ path: target, maxBytes }, ctx) {
    const resolved = expandPath(target, ctx.cwd);
    const stat = await fs.stat(resolved);
    if (!stat.isFile()) {
      return { ok: false, output: `${resolved} is not a regular file.` };
    }

    const cap = Math.min(maxBytes ?? MAX_BYTES, MAX_BYTES);
    const buf = await fs.readFile(resolved);
    const text = buf.toString('utf8');
    const display = text.length > cap ? truncate(text, cap) : text;

    return {
      ok: true,
      output: display,
      meta: { path: resolved, bytes: stat.size, truncated: text.length > cap },
    };
  },
};
