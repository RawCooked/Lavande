import React from 'react';
import { Box, Text } from 'ink';
import Spinner from 'ink-spinner';
import type { ToolResult } from '../../tools/types.js';
import { formatArgsPreview, truncateLines } from '../../utils/format.js';
import { glyphs, theme } from '../theme.js';

interface Props {
  name: string;
  args: unknown;
  status: 'running' | 'done';
  result?: ToolResult;
  /** Outer content width for clamping. */
  width?: number;
}

export const ToolCallCard: React.FC<Props> = ({ name, args, status, result, width }) => {
  const argsMax = width ? Math.max(20, width - 30) : 72;
  const argsPreview = formatArgsPreview(args, argsMax);
  const ok = result?.ok ?? null;

  return (
    <Box flexDirection="column" marginBottom={1}>
      <Box
        borderStyle="round"
        borderColor={theme.borderDim}
        paddingX={1}
        flexDirection="column"
        width={width}
        overflow="hidden"
      >
        <Box>
          {status === 'running' ? (
            <Text color={theme.glow}>
              <Spinner type="dots" />
            </Text>
          ) : ok ? (
            <Text color={theme.success}>{glyphs.check}</Text>
          ) : (
            <Text color={theme.danger}>{glyphs.cross}</Text>
          )}
          <Text color={theme.glow} bold>
            {' '}
            {name}
          </Text>
          {argsPreview && (
            <>
              <Text color={theme.dim}> {glyphs.arrow} </Text>
              <Text color={theme.muted} wrap="truncate-end">
                {argsPreview}
              </Text>
            </>
          )}
        </Box>
        {status === 'done' && result && (
          <Box marginTop={0} flexDirection="column">
            <Text color={ok ? theme.text : theme.danger} wrap="wrap">
              {truncateLines(result.output, 8) || ' '}
            </Text>
          </Box>
        )}
      </Box>
    </Box>
  );
};
