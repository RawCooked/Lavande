import { GoogleGenAI } from '@google/genai';
import { LavandeError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import type { ChatMessage } from '../../types/index.js';
import type {
  JSONSchemaProperty,
  LLMProvider,
  ProviderOptions,
  StreamEvent,
  StreamRequest,
  ToolSpec,
} from '../types.js';

const log = logger.scope('gemini');

type GeminiPart =
  | { text: string }
  | { functionCall: { name: string; args: Record<string, unknown> } }
  | { functionResponse: { id?: string; name: string; response: Record<string, unknown> } };

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

export function createGeminiProvider(opts: ProviderOptions): LLMProvider {
  if (!opts.apiKey) {
    throw new LavandeError('Missing GEMINI_API_KEY.', {
      code: 'MISSING_API_KEY',
      hint: 'Add GEMINI_API_KEY=... to your .env file. Get one at https://aistudio.google.com/app/apikey',
    });
  }

  const client = new GoogleGenAI({ apiKey: opts.apiKey });
  const model = opts.model;

  return {
    name: 'gemini',
    model,
    async *stream(req: StreamRequest): AsyncIterable<StreamEvent> {
      const contents = toGeminiContents(req.messages);
      const tools = req.tools.length
        ? [{ functionDeclarations: req.tools.map(toGeminiTool) }]
        : undefined;

      log.debug('stream:start', { model, messages: contents.length, tools: req.tools.length });

      let response;
      try {
        response = await client.models.generateContentStream({
          model,
          contents,
          config: {
            ...(req.system ? { systemInstruction: req.system } : {}),
            ...(tools ? { tools } : {}),
          },
        });
      } catch (err) {
        yield { type: 'error', error: wrapError(err) };
        return;
      }

      let finishReason: 'stop' | 'tool_calls' | 'length' = 'stop';
      let sawToolCall = false;

      try {
        for await (const chunk of response) {
          if (req.signal?.aborted) break;

          const text = extractText(chunk);
          if (text) yield { type: 'text', delta: text };

          const calls = extractFunctionCalls(chunk);
          for (const call of calls) {
            sawToolCall = true;
            yield {
              type: 'tool_call',
              id: call.id ?? `${call.name}-${Math.random().toString(36).slice(2, 8)}`,
              name: call.name,
              args: call.args ?? {},
            };
          }

          const reason = extractFinishReason(chunk);
          if (reason === 'MAX_TOKENS') finishReason = 'length';
        }
      } catch (err) {
        yield { type: 'error', error: wrapError(err) };
        return;
      }

      yield { type: 'done', reason: sawToolCall ? 'tool_calls' : finishReason };
    },
  };
}

/* ───────────────────── conversion ───────────────────── */

function toGeminiContents(messages: ChatMessage[]): GeminiContent[] {
  const out: GeminiContent[] = [];
  for (const msg of messages) {
    if (msg.role === 'system') continue;

    if (msg.role === 'user') {
      out.push({ role: 'user', parts: [{ text: msg.content }] });
      continue;
    }

    if (msg.role === 'assistant') {
      const parts: GeminiPart[] = [];
      if (msg.content) parts.push({ text: msg.content });
      for (const call of msg.toolCalls ?? []) {
        parts.push({
          functionCall: { name: call.name, args: (call.args ?? {}) as Record<string, unknown> },
        });
      }
      if (parts.length === 0) parts.push({ text: '' });
      out.push({ role: 'model', parts });
      continue;
    }

    if (msg.role === 'tool') {
      // Include the id so Gemini can correlate this response with the
      // functionCall it made. Required when multiple calls are in-flight.
      out.push({
        role: 'user',
        parts: [
          {
            functionResponse: {
              ...(msg.toolCallId ? { id: msg.toolCallId } : {}),
              name: msg.toolName ?? 'tool',
              response: { result: msg.content },
            },
          },
        ],
      });
    }
  }
  return out;
}

function toGeminiTool(spec: ToolSpec): {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
} {
  return {
    name: spec.name,
    description: spec.description,
    parameters: cleanSchema(spec.parameters) as Record<string, unknown>,
  };
}

function cleanSchema(schema: JSONSchemaProperty | ToolSpec['parameters']): unknown {
  if (typeof schema !== 'object' || schema === null) return schema;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(schema)) {
    if (k === 'additionalProperties') continue;
    if (k === 'properties' && v && typeof v === 'object') {
      const props: Record<string, unknown> = {};
      for (const [pk, pv] of Object.entries(v as Record<string, unknown>)) {
        props[pk] = cleanSchema(pv as JSONSchemaProperty);
      }
      out[k] = props;
    } else if (k === 'items' && v) {
      out[k] = cleanSchema(v as JSONSchemaProperty);
    } else {
      out[k] = v;
    }
  }
  return out;
}

/* ───────────────────── chunk extraction ───────────────────── */

function extractText(chunk: unknown): string {
  if (!chunk || typeof chunk !== 'object') return '';
  const c = chunk as { text?: string | (() => string); candidates?: Candidate[] };

  if (typeof c.text === 'function') {
    try { return c.text() ?? ''; } catch { /* fall through */ }
  }
  if (typeof c.text === 'string') return c.text;

  const parts = c.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((p) => (typeof p === 'object' && p !== null && 'text' in p ? String(p.text ?? '') : ''))
    .join('');
}

interface FunctionCall {
  id?: string;
  name: string;
  args?: Record<string, unknown>;
}

interface Candidate {
  content?: { parts?: Array<Record<string, unknown>> };
  finishReason?: string;
}

function extractFunctionCalls(chunk: unknown): FunctionCall[] {
  if (!chunk || typeof chunk !== 'object') return [];
  const c = chunk as {
    functionCalls?: FunctionCall[] | (() => FunctionCall[]);
    candidates?: Candidate[];
  };

  if (typeof c.functionCalls === 'function') {
    try { return c.functionCalls() ?? []; } catch { /* fall through */ }
  }
  if (Array.isArray(c.functionCalls)) return c.functionCalls;

  // Fallback: probe raw candidates — capture id from the model's functionCall.
  const parts = c.candidates?.[0]?.content?.parts ?? [];
  const calls: FunctionCall[] = [];
  for (const part of parts) {
    if (part && typeof part === 'object' && 'functionCall' in part) {
      const fc = part.functionCall as {
        id?: string;
        name?: string;
        args?: Record<string, unknown>;
      } | undefined;
      if (fc?.name) calls.push({ id: fc.id, name: fc.name, args: fc.args ?? {} });
    }
  }
  return calls;
}

function extractFinishReason(chunk: unknown): string | undefined {
  if (!chunk || typeof chunk !== 'object') return undefined;
  const c = chunk as { candidates?: Candidate[] };
  return c.candidates?.[0]?.finishReason;
}

function wrapError(err: unknown): Error {
  if (err instanceof Error) {
    if (/API key/i.test(err.message)) {
      return new LavandeError('Gemini rejected the API key.', {
        code: 'BAD_API_KEY',
        hint: 'Double-check GEMINI_API_KEY in your .env (no quotes, no trailing spaces).',
        cause: err,
      });
    }
    if (/exception parsing|invalid.*function.*response|function_response/i.test(err.message)) {
      return new LavandeError('Gemini rejected the conversation history.', {
        code: 'PARSE_ERROR',
        hint: 'This can happen with older model versions. Try LAVANDE_MODEL=gemini-2.5-flash.',
        cause: err,
      });
    }
    if (/not found|404/i.test(err.message)) {
      return new LavandeError(`Model not available: ${err.message}`, {
        code: 'MODEL_UNAVAILABLE',
        hint: 'Try LAVANDE_MODEL=gemini-2.5-flash or gemini-2.0-flash.',
        cause: err,
      });
    }
    return err;
  }
  return new Error(String(err));
}
