# Mitsuhiko Agent-Stuff Integration Analysis

**Analysis Date:** February 6, 2026  
**Repository:** https://github.com/mitsuhiko/agent-stuff  
**Target System:** pi-sessions (jayshah5696/pi-agent-extensions)

---

## Executive Summary

After thorough analysis of mitsuhiko's `agent-stuff` repository, I've identified **12 high-value extensions** and **4 skills** that can significantly enhance your pi-sessions package. This analysis categorizes them by priority and implementation complexity, with detailed recommendations for integration strategy.

**Key Finding:** Your current extensions (sessions, ask-user, handoff) are solid foundations focusing on session management and context transfer. Mitsuhiko's extensions complement these by adding **developer experience**, **file management**, **workflow automation**, and **debugging tools**.

---

## Current State Analysis

### Your Existing Extensions

| Extension | Purpose | Strength | Gap Coverage Needed |
|-----------|---------|----------|---------------------|
| **sessions** | Session picker with filtering | Clean TUI, multi-token search | Lacks session analytics/breakdown |
| **ask-user** | Structured LLM-to-user questions | Comprehensive (TUI/print/RPC modes) | No issues - well designed |
| **handoff** | Goal-driven context transfer | Novel approach with validation | Could benefit from review integration |

### Your Strengths
- **TypeBox validation** (runtime safety)
- **Mode awareness** (TUI vs print mode)
- **Signal-based cancellation** (proper async handling)
- **Clean architecture** (well-separated concerns)

---

## Priority 1: Must-Have Additions (Immediate Impact)

### 1. **`files.ts` - Unified File Browser** ⭐⭐⭐⭐⭐
**Why critical:** 1000+ lines of battle-tested code for file navigation that your handoff extension could leverage.

**What it does:**
- Merges git status with session-referenced files
- Fuzzy search with `Ctrl+Shift+D` for instant diff
- Smart sorting: dirty files first → session-modified → referenced
- Actions: reveal, open, edit, diff, add to prompt
- Extracts file refs from messages using multiple patterns (file tags, URLs, paths)

**Integration path:**
```typescript
// In your handoff/extraction.ts
import { extractFileReferencesFromEntry } from "../files/index.js";
// Use file extraction to validate handoff file lists
```

**Benefits for your package:**
- Handoff can validate extracted files against actual session references
- Users get visual file browser (`/files` command)
- Shortcuts: `Ctrl+Shift+O` (browse), `Ctrl+Shift+F` (reveal latest), `Ctrl+Shift+R` (Quick Look)

**Implementation effort:** Medium (adapt to your structure)  
**LOC:** ~1000 lines  
**Dependencies:** Git, filesystem, pi-tui (SelectList, Input, fuzzyFilter)

---

### 2. **`context.ts` - Context Breakdown Dashboard** ⭐⭐⭐⭐⭐
**Why critical:** Your handoff extension needs context awareness; this provides it visually.

**What it does:**
- Token usage bar chart (system/tools/convo/free)
- Lists loaded extensions, skills, AGENTS.md files
- Highlights skills actually read during session (via `tool_result` hook)
- Session totals: tokens + cost
- Tracks which skills were loaded vs just available

**Key feature:** Skill tracking via `tool_result` events
```typescript
pi.on("tool_result", (event, ctx) => {
  if (event.toolName === "read" && !event.isError) {
    // Detect skill loads by matching path to skill directories
  }
});
```

**Integration with your code:**
- Your handoff uses `ctx.getContextUsage()` - context.ts has a refined version
- Shows AGENTS.md token impact (your handoff references this)
- Provides cost tracking that handoff could log

**Implementation effort:** Medium  
**LOC:** ~550 lines  
**Dependencies:** pi-tui (Container, Text, DynamicBorder)

---

### 3. **`notify.ts` - Desktop Notifications** ⭐⭐⭐⭐
**Why valuable:** Zero dependencies, maximum UX improvement.

**What it does:**
- Sends native desktop notifications when agent finishes
- Uses OSC 777 escape sequence (works on Ghostty, iTerm2, WezTerm, rxvt-unicode)
- Strips markdown to plain text for notification body
- Truncates to 200 chars

**Code simplicity:** Only 86 lines!
```typescript
const notify = (title: string, body: string): void => {
  process.stdout.write(`\x1b]777;notify;${title};${body}\x07`);
};

pi.on("agent_end", async (event) => {
  const lastText = extractLastAssistantText(event.messages ?? []);
  notify("π", lastText);
});
```

**Integration effort:** Trivial - copy file as-is  
**Value:** High (users love this feature)

---

## Priority 2: High-Value Workflow Enhancements

### 4. **`review.ts` - Code Review System** ⭐⭐⭐⭐⭐
**Why important:** Complements your handoff extension; review before handoff, handoff after review.

**What it does:**
- Review uncommitted changes
- Review against base branch (PR-style)
- Review specific commits
- Review GitHub PRs (checks out locally)
- Custom review instructions
- Supports `REVIEW_GUIDELINES.md` for project-specific rules
- Session branching: creates review sub-session, returns with `/end-review`

**Workflow:**
```
/review → interactive picker
/review uncommitted → review dirty files
/review pr 123 → review GitHub PR #123
/review branch main → compare against main
/review commit abc123 → review specific commit
```

**Session state management:**
```typescript
// Branches session, tracks origin
reviewOriginId = ctx.sessionManager.getBranch().at(-1)?.id;
// Returns with /end-review command
```

**Integration with handoff:**
- Review code → `/handoff implement review feedback`
- Review before handoff ensures quality context

**Implementation effort:** High (complex git operations)  
**LOC:** ~1100 lines  
**Dependencies:** Git, GitHub CLI (optional), pi-ai (complete)

---

### 5. **`loop.ts` - Iterative Execution Loop** ⭐⭐⭐⭐
**Why useful:** Automates iterative workflows (e.g., "fix tests until passing").

**What it does:**
- Three modes: tests, custom condition, self-driven
- Registers `signal_loop_success` tool for breakout
- Auto-continues on turn end until success
- Summarizes condition using LLM (concise widget text)
- Shows widget: "Loop active: breaks when tests pass"

**Code pattern:**
```typescript
pi.on("turn_end", async (event, ctx) => {
  const state = getLoopState(ctx);
  if (state?.active && event.stopReason === "stop") {
    // Re-trigger with loop prompt
    pi.sendMessage({ content: buildPrompt(state.mode, state.condition) });
  }
});

pi.registerTool("signal_loop_success", {
  schema: Type.Object({ reason: Type.String() }),
  handler: async ({ reason }, ctx) => {
    // Mark loop complete
    return { success: true, reason };
  },
});
```

**Use cases:**
- `/loop` → "Until tests pass"
- `/loop custom "coverage > 90%"` → Custom condition
- `/loop self` → Agent decides when done

**Implementation effort:** Medium  
**LOC:** ~420 lines  
**Dependencies:** pi-ai (complete), @sinclair/typebox

---

### 6. **`answer.ts` - Question Extraction UI** ⭐⭐⭐
**Why interesting:** Alternative approach to your ask-user (extracts questions from assistant messages).

**How it differs from your ask-user:**

| Feature | Your ask-user | Mitsuhiko's answer |
|---------|---------------|-------------------|
| Direction | LLM → structured input | Last message → extract questions |
| Trigger | LLM calls tool | User calls `/answer` command |
| Use case | Agent needs input | User wants to batch-answer questions |

**Workflow:**
1. Agent sends message with multiple questions
2. User runs `/answer` (or `Ctrl+.`)
3. Extracts questions using LLM (Codex mini or Haiku)
4. Shows TUI to answer all questions
5. Submits batch answers

**Key innovation:** Uses cheaper model for extraction
```typescript
// Prefers Codex mini → Haiku → current model
const extractionModel = await selectExtractionModel(ctx.model, ctx.modelRegistry);
```

**Integration potential:**
- Complementary to your ask-user
- Could merge: ask-user for runtime, answer for post-hoc

**Implementation effort:** Medium (lots of TUI code)  
**LOC:** ~500 lines

---

## Priority 3: Nice-to-Have Utilities

### 7. **`session-breakdown.ts` - Session Analytics** ⭐⭐⭐⭐
**Why valuable:** Extends your `/sessions` command with analytics.

**What it does:**
- Shows last 7/30/90 days of session usage
- Groups by model, shows token usage + cost
- GitHub-style activity graph (ASCII art)
- Interactive TUI with drill-down

**Perfect complement to your sessions extension:**
```typescript
// Your sessions: pick a session
// session-breakdown: analyze session patterns
```

**Data shown:**
- Sessions per model
- Total tokens (input/output/cache)
- Total cost per model
- Daily activity visualization

**Implementation effort:** Medium  
**LOC:** ~850 lines  
**Dependencies:** Session parsing, cost calculation

---

### 8. **`todos.ts` - Todo Manager** ⭐⭐⭐
**Why useful:** Track action items from sessions.

**What it does:**
- File-backed storage (`.pi/todos.json`)
- TUI for listing/editing/completing todos
- `/todos add "implement feature X"`
- `/todos` → interactive list

**Architecture:**
```typescript
// File storage
type TodoItem = { id: string; text: string; created: number; completed?: number };
// CRUD operations via TUI
```

**Integration idea:**
- Handoff could auto-generate todos from session
- Review could create todos from findings

**Implementation effort:** Low (simple CRUD)  
**LOC:** ~1500 lines (includes rich TUI)

---

### 9. **`cwd-history.ts` - Working Directory History** ⭐⭐
**Why useful:** Navigate recently used directories.

**What it does:**
- Tracks recent working directories
- `/cwd` → pick from history
- Changes session cwd

**Simple but effective:**
```typescript
pi.on("session_start", (event, ctx) => {
  // Track cwd in history
});
```

**Implementation effort:** Trivial  
**LOC:** ~220 lines

---

### 10. **`control.ts` - Session Control** ⭐⭐
**Why niche:** For advanced users managing multiple sessions.

**What it does:**
- Lists controllable sessions (API sessions)
- Allows sending messages to other sessions
- Session IPC (inter-process communication)

**Use case:** Orchestrating multiple agents

**Implementation effort:** Medium  
**LOC:** ~1400 lines

---

### 11. **`whimsical.ts` - Fun Spinner Messages** ⭐
**Why fun:** Replaces "Thinking..." with random phrases.

**Examples:**
- "Reticulating splines..."
- "Consulting the void..."
- "Bribing the compiler..."

**Implementation:** 170 lines of entertainment

---

### 12. **`uv.ts` - UV Helper** ⭐⭐⭐
**Why useful:** Shortcuts for Python workflows (if you work with Python).

**What it does:**
- `/uv init` → initialize uv project
- `/uv add <package>` → add dependency
- `/uv run <script>` → run command

**Implementation effort:** Low  
**LOC:** ~40 lines (trivial wrapper)

---

## Skills Worth Adopting

### 1. **`/commit` - Conventional Commit Generator** ⭐⭐⭐⭐
**What it does:** Generates concise commit messages using Conventional Commits format.

**How it works:**
- Analyzes staged changes
- Generates structured commit (type, scope, subject)
- Follows best practices (imperative mood, 50 char limit)

**Value:** Consistent commit history

---

### 2. **`/update-changelog` - Changelog Generator** ⭐⭐⭐
**What it does:** Updates CHANGELOG.md with notable user-facing changes.

**How it works:**
- Analyzes recent commits
- Filters for user-facing changes
- Adds to changelog with proper formatting

**Value:** Automated release notes

---

### 3. **`/web-browser` - Puppeteer Browser Control** ⭐⭐⭐⭐
**What it does:** Control headless Chrome from agent.

**Capabilities:**
- Navigate, screenshot, eval JS
- Network inspection
- Cookie handling
- Log tailing

**Use cases:**
- Testing web apps
- Scraping data
- Debugging browser issues

**Complex but powerful**

---

### 4. **`/github` - GitHub CLI Integration** ⭐⭐⭐⭐
**What it does:** Interact with GitHub via `gh` CLI.

**Capabilities:**
- List/view issues and PRs
- Create/comment on issues
- Workflow runs
- API access

**Overlaps with:** Your potential GitHub integration needs

---

## Replacement Candidates

None of your extensions should be replaced. However:

### Consider Merging:
- **Your ask-user + Mitsuhiko's answer:** Complementary patterns, could offer both modes
- **Your sessions + Mitsuhiko's session-breakdown:** Enhance sessions with analytics

---

## Implementation Roadmap

### Phase 1: Foundation (Week 1-2)
1. Add **notify.ts** (trivial, immediate value)
2. Add **context.ts** (integrate with handoff)
3. Add **files.ts** (enhance handoff validation)

### Phase 2: Workflow (Week 3-4)
4. Add **review.ts** (pairs with handoff)
5. Add **loop.ts** (automate iterations)
6. Add **session-breakdown.ts** (enhance sessions)

### Phase 3: Polish (Week 5-6)
7. Add **todos.ts** (track action items)
8. Add **cwd-history.ts** (navigation)
9. Consider **answer.ts** (alternative ask-user mode)

### Phase 4: Advanced (Optional)
10. Skills: `/commit`, `/github`, `/web-browser`
11. **control.ts** (if multi-session orchestration needed)

---

## Technical Integration Notes

### Shared Patterns to Adopt

1. **OSC 777 Notifications** (from notify.ts)
```typescript
// Zero-dependency desktop notifications
process.stdout.write(`\x1b]777;notify;${title};${body}\x07`);
```

2. **Skill Load Tracking** (from context.ts)
```typescript
pi.on("tool_result", (event, ctx) => {
  if (event.toolName === "read") {
    // Track which skills were loaded
  }
});
```

3. **Session State via Custom Entries** (from review.ts, loop.ts)
```typescript
// Store extension state in session
pi.appendEntry<StateType>(CUSTOM_TYPE, stateData);
// Restore on session switch
pi.on("session_switch", (event, ctx) => {
  applyState(ctx);
});
```

4. **Model Selection Strategy** (from answer.ts, loop.ts)
```typescript
// Prefer cheaper models for utility tasks
const extractionModel = 
  tryCodexMini() ?? tryHaiku() ?? currentModel;
```

5. **External Editor Pattern** (from files.ts)
```typescript
// Spawn external editor, pause TUI
tui.stop();
spawnSync(editor, [tmpFile], { stdio: "inherit" });
tui.start();
```

---

## Architecture Recommendations

### 1. Create Shared Utilities Module
Extract common patterns:
```
extensions/
  _shared/
    notifications.ts   // OSC 777 notify
    session-state.ts   // Custom entry helpers
    file-refs.ts       // File extraction patterns
    model-select.ts    // Model resolution logic
```

### 2. Extension Composition
Make extensions composable:
```typescript
// files exports extractFileReferences()
// handoff imports and validates files
import { extractFileReferences } from "../files/utils.js";
```

### 3. Config Schema
Centralize settings:
```json
// .pi/settings.json
{
  "handoff": { ... },
  "review": { ... },
  "loop": { ... },
  "notifications": { "enabled": true }
}
```

---

## Testing Strategy

For each new extension:
1. **Unit tests** for core logic (file extraction, validation)
2. **Integration tests** for TUI components (mock pi API)
3. **E2E tests** for workflows (review → handoff)

Follow your existing pattern:
```typescript
// tests/files.test.ts
import { test } from "node:test";
import assert from "node:assert/strict";
```

---

## Dependencies Audit

**New dependencies needed:**
- None! All extensions use peer dependencies you already have:
  - `@mariozechner/pi-coding-agent`
  - `@mariozechner/pi-ai`
  - `@mariozechner/pi-tui`
  - `@sinclair/typebox` (you already use this)

**Optional dependencies:**
- `git` (required for review.ts, files.ts git features)
- `gh` (optional for GitHub integration)
- `code` (optional for VS Code diff in files.ts)

---

## Performance Considerations

### 1. **files.ts:** Large repos
- Streams git output via `-z` (null-separated)
- Caches canonical paths
- Limits session references to 200

### 2. **session-breakdown.ts:** Many sessions
- Lazy loads session data
- Paginates results
- Groups by time periods

### 3. **context.ts:** Token estimation
- Uses 4-char heuristic (fuzzy but fast)
- Caches calculations per render

---

## License Compatibility

Mitsuhiko's repo: **Apache 2.0 or MIT** (check LICENSE file)  
Your repo: **MIT**

✅ Compatible - can freely incorporate code with attribution.

**Required:** Add attribution in your README:
```markdown
## Acknowledgments

Some extensions adapted from [mitsuhiko/agent-stuff](https://github.com/mitsuhiko/agent-stuff)
```

---

## Final Recommendation Matrix

| Extension | Priority | Effort | Value | Add? |
|-----------|----------|--------|-------|------|
| files.ts | ⭐⭐⭐⭐⭐ | Medium | Very High | ✅ Yes |
| context.ts | ⭐⭐⭐⭐⭐ | Medium | Very High | ✅ Yes |
| notify.ts | ⭐⭐⭐⭐ | Trivial | High | ✅ Yes |
| review.ts | ⭐⭐⭐⭐⭐ | High | Very High | ✅ Yes |
| loop.ts | ⭐⭐⭐⭐ | Medium | High | ✅ Yes |
| session-breakdown.ts | ⭐⭐⭐⭐ | Medium | Medium | ✅ Yes |
| answer.ts | ⭐⭐⭐ | Medium | Medium | Maybe |
| todos.ts | ⭐⭐⭐ | Low | Medium | Maybe |
| cwd-history.ts | ⭐⭐ | Trivial | Low | Maybe |
| control.ts | ⭐⭐ | Medium | Low | No |
| whimsical.ts | ⭐ | Trivial | Fun | No |
| uv.ts | ⭐⭐⭐ | Trivial | Medium | If Python user |

---

## Suggested Package Structure After Integration

```
pi-sessions/
  extensions/
    sessions/          # Existing
    ask-user/          # Existing
    handoff/           # Existing
    files/             # NEW - file browser
    context/           # NEW - context dashboard
    review/            # NEW - code review
    loop/              # NEW - iterative execution
    breakdown/         # NEW - session analytics
    notify/            # NEW - desktop notifications
    _shared/           # NEW - common utilities
      notifications.ts
      session-state.ts
      file-refs.ts
  docs/
    extensions/
      files.md         # Usage guide
      review.md
      loop.md
      ...
    guides/
      integration.md   # How extensions work together
```

---

## Key Insights

### What Makes Mitsuhiko's Extensions Special

1. **Battle-tested:** Used in production workflows
2. **Composable:** Extensions reference each other
3. **TUI excellence:** Rich, responsive interfaces
4. **Git-first:** Deep git integration (status, diff, review)
5. **Model-aware:** Smart model selection for subtasks
6. **Session state:** Proper state management via custom entries

### What Your Extensions Do Better

1. **Validation:** TypeBox runtime validation
2. **Mode handling:** Better fallback for non-TUI mode
3. **Documentation:** More comprehensive inline docs
4. **Testing:** Better test coverage structure

### The Synthesis

Combine your validation rigor with Mitsuhiko's workflow automation to create a best-in-class extension collection.

---

## Next Steps

1. **Start with notify.ts** - Quick win, copy as-is
2. **Add context.ts** - Integrate with your handoff
3. **Add files.ts** - Foundation for review and enhanced handoff
4. **Implement review.ts** - Pairs perfectly with handoff
5. **Add loop.ts** - Automate iterative workflows
6. **Enhance sessions with breakdown** - Analytics view

**Timeline:** 4-6 weeks for full integration  
**Impact:** Transform from "session management" to "complete developer toolkit"

---

## Questions to Consider

1. **Naming:** Keep `/files`, `/review`, `/loop` or create your own naming scheme?
2. **Bundling:** Ship as one package or split into separate packages?
3. **Backward compat:** How to handle existing users when adding new extensions?
4. **Configuration:** Centralize in `.pi/settings.json` or per-extension config?

---

## Conclusion

Mitsuhiko's `agent-stuff` is a goldmine of production-ready patterns. The extensions are:
- **Mature:** 1000+ lines of battle-tested code each
- **Complementary:** Fill gaps in your current offerings
- **Well-architected:** Clean separation, composable design
- **High-value:** Immediate productivity improvements

**Recommendation:** Adopt Priority 1 extensions immediately, then phase in workflow enhancements.

Your package will go from "solid session tools" to "comprehensive Pi extension suite" that rivals any commercial offering.

---

**Analysis completed by:** Claude (Anthropic)  
**Confidence level:** High (based on direct code inspection)  
**Follow-up:** Review specific integration points in next session
