import { createInterface } from 'node:readline/promises';
import chalk from 'chalk';
import { loadConfig } from '../config/loader.js';
import { MemoryStore } from '../memory/store.js';
import { theme } from '../ui/theme.js';

interface Options {
  yes?: boolean;
}

export async function runReset(opts: Options = {}): Promise<void> {
  const config = await loadConfig();
  const memory = new MemoryStore(config);

  const c = {
    title: chalk.hex(theme.primary).bold,
    warn: chalk.hex(theme.warn),
    success: chalk.hex(theme.success),
    muted: chalk.hex(theme.muted),
  };

  process.stdout.write(`\n  ${c.title('reset memory')}\n  ${c.muted(memory.location())}\n\n`);

  if (!opts.yes) {
    const rl = createInterface({ input: process.stdin, output: process.stdout });
    const answer = (await rl.question(`  ${c.warn('!')} this deletes all stored conversations. continue? (y/N) `))
      .trim()
      .toLowerCase();
    rl.close();
    if (answer !== 'y' && answer !== 'yes') {
      process.stdout.write(`\n  ${c.muted('cancelled.')}\n\n`);
      return;
    }
  }

  await memory.clear();
  process.stdout.write(`\n  ${c.success('✓')} memory cleared.\n\n`);
}
