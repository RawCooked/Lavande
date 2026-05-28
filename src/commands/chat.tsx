import { render } from 'ink';
import { loadConfig } from '../config/loader.js';
import type { LavandeConfig } from '../config/schema.js';
import { App } from '../ui/App.js';

export interface ChatOptions {
  model?: string;
  noMemory?: boolean;
  debug?: boolean;
}

export async function runChat(options: ChatOptions = {}): Promise<void> {
  if (options.debug) process.env.LAVANDE_DEBUG = '1';

  const overrides: Partial<LavandeConfig> = {};
  if (options.model) overrides.model = options.model;
  if (options.noMemory) overrides.memory = { enabled: false, maxTurns: 40 };

  const config = await loadConfig(overrides);

  const { waitUntilExit } = render(<App config={config} />, {
    exitOnCtrlC: false,
  });

  await waitUntilExit();
}
