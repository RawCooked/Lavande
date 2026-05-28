import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import { theme } from '../theme.js';

interface Props {
  label?: string;
}

export const Thinking: React.FC<Props> = ({ label = 'thinking' }) => (
  <Box marginY={0}>
    <Text color={theme.glow}>
      <Spinner type="dots" />
    </Text>
    <Text color={theme.muted}> {label}…</Text>
  </Box>
);
