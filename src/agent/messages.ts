import type { ChatMessage, ToolCallRef } from '../types/index.js';

export function userMessage(content: string): ChatMessage {
  return { role: 'user', content };
}

export function assistantMessage(content: string, toolCalls?: ToolCallRef[]): ChatMessage {
  return { role: 'assistant', content, ...(toolCalls?.length ? { toolCalls } : {}) };
}

export function toolMessage(toolCallId: string, toolName: string, content: string): ChatMessage {
  return { role: 'tool', content, toolCallId, toolName };
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
