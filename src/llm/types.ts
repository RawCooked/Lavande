import type { ChatMessage } from '../types/index.js';

/**
 * JSON-schema shape passed to providers. We convert zod → JSON schema in the
 * tool registry so providers stay decoupled from zod.
 */
export interface ToolSpec {
  name: string;
  description: string;
  parameters: JSONSchema;
}

export type JSONSchema = {
  type: 'object';
  properties: Record<string, JSONSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
};

export type JSONSchemaProperty =
  | { type: 'string'; description?: string; enum?: string[] }
  | { type: 'number'; description?: string }
  | { type: 'integer'; description?: string }
  | { type: 'boolean'; description?: string }
  | { type: 'array'; description?: string; items: JSONSchemaProperty }
  | {
      type: 'object';
      description?: string;
      properties?: Record<string, JSONSchemaProperty>;
      required?: string[];
      additionalProperties?: boolean;
    };

export type StreamEvent =
  | { type: 'text'; delta: string }
  | { type: 'tool_call'; id: string; name: string; args: unknown }
  /**
   * Emitted once per turn, just before `done`, carrying the complete raw
   * provider parts for the model message. Consumers that need to replay
   * opaque fields (e.g. Gemini `thoughtSignature`) must store this and pass
   * it back via `ChatMessage.rawModelParts`. Providers that don't need it
   * simply never emit this event.
   */
  | { type: 'model_parts'; parts: unknown[] }
  | { type: 'done'; reason: 'stop' | 'tool_calls' | 'length' }
  | { type: 'error'; error: Error };

export interface StreamRequest {
  messages: ChatMessage[];
  tools: ToolSpec[];
  system?: string;
  signal?: AbortSignal;
}

export interface LLMProvider {
  readonly name: string;
  readonly model: string;
  stream(req: StreamRequest): AsyncIterable<StreamEvent>;
}

export interface ProviderOptions {
  apiKey?: string;
  model: string;
}

export type ProviderFactory = (opts: ProviderOptions) => LLMProvider;
