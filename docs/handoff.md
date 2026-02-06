# Handoff Extension

The `/handoff` command generates a high-quality "new thread prompt" from the current session, then starts a new session with that prompt pre-filled for review and submission.

## Why Handoff?

Traditional compaction (`/compact`) summarizes the past but can lose critical context:
- Not goal-aware (summarizes everything, not what matters for your next task)
- Lossy and non-interactive (no review step)
- Can miss exact commands, file names, and decisions

Handoff takes a different approach:
- **Goal-driven**: Extracts context relevant to your next task
- **Structured**: Uses JSON extraction for reliable file/command/decision capture
- **Interactive**: Review and edit the prompt before starting the new session
- **Preserves intent**: Your goal is included verbatim

## Usage

```
/handoff <goal>
```

The goal should be specific about what you want to accomplish in the new thread.

### Examples

```
/handoff implement team-level handoff with proper tests
/handoff fix the authentication bug in login flow
/handoff add unit tests for the parser module
/handoff refactor database connection pooling
```

### Bad Goals (Too Vague)

These will be rejected:
- `continue`
- `keep going`
- `more`
- `fix`

## What Gets Extracted

The LLM analyzes your conversation and extracts:

1. **Relevant Files** - Files that were discussed, read, or modified, with reasons
2. **Relevant Commands** - Commands that were run or should be run
3. **Relevant Information** - Key facts and context for the next task
4. **Key Decisions** - Important decisions made during the session
5. **Open Questions** - Unresolved questions or risks

## Generated Prompt Structure

```markdown
/skill:previous-skill  (if enabled and a skill was used)

# Handoff Context
You are continuing work from a previous thread...

## Context (from previous thread)
- Key fact 1
- Key fact 2

## Key Decisions
- Decision 1
- Decision 2

## Open Questions / Risks
- Question 1

## Relevant Files
- path/to/file.ts - Why this file matters
- path/to/other.ts - Why this file matters

## Relevant Commands
- npm test
- npm run build

## Session Metadata
- Model: anthropic/claude-sonnet-4-5 (thinking: medium)
- Tools: read, write, edit, bash
- Git: main (dirty)
- Prior skill: /skill:llm-evals

## Next Goal (verbatim)
Your goal here...
```

## Features

### Skill Inheritance

If you used a `/skill:` command in your session, handoff remembers it and can prepend it to the new session's prompt. This maintains agent capabilities across threads.

### Session Metadata

Captures and includes:
- Current model and thinking level
- Active tools
- Git branch and dirty state
- Session name (if set)

### Git Integration

Automatically detects:
- Current branch name
- Whether there are uncommitted changes (dirty state)

### Non-Interactive Mode

In print mode (`pi -p`), handoff outputs the generated prompt to stdout instead of creating a new session.

## Configuration

Add to `.pi/settings.json`:

```json
{
  "handoff": {
    "maxFiles": 20,
    "maxCommands": 10,
    "maxInformationItems": 12,
    "maxDecisionItems": 8,
    "maxOpenQuestions": 6,
    "minGoalLength": 12,
    "includeMetadata": true,
    "includeSkill": true,
    "includeFileReasons": true,
    "includeHandoffPreamble": true,
    "useCurrentModel": true,
    "model": "anthropic/claude-3-haiku"
  }
}
```

### Options

| Option | Default | Description |
|--------|---------|-------------|
| `maxFiles` | 20 | Maximum files to include |
| `maxCommands` | 10 | Maximum commands to include |
| `maxInformationItems` | 12 | Maximum context bullets |
| `maxDecisionItems` | 8 | Maximum decisions |
| `maxOpenQuestions` | 6 | Maximum open questions |
| `minGoalLength` | 12 | Minimum goal length (chars) |
| `includeMetadata` | true | Include session metadata section |
| `includeSkill` | true | Include skill prefix if used |
| `includeFileReasons` | true | Include "why" for each file |
| `includeHandoffPreamble` | true | Include context preamble |
| `useCurrentModel` | true | Use current model for extraction |
| `model` | - | Override model for extraction (e.g., fast model) |

## How It Works

1. **Collect Context**: Uses `buildSessionContext()` for an already-compacted view
2. **Serialize**: Converts messages to text via `convertToLlm()` + `serializeConversation()`
3. **Extract**: Calls LLM with structured JSON extraction prompt
4. **Validate**: Parses and validates JSON, retries once on failure
5. **Normalize**: Dedupes files/commands, caps to limits, strips @ prefixes
6. **Assemble**: Builds the handoff prompt from template
7. **Review**: Opens editor for user to review/edit
8. **Create Session**: Creates new session with parent tracking, prefills editor

## Files

```
extensions/handoff/
├── index.ts      # Main extension, command registration
├── types.ts      # TypeBox schemas and interfaces
├── config.ts     # Configuration loading and goal validation
├── parser.ts     # JSON extraction and normalization
├── prompt.ts     # Prompt assembly
├── metadata.ts   # Git and session metadata collection
└── extraction.ts # LLM extraction prompts and processing
```

## Testing

```bash
npm test
```

Tests cover:
- Schema validation (TypeBox)
- JSON parsing and extraction from markdown
- Prompt assembly with all options
- Configuration merging
- Goal validation
- Git metadata parsing

## See Also

- [Spec: Handoff for Pi Agents](./spec_handoff.md) - Full specification
- [Implementation Log](./handoff_implementation_log.md) - Development history
