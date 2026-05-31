/**
 * MiniCPM5-1B provider — talks to the local Python bridge (minicpm_server.py).
 *
 * Format choice — read this before changing anything:
 *
 *   MiniCPM5-1B was trained with an XML tool-call format that looks like:
 *
 *     <function name="open_app"><parameter name="target">brave</parameter></function>
 *
 *   We originally tried to coax it into a JSON <tool_call>{...}</tool_call>
 *   shape via prompt engineering. That fails: a 1B model's training prior
 *   beats any few-shot, and it reverts to XML on the first non-trivial turn.
 *   So we now align WITH the model: the system prompt teaches the same XML
 *   format the model already wants to use, and the parser accepts it.
 *
 *   The parser also tolerates the JSON shape (for forward compat) and the
 *   xLAM-style <function=name><parameter=key>val</parameter></function>
 *   format some sibling MiniCPM variants emit.
 *
 *   MiniCPM5 also leaks <think>...</think> reasoning into the assistant turn.
 *   We strip it before display and before parsing — never show it to the user
 *   and never feed it back as history.
 */
import { LavandeError } from '../../utils/errors.js';
import { logger } from '../../utils/logger.js';
import type { ChatMessage } from '../../types/index.js';
import type {
  LLMProvider,
  ProviderOptions,
  StreamEvent,
  StreamRequest,
  ToolSpec,
} from '../types.js';

const log = logger.scope('minicpm');

const SERVER_URL = process.env.MINICPM_URL ?? 'http://127.0.0.1:8088/chat';

// Stop strings sent to the server. Whichever appears first in the decoded
// text wins. The </function> and </tool_call> stops cut tool-call turns
// cleanly. The chat-end stops (<|im_end|>, <|endoftext|>, <|user|>) catch
// plain-text replies — without them, MiniCPM keeps generating up to
// max_new_tokens after finishing its sentence, which on CPU is excruciating.
const STOPS = [
  '</function>',
  '</tool_call>',
  '<|im_end|>',
  '<|endoftext|>',
  '<|user|>',
  '\nUser:',
];

export function createMiniCPMProvider(opts: ProviderOptions): LLMProvider {
  const model = opts.model || 'openbmb/MiniCPM5-1B';

  return {
    name: 'minicpm',
    model,
    async *stream(req: StreamRequest): AsyncIterable<StreamEvent> {
      const system = buildSystemPrompt(req.system ?? '', req.tools);
      const messages = toFlatMessages(req.messages);

      // Follow-up turns (the last incoming msg is a tool response) only
      // need a short prose reply — cap them tightly so CPU users aren't
      // waiting 60s for "Done.".
      const isFollowUp =
        messages[messages.length - 1]?.content.includes('<function_response') ?? false;
      const maxTokens = isFollowUp ? 96 : 384;

      log.debug('request:start', {
        messages: messages.length,
        tools: req.tools.length,
        maxTokens,
        isFollowUp,
      });

      let raw: string;
      try {
        const res = await fetch(SERVER_URL, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({
            messages,
            system,
            max_new_tokens: maxTokens,
            temperature: 0.3,
            top_p: 0.9,
            stop: STOPS,
          }),
          signal: req.signal,
        });
        if (!res.ok) {
          const body = await res.text().catch(() => '');
          throw new LavandeError(
            `MiniCPM server returned ${res.status}: ${body.slice(0, 200)}`,
            {
              code: 'PROVIDER_ERROR',
              hint: 'Make sure minicpm_server.py is running: python minicpm_server.py',
            },
          );
        }
        const json = (await res.json()) as { text: string };
        raw = json.text ?? '';
      } catch (err) {
        if ((err as { name?: string }).name === 'AbortError') {
          yield { type: 'done', reason: 'stop' };
          return;
        }
        yield { type: 'error', error: wrapError(err) };
        return;
      }

      log.debug('request:raw', { raw: raw.slice(0, 400) });
      const parsed = parseOutput(raw);

      if (parsed.kind === 'tool_call') {
        yield {
          type: 'tool_call',
          id: `${parsed.name}-${Math.random().toString(36).slice(2, 8)}`,
          name: parsed.name,
          args: parsed.args,
        };
        yield { type: 'done', reason: 'tool_calls' };
        return;
      }

      if (parsed.text) {
        for (const piece of chunkText(parsed.text)) {
          if (req.signal?.aborted) break;
          yield { type: 'text', delta: piece };
          await delay(12);
        }
      }
      yield { type: 'done', reason: 'stop' };
    },
  };
}

/* ─────────────────────────── prompt engineering ─────────────────────────── */

/**
 * The MiniCPM-specific instruction block. Appended to whatever base system
 * prompt the agent already passed in (Lavande's personality/env block).
 *
 * Design notes:
 *   - Uses MiniCPM's NATIVE XML format. Don't try to force JSON; you'll lose.
 *   - "Hard rules" near the top, examples at the bottom. Small models latch
 *     onto the most recent pattern, so the few-shot has to be freshest.
 *   - Single tool call per turn. Multi-call is a stretch goal for 1B models
 *     and not worth the parser complexity.
 *   - "Never write <think>" is wishful — MiniCPM does it anyway. The strip
 *     happens in parseOutput.
 */
function buildSystemPrompt(base: string, tools: ToolSpec[]): string {
  const toolsBlock = tools
    .map((t) => {
      const params = t.parameters.properties ?? {};
      const required = new Set(t.parameters.required ?? []);
      const lines = Object.entries(params).map(([k, v]) => {
        const type = (v as { type?: string }).type ?? 'string';
        const desc = (v as { description?: string }).description ?? '';
        const req = required.has(k) ? ' (required)' : '';
        return `    - ${k} (${type})${req}: ${desc}`;
      });
      return `  ${t.name} — ${t.description}\n${lines.join('\n')}`;
    })
    .join('\n\n');

  const formatSpec = `
## Tool use

You can call tools to act on the user's computer.

When you call a tool, your ENTIRE response is one XML block, nothing else:

  <function name="TOOL_NAME"><parameter name="ARG">value</parameter></function>

When you do NOT need a tool, reply in plain prose. No XML tags, no JSON, no
function names mentioned.

Hard rules:
  - One turn = either a function call OR prose. Never both, never two calls.
  - Use ONLY the tool names below. Inventing a name is a failure.
  - Parameter values are written as plain text inside the tag:
      strings: <parameter name="path">C:\\Users\\Me\\Desktop</parameter>
      numbers: <parameter name="count">5</parameter>
      booleans: <parameter name="hidden">true</parameter>
  - After a <function_response> appears in the conversation, read it and
    reply to the user in one short sentence summarizing the useful part.
    Do not call the same tool again unless it failed.
  - If the user asks for something that obviously needs a tool (file system,
    clipboard, opening an app, current time), just call it — don't ask
    permission first.
  - Do not write <think> tags. Decide silently.

## Available tools

${toolsBlock}

## Examples

User: what time is it?
Assistant: <function name="date_time"></function>

User: <function_response name="date_time">{"human":"Sunday, 31 May 2026, 11:42"}</function_response>
Assistant: It's 11:42 on Sunday.

User: thanks, what's the capital of France?
Assistant: Paris.

User: open notepad
Assistant: <function name="open_app"><parameter name="target">notepad</parameter></function>

User: list the files on my desktop
Assistant: <function name="list_dir"><parameter name="path">C:\\Users\\Me\\Desktop</parameter></function>

User: open youtube
Assistant: <function name="open_url"><parameter name="url">https://youtube.com</parameter></function>

User: open youtube in brave
Assistant: <function name="open_url"><parameter name="url">https://youtube.com</parameter><parameter name="browser">brave</parameter></function>
`;

  return (base ? base.trim() + '\n\n' : '') + formatSpec.trim();
}

/* ─────────────────────────── message conversion ─────────────────────────── */

interface FlatMessage {
  role: 'user' | 'assistant';
  content: string;
}

/**
 * MiniCPM's chat template only understands user/assistant/system. Tool
 * results get wrapped in a <function_response> tag inside the next user
 * turn — matches the format used in the few-shot examples above. Assistant
 * tool calls get re-serialized into the same <function> shape the model
 * itself emits, so history stays format-consistent across turns.
 */
function toFlatMessages(messages: ChatMessage[]): FlatMessage[] {
  const out: FlatMessage[] = [];
  let pendingToolResponses: string[] = [];

  const flushPending = () => {
    if (pendingToolResponses.length === 0) return;
    out.push({ role: 'user', content: pendingToolResponses.join('\n') });
    pendingToolResponses = [];
  };

  for (const msg of messages) {
    if (msg.role === 'system') continue;

    if (msg.role === 'user') {
      flushPending();
      out.push({ role: 'user', content: msg.content });
      continue;
    }

    if (msg.role === 'assistant') {
      flushPending();
      if (msg.toolCalls && msg.toolCalls.length > 0) {
        const call = msg.toolCalls[0]!;
        out.push({ role: 'assistant', content: serializeToolCall(call.name, call.args) });
      } else if (msg.content) {
        out.push({ role: 'assistant', content: msg.content });
      }
      continue;
    }

    if (msg.role === 'tool') {
      pendingToolResponses.push(
        `<function_response name="${msg.toolName ?? 'tool'}">${msg.content}</function_response>`,
      );
    }
  }
  flushPending();

  // Per-turn nudge: when the LAST message is a tool response, the model is
  // being asked to follow up. A 1B model heavily pattern-matches recent
  // context — without this hint it tends to re-emit the same function call
  // instead of summarizing the result in prose. Putting the directive at
  // the very end of context maximizes its weight.
  const last = out[out.length - 1];
  if (last && last.role === 'user' && last.content.includes('<function_response')) {
    last.content +=
      '\n\n[System: the tool above already ran. Reply to me now in one short plain-text sentence. Do not call any function.]';
  }
  return out;
}

function serializeToolCall(name: string, args: unknown): string {
  const params =
    args && typeof args === 'object'
      ? Object.entries(args as Record<string, unknown>)
          .map(([k, v]) => `<parameter name="${k}">${stringifyValue(v)}</parameter>`)
          .join('')
      : '';
  return `<function name="${name}">${params}</function>`;
}

function stringifyValue(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (typeof v === 'string') return v;
  if (typeof v === 'number' || typeof v === 'boolean') return String(v);
  return JSON.stringify(v);
}

/* ─────────────────────────── output parsing ─────────────────────────── */

type Parsed =
  | { kind: 'text'; text: string }
  | { kind: 'tool_call'; name: string; args: Record<string, unknown> };

/**
 * Multi-format parser. Tries (in order):
 *   1. MiniCPM's native XML — <function name="X"><parameter name="Y">v</parameter></function>
 *   2. xLAM-style equals — <function=X><parameter=Y>v</parameter></function>
 *   3. Canonical JSON — <tool_call>{"name":"X","arguments":{...}}</tool_call>
 *
 * Closing tags may be missing because the server truncates at the stop
 * string. We tolerate that — match until the stop or end of string.
 *
 * <think>...</think> blocks are stripped before any matching: MiniCPM5
 * emits them in the assistant turn and they should never reach the UI or
 * the parser's tool-detection.
 */
function parseOutput(raw: string): Parsed {
  let text = raw
    .replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '')
    // Stop strings are kept in the response by the server (it cuts AFTER
    // the match) so we strip the chat-end / control tokens here before the
    // text reaches the UI. Tool-call closers (</function>, </tool_call>)
    // stay — the regex parsers below need them as anchors.
    .replace(/<\|im_end\|>/g, '')
    .replace(/<\|endoftext\|>/g, '')
    .replace(/<\|im_start\|>/g, '')
    .replace(/<\|user\|>[\s\S]*$/g, '')
    .replace(/\nUser:[\s\S]*$/g, '')
    .replace(/^assistant\s*[:>]\s*/i, '')
    .trim();

  // 1. XML attribute style — MiniCPM5's native format.
  const xmlAttr = text.match(
    /<function\s+name=["']([^"']+)["'][^>]*>([\s\S]*?)(?:<\/function>|$)/i,
  );
  if (xmlAttr) {
    const name = xmlAttr[1]!;
    const inner = xmlAttr[2] ?? '';
    const args = parseXmlParams(inner);
    return { kind: 'tool_call', name, args };
  }

  // 2. xLAM equals style.
  const xmlEq = text.match(
    /<function=([A-Za-z_][\w.-]*)>([\s\S]*?)(?:<\/function>|$)/,
  );
  if (xmlEq) {
    const name = xmlEq[1]!;
    const inner = xmlEq[2] ?? '';
    const args: Record<string, unknown> = {};
    const re = /<parameter=([A-Za-z_][\w.-]*)>([\s\S]*?)(?:<\/parameter>|$)/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(inner)) !== null) {
      args[m[1]!] = coerceScalar(m[2]!.trim());
    }
    return { kind: 'tool_call', name, args };
  }

  // 3. JSON in <tool_call>.
  const jsonBlock = text.match(/<tool_call>\s*([\s\S]*?)\s*(?:<\/tool_call>|$)/);
  if (jsonBlock) {
    const inner = jsonBlock[1]!.replace(/```(?:json)?/g, '').trim();
    try {
      const obj = JSON.parse(inner) as {
        name?: string;
        arguments?: Record<string, unknown>;
      };
      if (obj && typeof obj.name === 'string') {
        return { kind: 'tool_call', name: obj.name, args: obj.arguments ?? {} };
      }
    } catch (err) {
      log.debug('tool_call:json-parse-failed', { err: String(err) });
    }
  }

  return { kind: 'text', text };
}

function parseXmlParams(inner: string): Record<string, unknown> {
  const args: Record<string, unknown> = {};
  // Accept both <parameter ...> and <param ...> for the opener, and both
  // closing forms (</parameter> and </param>). MiniCPM-1B emits a mix:
  // typically opens with <parameter ...> but closes with </param>. Being
  // lenient on both ends keeps the parser robust to that quirk.
  const re =
    /<param(?:eter)?\s+name=["']([^"']+)["'](?:\s+type=["']([^"']+)["'])?[^>]*>([\s\S]*?)(?:<\/param(?:eter)?>|$)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(inner)) !== null) {
    // Strip a trailing closing tag if it leaked into the value (happens when
    // the body matcher ran to end-of-string because neither closing variant
    // was present in the inner substring).
    const value = m[3]!.replace(/<\/param(?:eter)?>\s*$/i, '').trim();
    args[m[1]!] = coerceScalar(value, m[2]);
  }
  return args;
}

/**
 * Lightweight type coercion for XML parameter values. We can't rely on the
 * model to produce typed output, so we promote obvious numbers/booleans/JSON.
 */
function coerceScalar(s: string, type?: string): unknown {
  if (!s) return '';
  if (type === 'number' || type === 'integer') {
    const n = Number(s);
    if (!Number.isNaN(n)) return n;
  }
  if (type === 'boolean') {
    if (/^true$/i.test(s)) return true;
    if (/^false$/i.test(s)) return false;
  }
  if (!type) {
    if (/^true$/i.test(s)) return true;
    if (/^false$/i.test(s)) return false;
    if (/^-?\d+$/.test(s)) return Number(s);
    if (/^-?\d+\.\d+$/.test(s)) return Number(s);
    if (/^[\[{]/.test(s)) {
      try {
        return JSON.parse(s);
      } catch {
        /* fall through */
      }
    }
  }
  return s;
}

/* ─────────────────────────── helpers ─────────────────────────── */

const delay = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function* chunkText(text: string, size = 24): Generator<string> {
  let i = 0;
  while (i < text.length) {
    let end = Math.min(i + size, text.length);
    while (end < text.length && !/\s/.test(text[end] ?? '')) end += 1;
    yield text.slice(i, end);
    i = end;
  }
}

function wrapError(err: unknown): Error {
  if (err instanceof LavandeError) return err;
  if (err instanceof Error) {
    if (/ECONNREFUSED|fetch failed/i.test(err.message)) {
      return new LavandeError('MiniCPM server is not reachable.', {
        code: 'PROVIDER_UNAVAILABLE',
        hint: `Start it with: python minicpm_server.py (expected at ${SERVER_URL})`,
        cause: err,
      });
    }
    return err;
  }
  return new Error(String(err));
}
