import { cac } from 'cac';
import chalk from 'chalk';
import { runChat } from './commands/chat.js';
import { runConfig } from './commands/config.js';
import { runReset } from './commands/reset.js';
import { runTools } from './commands/tools.js';
import { theme } from './ui/theme.js';
import { formatError } from './utils/errors.js';

const VERSION = '0.1.0';

export async function runCli(argv: string[]): Promise<void> {
  const cli = cac('lavande');

  cli
    .command('[...args]', 'Start a chat session (default).')
    .option('--model <id>', 'Override the configured model.')
    .option('--no-memory', 'Disable persistent memory for this session.')
    .option('--debug', 'Enable debug log file.')
    .action(async (_args: string[], options: Record<string, unknown>) => {
      await runChat({
        model: options.model as string | undefined,
        noMemory: options.memory === false,
        debug: Boolean(options.debug),
      });
    });

  cli
    .command('chat', 'Start a chat session.')
    .option('--model <id>', 'Override the configured model.')
    .option('--no-memory', 'Disable persistent memory for this session.')
    .option('--debug', 'Enable debug log file.')
    .action(async (options: Record<string, unknown>) => {
      await runChat({
        model: options.model as string | undefined,
        noMemory: options.memory === false,
        debug: Boolean(options.debug),
      });
    });

  cli
    .command('tools', 'List every registered tool.')
    .action(async () => {
      await runTools();
    });

  cli
    .command('config', 'Show the resolved configuration.')
    .action(async () => {
      await runConfig('show');
    });

  cli
    .command('config:path', 'Print the resolved config and data file paths.')
    .action(async () => {
      await runConfig('path');
    });

  cli
    .command('config:set <key> <value>', 'Persist a configuration value (dot-path supported).')
    .action(async (key: string, value: string) => {
      await runConfig('set', { key, value });
    });

  cli
    .command('reset', 'Erase stored memory.')
    .option('-y, --yes', 'Skip the confirmation prompt.')
    .action(async (options: Record<string, unknown>) => {
      await runReset({ yes: Boolean(options.yes) });
    });

  cli.help((sections: Array<{ title?: string; body: string }>) => {
    sections.unshift({
      body: `  ${chalk.hex(theme.primary).bold('lavande')}  ${chalk.hex(theme.muted)('· calm intelligence for your terminal')}`,
    });
    return sections;
  });
  cli.version(VERSION);

  try {
    cli.parse(argv, { run: false });
    await cli.runMatchedCommand();
  } catch (err) {
    process.stderr.write(formatError(err));
    process.exitCode = 1;
  }
}
