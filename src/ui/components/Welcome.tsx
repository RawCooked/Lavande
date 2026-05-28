import React from 'react';
import { Box, Text } from 'ink';
import { glyphs, theme } from '../theme.js';

interface Props {
  provider: string;
  model: string;
  toolCount: number;
  memoryEnabled: boolean;
  apiKeyOk: boolean;
  width?: number;
}

export const Welcome: React.FC<Props> = ({
  provider,
  model,
  toolCount,
  memoryEnabled,
  apiKeyOk,
  width,
}) => {
  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.borderDim}
      paddingX={2}
      paddingY={0}
      marginBottom={1}
      width={width}
      overflow="hidden"
    >
      <Box>
        <Text color={theme.primary} bold>
          welcome
        </Text>
        <Text color={theme.muted}> · here is your session</Text>
      </Box>
      <Box marginTop={1} flexDirection="column">
        <Row label="provider" value={`${provider} ${glyphs.bullet} ${model}`} ok={apiKeyOk} />
        <Row label="tools" value={`${toolCount} ready`} ok />
        <Row label="memory" value={memoryEnabled ? 'on' : 'off'} ok={memoryEnabled} />
      </Box>
      {!apiKeyOk && (
        <Box marginTop={1}>
          <Text color={theme.warn} wrap="truncate-end">
            {glyphs.spark} Add GEMINI_API_KEY to your .env to start chatting.
          </Text>
        </Box>
      )}
    </Box>
  );
};

const Row: React.FC<{ label: string; value: string; ok: boolean }> = ({ label, value, ok }) => (
  <Box>
    <Box width={10} flexShrink={0}>
      <Text color={theme.muted}>{label}</Text>
    </Box>
    <Text color={ok ? theme.text : theme.warn} wrap="truncate-end">
      {value}
    </Text>
  </Box>
);
