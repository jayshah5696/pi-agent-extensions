# AGENTS.md

## Project Overview

**pi-agent-extensions** — A collection of TypeScript extensions for the [Pi coding agent](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent). Provides three extensions: `sessions` (session picker command), `ask-user` (structured user input tool), and `handoff` (goal-driven context transfer command).

## Commands

```bash
npm install          # Install dependencies
npm test             # Run all tests (Node.js native test runner via tsx)
```

There is no build step — TypeScript is executed directly via `tsx`.

## Architecture

### Extension Registration Pattern

Each extension lives in `extensions/<name>/` and exports a default function that receives the Pi `ExtensionAPI`. Extensions are registered in `package.json` under `pi.extensions`:

```
extensions/
  sessions/index.ts    → registerCommand("/sessions")
  ask-user/index.ts    → registerTool("ask_user")
  handoff/index.ts     → registerCommand("/handoff") + session_start event handler
```

### Shared Patterns

- **TypeBox schemas** (`@sinclair/typebox`) for runtime validation with TypeScript type inference — see `types.ts` in each extension
- **Mode-based execution**: Extensions detect `ctx.hasUI` to switch between interactive TUI mode and print/file-based fallback mode
- **ESM imports with `.js` extensions**: All relative imports use `.js` suffix (e.g., `import { foo } from "./module.js"`)
- **Signal-based cancellation**: Long operations accept `AbortSignal` for cancellable workflows

### Extension Details

**Sessions** (`extensions/sessions/`): Loads sessions for the current project, supports multi-token substring filtering across name/id/cwd/first-message fields. Uses `SelectList` TUI component or stdout in print mode.

**Ask User** (`extensions/ask-user/`): LLM-callable tool with TypeBox-validated input schema. Three modes — interactive (TUI `Editor`/`SelectList`), print (writes `.pi/pending-questions.json` for async response), and RPC. Always includes an "Other" free-text option. Answers persisted to session entries.

**Handoff** (`extensions/handoff/`): Uses LLM completion to extract structured context (relevant files, commands, decisions, open questions) from conversation history. Validates extracted files against actual conversation text to prevent hallucinations. Configurable via `.pi/settings.json` under `handoff` key. Supports retry logic on JSON parse failure.

**Nvidia NIM** (`extensions/nvidia-nim/`): Registers `/nvidia-nim-auth` and `/nvidia-nim-models` to configure API key + model list (one `org/model` per line). Persists config to `~/.pi/nvidia-nim.json`, registers provider dynamically via `pi.registerProvider()`, and updates `~/.pi/agent/settings.json` `enabledModels` so models appear in scoped `/model` and Ctrl+P cycling.

### Peer Dependencies (provided by Pi runtime)

- `@mariozechner/pi-coding-agent` — Extension API, session management
- `@mariozechner/pi-ai` — LLM completion interface
- `@mariozechner/pi-tui` — Terminal UI components (Editor, SelectList, Container, Border)

## Testing

Tests use **Node.js native test runner** with `node:test` and `node:assert/strict`. Located in `tests/` mirroring extension structure. No external test framework or mocking library.

Run a single test file:
```bash
node --import tsx --test tests/sessions.test.ts
node --import tsx --test tests/ask-user/tool.test.ts
```
