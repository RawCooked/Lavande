import React from 'react';
import { Box, Text } from 'ink';
import { glyphs, theme } from '../theme.js';

interface Props {
  model: string;
  toolCount: number;
  memoryEnabled: boolean;
  busy: boolean;
}

export const StatusFooter: React.FC<Props> = ({ model, toolCount, memoryEnabled, busy }) => {
  return (
    <Box marginTop={1}>
      <Text color={theme.dim}>{glyphs.spark} </Text>
      <Text color={theme.muted}>{model}</Text>
      <Text color={theme.dim}> {glyphs.bullet} </Text>
      <Text color={theme.muted}>tools:{toolCount}</Text>
      <Text color={theme.dim}> {glyphs.bullet} </Text>
      <Text color={theme.muted}>mem:{memoryEnabled ? 'on' : 'off'}</Text>
      <Text color={theme.dim}> {glyphs.bullet} </Text>
      <Text color={busy ? theme.glow : theme.dim}>
        {busy ? 'busy' : 'ready'}
      </Text>
      <Text color={theme.dim}>   ctrl+c to exit</Text>
    </Box>
  );
};
