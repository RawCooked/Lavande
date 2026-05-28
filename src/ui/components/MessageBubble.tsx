import React from 'react';
import { Box, Text } from 'ink';
import { glyphs, theme } from '../theme.js';

interface Props {
  role: 'user' | 'assistant';
  content: string;
  /** Render with a soft border (used for the current streaming turn). */
  active?: boolean;
}

export const MessageBubble: React.FC<Props> = ({ role, content, active }) => {
  const isUser = role === 'user';
  const tag = isUser ? 'you' : 'lavande';
  const tagColor = isUser ? theme.muted : theme.primary;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box>
        <Text color={tagColor} bold>
          {isUser ? glyphs.prompt : glyphs.spark}
        </Text>
        <Text color={tagColor}> {tag}</Text>
        {active && <Text color={theme.dim}> · streaming</Text>}
      </Box>
      <Box marginLeft={2} flexDirection="column">
        <Text color={isUser ? theme.accent : theme.text}>{content || ' '}</Text>
      </Box>
    </Box>
  );
};
