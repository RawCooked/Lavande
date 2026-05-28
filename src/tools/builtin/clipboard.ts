import clipboardy from 'clipboardy';
import { z } from 'zod';
import { truncate } from '../../utils/format.js';
import type { Tool } from '../types.js';

const schema = z.object({
  maxChars: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Maximum characters to return. Defaults to 4000.'),
});

const DEFAULT_MAX = 4000;

export const clipboardTool: Tool<typeof schema> = {
  name: 'read_clipboard',
  description:
    "Read the user's system clipboard. Use when the user says \"check my clipboard\", \"what did I just copy\", or asks you to act on something they copied.",
  schema,
  async execute({ maxChars }) {
    try {
      const raw = await clipboardy.read();
      if (!raw) return { ok: true, output: 'Clipboard is empty.' };

      const cap = maxChars ?? DEFAULT_MAX;
      const out = truncate(raw, cap);
      return {
        ok: true,
        output: out,
        meta: { length: raw.length, truncated: raw.length > cap },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, output: `Could not read the clipboard: ${msg}` };
    }
  },
};
