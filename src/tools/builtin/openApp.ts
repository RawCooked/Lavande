import { execa } from 'execa';
import { z } from 'zod';
import type { Tool, ToolContext } from '../types.js';

const schema = z.object({
  target: z
    .string()
    .describe(
      'What to open. An app name (e.g. "calc", "notepad", "spotify", "brave"), a file path, or a URL. On Windows use PowerShell-friendly names: calc, notepad, mspaint, explorer, taskmgr.',
    ),
});

/** Extensions that count as executables and require confirmation. */
const EXECUTABLE_EXTENSIONS = new Set(['.exe', '.bat', '.cmd', '.ps1', '.msi', '.com', '.vbs']);

function isExecutable(target: string): boolean {
  const lower = target.toLowerCase().trimEnd();
  for (const ext of EXECUTABLE_EXTENSIONS) {
    if (lower.endsWith(ext)) return true;
  }
  return false;
}

async function openWindows(target: string, ctx: ToolContext): Promise<string> {
  if (isExecutable(target)) {
    const ok = await ctx.confirm({
      title: `Run executable?`,
      detail: target,
      action: 'Run',
    });
    if (!ok) return 'User declined to run the executable.';
  }

  // PowerShell Start-Process handles:
  //   • app names: calc, notepad, spotify, brave, chrome, …
  //   • file paths: opens with the default associated app
  //   • URLs: opens with the default browser
  // Single-quote the target for PS, escaping embedded single-quotes.
  const escaped = target.replace(/'/g, "''");
  await execa('powershell', [
    '-NoProfile',
    '-NonInteractive',
    '-Command',
    `Start-Process -FilePath '${escaped}'`,
  ]);
  return `Opened: ${target}`;
}

export const openAppTool: Tool<typeof schema> = {
  name: 'open_app',
  description:
    "Open an application, file, or URL on the user's computer. On Windows use PowerShell app names: calc (Calculator), notepad, mspaint (Paint), explorer, taskmgr. File paths and URLs also work. Executable files (.exe, .bat, .ps1) require confirmation.",
  schema,
  async execute({ target }, ctx) {
    const platform = process.platform;

    try {
      let output: string;
      if (platform === 'win32') {
        output = await openWindows(target, ctx);
      } else if (platform === 'darwin') {
        await execa('open', [target]);
        output = `Opened: ${target}`;
      } else {
        await execa('xdg-open', [target]);
        output = `Opened: ${target}`;
      }
      return { ok: true, output, meta: { target, platform } };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, output: `Could not open "${target}": ${msg}` };
    }
  },
};
