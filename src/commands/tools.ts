import chalk from 'chalk';
import { loadConfig } from '../config/loader.js';
import { createToolRegistry } from '../tools/registry.js';
import { theme } from '../ui/theme.js';

/** Pretty-print the registered tools. Pure stdout — no Ink. */
export async function runTools(): Promise<void> {
  const config = await loadConfig();
  const registry = createToolRegistry(config);
  const tools = registry.list();

  const c = {
    title: chalk.hex(theme.primary).bold,
    name: chalk.hex(theme.glow).bold,
    desc: chalk.hex(theme.text),
    muted: chalk.hex(theme.muted),
    danger: chalk.hex(theme.danger),
    accent: chalk.hex(theme.accent),
  };

  const lines: string[] = [];
  lines.push('');
  lines.push(`  ${c.title('lavande tools')}  ${c.muted(`(${tools.length})`)}`);
  lines.push('');

  const nameWidth = Math.max(...tools.map((t) => t.name.length), 12);

  for (const tool of tools) {
    const flag = tool.dangerous ? c.danger(' ⚠ confirm') : '';
    lines.push(`  ${c.name(tool.name.padEnd(nameWidth))}  ${c.desc(tool.description)}${flag}`);
  }
  lines.push('');
  lines.push(c.muted('  add a tool → src/tools/builtin/<name>.ts, then export from index.ts'));
  lines.push('');

  process.stdout.write(lines.join('\n'));
}
