import { LavandeError } from '../utils/errors.js';
import type { LavandeConfig } from '../config/schema.js';
import type { ProviderName } from '../types/index.js';
import { createGeminiProvider } from './providers/gemini.js';
import { createOpenAIProvider } from './providers/openai.js';
import type { LLMProvider, ProviderFactory } from './types.js';

/**
 * Provider factories keyed by name. To add a new provider, implement
 * LLMProvider in a new file under ./providers and register it here.
 */
const factories: Record<ProviderName, ProviderFactory> = {
  gemini: createGeminiProvider,
  openai: createOpenAIProvider,
  anthropic: () => {
    throw new LavandeError('Anthropic provider is not yet implemented.', {
      code: 'PROVIDER_UNAVAILABLE',
      hint: 'Set provider to "gemini" in your config or .env (LAVANDE_PROVIDER=gemini).',
    });
  },
  ollama: () => {
    throw new LavandeError('Ollama provider is not yet implemented.', {
      code: 'PROVIDER_UNAVAILABLE',
      hint: 'Set provider to "gemini" in your config or .env (LAVANDE_PROVIDER=gemini).',
    });
  },
};

export function listProviders(): ProviderName[] {
  return Object.keys(factories) as ProviderName[];
}

export function createProvider(config: LavandeConfig): LLMProvider {
  const factory = factories[config.provider];
  if (!factory) {
    throw new LavandeError(`Unknown provider: ${config.provider}`, {
      code: 'UNKNOWN_PROVIDER',
      hint: `Available: ${listProviders().join(', ')}`,
    });
  }
  return factory({ apiKey: config.apiKey, model: config.model });
}
