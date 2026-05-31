# Extensions Reference

This document provides a comprehensive reference for the 16 extensions included in **pi-agent-extensions**.

---

## Index of Extensions

1. [Answer (`/answer`)](#1-answer-answer)
2. [Ask User (`ask_user`)](#2-ask-user-ask_user)
3. [BTW (`/btw`)](#3-btw-btw)
4. [Context (`/context`)](#4-context-context)
5. [Control (`send_to_session`)](#5-control-send_to_session)
6. [CWD History (Tracker)](#6-cwd-history-tracker)
7. [Files (`/files`)](#7-files-files)
8. [Handoff (`/handoff`)](#8-handoff-handoff)
9. [Loop (`/loop`)](#9-loop-loop)
10. [Notify (`notify`)](#10-notify-notify)
11. [Powerline Footer](#11-powerline-footer)
12. [Review (`/review`)](#12-review-review)
13. [Session Breakdown (`/session-breakdown`)](#13-session-breakdown-session-breakdown)
14. [Sessions (`/sessions`)](#14-sessions-sessions)
15. [Todos (`/todos`)](#15-todos-todos)
16. [Whimsical (`/whimsy`)](#16-whimsical-whimsy)

---

## 1. Answer (`/answer`)

Extracts questions from the last assistant message and provides a dedicated TUI to answer them in a batch.

*   **Type:** Tool & Command
*   **Command:** `/answer`
*   **Shortcut:** `Ctrl+.`
*   **Features:**
    *   Fires an LLM sub-call to parse/extract questions from raw message markdown.
    *   Presents questions in a sequential input form.
    *   Submits the final batch answers back into the conversation thread.

---

## 2. Ask User (`ask_user`)

Allows the LLM to request structured input from the user during execution.

*   **Type:** Tool
*   **Tool Name:** `ask_user`
*   **Features:**
    *   **Text & Select Prompts:** Supports simple open-ended text input and option selection lists.
    *   **Always-Available "Other":** Option lists automatically contain a free-text "Other" selection.
    *   **Modes:**
        *   *Interactive (TUI):* Renders an interactive Select/Editor.
        *   *Print (Fallback):* Non-interactive mode writes pending questions to `.pi/pending-questions.json` for async response.
        *   *RPC:* Supports RPC integrations.
    *   **Persistence:** Persistent answer history stored inside the session.

---

## 3. BTW (`/btw`)

Ask ephemeral "by the way" questions without polluting your conversation history or inflating context tokens.

*   **Type:** Command
*   **Command:** `/btw <question>`
*   **Features:**
    *   Full conversation context is visible to the query, but tool access is disabled.
    *   Renders response in a dismissable overlay screen.
    *   Scroll response with `↑`/`↓`/`j`/`k`/`PgUp`/`PgDn` and exit using `Esc`, `Space`, or `q`.
    *   Uses the currently selected session model for high-quality answers.
    *   Zero token impact on subsequent turns.

---

## 4. Context (`/context`)

Visualizes context window utilization and tracks loaded tools or skills.

*   **Type:** UI Dashboard
*   **Command:** `/context`
*   **Features:**
    *   Renders an ASCII bar chart representing token allocation (System, Tools, Conversation, Free).
    *   Lists all registered extensions and available skills.
    *   Highlights files and skills actively loaded in the current turn.
    *   Computes current session cost estimates.

---

## 5. Control (`send_to_session`)

Provides RPC capabilities to manage and communicate across concurrent Pi sessions (e.g. orchestrating manager and worker agents).

*   **Type:** RPC / Tool
*   **Tool Name:** `send_to_session`
*   **Features:**
    *   Lists controllable active sessions.
    *   Enables IPC (Inter-Process Communication) to pass instructions and data between session threads.

---

## 6. CWD History (Tracker)

Autonomously tracks directory changes (`cd` operations) and keeps the context updated.

*   **Type:** Context Tracker
*   **Features:**
    *   Fires on directory change hooks.
    *   Injects the current working directory path into the context so relative file references resolve correctly across turns.

---

## 7. Files (`/files`)

Interactive fuzzy file browser with deep Git integration.

*   **Type:** Command / Tool
*   **Command:** `/files`
*   **Shortcuts:**
    *   `Ctrl+Shift+O`: Open files browser
    *   `Ctrl+Shift+F`: Reveal latest modified file in OS Finder
    *   `Ctrl+Shift+R`: macOS Quick Look for selected file
    *   `Ctrl+Shift+D` / Action: Open file diff in VS Code
*   **Features:**
    *   Sorts lists dynamically (Modified/Dirty → Session-modified → Unmodified).
    *   Fuzzy filtering via live input typing.
    *   Add files directly to the prompt context.

---

## 8. Handoff (`/handoff`)

Goal-driven context transfer to transition work cleanly to a fresh session.

*   **Type:** Command
*   **Command:** `/handoff <goal>`
*   **Features:**
    *   **Goal Validation:** Ensures goals are specific (e.g., minimum character length, rejects vague goals like "continue").
    *   **Structured Context Extraction:** Fires an LLM sub-call to extract key decisions, facts, files, and commands as structured JSON.
    *   **Hallucination Filter:** Post-processes file paths, validating them against actual conversation history.
    *   **Skill Inheritance:** Inherits and prepends the prior `/skill:` invocation.
    *   **Interactive Review:** Opens an editor to review/edit the generated handoff prompt before starting the session.
*   **Configuration (`.pi/settings.json`):**
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
        "validateFiles": true,
        "useCurrentModel": true
      }
    }
    ```

---

## 9. Loop (`/loop`)

Iterative execution loop that allows Pi to self-correct and work autonomously until a target condition is satisfied.

*   **Type:** Tool & Command
*   **Command:** `/loop`
*   **Tool Name:** `run_loop` / `signal_loop_success`
*   **Modes:**
    *   *Until tests pass:* Retries turns until automated tests execute successfully.
    *   *Until custom condition:* Runs until a user-defined prompt criteria is met.
    *   *Self-driven:* The agent self-corrects and signals completion when satisfied.

---

## 10. Notify (`notify`)

Desktop notification integrations using OSC 777 escape sequences.

*   **Type:** Tool
*   **Tool Name:** `notify`
*   **Features:**
    *   Zero dependencies, using native terminal OSC 777 sequences.
    *   Fires automatically upon turn completion.
    *   Strips markdown and truncates output safely to 200 characters.
    *   *Supported Terminals:* Ghostty, iTerm2, WezTerm, rxvt-unicode.

---

## 11. Powerline Footer

A custom status footer replacing the default Pi footer with dense real-time indicators.

*   **Type:** UI Component
*   **Features:**
    *   **Git Status:** Displays current branch and uncommitted staged, unstaged, and untracked counts.
    *   **Context & Cost:** Real-time token usage percentage (color-coded) and session cost estimates.
    *   **Timer:** Cumulative turn and session durations.
    *   **Env Indicator:** Automatically detects and displays active Python Virtualenvs or Conda environments.
    *   **Async refresh:** Pulls details every 10 seconds asynchronously to avoid blocking input or render cycles.

---

## 12. Review (`/review`)

Interactive code review suite supporting multiple diff scopes.

*   **Type:** Command / Tool
*   **Command:** `/review`
*   **Shortcuts:** `Ctrl+R` to trigger review
*   **Review Modes:**
    *   Review uncommitted (dirty) files.
    *   Review unmerged branch changes against a target base branch (e.g. `main`).
    *   Review specific commit hashes.
    *   Review GitHub Pull Requests (requires `gh` CLI).
    *   Integrates project-specific `REVIEW_GUIDELINES.md` rules.

---

## 13. Session Breakdown (`/session-breakdown`)

Visual analytics dashboard compiling token consumption and model activity.

*   **Type:** Command
*   **Command:** `/session-breakdown`
*   **Features:**
    *   Aggregates data across files in `~/.pi/agent/sessions/`.
    *   Calculates metrics: sessions/day, messages/day, token usage, cost/day.
    *   Renders a Git-style ASCII activity graph.
    *   Supports 7, 30, and 90-day time filtering.

---

## 14. Sessions (`/sessions`)

Quick session picker to search and switch between active project threads.

*   **Type:** Command
*   **Command:** `/sessions [count]`
*   **Features:**
    *   Scopes sessions to the **current project directory** only.
    *   Renders a split-pane layout: select list on the left, conversation history preview block on the right.
    *   Supports typing multi-token filters (sub-string searches across name, CWD, first message, or ID).
    *   Displays human-readable timestamps (`YYYY-MM-DD HH:mm`).

---

## 15. Todos (`/todos`)

File-backed task manager supporting claim and status tracking.

*   **Type:** Command / Tool
*   **Command:** `/todos`
*   **Tool Name:** `todo`
*   **Features:**
    *   Persists todos locally to `.pi/todos.json`.
    *   Interactive task list TUI to create, view, claim, close, and delete items.

---

## 16. Whimsical (`/whimsy`)

Desi/Bollywood-infused, context-aware loader spinner and exits.

*   **Type:** UI / Command
*   **Command:** `/whimsy [on | off | status | reset]`
*   **Features:**
    *   Replaces generic "Thinking..." text during API calls.
    *   **Chaos Mixer:** Weights messages across 7 buckets (Absurd Nerd, Boss Progression, Fake Compiler Panics, Terminal Memes, Bollywood & Hinglish, Whimsical Verbs, Pi Tips).
    *   **Tuner Window:** Running `/whimsy` opens a percent-tuning window with interactive sliders to adjust weights and preview loader speeds.
    *   **Custom Spinners:** Options to choose spinner types: *Sleek Orbit*, *Neon Pulse*, *Scanline*, *Chevron Flow*, or *Matrix Glyph*.
    *   **Weighted Exits:** `/exit` or `/bye` commands deliver a humorous themed goodbye before closing.
