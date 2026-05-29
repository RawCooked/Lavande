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
  /**
   * Raw provider parts from the model turn, stored verbatim.
   * Gemini thinking models embed an opaque `thoughtSignature` in their parts
   * that must be echoed back in the next request. When this field is present,
   * the Gemini provider replays it directly instead of reconstructing parts
   * from `content` + `toolCalls`, preserving the signature end-to-end.
   */
  rawModelParts?: unknown[];
  /**
   * Present for tool messages that produced image output (e.g. screenshots).
   * Only the file path is stored — the provider reads and base64-inlines the
   * image at request time so the model can actually see it, while memory.json
   * stays small.
   */
  images?: MessageImage[];
}

export interface MessageImage {
  /** MIME type, e.g. "image/png". */
  mimeType: string;
  /** Absolute path to the image on disk. */
  path: string;
}

export interface ToolCallRef {
  id: string;
  name: string;
  args: unknown;
}

export type ProviderName = 'gemini' | 'openai' | 'anthropic' | 'ollama';
