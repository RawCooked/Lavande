import type { ToolResult } from '../tools/types.js';
import type { ConfirmRequest } from '../tools/types.js';

/**
 * Events streamed from the Agent to the UI. Designed as a tagged union so the
 * reducer in useAgent can pattern-match cleanly without runtime type guards.
 */
export type AgentEvent =
  | { type: 'turn_start' }
  | { type: 'thinking' }
  | { type: 'text'; delta: string }
  | { type: 'tool_start'; id: string; name: string; args: unknown }
  | { type: 'tool_end'; id: string; name: string; result: ToolResult }
  | { type: 'confirm_request'; id: string; request: ConfirmRequest }
  | { type: 'confirm_resolved'; id: string; approved: boolean }
  | { type: 'turn_end'; reason: 'stop' | 'tool_calls' | 'length' | 'cancelled' | 'error' }
  | { type: 'error'; message: string };
