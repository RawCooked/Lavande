import React from 'react';
import { Box, Text } from 'ink';
import BigText from 'ink-big-text';
import Gradient from 'ink-gradient';
import { gradients, theme } from '../theme.js';

interface Props {
  gradient?: boolean;
  tagline?: string;
}

export const Logo: React.FC<Props> = ({ gradient = true, tagline = 'calm intelligence for your terminal' }) => {
  const body = <BigText text="lavande" font="tiny" />;
  return (
    <Box flexDirection="column" alignItems="flex-start" marginBottom={1}>
      {gradient ? <Gradient colors={[...gradients.brand]}>{body}</Gradient> : <Text color={theme.primary}>{body}</Text>}
      <Box marginLeft={1}>
        <Text color={theme.muted} italic>
          {tagline}
        </Text>
      </Box>
    </Box>
  );
};
