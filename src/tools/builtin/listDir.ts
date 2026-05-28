import fs from 'node:fs/promises';
import { z } from 'zod';
import { expandPath } from '../../utils/expandPath.js';
import type { Tool } from '../types.js';

const schema = z.object({
  path: z
    .string()
    .optional()
    .describe('Directory to list (absolute or relative). Defaults to the working directory.'),
  hidden: z
    .boolean()
    .optional()
    .describe('Include entries starting with a dot. Defaults to false.'),
});

export const listDirTool: Tool<typeof schema> = {
  name: 'list_dir',
  description:
    'List the files and folders in a directory. Use when the user asks "what is in this folder" or wants to browse their files.',
  schema,
  async execute({ path: target, hidden }, ctx) {
    const resolved = target ? expandPath(target, ctx.cwd) : ctx.cwd;

    const entries = await fs.readdir(resolved, { withFileTypes: true });
    const filtered = entries.filter((e) => hidden || !e.name.startsWith('.'));
    filtered.sort((a, b) => {
      if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    const rows = filtered.map((e) => {
      const kind = e.isDirectory() ? 'dir' : e.isSymbolicLink() ? 'link' : 'file';
      return `${kind.padEnd(4)}  ${e.name}`;
    });

    return {
      ok: true,
      output:
        rows.length === 0
          ? `${resolved} is empty.`
          : `${resolved}\n${rows.join('\n')}`,
      meta: { path: resolved, count: rows.length },
    };
  },
};
