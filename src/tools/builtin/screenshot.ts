import path from 'node:path';
import { z } from 'zod';
import { cacheDir } from '../../config/paths.js';
import type { Tool } from '../types.js';

const schema = z.object({
  region: z
    .enum(['full', 'window', 'selection'])
    .optional()
    .describe('What to capture. Defaults to full.'),
});

/**
 * Placeholder screenshot tool.
 *
 * Wiring this up requires a platform-specific capture: on macOS use `screencapture`,
 * on Windows use Snip & Sketch or a PowerShell snippet, on Linux pick a tool the
 * user already has (e.g. `gnome-screenshot`, `grim`). Keep the same return
 * shape — the rest of Lavande already handles the result.
 */
export const screenshotTool: Tool<typeof schema> = {
  name: 'screenshot',
  description:
    'Take a screenshot of the user\'s screen. Currently a placeholder — returns a stub path and reports that capture is not yet enabled.',
  schema,
  async execute({ region }) {
    const stubPath = path.join(cacheDir, `screenshot-${Date.now()}.png`);
    return {
      ok: false,
      output:
        `Screenshot capture is not enabled yet. ` +
        `Region requested: ${region ?? 'full'}. ` +
        `When implemented, the file would be saved to: ${stubPath}.`,
      meta: { stub: true, path: stubPath, region: region ?? 'full' },
    };
  },
};
