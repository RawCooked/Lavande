import React from 'react';
import { Box, Text } from 'ink';
import TextInput from 'ink-text-input';
import { glyphs, theme } from '../theme.js';

interface Props {
  value: string;
  onChange: (v: string) => void;
  onSubmit: (v: string) => void;
  disabled?: boolean;
  placeholder?: string;
}

export const Composer: React.FC<Props> = ({
  value,
  onChange,
  onSubmit,
  disabled = false,
  placeholder = 'ask Lavande anything…',
}) => {
  return (
    <Box>
      <Text color={theme.primary} bold>
        {glyphs.prompt}{' '}
      </Text>
      {disabled ? (
        <Text color={theme.dim}>{value || placeholder}</Text>
      ) : (
        <TextInput
          value={value}
          onChange={onChange}
          onSubmit={onSubmit}
          placeholder={placeholder}
        />
      )}
    </Box>
  );
};
