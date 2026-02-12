# Pi Agent Extensions

TypeScript extension pack for Pi with four extensions:

- `ask_user` (tool): structured user Q&A from the agent
- `handoff` (command): create goal-focused context handoffs into a new session
- `sessions` (command): quick session picker for the current project
- `whimsical` (UI/commands): dynamic working messages plus `/exit` and `/bye`

## Install

```bash
pi install .
```

Or from npm (if published):

```bash
pi install npm:pi-agent-extensions
```

## Included Extensions

### 1) ask_user

Tool name: `ask_user`

Lets the model ask one or more structured questions with options, freeform fallback, and metadata.

- Interactive mode: prompts directly in the TUI
- Non-interactive mode: writes `.pi/pending-questions.json`

### 2) handoff

Command: `/handoff <goal>`

Extracts relevant context from the current session, builds a focused handoff prompt, opens it in an editor, then starts a new session with the prompt prefilled.

Highlights:
- Goal validation
- Structured extraction via model call + retry parsing
- Optional metadata (model/tools/git/skill)
- Configurable through `.pi/settings.json` under `handoff`

### 3) sessions

Command: `/sessions [limit]`

Shows recent sessions in the current project with filtering and selection.

- Interactive picker with search
- Non-UI mode prints sessions to stdout

### 4) whimsical

Commands:
- `/whimsy [chaos|classic|bollywood|geek|on|off]`
- `/exit`
- `/bye`

Adds context-aware working messages during turns and graceful whimsical exits.

## Project Structure

```text
extensions/
  ask-user/
  handoff/
  sessions/
  whimsical/
```

## Notes

- Package is configured via the `pi.extensions` manifest in `package.json`.
- Source uses ESM TypeScript modules (`.ts` files with `.js` import specifiers), compatible with Pi extension loading.
