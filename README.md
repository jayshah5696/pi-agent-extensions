# pi-agent-extensions

A collection of extensions for the [pi coding agent](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent).

## Acknowledgments

This project includes extensions adapted from [mitsuhiko/agent-stuff](https://github.com/mitsuhiko/agent-stuff) (Apache 2.0 / MIT License).

**Special thanks to Armin Ronacher ([@mitsuhiko](https://github.com/mitsuhiko))** for creating and open-sourcing these excellent production-ready extensions:
- `notify.ts` - Desktop notifications via OSC 777
- `context.ts` - Context breakdown dashboard  
- `files.ts` - Unified file browser with git integration
- `review.ts` - Code review system
- `loop.ts` - Iterative execution loop

Original repository: https://github.com/mitsuhiko/agent-stuff

## Extensions

| Extension | Type | Description | Status |
|-----------|------|-------------|--------|
| **sessions** | Command | Quick session picker with `/sessions` | ✅ Stable |
| **ask_user** | Tool | LLM can ask structured questions | ⚙️ Beta |
| **handoff** | Command | Goal-driven context transfer `/handoff` | ✅ Stable |
| **whimsical** | UI | Context-aware loading messages & exit | ✅ Stable |
| **files** | Tool | Unified file browser & git integration | ✅ Stable |
| **notify** | Tool | Desktop notifications via OSC 777 | ✅ Stable |
| **context** | UI | Context breakdown dashboard | ✅ Stable |
| **review** | Tool | Interactive code review system | ✅ Stable |
| **loop** | Tool | Iterative execution loop | ✅ Stable |
| **todos** | Tool | File-based todo list management | ✅ Stable |
| **control** | RPC | Inter-session communication & control | ⚙️ Beta |
| **answer** | Tool | Structured Q&A for complex queries | ⚙️ Beta |
| **cwd_history** | Tracker | Tracks directory changes in context | ✅ Stable |
| **nvidia-nim** | Command | Nvidia NIM auth & config | ✅ Stable |

## Install

### From npm (Recommended)

```bash
pi install npm:pi-agent-extensions
```

All extensions will be available immediately after installation.

### From Source (For Development)

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

## Update

```bash
# Update to latest version
pi update pi-agent-extensions

# Or update all packages
pi --update-packages
```

## Uninstall

```bash
pi remove pi-agent-extensions
```

## Troubleshooting

### Extensions not showing after install

If you installed via `npm install` or `npm update`, the package won't be registered with Pi. You must use **Pi's package manager**:

```bash
# Wrong (npm only - won't register with Pi)
npm install pi-agent-extensions

# Correct (registers with Pi)
pi install npm:pi-agent-extensions
```

### Verify installation

Check that the package appears in your settings:

```bash
cat ~/.pi/agent/settings.json | grep pi-agent-extensions
```

You should see:
```json
"packages": [
  "npm:pi-agent-extensions",
  ...
]
```

### Local development vs npm

When running Pi from the `pi-agent-extensions` directory, it loads **local** extensions (your development copy), not the npm-installed version. This is useful for development but can cause confusion.

To test the npm version, run Pi from a different directory:

```bash
cd ~/some-other-project
pi
# Check: should show npm:pi-agent-extensions in [Extensions]
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

### Whimsical

A personality engine for Pi that makes waiting fun.

**Usage:**

```bash
/whimsy         # Check status
/whimsy chaos   # Enable chaos mode (Bollywood + Geek + Tips)
/exit           # Graceful whimsical exit
```

**Features:**
- **Context-Aware:** Messages change based on time of day (Morning/Night) and wait duration.
- **Personality Modes:**
  - `chaos`: The full experience (50% Bollywood, 30% Tips, 20% Geek).
  - `bollywood`: 100% Bollywood dialogues & Hinglish memes.
  - `geek`: Sci-Fi & Dev humor ("Reticulating splines...").
- **Smart Exit:** `/exit` and `/bye` commands that ensure a clean terminal shutdown with a funny goodbye message.

See [extensions/whimsical/README.md](extensions/whimsical/README.md) for details.

### Productivity Tools

**Files (`/files`)**
Unified file explorer with git integration. Adapted from `agent-stuff`.
- `/files` - Open file browser
- `Ctrl+Shift+F` - Open file picker

**Todos (`/todos`)**
File-based todo list management (stores in `.pi/todos/`).
- `/todos` - List and manage todos
- Tool: `todo` (create, update, claim, close tasks)

**Notify**
Allows the agent to send desktop notifications (via terminal OSC 777).
- Tool: `notify`

**Review**
Interactive code review system. The agent can request a review, and you can approve/reject/comment on specific files.
- Tool: `request_review`

**Loop**
Iterative execution loop for complex tasks.
- Tool: `run_loop`

**Control**
RPC-based session control. Allows sessions to talk to each other (e.g., a "manager" session spawning and controlling "worker" sessions).
- Flag: `--session-control`
- Tool: `send_to_session`

**Nvidia NIM (`/nvidia-nim-auth`)**
Authenticate and configure Nvidia NIM as an LLM provider.
- Command: `/nvidia-nim-auth` (alias: `/nvidia-auth`)

## Development

```bash
npm install
npm test
```

## License

MIT
