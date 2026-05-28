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
