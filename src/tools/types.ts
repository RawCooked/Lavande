import type { z } from 'zod';

export interface ToolContext {
  cwd: string;
  /** Ask the user for confirmation. Returns true if approved. */
  confirm: (request: ConfirmRequest) => Promise<boolean>;
  signal: AbortSignal;
}

export interface ConfirmRequest {
  title: string;
  detail?: string;
  /** Hard-coded short verb ("Allow", "Run", "Overwrite"). */
  action?: string;
}

export interface ToolResult {
  ok: boolean;
  output: string;
  meta?: Record<string, unknown>;
}

export interface Tool<S extends z.ZodTypeAny = z.ZodTypeAny> {
  /** Snake_case, stable identifier — exposed to the LLM. */
  name: string;
  /** One short paragraph describing when to use the tool. Shown to the LLM. */
  description: string;
  /** Zod input schema. Converted to JSON Schema for providers. */
  schema: S;
  /**
   * If true the tool always requires confirmation. Tools may also decide
   * dynamically inside execute() — see writeFile.
   */
  dangerous?: boolean;
  execute(args: z.infer<S>, ctx: ToolContext): Promise<ToolResult>;
}
