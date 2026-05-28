import chalk from 'chalk';
import { loadConfig, writeConfig } from '../config/loader.js';
import { configDir, configFile, dataDir, memoryFile } from '../config/paths.js';
import { theme } from '../ui/theme.js';
import { LavandeError } from '../utils/errors.js';

export type ConfigSubcommand = 'show' | 'path' | 'set';

interface SetArgs {
  key: string;
  value: string;
}

const c = {
  title: chalk.hex(theme.primary).bold,
  key: chalk.hex(theme.glow),
  value: chalk.hex(theme.text),
  muted: chalk.hex(theme.muted),
  warn: chalk.hex(theme.warn),
  success: chalk.hex(theme.success),
};

export async function runConfig(sub: ConfigSubcommand = 'show', args?: SetArgs): Promise<void> {
  if (sub === 'path') {
    process.stdout.write(
      '\n' +
        `  ${c.title('config file')}  ${c.value(configFile)}\n` +
        `  ${c.title('config dir')}   ${c.value(configDir)}\n` +
        `  ${c.title('memory file')}  ${c.value(memoryFile)}\n` +
        `  ${c.title('data dir')}     ${c.value(dataDir)}\n\n`,
    );
    return;
  }

  if (sub === 'set') {
    if (!args?.key || args.value === undefined) {
      throw new LavandeError('Missing key or value for "config set".', {
        code: 'BAD_ARGS',
        hint: 'Usage: lavande config set <key> <value>',
      });
    }
    const patch = patchFromDotPath(args.key, parseValue(args.value));
    await writeConfig(patch);
    process.stdout.write(`\n  ${c.success('✓')} updated ${c.key(args.key)} = ${c.value(args.value)}\n\n`);
    return;
  }

  const config = await loadConfig();
  process.stdout.write('\n  ' + c.title('lavande config') + '\n\n');
  const rows: Array<[string, string]> = [
    ['provider', config.provider],
    ['model', config.model],
    ['apiKey', config.apiKey ? c.success('set') : c.warn('missing')],
    ['enabledTools', JSON.stringify(config.enabledTools)],
    ['memory.enabled', String(config.memory.enabled)],
    ['memory.maxTurns', String(config.memory.maxTurns)],
    ['agent.maxIterations', String(config.agent.maxIterations)],
    ['ui.gradient', String(config.ui.gradient)],
    ['ui.animations', String(config.ui.animations)],
  ];
  const w = Math.max(...rows.map(([k]) => k.length));
  for (const [k, v] of rows) {
    process.stdout.write(`  ${c.key(k.padEnd(w))}  ${c.value(v)}\n`);
  }
  process.stdout.write(`\n  ${c.muted('config file:')} ${configFile}\n\n`);
}

function parseValue(raw: string): unknown {
  if (raw === 'true') return true;
  if (raw === 'false') return false;
  if (/^-?\d+$/.test(raw)) return Number(raw);
  if (raw.startsWith('[') || raw.startsWith('{')) {
    try {
      return JSON.parse(raw);
    } catch {
      return raw;
    }
  }
  return raw;
}

function patchFromDotPath(path: string, value: unknown): Record<string, unknown> {
  const parts = path.split('.');
  const out: Record<string, unknown> = {};
  let cursor: Record<string, unknown> = out;
  for (let i = 0; i < parts.length - 1; i += 1) {
    const next: Record<string, unknown> = {};
    cursor[parts[i]!] = next;
    cursor = next;
  }
  cursor[parts[parts.length - 1]!] = value;
  return out;
}
