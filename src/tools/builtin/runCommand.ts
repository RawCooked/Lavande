import { execa } from 'execa';
import { z } from 'zod';
import { truncateLines } from '../../utils/format.js';
import { checkCommandSafety } from '../safety.js';
import type { Tool } from '../types.js';

const schema = z.object({
  command: z
    .string()
    .describe('The shell command line to execute. Quote arguments as needed.'),
  cwd: z
    .string()
    .optional()
    .describe('Working directory to run the command in. Defaults to Lavande\'s cwd.'),
  timeoutMs: z
    .number()
    .int()
    .positive()
    .optional()
    .describe('Max runtime in milliseconds. Defaults to 30000.'),
});

const MAX_OUT_LINES = 200;
const DEFAULT_TIMEOUT = 30_000;

export const runCommandTool: Tool<typeof schema> = {
  name: 'run_command',
  description:
    'Run a shell command on the user\'s machine. Use sparingly for things the user explicitly asks for (e.g. "show my disk usage"). Output is truncated. The command is checked against a safety blocklist and requires confirmation.',
  schema,
  dangerous: true,
  async execute({ command, cwd, timeoutMs }, ctx) {
    const verdict = checkCommandSafety(command);
    if (!verdict.allowed) {
      return {
        ok: false,
        output: `Refused: ${verdict.reason ?? 'command matched the safety blocklist.'}`,
      };
    }

    try {
      const result = await execa(command, {
        shell: true,
        cwd: cwd ?? ctx.cwd,
        timeout: timeoutMs ?? DEFAULT_TIMEOUT,
        reject: false,
        stripFinalNewline: true,
      });

      const stdout = truncateLines(result.stdout ?? '', MAX_OUT_LINES);
      const stderr = truncateLines(result.stderr ?? '', MAX_OUT_LINES);
      const exitCode = result.exitCode ?? -1;

      const blocks = [
        `$ ${command}`,
        `exit ${exitCode}`,
        stdout && `--- stdout ---\n${stdout}`,
        stderr && `--- stderr ---\n${stderr}`,
      ].filter(Boolean);

      return {
        ok: exitCode === 0,
        output: blocks.join('\n'),
        meta: { exitCode, timedOut: result.timedOut === true },
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, output: `Failed to execute command: ${msg}` };
    }
  },
};
