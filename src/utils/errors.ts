import chalk from 'chalk';
import { theme } from '../ui/theme.js';

/**
 * Lavande's typed error — distinguishes expected failures from bugs.
 * Carrying a hint lets the UI render a calm, actionable error screen.
 */
export class LavandeError extends Error {
  readonly hint?: string;
  readonly code: string;

  constructor(message: string, opts: { code?: string; hint?: string; cause?: unknown } = {}) {
    super(message);
    this.name = 'LavandeError';
    this.code = opts.code ?? 'LAVANDE_ERROR';
    this.hint = opts.hint;
    if (opts.cause !== undefined) (this as { cause?: unknown }).cause = opts.cause;
  }
}

export function isLavandeError(err: unknown): err is LavandeError {
  return err instanceof LavandeError;
}

/**
 * Render an error to the terminal using the lavender palette.
 * Used by both the CLI top-level handler and the Ink UI fallback.
 */
export function formatError(err: unknown): string {
  const lines: string[] = [];
  const isOurs = isLavandeError(err);
  const header = isOurs ? `  ${chalk.hex(theme.danger)('✗')} ${chalk.hex(theme.danger).bold(err.code)}` : `  ${chalk.hex(theme.danger)('✗')} ${chalk.hex(theme.danger).bold('error')}`;
  lines.push('');
  lines.push(header);
  lines.push('');

  const message = err instanceof Error ? err.message : String(err);
  for (const line of message.split('\n')) {
    lines.push(`    ${chalk.hex(theme.text)(line)}`);
  }

  if (isOurs && err.hint) {
    lines.push('');
    lines.push(`    ${chalk.hex(theme.muted)('hint')}  ${chalk.hex(theme.accent)(err.hint)}`);
  }

  lines.push('');
  return lines.join('\n');
}
