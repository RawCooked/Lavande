import { useCallback, useReducer, useRef } from 'react';
import type { Agent } from '../../agent/Agent.js';
import type { AgentEvent } from '../../agent/events.js';
import type { ToolResult } from '../../tools/types.js';

export type Turn =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'assistant'; id: string; text: string; streaming: boolean }
  | {
      kind: 'tool';
      id: string;
      name: string;
      args: unknown;
      status: 'running' | 'done';
      result?: ToolResult;
    }
  | { kind: 'error'; id: string; message: string };

interface State {
  turns: Turn[];
  busy: boolean;
  thinking: boolean;
}

type Action =
  | { type: 'add'; turn: Turn }
  | { type: 'append_text'; delta: string }
  | { type: 'finish_assistant' }
  | { type: 'tool_done'; id: string; result: ToolResult }
  | { type: 'set_busy'; busy: boolean }
  | { type: 'set_thinking'; value: boolean }
  | { type: 'cancelled' };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'add':
      return { ...state, turns: [...state.turns, action.turn] };

    case 'append_text': {
      const turns = [...state.turns];
      const last = turns[turns.length - 1];
      if (last && last.kind === 'assistant' && last.streaming) {
        turns[turns.length - 1] = { ...last, text: last.text + action.delta };
      } else {
        turns.push({
          kind: 'assistant',
          id: `a-${Date.now()}`,
          text: action.delta,
          streaming: true,
        });
      }
      return { ...state, turns, thinking: false };
    }

    case 'finish_assistant': {
      const turns = state.turns.map((t) =>
        t.kind === 'assistant' && t.streaming ? { ...t, streaming: false } : t,
      );
      return { ...state, turns };
    }

    case 'tool_done': {
      const turns = state.turns.map((t) =>
        t.kind === 'tool' && t.id === action.id
          ? { ...t, status: 'done' as const, result: action.result }
          : t,
      );
      return { ...state, turns };
    }

    case 'set_busy':
      return { ...state, busy: action.busy };

    case 'set_thinking':
      return { ...state, thinking: action.value };

    case 'cancelled':
      return { ...state, busy: false, thinking: false };
  }
}

const initialState: State = { turns: [], busy: false, thinking: false };

/**
 * Drives one Agent and exposes terminal-friendly state.
 *
 * - send(text): kicks off a new turn
 * - cancel(): aborts the in-flight stream
 */
export function useAgent(agent: Agent | null) {
  const [state, dispatch] = useReducer(reducer, initialState);
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
    dispatch({ type: 'cancelled' });
  }, []);

  const send = useCallback(
    async (text: string) => {
      if (!agent) return;
      if (!text.trim()) return;

      const userTurn: Turn = { kind: 'user', id: `u-${Date.now()}`, text };
      dispatch({ type: 'add', turn: userTurn });
      dispatch({ type: 'set_busy', busy: true });

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        for await (const event of agent.run(text, controller.signal)) {
          handleEvent(event, dispatch);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        dispatch({
          type: 'add',
          turn: { kind: 'error', id: `e-${Date.now()}`, message },
        });
      } finally {
        dispatch({ type: 'finish_assistant' });
        dispatch({ type: 'set_busy', busy: false });
        dispatch({ type: 'set_thinking', value: false });
        abortRef.current = null;
      }
    },
    [agent],
  );

  return { ...state, send, cancel };
}

function handleEvent(event: AgentEvent, dispatch: React.Dispatch<Action>): void {
  switch (event.type) {
    case 'turn_start':
      dispatch({ type: 'set_thinking', value: true });
      return;
    case 'thinking':
      dispatch({ type: 'set_thinking', value: true });
      return;
    case 'text':
      dispatch({ type: 'append_text', delta: event.delta });
      return;
    case 'tool_start':
      dispatch({ type: 'finish_assistant' });
      dispatch({
        type: 'add',
        turn: {
          kind: 'tool',
          id: event.id,
          name: event.name,
          args: event.args,
          status: 'running',
        },
      });
      dispatch({ type: 'set_thinking', value: false });
      return;
    case 'tool_end':
      dispatch({ type: 'tool_done', id: event.id, result: event.result });
      return;
    case 'error':
      dispatch({
        type: 'add',
        turn: { kind: 'error', id: `e-${Date.now()}`, message: event.message },
      });
      return;
    case 'turn_end':
      dispatch({ type: 'finish_assistant' });
      dispatch({ type: 'set_thinking', value: false });
      return;
    default:
      return;
  }
}
