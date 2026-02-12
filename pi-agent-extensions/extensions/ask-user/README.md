# ask_user Extension

Interactive user input tool for pi coding agent.

## Overview

The `ask_user` tool allows the LLM to pause execution and gather structured input from users. Unlike simple yes/no confirmations, this supports multiple question types with options.

## Usage

The LLM calls the tool directly. You just interact with the prompts.

**Example conversation:**

```
You: Create a new microservice for me

LLM: I'll need some information first.
     *calls ask_user tool*

     Which database should we use?
     > 1. PostgreSQL (Recommended)
       2. SQLite
       3. MongoDB
       4. Other (type your answer)

You: [selects PostgreSQL]

LLM: Great! Creating microservice with PostgreSQL...
```

## Features

✅ **Text input** - Free-form answers
✅ **Option selection** - Choose from predefined options
✅ **Custom answers** - "Other" option always available
✅ **Multiple questions** - Batch related questions
✅ **Print mode support** - Works in non-interactive mode
✅ **Session persistence** - Q&A stored in session history

## Question Types

### Text Input

No options provided - user types answer freely.

```typescript
{
  question: "What should we name this project?"
}
```

### Single Select

Choose one from a list.

```typescript
{
  question: "Which framework?",
  options: [
    { label: "FastAPI", description: "Modern async framework" },
    { label: "Flask", description: "Lightweight and flexible" }
  ]
}
```

### Multi-Select (Basic)

Choose multiple options (currently shows sequentially).

```typescript
{
  question: "Which features to include?",
  options: [
    { label: "Authentication" },
    { label: "REST API" },
    { label: "Admin Dashboard" }
  ],
  multiSelect: true
}
```

## Non-Interactive Mode

When running `pi -p`, questions are written to a file:

```bash
pi -p "Ask me about my database preference"
# Creates .pi/pending-questions.json

# Answer via natural language:
pi -p @.pi/pending-questions.json "I prefer PostgreSQL"

# Or edit JSON directly and continue:
pi -c
```

## Implementation Status

**v0.1.0 - Current**

- ✅ Core tool logic
- ✅ Schema validation
- ✅ Print mode (pending file)
- ✅ Basic interactive mode (ctx.ui helpers)
- ✅ Custom rendering
- ⏸️ Custom TUI components (awaiting feedback)
- ⏸️ Tabbed multi-question UI (shows sequentially for now)
- ⏸️ True multi-select (single-select behavior currently)

## For Developers

**Test:**
```bash
npm test
```

**Manual testing:**
See [docs/manual-testing.md](../docs/manual-testing.md)

**Spec:**
See [docs/ask-user.md](../docs/ask-user.md) for full specification

**Type Definitions:**
See `types.ts` for schema details
