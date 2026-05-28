import { z } from 'zod';
import type { LavandeConfig } from '../config/schema.js';
import type { JSONSchemaProperty, ToolSpec } from '../llm/types.js';
import { builtinTools } from './builtin/index.js';
import type { Tool, ToolContext, ToolResult } from './types.js';

/**
 * Holds the active tool set and exposes the two interfaces the agent needs:
 *   - specs():        schemas to send to the LLM
 *   - execute(name):  run a tool by name with validation
 */
export class ToolRegistry {
  private readonly tools = new Map<string, Tool>();

  constructor(tools: Tool[]) {
    for (const tool of tools) {
      if (this.tools.has(tool.name)) {
        throw new Error(`Duplicate tool name: ${tool.name}`);
      }
      this.tools.set(tool.name, tool);
    }
  }

  list(): Tool[] {
    return [...this.tools.values()];
  }

  get(name: string): Tool | undefined {
    return this.tools.get(name);
  }

  specs(): ToolSpec[] {
    return this.list().map((tool) => ({
      name: tool.name,
      description: tool.description,
      parameters: zodToJsonSchema(tool.schema),
    }));
  }

  async execute(name: string, rawArgs: unknown, ctx: ToolContext): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      return { ok: false, output: `Unknown tool: ${name}` };
    }

    const parsed = tool.schema.safeParse(rawArgs ?? {});
    if (!parsed.success) {
      return {
        ok: false,
        output: `Invalid arguments for ${name}: ${parsed.error.issues
          .map((i) => `${i.path.join('.')} ${i.message}`)
          .join('; ')}`,
      };
    }

    if (tool.dangerous) {
      const ok = await ctx.confirm({
        title: `Run ${tool.name}?`,
        detail: tool.description,
        action: 'Allow',
      });
      if (!ok) {
        return { ok: false, output: 'User declined to run this tool.' };
      }
    }

    try {
      return await tool.execute(parsed.data, ctx);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return { ok: false, output: `Tool ${name} failed: ${msg}` };
    }
  }
}

export function createToolRegistry(config: LavandeConfig): ToolRegistry {
  const enabled = config.enabledTools;
  const filtered =
    enabled === '*' ? builtinTools : builtinTools.filter((t) => enabled.includes(t.name));
  return new ToolRegistry(filtered);
}

/* ───────────────────── zod → JSON schema ─────────────────────
 * Lightweight converter — covers the shapes our tools actually use.
 * If you add a tool with an exotic schema (refinements, unions, transforms),
 * extend this rather than reaching for a heavyweight library.
 */
export function zodToJsonSchema(schema: z.ZodTypeAny): ToolSpec['parameters'] {
  const result = convert(schema);
  if (result.type !== 'object') {
    return {
      type: 'object',
      properties: { value: result as JSONSchemaProperty },
      required: ['value'],
    };
  }
  return result as ToolSpec['parameters'];
}

function convert(schema: z.ZodTypeAny): JSONSchemaProperty {
  const description = schema.description;

  if (schema instanceof z.ZodString) return { type: 'string', ...(description && { description }) };
  if (schema instanceof z.ZodNumber) return { type: 'number', ...(description && { description }) };
  if (schema instanceof z.ZodBoolean) return { type: 'boolean', ...(description && { description }) };

  if (schema instanceof z.ZodEnum) {
    return { type: 'string', enum: schema.options as string[], ...(description && { description }) };
  }

  if (schema instanceof z.ZodLiteral) {
    const value = schema.value;
    if (typeof value === 'string') return { type: 'string', enum: [value], ...(description && { description }) };
  }

  if (schema instanceof z.ZodOptional || schema instanceof z.ZodNullable || schema instanceof z.ZodDefault) {
    return convert(schema._def.innerType);
  }

  if (schema instanceof z.ZodArray) {
    return {
      type: 'array',
      items: convert(schema.element),
      ...(description && { description }),
    };
  }

  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const properties: Record<string, JSONSchemaProperty> = {};
    const required: string[] = [];
    for (const [key, value] of Object.entries(shape)) {
      properties[key] = convert(value);
      if (!value.isOptional() && !(value instanceof z.ZodDefault)) required.push(key);
    }
    return {
      type: 'object',
      properties,
      ...(required.length ? { required } : {}),
      ...(description && { description }),
    };
  }

  // Sensible fallback so we never throw on schema conversion.
  return { type: 'string', ...(description && { description }) };
}
