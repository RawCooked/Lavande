import React from 'react';
import { Box, Text } from 'ink';
import { glyphs, theme } from '../theme.js';

interface Props {
  width?: number;
  color?: string;
}

export const Separator: React.FC<Props> = ({ width, color = theme.dim }) => {
  const w = width ?? Math.min((process.stdout.columns ?? 80) - 4, 120);
  return (
    <Box>
      <Text color={color}>{glyphs.divider.repeat(Math.max(1, w))}</Text>
    </Box>
  );
};
