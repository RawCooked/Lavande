import fs from 'node:fs/promises';
import path from 'node:path';
import { z } from 'zod';
import { expandPath } from '../../utils/expandPath.js';
import type { Tool } from '../types.js';

const schema = z.object({
  path: z.string().describe('Destination path (absolute or relative to the working directory).'),
  content: z.string().describe('Full file contents to write.'),
  overwrite: z
    .boolean()
    .optional()
    .describe('If true, allow overwriting an existing file. Defaults to false.'),
});

export const writeFileTool: Tool<typeof schema> = {
  name: 'write_file',
  description:
    'Write a text file to disk. Creating a new file is always allowed. Overwriting an existing file requires user confirmation, so set overwrite: true only when intentional.',
  schema,
  // Confirmation is decided dynamically inside execute() based on whether the
  // target exists. Not declaring `dangerous: true` here lets new-file writes go
  // through silently — the common case.
  async execute({ path: target, content, overwrite }, ctx) {
    const resolved = expandPath(target, ctx.cwd);

    let exists = false;
    try {
      await fs.access(resolved);
      exists = true;
    } catch {
      exists = false;
    }

    if (exists) {
      if (!overwrite) {
        return {
          ok: false,
          output: `${resolved} already exists. Re-call with overwrite: true to replace it.`,
        };
      }
      const ok = await ctx.confirm({
        title: 'Overwrite file?',
        detail: resolved,
        action: 'Overwrite',
      });
      if (!ok) return { ok: false, output: 'User declined to overwrite the file.' };
    }

    await fs.mkdir(path.dirname(resolved), { recursive: true });
    await fs.writeFile(resolved, content, 'utf8');

    return {
      ok: true,
      output: `Wrote ${content.length} characters to ${resolved}.`,
      meta: { path: resolved, bytes: Buffer.byteLength(content, 'utf8'), overwritten: exists },
    };
  },
};
