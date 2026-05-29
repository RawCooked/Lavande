import { randomUUID } from 'node:crypto';
import type { LavandeConfig } from '../config/schema.js';
import type { LLMProvider } from '../llm/types.js';
import type { MemoryStore } from '../memory/store.js';
import type { ToolRegistry } from '../tools/registry.js';
import type { ConfirmRequest } from '../tools/types.js';
import type { ChatMessage, MessageImage, ToolCallRef } from '../types/index.js';
import { logger } from '../utils/logger.js';
import { assistantMessage, compactHistory, toolMessage, userMessage } from './messages.js';
import { buildSystemPrompt } from './systemPrompt.js';
import type { AgentEvent } from './events.js';

const log = logger.scope('agent');

export interface AgentDeps {
  provider: LLMProvider;
  tools: ToolRegistry;
  memory: MemoryStore;
  config: LavandeConfig;
  /**
   * Asks the UI to render a confirmation prompt. Resolves with the user's
   * decision. The Agent itself stays UI-agnostic — this dependency is what
   * lets the same loop work in tests with auto-approval.
   */
  requestConfirm: (req: ConfirmRequest) => Promise<boolean>;
}

/**
 * The core agent loop. Provider- and UI-agnostic.
 *
 * One call to `run(userInput)` produces an async stream of AgentEvents. The
 * UI consumes the stream; tests can collect events into an array and assert.
 */
export class Agent {
  private history: ChatMessage[] = [];
  private readonly conversationId: Promise<string>;
  private readonly systemPrompt: string;

  constructor(private readonly deps: AgentDeps) {
    this.conversationId = this.initConversation();
    this.systemPrompt = buildSystemPrompt();
  }

  private async initConversation(): Promise<string> {
    const conv = await this.deps.memory.startConversation();
    return conv.id;
  }

  /** Returns the conversation snapshot for display / persistence. */
  getHistory(): ReadonlyArray<ChatMessage> {
    return this.history;
  }

  /**
   * Drive one user turn. The returned iterable terminates with `turn_end`.
   */
  async *run(input: string, signal: AbortSignal): AsyncIterable<AgentEvent> {
    const convId = await this.conversationId;

    yield { type: 'turn_start' };

    const userMsg = userMessage(input);
    this.history.push(userMsg);
    await this.deps.memory.appendMessage(convId, userMsg);

    let iterations = 0;
    const maxIterations = this.deps.config.agent.maxIterations;

    outer: while (iterations < maxIterations) {
      iterations += 1;
      if (signal.aborted) {
        yield { type: 'turn_end', reason: 'cancelled' };
        return;
      }

      yield { type: 'thinking' };

      const compact = compactHistory(this.history, this.deps.config.memory.maxTurns);
      const toolSpecs = this.deps.tools.specs();

      let assistantText = '';
      const pendingCalls: ToolCallRef[] = [];
      let finishReason: 'stop' | 'tool_calls' | 'length' = 'stop';
      // Raw model parts emitted by the provider (e.g. Gemini thoughtSignature).
      // Stored verbatim so they can be replayed in the next request.
      let rawModelParts: unknown[] | undefined;

      try {
        for await (const event of this.deps.provider.stream({
          messages: compact,
          tools: toolSpecs,
          system: this.systemPrompt,
          signal,
        })) {
          if (signal.aborted) {
            yield { type: 'turn_end', reason: 'cancelled' };
            return;
          }

          switch (event.type) {
            case 'text':
              assistantText += event.delta;
              yield { type: 'text', delta: event.delta };
              break;
            case 'tool_call':
              pendingCalls.push({ id: event.id, name: event.name, args: event.args });
              break;
            case 'model_parts':
              // Capture raw parts for verbatim replay (needed by thinking models).
              rawModelParts = event.parts;
              break;
            case 'done':
              finishReason = event.reason;
              break;
            case 'error':
              log.error('provider error', event.error.message);
              yield { type: 'error', message: event.error.message };
              yield { type: 'turn_end', reason: 'error' };
              return;
          }
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        log.error('stream threw', msg);
        yield { type: 'error', message: msg };
        yield { type: 'turn_end', reason: 'error' };
        return;
      }

      // Persist this turn's assistant message (including raw parts if present).
      const asstMsg = assistantMessage(assistantText, pendingCalls, rawModelParts);
      this.history.push(asstMsg);
      await this.deps.memory.appendMessage(convId, asstMsg);

      if (pendingCalls.length === 0) {
        yield { type: 'turn_end', reason: finishReason };
        return;
      }

      // Execute each tool call, append results, then loop for follow-up reasoning.
      for (const call of pendingCalls) {
        yield { type: 'tool_start', id: call.id, name: call.name, args: call.args };

        const result = await this.deps.tools.execute(call.name, call.args, {
          cwd: process.cwd(),
          signal,
          confirm: async (req) => {
            const cid = randomUUID();
            // We can't yield from inside this nested callback, so we surface
            // confirm state by routing through deps.requestConfirm. The UI is
            // already wired through that promise — events are for the renderer.
            void cid;
            return this.deps.requestConfirm(req);
          },
        });

        yield { type: 'tool_end', id: call.id, name: call.name, result };

        // Some tools (e.g. screenshot) return images the model should see.
        const images = extractImages(result.meta);
        const toolMsg = toolMessage(call.id, call.name, result.output, images);
        this.history.push(toolMsg);
        await this.deps.memory.appendMessage(convId, toolMsg);
      }

      // Continue outer loop — the model now gets a chance to summarize the
      // tool results for the user.
      continue outer;
    }

    yield { type: 'error', message: `Agent stopped after ${maxIterations} iterations.` };
    yield { type: 'turn_end', reason: 'error' };
  }
}

/**
 * Pull image attachments out of a tool result's `meta.images`, validating the
 * shape so a malformed tool can't corrupt the history. Returns undefined when
 * there are no usable images.
 */
function extractImages(meta: Record<string, unknown> | undefined): MessageImage[] | undefined {
  const raw = meta?.images;
  if (!Array.isArray(raw)) return undefined;
  const images: MessageImage[] = [];
  for (const item of raw) {
    if (
      item &&
      typeof item === 'object' &&
      typeof (item as MessageImage).path === 'string' &&
      typeof (item as MessageImage).mimeType === 'string'
    ) {
      images.push({
        path: (item as MessageImage).path,
        mimeType: (item as MessageImage).mimeType,
      });
    }
  }
  return images.length ? images : undefined;
}
