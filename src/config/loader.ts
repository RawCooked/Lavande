import fs from 'node:fs/promises';
import path from 'node:path';
import dotenv from 'dotenv';
import { ConfigSchema, type LavandeConfig } from './schema.js';
import { configDir, configFile } from './paths.js';

/**
 * Resolve the active configuration in priority order:
 *   1. CLI overrides (passed in)
 *   2. Environment variables (.env in cwd, then in configDir, then real env)
 *   3. config.json in the user's config dir
 *   4. Schema defaults
 */
export async function loadConfig(
  overrides: Partial<LavandeConfig> = {},
): Promise<LavandeConfig> {
  // Layered .env loading. dotenv won't override an existing var, so we start
  // with the closest source (cwd) and walk outward.
  dotenv.config({ path: path.join(process.cwd(), '.env') });
  dotenv.config({ path: path.join(configDir, '.env') });

  const fileConfig = await readConfigFile();
  const envConfig = readEnvConfig();

  const merged = deepMerge(fileConfig, envConfig, overrides);
  return ConfigSchema.parse(merged);
}

async function readConfigFile(): Promise<Record<string, unknown>> {
  try {
    const raw = await fs.readFile(configFile, 'utf8');
    return JSON.parse(raw);
  } catch (err) {
    if (isNotFound(err)) return {};
    throw new Error(`Failed to read config at ${configFile}: ${(err as Error).message}`);
  }
}

function readEnvConfig(): Record<string, unknown> {
  const cfg: Record<string, unknown> = {};
  if (process.env.LAVANDE_PROVIDER) cfg.provider = process.env.LAVANDE_PROVIDER;
  if (process.env.LAVANDE_MODEL) cfg.model = process.env.LAVANDE_MODEL;

  // Provider-specific keys.
  const apiKey =
    process.env.GEMINI_API_KEY ??
    process.env.GOOGLE_API_KEY ??
    process.env.OPENAI_API_KEY ??
    process.env.ANTHROPIC_API_KEY;
  if (apiKey) cfg.apiKey = apiKey;

  return cfg;
}

export async function writeConfig(patch: Partial<LavandeConfig>): Promise<LavandeConfig> {
  const current = await readConfigFile();
  const next = deepMerge(current, patch as Record<string, unknown>);
  const validated = ConfigSchema.parse(next);

  await fs.mkdir(configDir, { recursive: true });
  await fs.writeFile(configFile, JSON.stringify(validated, null, 2), 'utf8');
  return validated;
}

function isNotFound(err: unknown): boolean {
  return (
    typeof err === 'object' &&
    err !== null &&
    'code' in err &&
    (err as { code: string }).code === 'ENOENT'
  );
}

function deepMerge<T extends Record<string, unknown>>(...sources: T[]): T {
  const out = {} as Record<string, unknown>;
  for (const src of sources) {
    if (!src) continue;
    for (const [k, v] of Object.entries(src)) {
      if (v === undefined) continue;
      if (isPlainObject(v) && isPlainObject(out[k])) {
        out[k] = deepMerge(out[k] as Record<string, unknown>, v);
      } else {
        out[k] = v;
      }
    }
  }
  return out as T;
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
