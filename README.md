# pi-agent-extensions

A collection of extensions for the [pi coding agent](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent).

## Extensions

| Extension | Type | Description | Status |
|-----------|------|-------------|--------|
| **sessions** | Command | Quick session picker with `/sessions` command | ✅ Stable |
| **ask_user** | Tool | LLM can ask structured questions with options | ⚙️ Beta (v0.1.0) |
| **handoff** | Command | Transfer context to a new focused session with `/handoff` | ✅ Stable |

## Install

### From Source (Until Published)

```bash
# Clone the repository
git clone https://github.com/jayshah5696/pi-agent-extensions.git
cd pi-agent-extensions

# Install globally
pi install .

# Or install to specific project
cd ~/your-project
pi install -l /path/to/pi-agent-extensions
```

### Quick Test Without Installing

```bash
pi -e /path/to/pi-agent-extensions/extensions/sessions/index.ts \
   -e /path/to/pi-agent-extensions/extensions/ask-user/index.ts \
   -e /path/to/pi-agent-extensions/extensions/handoff/index.ts
```

### From npm (When Published)

```bash
pi install npm:pi-agent-extensions
```

Both extensions will be available immediately after installation.

## Verify Installation

After installing, start pi and look for the startup message:

```
Extensions: sessions, ask_user, handoff
```

**Test sessions:**
```bash
pi
/sessions
```

**Test ask_user:**
```bash
pi
> Ask me which database I prefer: PostgreSQL or SQLite
```

The LLM should call the `ask_user` tool and show you options to select.

**Test handoff:**
```bash
pi
# Have a conversation first, then:
/handoff implement the next feature with proper tests
```

You'll see a loader while context is extracted, then an editor to review the handoff prompt.

## Uninstall

```bash
pi remove pi-agent-extensions
```

## Extensions

### Sessions

Quick session picker for the pi coding agent. Provides a compact `/sessions` selector (default 5 visible rows) with arrow navigation, Enter to switch, and Esc to cancel.

**Usage:**

```bash
/sessions       # Show last 5 sessions
/sessions 10    # Show last 10 sessions
```

**Features:**
- Lists sessions from the **current project** only
- Displays absolute timestamps (`YYYY-MM-DD HH:mm`)
- Filter by typing (prefix match on session name or cwd)
- In non-UI mode (`pi -p` or JSON/RPC), sessions are printed to stdout

See [docs/extensions/sessions.md](docs/extensions/sessions.md) for details.

### Ask User

The LLM can call the `ask_user` tool to gather user input with structured questions and options.

**Status:** ⚙️ Beta (v0.1.0) - Core features working, enhanced UI coming soon

**Example:**

```typescript
ask_user({
  questions: [{
    question: "Which database should we use?",
    header: "Database Selection",
    options: [
      { label: "PostgreSQL (Recommended)", description: "Battle-tested relational DB" },
      { label: "SQLite", description: "Lightweight, file-based" },
      { label: "MongoDB", description: "Document store" }
    ]
  }]
})
```

**Features:**
- ✅ Text input questions
- ✅ Option selection with descriptions
- ✅ "Other" option always available
- ✅ Print mode (pending file workflow)
- ✅ Session persistence
- ⏸️ Custom TUI components (using built-in helpers for now)
- ⏸️ Tabbed multi-question UI (sequential currently)

See [extensions/ask-user/README.md](extensions/ask-user/README.md) and [docs/extensions/ask-user.md](docs/extensions/ask-user.md) for details.

### Handoff

Transfer context to a new focused session. Unlike `/compact` which summarizes everything, `/handoff` extracts only what's relevant to your next goal.

**Usage:**

```bash
/handoff <goal>
```

**Examples:**

```bash
/handoff implement team-level handoff with proper tests
/handoff fix the authentication bug in login flow
/handoff add unit tests for the parser module
```

**Features:**
- Goal-driven context extraction (files, commands, decisions, open questions)
- Structured JSON extraction with LLM
- Skill inheritance (preserves last `/skill:` used)
- Git metadata (branch, dirty state)
- Session metadata (model, tools, thinking level)
- Interactive editor to review/edit before creating new session
- Configurable via `.pi/settings.json`

**What gets extracted:**
- Relevant files with reasons
- Commands that were run
- Key context and decisions
- Open questions/risks

See [docs/extensions/handoff.md](docs/extensions/handoff.md) for full documentation.

## Development

```bash
npm install
npm test
```

## License

MIT
