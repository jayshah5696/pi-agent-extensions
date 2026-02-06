# ask_user Tool Specification

> A user interaction tool for pi-coding-agent that enables LLMs to gather structured input from users during agentic workflows.

## Overview

The `ask_user` tool allows the LLM to pause execution and request input from the user. It supports structured questions with options while gracefully handling both interactive and non-interactive modes.

### Design Goals

1. **Simple yet flexible** - Support select with options, but users can always type custom answers
2. **Mode-agnostic** - Work in interactive TUI, print mode (`-p`), and RPC mode
3. **Session-aware** - Persist question/answer state for branching and replay
4. **LLM-friendly** - Clear, structured responses that help the model proceed

### Prior Art

| Tool | Approach | Key Features |
|------|----------|--------------|
| **Claude Code `AskUserQuestion`** | Questions array with options | `multiSelect`, `header`, always has "Other" option, `metadata` |
| **Roo Code `ask_followup_question`** | Single question + suggestions | Simpler XML-based, suggested answers in `<suggest>` tags |
| **OpenCode** | No ask_user tool | Only permission dialogs for bash commands |
| **Pi `question.ts` example** | Rich UI with options | Interactive-only, single question, "Type something" always available |
| **Pi `questionnaire.ts` example** | Multi-question with tabs | Interactive-only, tabbed navigation |

### Key Design Decisions

Based on research of Claude Code and Roo Code implementations:

1. **"Other" is always available** - Users can always type a custom answer instead of selecting an option. This is baked in, not configurable.

2. **No validation** - The LLM handles whatever the user types. Users saying "skip this" or "port 8080" are understood by the model without rigid validation.

3. **No conditional questions** - Users can type anything or skip optional questions. The LLM can ask follow-up questions naturally if needed.

4. **No timeout** - Always wait for user input.

5. **No explicit "optional" field** - Users can type "skip", "none", or "n/a" via Other. The LLM understands intent.

6. **Convention-based recommendations** - Following Claude Code: put recommended option first and add "(Recommended)" to the label. No schema field needed.

7. **Multi-question is atomic** - If user cancels mid-way, all answers are discarded (with confirmation if any were answered).

8. **Text-only answers (v1)** - Image attachments in answers deferred to v2.

---

## Question Schema

Following Claude Code's proven structure:

```typescript
interface Question {
  question: string;              // The question text (required)
  header?: string;               // Optional header/title for grouping context
  options?: Option[];            // Suggested options (optional - if omitted, free text input)
  multiSelect?: boolean;         // Allow multiple selections (default: false)
}

interface Option {
  label: string;                 // Display text (required)
  description?: string;          // Help text shown below label (optional)
}
```

**Note:** When `options` is provided, an "Other" option is automatically appended, allowing users to type a custom answer.

### Simplified Alternative (Roo Code style)

For simple yes/no or single questions, the LLM can also just ask naturally:

```typescript
interface SimpleQuestion {
  question: string;              // The question text
  suggestions?: string[];        // Quick suggestions (displayed as chips/buttons)
}
```

---

## Tool Interface

### Parameters Schema

```typescript
const AskUserParams = Type.Object({
  questions: Type.Array(QuestionSchema, {
    description: "One or more questions to ask the user",
    minItems: 1,
  }),
  metadata?: Type.Optional(Type.Object({}, {
    additionalProperties: true,
    description: "Optional metadata for tracking (e.g., { source: 'setup-wizard' })",
  })),
});

const QuestionSchema = Type.Object({
  question: Type.String({ description: "The question to ask" }),
  header: Type.Optional(Type.String({ description: "Optional header/title for context" })),
  options: Type.Optional(Type.Array(OptionSchema, { description: "Suggested options" })),
  multiSelect: Type.Optional(Type.Boolean({ description: "Allow multiple selections" })),
});

const OptionSchema = Type.Object({
  label: Type.String({ description: "Display text" }),
  description: Type.Optional(Type.String({ description: "Help text" })),
});
```

### Response Format

The tool returns structured answers that the LLM can easily parse:

```typescript
interface AskUserResult {
  answered: boolean;           // false if cancelled
  answers: Answer[];           // Array matching questions order
  pendingFile?: string;        // Path to JSON file (non-interactive mode only)
}

interface Answer {
  question: string;            // Echo of the question asked
  answer: string | string[];   // User's answer (string[] if multiSelect)
  selectedOption?: string;     // Which option label was selected (if applicable)
  wasCustom: boolean;          // True if user typed custom answer via "Other"
}
```

### Example Tool Call & Response

**LLM calls:**
```json
{
  "name": "ask_user",
  "input": {
    "questions": [
      {
        "question": "Which database should we use?",
        "header": "Database Selection",
        "options": [
          { "label": "PostgreSQL (Recommended)", "description": "Battle-tested relational DB" },
          { "label": "SQLite", "description": "Lightweight, file-based" },
          { "label": "MongoDB", "description": "Document store" }
        ]
      },
      {
        "question": "What should we name this service?",
        "header": "Service Setup"
      }
    ],
    "metadata": { "source": "project-setup" }
  }
}
```

**Tool returns (user selected PostgreSQL and typed custom name):**
```json
{
  "answered": true,
  "answers": [
    {
      "question": "Which database should we use?",
      "answer": "PostgreSQL (Recommended)",
      "selectedOption": "PostgreSQL (Recommended)",
      "wasCustom": false
    },
    {
      "question": "What should we name this service?",
      "answer": "order-processor",
      "wasCustom": true
    }
  ]
}
```

**Tool returns (user selected "Other" and typed custom DB):**
```json
{
  "answered": true,
  "answers": [
    {
      "question": "Which database should we use?",
      "answer": "I want to use DynamoDB",
      "wasCustom": true
    }
  ]
}
```

---

## Mode Behavior

### Interactive Mode (TUI)

Full UI experience:
- **Single question without options**: Simple text input replacing editor
- **Single question with options**: Options list with "Other" at bottom
- **Multiple questions**: Tabbed interface (like Pi's `questionnaire.ts` example)
- **Keyboard**: ↑↓ for options, Tab for questions, Enter to confirm, Esc to cancel

### Non-Interactive Mode (`pi -p`)

Two-pass workflow for graceful handling:

#### Pass 1: Questions Pending

When `ask_user` is called in print mode, it:
1. Writes questions to a JSON file (e.g., `.pi/pending-questions.json`)
2. Returns a structured response with instructions

**Tool output:**
```
Questions pending. User input required.

To answer, re-run with:
  pi -p @.pi/pending-questions.json "your answers"

Or edit the JSON file and run:
  pi -c

Questions saved to: .pi/pending-questions.json
```

**The pending questions file:**
```json
{
  "sessionId": "abc123",
  "timestamp": "2026-02-04T22:16:32Z",
  "questions": [
    {
      "question": "Which database should we use?",
      "options": ["PostgreSQL (Recommended)", "SQLite", "MongoDB"],
      "answer": null
    },
    {
      "question": "What should we name this service?",
      "answer": null
    }
  ]
}
```

#### Pass 2: Answering Questions

User can answer in multiple ways:

**Option A: Natural language (LLM parses)**
```bash
pi -p @.pi/pending-questions.json "use postgres, call it order-processor"
```

**Option B: Edit JSON directly**
```json
{
  "questions": [
    { "question": "Which database?", "answer": "PostgreSQL (Recommended)" },
    { "question": "Service name?", "answer": "order-processor" }
  ]
}
```
Then: `pi -c` (continue session)

**Option C: Inline answers flag**
```bash
pi -p --answers '["PostgreSQL (Recommended)", "order-processor"]'
```

### RPC Mode

Returns structured JSON that the RPC client can present however they choose:

```json
{
  "type": "ask_user_request",
  "requestId": "req-123",
  "questions": [...],
  "metadata": { "source": "project-setup" }
}
```

Client sends back via RPC:
```json
{
  "type": "ask_user_response",
  "requestId": "req-123",
  "answers": [...]
}
```

---

## UI Design (Interactive Mode)

### Single Question (with options)

```
────────────────────────────────────────────────────────────
 Database Selection

  Which database should we use?

  > 1. PostgreSQL (Recommended)
       Battle-tested relational DB
    2. SQLite
       Lightweight, file-based
    3. MongoDB
       Document store
    4. Other (type your answer)

  ↑↓ navigate • 1-9 quick select • Enter to select • Esc to cancel
────────────────────────────────────────────────────────────
```

### Single Question (with many options - scrollable)

```
────────────────────────────────────────────────────────────
 Framework Selection

  Which framework should we use?

    1. Express.js
    2. Fastify
  > 3. Hono
    4. Koa
    5. NestJS
    ↓ 3 more...

  ↑↓ navigate • 1-9 quick select • Enter to select • Esc to cancel
────────────────────────────────────────────────────────────
```

### Single Question (text input, no options)

```
────────────────────────────────────────────────────────────
 Service Setup

  What should we name this service?

  > order-processor█

  Enter to submit • Esc to cancel
────────────────────────────────────────────────────────────
```

### Multi-Question View (Tabbed)

```
────────────────────────────────────────────────────────────
 ← ■ Database  □ Service Name  □ Features  ✓ Submit →

  Which database should we use?

  > 1. PostgreSQL (Recommended)
    2. SQLite
    3. MongoDB
    4. Other (type your answer)

  Tab/←→ switch • ↑↓ select • Enter confirm • Esc cancel
────────────────────────────────────────────────────────────
```

### Multi-Select View (`multiSelect: true`)

```
────────────────────────────────────────────────────────────
 Feature Selection

  Which features should we include?

    [x] Authentication
        OAuth2 + JWT
  > [ ] REST API
        OpenAPI spec included
    [x] Admin Dashboard
    [ ] Other (type your answer)

  Space to toggle • Enter to submit • Esc to cancel
────────────────────────────────────────────────────────────
```

---

## Behavior Details

### Cancellation

| Scenario | Behavior |
|----------|----------|
| Single question, Esc pressed | Immediate cancel, return `{ answered: false, cancelled: true }` |
| Multi-question, no answers yet, Esc | Immediate cancel |
| Multi-question, some answered, Esc | Confirm dialog: "Discard N answers?" → Yes cancels, No returns to questions |
| Multi-question, all answered, on Submit tab, Esc | Same confirm dialog |

### Session Interruption

If user closes terminal mid-question (kill, crash, Ctrl+C twice):
- **No partial state is saved** - the tool call is incomplete
- On `pi -c` (continue session): the `ask_user` tool call replays from the beginning
- User sees the same questions again as if nothing happened

This is consistent with how Pi handles interrupted tool calls generally.

### Answer Length

- **Soft limit: 2000 characters** per answer
- If exceeded, show warning: "Answer is long (2,847 chars). Continue anyway? [Y/n]"
- Allow submission regardless - LLM can handle long text
- Rationale: Prevents accidental paste of entire files, but doesn't block intentional long answers

### Long Option Lists

When more than 6 options are provided:
- Show scrollable list with scroll indicator ("↓ 3 more...")
- Support number keys 1-9 for quick selection
- "Other" is always last, accessible via `0` or scrolling to end

### Compaction Behavior

When a session containing `ask_user` calls is compacted:
- Q&A content is included in the summary as structured text
- Example in summary: "User was asked about database preference and chose PostgreSQL. Service was named 'order-processor'."
- The `details` field in tool result provides structured data for the summarizer

---

## Error Handling

| Scenario | Behavior |
|----------|----------|
| User cancels (Esc) | `{ answered: false, answers: [], cancelled: true }` |
| Empty questions array | Return error, don't show UI |
| Non-interactive, no pending file | Create pending file, return instructions |
| RPC mode, client disconnects | Return `{ answered: false, connectionLost: true }` |

---

## State Persistence

Answers are stored in the session for:
- **Branching support**: Navigate to before the question, answers replay correctly
- **Session replay**: Resuming a session sees prior Q&A
- **Debugging**: See what the user answered in session history

Stored in tool result details:
```typescript
{
  questions: [...],
  answers: [...],
  answeredAt: 1707091200000,
  mode: "interactive" | "print" | "rpc",
  metadata?: { source: "project-setup" },
}
```

---

## Extension Structure

```
pi-ask-user/
├── package.json
├── src/
│   ├── index.ts           # Extension entry point
│   ├── tool.ts            # ask_user tool implementation
│   ├── types.ts           # Question/Answer type definitions
│   ├── ui/
│   │   ├── single.ts      # Single question component
│   │   ├── multi.ts       # Multi-question tabbed component
│   │   └── option-list.ts # Option selection with "Other"
│   ├── modes/
│   │   ├── interactive.ts # TUI mode handler
│   │   ├── print.ts       # Print mode (pending file workflow)
│   │   └── rpc.ts         # RPC mode handler
│   └── render.ts          # Custom tool call/result rendering
└── README.md
```

---

## API Summary

### Tool Registration

```typescript
pi.registerTool({
  name: "ask_user",
  label: "Ask User",
  description: `Ask the user one or more questions. Use when you need:
- Clarification on requirements or preferences
- User decisions between multiple valid approaches
- Confirmation before significant changes
- Input that cannot be inferred from context

Each question can have suggested options with descriptions.
Users can always select "Other" to provide a custom answer.
In non-interactive mode, creates a pending questions file for async response.

Guidelines:
- Put recommended option first with "(Recommended)" in the label
- Batch related questions together (avoid multiple rounds)
- Limit to 3-5 questions per call to avoid user fatigue
- Don't ask what can be inferred from context or previous messages
- Don't re-ask questions already answered in this session`,
  parameters: AskUserParams,
  execute: askUserExecute,
  renderCall: renderAskUserCall,
  renderResult: renderAskUserResult,
});
```

### Command Registration

```typescript
// Command to check/manage pending questions
pi.registerCommand("questions", {
  description: "Show or clear pending questions",
  handler: async (args, ctx) => {
    // Show pending questions file if exists
    // "clear" subcommand to remove pending file
  },
});
```

---

## Design Decisions (With Rationale)

### 1. "Other" Always Available

**Decision:** Users can always type a custom answer, even when options are provided.

**Rationale:** Claude Code does this. It prevents frustration when the LLM's suggested options don't match what the user wants. The LLM can interpret free-form text like "I'd rather use DynamoDB" or "skip this question".

### 2. No Validation

**Decision:** No regex, type checking, or format validation.

**Rationale:** 
- Claude Code and Roo Code don't validate
- The LLM can interpret "8080" or "port 8080" or "use port eight thousand eighty" equally well
- Validation frustrates users when they know what they mean
- If input is truly invalid, the LLM can ask a follow-up question

### 3. No Conditional Questions

**Decision:** All questions are shown regardless of previous answers.

**Rationale:**
- Users can type anything or skip via "Other"
- The LLM can naturally ask follow-up questions if needed
- Adds complexity without clear benefit
- Claude Code doesn't have this either

### 4. No Timeout

**Decision:** Always wait for user input, no auto-proceed.

**Rationale:**
- Both Claude Code and Roo Code wait indefinitely
- User input is explicitly requested, so it's important
- Auto-timeout with defaults could lead to unwanted actions

### 5. Unified Question Type

**Decision:** One flexible question type instead of text/select/confirm/multiselect.

**Rationale:**
- With options → select behavior
- Without options → text input behavior  
- With `multiSelect: true` → multi-select behavior
- Confirm is just options `["Yes", "No"]`
- Simpler schema, fewer edge cases

### 6. Atomic Multi-Question

**Decision:** If user cancels mid-way through multiple questions, all answers are discarded.

**Rationale:**
- Partial answers could leave the LLM in an inconsistent state
- Simpler mental model for users: "complete all or none"
- Confirmation dialog prevents accidental loss if answers were already provided

### 7. Question Replay on Interruption

**Decision:** If session is interrupted mid-question, the question replays on continue.

**Rationale:**
- Consistent with how Pi handles all interrupted tool calls
- No complex partial-state persistence needed
- User always sees a clean state

---

## Future Considerations (v2+)

These are explicitly out of scope for v1 but worth tracking:

1. **Image attachments in answers** - Let users paste screenshots as part of their answer
2. **File path input with completion** - Special handling for path questions
3. **Search/filter for long option lists** - Press `/` to filter options
4. **Answer history** - Press up arrow to recall previous answers
5. **Localization** - Translate "Other (type your answer)" and UI strings

---

## Implementation Phases

### Phase 1: Core (MVP)
- [ ] Basic tool with questions array
- [ ] Interactive mode UI (single question)
- [ ] Options with "Other" always available
- [ ] Session persistence
- [ ] Custom rendering

### Phase 2: Multi-Question + Non-Interactive
- [ ] Tabbed UI for multiple questions
- [ ] `multiSelect` support
- [ ] Print mode pending file workflow
- [ ] `/questions` command

### Phase 3: Polish
- [ ] RPC mode protocol
- [ ] `header` field support
- [ ] Input event handler for answer files
- [ ] `--answers` CLI flag

### Phase 4: Publish
- [ ] Documentation
- [ ] Tests
- [ ] Publish as pi-package

---

## References

- [Claude Code System Prompts (AskUserQuestion)](https://github.com/Piebald-AI/claude-code-system-prompts/blob/main/system-prompts/tool-description-askuserquestion.md)
- [Roo Code ask_followup_question](https://docs.roocode.com/advanced-usage/available-tools/ask-followup-question)
- [Pi Extensions Documentation](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/extensions.md)
- [Pi TUI Components](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/docs/tui.md)
- [Pi question.ts Example](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/extensions/question.ts)
- [Pi questionnaire.ts Example](https://github.com/badlogic/pi-mono/blob/main/packages/coding-agent/examples/extensions/questionnaire.ts)
