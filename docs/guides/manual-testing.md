# Manual Testing Guide

This guide details how to manually verify the behavior of all 17 extensions and themes in a terminal session.

---

## Prerequisites

Before testing, install the package locally using Pi's package manager:

```bash
# From the repository root
pi install -l .
```

To run Pi in a verbose mode for checking loaded extensions:
```bash
pi
```

On startup, you should see:
```
Extensions: sessions, ask_user, handoff, notify, context, files, review, 
            loop, answer, control, cwd-history, session-breakdown, todos, whimsical,
            btw, powerline-footer, workflow
```

---

## 1. Sessions (`/sessions`)

**Goal:** Quick session picker with fuzzy filtering and live preview.

### Test Instructions
1. Run the command:
   ```
   /sessions
   ```
2. Verify that:
   - A list of recent sessions from the current project is displayed (default 5 rows).
   - Pressing `↑` / `↓` moves the selection.
   - A split-pane preview pane appears on the right showing the message history of the selected session.
3. Test filtering:
   - Start typing. The list should filter immediately based on matching substrings in the session name, cwd, or first message.
4. Test size argument:
   ```
   /sessions 10
   ```
   Verify it displays up to 10 sessions.
5. Press `Esc` to cancel, or `Enter` to switch to the selected session.

---

## 2. Ask User (`ask_user`)

**Goal:** Structured LLM-to-user questions with text and list picker types.

### Test Instructions (Interactive Mode)
1. In a Pi session, ask:
   ```
   Can you ask me what my favorite color is?
   ```
   Verify you see a text input prompt.
2. Ask:
   ```
   Ask me which database I prefer: PostgreSQL, SQLite, or MongoDB
   ```
   Verify a list selection UI opens, with an "Other (type your answer)" option.
3. Select "Other" and type your own database name. Verify it transitions cleanly to an inline text editor.

### Test Instructions (Print Mode)
1. Run Pi in non-interactive print mode:
   ```bash
   pi -p "Ask me what database I prefer"
   ```
2. Verify that:
   - Pi writes the question to `.pi/pending-questions.json`.
   - Pi outputs instructions on how to answer.
   - Inspect the file: `cat .pi/pending-questions.json`

---

## 3. Handoff (`/handoff`)

**Goal:** Goal-driven context extraction and transfer.

### Test Instructions
1. Have a brief conversation with Pi to generate history.
2. Run handoff:
   ```
   /handoff implement a clean button widget
   ```
3. Verify that:
   - A spinner loader runs while context is extracted.
   - An editor opens showing the structured prompt (with facts, files, decisions, open questions, and git status).
4. Review the prompt, make edits, and save/exit.
5. Pi should start a brand new session with that prompt pre-filled.

---

## 4. BTW (`/btw`)

**Goal:** Quick ephemeral side questions that do not clutter session history.

### Test Instructions
1. Run `/btw` with a query:
   ```
   /btw what is the syntax for a typescript interface?
   ```
2. Verify that:
   - An overlay opens with the answer.
   - Pressing `↑`/`↓`/`j`/`k` or `PgUp`/`PgDn` scrolls the answer text.
   - Pressing `Esc`, `Space`, or `q` dismisses the overlay.
3. Verify in your conversation history (e.g. by running `/context` or inspecting history) that the `/btw` conversation has not been appended to the thread.

---

## 5. Powerline Footer (Status Bar)

**Goal:** Visual real-time indicator of git, model, and cost details.

### Test Instructions
1. Start Pi.
2. Verify the custom footer displays:
   - Current Git branch and tree status (e.g. `main (staged: 1, untracked: 3)` or similar).
   - Current LLM provider and model name.
   - Context window usage percentage.
   - Cumulative session cost (e.g. `$0.02` or `<$0.01`).
   - Active Python virtualenv / Conda environment if applicable.
3. Perform a file write or edit to change Git status. Wait 10 seconds and verify the Git indicator updates automatically.

---

## 6. Session Breakdown (`/session-breakdown`)

**Goal:** Visual interactive session usage analytics.

### Test Instructions
1. Run the command:
   ```
   /session-breakdown
   ```
2. Verify that:
   - It lists analytics summaries: sessions/day, messages/day, token usage, cost/day.
   - A GitHub-style ASCII activity graph is displayed.
   - You can filter the date range (7, 30, or 90 days).
   - A list of models used and their breakdowns is shown.

---

## 7. Productivity Extensions

Verify the behavior of the adapted `agent-stuff` extensions:

### Context Dashboard (`/context`)
- Run `/context`. Verify it displays the token window bar chart, loaded skills, loaded extensions, and total session metrics.

### File Browser (`/files`)
- Run `/files`. Navigate folders, type to filter files.
- Press `Ctrl+Shift+D` on a modified file to view VS Code diff.
- Press `Enter` on a file and choose "Add to prompt".

### Desktop Notifications (`notify`)
- Run a long command or simply ask: `Create a test.txt file`.
- Verify a native desktop notification is sent when Pi completes the turn (requires Ghostty, iTerm2, WezTerm, or rxvt-unicode).

### Code Review (`/review`)
- Run `/review`. Choose "Review uncommitted changes".
- Verify that Pi analyzes the uncommitted diff and provides code feedback.

### Iterative Loop (`/loop`)
- Run `/loop`. Select "Until tests pass" or "Self driven".
- Verify that a loop widget status is rendered and Pi continues executing turns until completion.

### Todos (`/todos`)
- Run `/todos`. Add a todo task, verify you can claim and complete tasks interactively.

---

## 8. Workflow (`/workflow`)

**Goal:** Verify model-profile setup, generated-script approval, background progress, and saved workflows.

### Test Instructions

1. Run `/workflow setup`, choose **Balanced**, inspect the suggested role routes, and save globally.
2. Run:
   ```text
   /workflow run inspect this repository for three independent maintainability risks and verify each one
   ```
3. Verify that the generated JavaScript approval shows phases, model roles, scale caps, tools, and the trusted-script warning.
4. Approve it. Confirm `/workflow active` shows the background run and that its final result returns to the conversation.
5. Add a small workflow under `.pi/workflows/smoke.js`, confirm `/workflow list` discovers it, then run `/workflow saved smoke`.
6. Start a longer saved workflow, run `/workflow pause <runId>`, then `/workflow resume <runId>`. Confirm completed prefix agents are marked as cached rather than rerun.
7. Decline an approval and confirm no subagent starts.

---

## 9. Color Themes

**Goal:** Verify theme styling.

### Test Instructions
1. Start Pi with a custom theme:
   ```bash
   pi --theme p10k-inspired
   ```
2. Run `/context` or `/files` to check that:
   - Borders are medium gray (`#6c6c6c`).
   - Accents are bright cyan (`#00D9FF`).
   - Success text is bright green (`#5fd700`).
   - Errors are bright red (`#ff0087`).
3. Repeat with other themes to verify they render cleanly:
   - `ghostty-dark`
   - `fzf-bat`
   - `nightowl`
