import { readFileSync } from 'node:fs';
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
  | { text: string; thoughtSignature?: string }
  | { functionCall: { id?: string; name: string; args: Record<string, unknown> } }
  | { functionResponse: { id?: string; name: string; response: Record<string, unknown> } }
  | { inlineData: { mimeType: string; data: string } };

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

      log.debug('request:start', { model, messages: contents.length, tools: req.tools.length });

      /**
       * Non-streaming generateContent.
       *
       * Why not generateContentStream? Gemini thinking models (gemini-3-*,
       * 2.5-thinking, …) attach an opaque `thoughtSignature` to the part that
       * carries the functionCall. The API REQUIRES that signature to be echoed
       * back verbatim on the next request. During streaming, the SDK does not
       * reliably surface that signature on the functionCall part — it is only
       * complete in the aggregated response. So we fetch the full response in
       * one call (canonical parts, signature intact), store the parts verbatim
       * for replay, and reproduce a streaming feel by chunking the text below.
       */
      let response;
      try {
        response = await client.models.generateContent({
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

      if (req.signal?.aborted) {
        yield { type: 'done', reason: 'stop' };
        return;
      }

      // Complete, canonical parts — includes thoughtSignature on functionCall
      // parts for thinking models. Stored verbatim and replayed next turn.
      const rawParts = extractRawParts(response);

      // Stream the visible text out in small chunks for a progressive feel.
      const text = extractText(response);
      if (text) {
        for (const piece of chunkText(text)) {
          if (req.signal?.aborted) break;
          yield { type: 'text', delta: piece };
          await delay(12);
        }
      }

      // Tool / function calls.
      const calls = extractFunctionCalls(response);
      let sawToolCall = false;
      for (const call of calls) {
        sawToolCall = true;
        yield {
          type: 'tool_call',
          id: call.id ?? `${call.name}-${Math.random().toString(36).slice(2, 8)}`,
          name: call.name,
          args: call.args ?? {},
        };
      }

      // Emit raw parts before done so the agent can store them for replay.
      if (rawParts.length > 0) {
        yield { type: 'model_parts', parts: rawParts };
      }

      const reason = extractFinishReason(response);
      yield {
        type: 'done',
        reason: sawToolCall ? 'tool_calls' : reason === 'MAX_TOKENS' ? 'length' : 'stop',
      };
    },
  };
}

/* ───────────────────── streaming-effect helpers ───────────────────── */

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

/**
 * Split text into ~24-char chunks at whitespace boundaries so the UI can
 * render it progressively without cutting words mid-stream.
 */
function* chunkText(text: string, size = 24): Generator<string> {
  let i = 0;
  while (i < text.length) {
    let end = Math.min(i + size, text.length);
    while (end < text.length && !/\s/.test(text[end] ?? '')) end += 1;
    yield text.slice(i, end);
    i = end;
  }
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
      if (msg.rawModelParts && msg.rawModelParts.length > 0) {
        /**
         * Verbatim replay — preserves thoughtSignature for thinking models.
         * The parts were collected as-is from the streaming response, so they
         * already contain every field the API expects back.
         */
        out.push({ role: 'model', parts: msg.rawModelParts as GeminiPart[] });
      } else {
        // Fallback reconstruction for non-thinking models or imported history.
        const parts: GeminiPart[] = [];
        if (msg.content) parts.push({ text: msg.content });
        for (const call of msg.toolCalls ?? []) {
          parts.push({
            functionCall: { name: call.name, args: (call.args ?? {}) as Record<string, unknown> },
          });
        }
        if (parts.length === 0) parts.push({ text: '' });
        out.push({ role: 'model', parts });
      }
      continue;
    }

    if (msg.role === 'tool') {
      // Include the id so Gemini can correlate this response with its functionCall.
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

      // If the tool produced images (e.g. a screenshot), read them from disk
      // and inline them as a follow-up user turn so the model can see them.
      // Stored as a path (not base64) to keep persisted history small — we
      // base64-encode lazily here, at request time.
      if (msg.images?.length) {
        const imageParts: GeminiPart[] = [];
        for (const img of msg.images) {
          try {
            const data = readFileSync(img.path).toString('base64');
            imageParts.push({ inlineData: { mimeType: img.mimeType, data } });
          } catch (err) {
            log.debug('image:read-failed', { path: img.path, err: String(err) });
          }
        }
        if (imageParts.length > 0) {
          out.push({
            role: 'user',
            parts: [{ text: 'Here is the captured image for you to analyze:' }, ...imageParts],
          });
        }
      }
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

interface Candidate {
  content?: { parts?: Array<Record<string, unknown>> };
  finishReason?: string;
}

/**
 * Return ALL raw parts from a streaming chunk, including thought parts with
 * `thoughtSignature`. These are collected verbatim for replay.
 */
function extractRawParts(chunk: unknown): unknown[] {
  if (!chunk || typeof chunk !== 'object') return [];
  const c = chunk as { candidates?: Candidate[] };
  return c.candidates?.[0]?.content?.parts ?? [];
}

function extractText(chunk: unknown): string {
  if (!chunk || typeof chunk !== 'object') return '';
  const c = chunk as { text?: string | (() => string); candidates?: Candidate[] };

  if (typeof c.text === 'function') {
    try { return c.text() ?? ''; } catch { /* fall through */ }
  }
  if (typeof c.text === 'string') return c.text;

  const parts = c.candidates?.[0]?.content?.parts ?? [];
  return parts
    .map((p) => {
      if (typeof p !== 'object' || p === null || !('text' in p)) return '';
      // Skip thought parts — they contain the reasoning, not the response text.
      if ('thoughtSignature' in p) return '';
      return String(p.text ?? '');
    })
    .join('');
}

interface FunctionCall {
  id?: string;
  name: string;
  args?: Record<string, unknown>;
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
    if (/thought_signature|thought signature/i.test(err.message)) {
      return new LavandeError('Gemini thinking-model error: thought_signature missing.', {
        code: 'THOUGHT_SIGNATURE',
        hint: 'This is a known issue with thinking models. The fix is active — please restart and retry.',
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
    if (/quota|resource_exhausted|429|rate.?limit/i.test(err.message)) {
      return new LavandeError('Gemini quota exceeded.', {
        code: 'QUOTA_EXCEEDED',
        hint: 'The free tier allows a limited number of requests per day (and each tool turn costs two). Wait a little, switch model with LAVANDE_MODEL=gemini-2.5-flash, or enable billing in Google AI Studio.',
        cause: err,
      });
    }
    return err;
  }
  return new Error(String(err));
}
