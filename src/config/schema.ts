import { z } from 'zod';

export const ConfigSchema = z.object({
  provider: z.enum(['gemini', 'openai', 'anthropic', 'ollama']).default('gemini'),
  model: z.string().default('gemini-2.5-flash'),
  apiKey: z.string().optional(),
  enabledTools: z.union([z.array(z.string()), z.literal('*')]).default('*'),
  memory: z
    .object({
      enabled: z.boolean().default(true),
      maxTurns: z.number().int().positive().default(40),
    })
    .default({}),
  ui: z
    .object({
      gradient: z.boolean().default(true),
      animations: z.boolean().default(true),
    })
    .default({}),
  agent: z
    .object({
      maxIterations: z.number().int().positive().default(8),
    })
    .default({}),
});

export type LavandeConfig = z.infer<typeof ConfigSchema>;
