import type { ChatMessage, MessageImage, ToolCallRef } from '../types/index.js';

export function userMessage(content: string): ChatMessage {
  return { role: 'user', content };
}

export function assistantMessage(
  content: string,
  toolCalls?: ToolCallRef[],
  rawModelParts?: unknown[],
): ChatMessage {
  return {
    role: 'assistant',
    content,
    ...(toolCalls?.length ? { toolCalls } : {}),
    // Store raw provider parts verbatim (e.g. Gemini thoughtSignature) so
    // they can be replayed in the next request without reconstruction loss.
    ...(rawModelParts?.length ? { rawModelParts } : {}),
  };
}

export function toolMessage(
  toolCallId: string,
  toolName: string,
  content: string,
  images?: MessageImage[],
): ChatMessage {
  return {
    role: 'tool',
    content,
    toolCallId,
    toolName,
    ...(images?.length ? { images } : {}),
  };
}

/**
 * Compact history so we don't keep growing unbounded.
 * Drops the oldest user/assistant pairs while keeping system + the most recent
 * `keep` exchanges. Conservative — providers also cap context independently.
 */
export function compactHistory(messages: ChatMessage[], keepTurns: number): ChatMessage[] {
  if (messages.length <= keepTurns * 2 + 1) return messages;

  const system = messages.filter((m) => m.role === 'system');
  const rest = messages.filter((m) => m.role !== 'system');
  const recent = rest.slice(-keepTurns * 2);
  return [...system, ...recent];
}
