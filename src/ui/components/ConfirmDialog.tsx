import React from 'react';
import { Box, Text, useInput } from 'ink';
import type { ConfirmRequest } from '../../tools/types.js';
import { glyphs, theme } from '../theme.js';

interface Props {
  request: ConfirmRequest;
  onDecision: (approved: boolean) => void;
}

export const ConfirmDialog: React.FC<Props> = ({ request, onDecision }) => {
  useInput((input, key) => {
    if (key.return) onDecision(true);
    else if (input === 'y' || input === 'Y') onDecision(true);
    else if (input === 'n' || input === 'N' || key.escape) onDecision(false);
  });

  return (
    <Box
      flexDirection="column"
      borderStyle="round"
      borderColor={theme.warn}
      paddingX={2}
      paddingY={0}
      marginY={1}
    >
      <Text color={theme.warn} bold>
        {glyphs.spark} {request.title}
      </Text>
      {request.detail && (
        <Box marginTop={0}>
          <Text color={theme.muted}>{request.detail}</Text>
        </Box>
      )}
      <Box marginTop={1}>
        <Text color={theme.text}>
          {request.action ?? 'Allow'}? <Text color={theme.success}>(y)</Text> /{' '}
          <Text color={theme.danger}>(n)</Text>
        </Text>
      </Box>
    </Box>
  );
};
