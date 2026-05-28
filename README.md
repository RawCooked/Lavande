# Lavande

A calm, lavender-themed AI terminal companion for everyday tasks — organization, desktop help, light automation. Not a coding assistant.

```
   _                              _      
  | |    __ ___   ____ _ _ __   __| | ___ 
  | |   / _` \ \ / / _` | '_ \ / _` |/ _ \
  | |__| (_| |\ V / (_| | | | | (_| |  __/
  |_____\__,_| \_/ \__,_|_| |_|\__,_|\___|
```

## Quick start

```bash
pnpm install
pnpm build

# Set your Gemini API key
cp .env.example .env
# then edit .env and add GEMINI_API_KEY

# Start chatting
node bin/lavande.js
```

Get a Gemini key at https://aistudio.google.com/app/apikey.

## Commands

| command                | what it does                                   |
| ---------------------- | ---------------------------------------------- |
| `lavande`              | Start the chat UI (default).                   |
| `lavande chat`         | Same as above.                                 |
| `lavande tools`        | List every registered tool.                    |
| `lavande config`       | Show resolved config; `config path` for files. |
| `lavande reset`        | Wipe stored memory.                            |

Global flags: `--model <id>`, `--no-memory`, `--debug`.

## Architecture

```
src/
  agent/      Core agent loop (provider-agnostic)
  llm/        Provider abstraction (Gemini, OpenAI stub)
  tools/      Tool system + 8 builtin tools
  ui/         Ink components, lavender theme
  memory/     Pluggable storage (JSON impl)
  config/     Zod-validated config, XDG paths
  commands/   CLI subcommands
  utils/      Errors, logging, formatting
```

### How the agent loop works

1. User sends a message.
2. `Agent` calls `provider.stream()` with the conversation + tool schemas.
3. As the provider emits `text` deltas, they stream straight into the UI.
4. When the provider emits a `tool_call`, the agent looks it up in the tool registry, runs it (gating dangerous tools through a confirm prompt), and appends the result.
5. The loop continues until the provider stops or the iteration cap is reached.

The agent never imports a concrete provider or tool — both go through interfaces.

## Extending

### Add a tool

1. Create `src/tools/builtin/myTool.ts`:

```ts
import { z } from 'zod';
import type { Tool } from '../types.js';

export const myTool: Tool = {
  name: 'my_tool',
  description: 'Does the thing.',
  schema: z.object({ input: z.string() }),
  async execute(args) {
    return { ok: true, output: `done: ${args.input}` };
  },
};
```

2. Export it from `src/tools/builtin/index.ts`. Done — the registry picks it up.

Set `dangerous: true` to require user confirmation before execution.

### Add a provider

1. Implement `LLMProvider` in `src/llm/providers/myProvider.ts`.
2. Register it in `src/llm/registry.ts`.
3. Select it via `LAVANDE_PROVIDER=myProvider` or `config set provider myProvider`.

### Swap memory backend

Implement the `Storage` interface from `src/memory/types.ts` and wire it in `src/memory/store.ts`. The JSON implementation is the reference.

### Re-theme

Every component reads from `src/ui/theme.ts`. Change the palette there and the entire UI follows.

## Safety

- Tools marked `dangerous: true` require confirmation. In non-TTY contexts they auto-deny.
- `run_command` runs through a regex blocklist (e.g. `rm -rf /`, `format c:`).
- `write_file` is dangerous only when overwriting an existing file.

## License

MIT.
