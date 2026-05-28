import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useApp, useInput } from 'ink';
import { Agent } from '../agent/Agent.js';
import type { LavandeConfig } from '../config/schema.js';
import { createProvider } from '../llm/registry.js';
import { MemoryStore } from '../memory/store.js';
import { createToolRegistry } from '../tools/registry.js';
import { LavandeError } from '../utils/errors.js';
import { Composer } from './components/Composer.js';
import { ConfirmDialog } from './components/ConfirmDialog.js';
import { Logo } from './components/Logo.js';
import { MessageBubble } from './components/MessageBubble.js';
import { Separator } from './components/Separator.js';
import { StatusFooter } from './components/StatusFooter.js';
import { Thinking } from './components/Thinking.js';
import { ToolCallCard } from './components/ToolCallCard.js';
import { Welcome } from './components/Welcome.js';
import { useAgent } from './hooks/useAgent.js';
import { useConfirm } from './hooks/useConfirm.js';
import { theme } from './theme.js';

interface Props {
  config: LavandeConfig;
}

export const App: React.FC<Props> = ({ config }) => {
  const { exit } = useApp();
  const [input, setInput] = useState('');
  const confirmGate = useConfirm();
  const [bootError, setBootError] = useState<string | null>(null);

  // Clamp content to terminal width (minus 4 chars for outer padding) up to 120.
  const contentWidth = Math.min((process.stdout.columns ?? 80) - 4, 120);

  // Build the agent once. If the API key is missing, we keep the UI mounted
  // and let the user see the Welcome panel's setup hint instead of crashing.
  const agent = useMemo<Agent | null>(() => {
    try {
      const tools = createToolRegistry(config);
      const provider = createProvider(config);
      const memory = new MemoryStore(config);
      return new Agent({
        provider,
        tools,
        memory,
        config,
        requestConfirm: confirmGate.request,
      });
    } catch (err) {
      const msg = err instanceof LavandeError ? err.message : err instanceof Error ? err.message : String(err);
      setBootError(msg);
      return null;
    }
  }, [config, confirmGate.request]);

  const toolCount = useMemo(() => {
    try {
      return createToolRegistry(config).list().length;
    } catch {
      return 0;
    }
  }, [config]);

  const { turns, busy, thinking, send, cancel } = useAgent(agent);

  useInput((_input, key) => {
    if (key.ctrl && _input === 'c') {
      if (busy) cancel();
      else exit();
    }
    if (key.escape && busy) {
      cancel();
    }
  });

  // If a confirmation pops while busy, we want it focused. The dialog uses
  // useInput, which already takes priority over the composer when mounted.

  useEffect(() => {
    return () => {
      // Nothing to dispose — the agent has no long-lived sockets.
    };
  }, []);

  const apiKeyOk = Boolean(config.apiKey);

  const handleSubmit = (value: string) => {
    if (!value.trim()) return;
    if (!agent) return;
    setInput('');
    void send(value);
  };

  return (
    <Box flexDirection="column" paddingX={1} paddingY={1}>
      <Logo gradient={config.ui.gradient} />

      <Welcome
        provider={config.provider}
        model={config.model}
        toolCount={toolCount}
        memoryEnabled={config.memory.enabled}
        apiKeyOk={apiKeyOk}
        width={contentWidth}
      />

      {bootError && (
        <Box marginBottom={1}>
          <Text color={theme.danger}>✗ {bootError}</Text>
        </Box>
      )}

      {turns.length > 0 && <Separator width={contentWidth} />}

      <Box flexDirection="column" marginTop={1}>
        {turns.map((turn) => {
          if (turn.kind === 'user') {
            return <MessageBubble key={turn.id} role="user" content={turn.text} />;
          }
          if (turn.kind === 'assistant') {
            return (
              <MessageBubble
                key={turn.id}
                role="assistant"
                content={turn.text}
                active={turn.streaming}
              />
            );
          }
          if (turn.kind === 'tool') {
            return (
              <ToolCallCard
                key={turn.id}
                name={turn.name}
                args={turn.args}
                status={turn.status}
                result={turn.result}
                width={contentWidth}
              />
            );
          }
          return (
            <Box key={turn.id} marginBottom={1}>
              <Text color={theme.danger}>✗ {turn.message}</Text>
            </Box>
          );
        })}

        {thinking && <Thinking />}
      </Box>

      {confirmGate.pending ? (
        <ConfirmDialog
          request={confirmGate.pending.request}
          onDecision={(approved) => confirmGate.resolve(approved)}
        />
      ) : (
        <Box marginTop={1}>
          <Composer
            value={input}
            onChange={setInput}
            onSubmit={handleSubmit}
            disabled={busy || !agent}
            placeholder={
              !agent
                ? 'setup needed — add GEMINI_API_KEY to your .env'
                : busy
                  ? 'Lavande is working… (esc to cancel)'
                  : 'ask Lavande anything…'
            }
          />
        </Box>
      )}

      <StatusFooter
        model={config.model}
        toolCount={toolCount}
        memoryEnabled={config.memory.enabled}
        busy={busy}
      />
    </Box>
  );
};
