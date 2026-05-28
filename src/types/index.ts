/**
 * Cross-module shared types.
 * Only put things here that genuinely belong to more than one layer.
 */

export type Role = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
  role: Role;
  content: string;
  /** Present for assistant messages that requested tool calls. */
  toolCalls?: ToolCallRef[];
  /** Present for tool messages — links the result to the originating call. */
  toolCallId?: string;
  /** Present for tool messages — the tool that produced this output. */
  toolName?: string;
}

export interface ToolCallRef {
  id: string;
  name: string;
  args: unknown;
}

export type ProviderName = 'gemini' | 'openai' | 'anthropic' | 'ollama';
