import { LavandeError } from '../../utils/errors.js';
import type { LLMProvider, ProviderOptions, StreamEvent, StreamRequest } from '../types.js';

/**
 * OpenAI provider — stub that proves the provider abstraction.
 *
 * To wire this up:
 *   1. pnpm add openai
 *   2. Replace the body of stream() with a real call to client.chat.completions.create
 *      using stream: true and tool_choice: 'auto'.
 *   3. Map openai stream chunks → StreamEvent (text, tool_call, done).
 *
 * The Agent will then work with no changes — that is the point of the provider
 * interface. Keep the stub here so anyone reading the codebase can see exactly
 * what shape a new provider must have.
 */
export function createOpenAIProvider(_opts: ProviderOptions): LLMProvider {
  return {
    name: 'openai',
    model: _opts.model,
    // eslint-disable-next-line require-yield
    async *stream(_req: StreamRequest): AsyncIterable<StreamEvent> {
      throw new LavandeError('OpenAI provider is not yet implemented.', {
        code: 'PROVIDER_UNAVAILABLE',
        hint: 'Use LAVANDE_PROVIDER=gemini for now. See src/llm/providers/openai.ts to add it.',
      });
    },
  };
}
