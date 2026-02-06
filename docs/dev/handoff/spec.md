# Handoff for Pi Agents

## Summary
Introduce a `/handoff` command that generates a high‑quality “new thread prompt” from the current session, then starts a new session with that prompt pre‑filled for the user to review and send. This mirrors Amp’s handoff workflow: extract relevant context + files, keep the user’s goal explicit, and avoid lossy compaction.

This will be delivered as a new extension in this repo (similar to `sessions`) and distributed via the existing `pi` package mechanism.

## Background (Amp Handoff Takeaways)
- `/compact` summaries often drop critical instructions, relevant files, and command history.
- Handoff works better when the model **extracts context** instead of writing full instructions.
- The user's goal should be **explicit and preserved verbatim**, appended to the generated context.
- Structured output (JSON) for `relevantFiles` + `relevantInformation` improved reliability.
- Prompt tuning + feedback loops were key to quality.

## Lessons from Amp's Implementation

Based on [Nicolay Gerold's detailed write-up](https://nicolaygerold.com/posts/how-i-built-handoff-in-amp) on building handoff in Amp:

### Key Insight: Extraction, Not Instruction Generation

> "Handoff didn't generate instructions anymore, it only gathered context."

Models are bad at writing instructions. The breakthrough was reframing the problem:
- **Model's job**: Extract `relevantFiles` and `relevantInformation` from the conversation
- **User's job**: Write a clear goal (which becomes the actual instruction)
- **Assembly**: Just stitch context + goal together

This decomposition leverages what models are good at (information extraction) while keeping the user in control of intent.

### User Goal Quality Matters

> "Users got lazy. They wrote goals like 'continue' or 'fix'. This made the generated instructions even worse."

Bad user input propagates through the system. Solution: validate goals and nudge users toward specificity.

### File Validation Against Conversation

> "After I got the relevant files, I check each entry whether it was actually mentioned in the conversation and remove any that aren't."

Post-processing step to filter hallucinated files. The model might invent plausible-sounding file paths that were never discussed.

### Iterative Prompt Tuning with Real Threads

> "I ran around 100 threads through the playground and wrote down what I didn't like about the answer and why I thought it failed in a Google Sheet. Then I fixed one failure mode at a time."

This is the eval harness approach:
1. Collect real handoff sessions (good and bad)
2. Build a playground for testing
3. Track failure modes systematically
4. Fix one issue at a time, re-run all affected cases

### Amp's Evolution

Amp has since added:
- **Auto-handoff as a tool**: Model can invoke handoff on its own
- **Skill inheritance**: New thread inherits the skill from the previous thread
- **Read previous thread**: New thread can ask questions about the previous thread when context is lost

### Implications for Our Implementation

| Amp Feature | Our Status | Action |
|-------------|------------|--------|
| Structured extraction | Implemented | - |
| Goal validation | Implemented | - |
| File validation | Not implemented | **Add post-processing** |
| Skill inheritance | Implemented | - |
| Eval harness | Spec only | **Build playground** |
| Auto-handoff (tool) | Not implemented | Future enhancement |
| Read previous thread | Not implemented | Future enhancement |

## Why compaction is brittle in pi
- **Not goal‑aware**: Compaction summarizes the past, not the next objective. It can miss what matters for the new task.
- **Lossy and non‑interactive**: Summary replaces raw context with no review/edit step.
- **Split‑turn risk**: Large turns can be split mid‑turn, losing recent instructions or tool results.
- **Command/detail loss**: It doesn’t preserve exact commands, flags, or file names unless the model chooses to keep them.
- **Shallow file tracking**: Tracks read/modified files, but not why they matter or how they relate to the next goal.
- **Wrong fit for new threads**: Compaction keeps a long thread going; handoff is intentional context transfer.
- **Summary stacking**: Repeated compaction encourages long, meandering threads where summaries pile on summaries, degrading signal.

## Goals
- Provide a reliable, fast way to continue work in a fresh session without losing context.
- Keep user intent explicit and editable.
- Extract relevant files, commands, decisions, and open questions from the current thread.
- Preserve optional session metadata (model, tools, branch) that matters for continuation.
- Keep UX simple: `/handoff <goal>` → draft prompt → new session.

## Non‑Goals
- Replace or disable `/compact`.
- Fully automatic handoff on context limit.
- Perfect summarization of the entire session history (we will use a bounded context).

## Proposed UX
### Command
```
/handoff <goal>
```
- Goal is required. If empty or too short, show guidance and prompt for more detail.
- Opens a loader while generating context.
- Shows an editor to review/edit the prompt.
- Creates a new session and pre‑fills the editor with the final prompt.

### Suggested Goal Guidance (inline)
When goal is too short or vague (e.g., “continue”, “fix”):
- “Be specific: what should the next thread accomplish?”
- Example: “implement team-level handoff, update tests, document API.”

## Architecture Overview
1. **Collect context** from current branch (bounded):
   - Use `ctx.sessionManager.buildSessionContext().messages` for a safe, already‑compacted view.
   - Convert via `convertToLlm()` + `serializeConversation()`.
2. **Collect session metadata** (optional):
   - Model + thinking level, active tools, session name.
   - Git branch + dirty state (best effort; skip if not a git repo).
   - Last `/skill:` invocation (see Skill Inheritance below).
3. **LLM extraction**:
   - Provide conversation text + user goal + optional metadata.
   - Ask for **strict JSON** with `relevantFiles`, `relevantCommands`, `relevantInformation`, `decisions`, `openQuestions`.
   - Each file includes a short “why this file” reason.
   - Enforce tight budgets (max bullets/files/commands) and instruct the model to stay within them.
   - Retry once on parse failure with stricter JSON‑only instruction.
4. **Assemble handoff prompt**:
   - Compose standard template with extracted content.
   - Append user goal verbatim at the bottom.
   - Optionally prepend `/skill:<name>` if a skill was used last.
   - Optionally prepend a short handoff preamble to set expectations in the new thread.
5. **Create new session**:
   - `ctx.newSession({ parentSession: currentSessionFile })`
   - `ctx.ui.setEditorText(compiledPrompt)`

## Output Schema (LLM → Extension)
```json
{
  "relevantFiles": [
    { "path": "path/to/file.ts", "reason": "Contains the handoff command" }
  ],
  "relevantCommands": ["npm test", "rg \"handoff\" -n"],
  "relevantInformation": [
    "We switched to async handlers in sessions extension",
    "Tests live in tests/sessions.test.ts"
  ],
  "decisions": [
    "Use TypeBox for schemas instead of Zod"
  ],
  "openQuestions": [
    "Need to decide how to validate file mentions"
  ]
}
```

### Validation Rules
- Dedupe files and commands; cap to configurable max (default 20 files, 10 commands).
- Drop empty entries or placeholder text.
- Normalize file paths (strip leading `@`).
- **File validation**: Check that each extracted file path was actually mentioned in the conversation text. Filter out hallucinated paths that the model invented.

## Handoff Prompt Template (Generated)
```
# Handoff Context
You are continuing work from a previous thread. Use the context below and focus only on the goal at the bottom. Do not mention the handoff itself.

## Context (from previous thread)
- ...relevantInformation (bullets)

## Key Decisions
- ...decisions

## Open Questions / Risks
- ...openQuestions

## Relevant Files
- path/to/file.ts — why this file matters
- path/to/other.ts — why this file matters

## Relevant Commands
- npm test
- rg "handoff" -n

## Session Metadata (if relevant)
- Model: anthropic/claude-sonnet-4-5 (thinking: medium)
- Tools: read, write, edit, bash
- Git: main (dirty)
- Prior skill: /skill:llm-evals

## Next Goal (verbatim)
<user_goal>
```

## Extraction Prompt Guidelines

The extraction prompt is critical to handoff quality. Based on Amp's learnings and our analysis:

### Core Principles

1. **Goal-oriented extraction**: Extract what matters for the user's stated goal, not a general summary
2. **Future-focused**: Extract what the NEXT agent needs, not a history of what was done
3. **Avoid obvious actions**: Don't suggest "run tests" or "build" - agents do this naturally
4. **Capture learned knowledge**: Include runtime behaviors and gotchas discovered during the session

### What to Extract

**relevantInformation** should include:
- Project-specific conventions learned (e.g., "Use TypeBox, not Zod")
- Runtime behaviors discovered (e.g., "Extensions hot-reload with /reload")
- Gotchas that could trip up the next agent (e.g., "Must use .js extension in imports")
- Technical constraints or requirements
- Key findings from exploration

**relevantFiles** should include:
- Files directly related to the goal
- Files containing patterns to follow
- Files that need to be read, edited, or created
- Files providing important context

**NOT to include**:
- Completed tasks or work history
- Obvious next steps (testing, building, linting)
- Files not mentioned in the conversation (hallucinations)
- Vague or generic context

### Prompt Structure

The extraction prompt should guide the model to:
1. Focus on the user's goal
2. Extract actionable context
3. Capture learned knowledge and gotchas
4. Avoid redundant or obvious information

See `extraction.ts` for the actual prompt implementation.

## Extension Implementation Plan
- Add new extension at `extensions/handoff/index.ts`.
- Register `/handoff` command via `pi.registerCommand`.
- Use `BorderedLoader` for LLM call; `ctx.ui.editor` for review.
- Handle non‑UI mode:
  - Print generated prompt to stdout, no session switch.
- Skill inheritance:
  - Use `pi.on("input")` to detect `/skill:` commands pre‑expansion.
  - Persist last skill name in a custom entry (e.g., `handoff:last-skill`).
  - Prepend `/skill:<name>` to the handoff prompt when enabled.
- Update `package.json` `pi.extensions` list.
- Add `docs/handoff.md` with usage and examples.

## Configuration
Add optional settings in `.pi/settings.json`:
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
    "model": null,
    "showProgressPhases": true
  }
}
```

### Model Configuration

By default, handoff uses the current session model for extraction. To use a faster/cheaper model:

```json
{
  "handoff": {
    "useCurrentModel": false,
    "model": "anthropic/claude-3-haiku"
  }
}
```

**Recommended fast models:**
- `anthropic/claude-3-haiku` - Fast, cheap, good for extraction
- `google/gemini-2.0-flash` - Very fast, good JSON output
- `openai/gpt-4o-mini` - Balanced speed/quality

The model string format is `provider/model-id` matching Pi's model format.

### Progress Display

The `showProgressPhases` option (default: true) shows phase-based progress during extraction:

```
⠋ Analyzing conversation...
⠋ Extracting context...
✓ Context ready (2.1s)
```

When disabled, shows a simple spinner without phase updates.

## Progress UI Design

### Decision: Phase-Based Progress, NOT Streaming JSON

Based on UX research (Nielsen Norman Group, analysis of tools like aider, Claude Code, GitHub CLI):

**Why NOT stream raw JSON:**
- Partial JSON is unreadable and confusing to users
- Structured extraction is a background operation, not a conversation
- Streaming malformed JSON provides no actionable information
- Users can't tell if the output is correct until it's complete

**Why phase-based progress works better:**
- Clear indication the system is working (reduces anxiety)
- Meaningful labels help users understand what's happening
- Completion feedback with timing provides transparency
- Matches mental model of "processing" rather than "typing"

### Progress Phases

```
⠋ Analyzing conversation...
⠋ Extracting relevant context...
⠋ Assembling handoff prompt...
✓ Context ready (2.1s)
```

**Implementation notes:**
- Use animated spinner (braille dots: `⠋ ⠙ ⠹ ⠸ ⠼ ⠴ ⠦ ⠧ ⠇ ⠏`)
- Update phase label as extraction progresses
- Show elapsed time on completion
- Clear success indicator (`✓`) or error (`✗`)

### Timing Guidelines (Nielsen Norman)
- < 1 second: No indicator needed
- 2-10 seconds: Spinner with phase labels (our case)
- > 10 seconds: Add time estimate

### Configurable Behavior

Via `showProgressPhases` setting:
- `true` (default): Show phase labels during extraction
- `false`: Simple spinner with static message

## Edge Cases & Errors
- **No model**: show error.
- **No conversation**: show error.
- **User cancels**: exit cleanly.
- **Parse failure**: retry once with "output valid JSON only" instruction.
- **Very large context**: rely on `buildSessionContext()` (already compacted).
- **No git repo / detached head**: omit git metadata.
- **No prior skill**: omit skill line.
- **Hallucinated files**: filter out file paths not mentioned in conversation (see File Validation).

## Testing Plan
- Unit tests for:
  - JSON parse + retry
  - prompt assembly
  - metadata inclusion
  - skill inheritance plumbing
- Manual test scenarios:
  - Long sessions with compaction
  - Short goal input
  - Sessions with no tool calls

## Evaluation Harness (LLM Evals)

See **[`docs/handoff_eval_strategy.md`](handoff_eval_strategy.md)** for the complete evaluation strategy.

Use the `llm-evals` skill guidance for a lightweight, repeatable eval pipeline.

### Dataset design
- Start with **30 hand‑picked cases** (per `llm-evals/references/dataset.md`).
- Categorize: 60% happy path, 25% edge, 10% adversarial, 5% regression.
- Each case should include:
  - `session_id` (or captured trace)
  - `goal`
  - `expected_files` (key paths)
  - `expected_commands` (key commands)
  - `expected_context` (must‑include facts)
  - `pass_criteria`

### Metrics (binary pass/fail)
- **Overall pass rate** (target >85%)
- **File coverage** (did required files appear?)
- **Command coverage** (did required commands appear?)
- **Context coverage** (did required facts appear?)
- **Hallucination flag** (no invented files/commands)

### Judge strategy
- Start with **human‑scored pass/fail + critique** on the 30 cases.
- Build an **LLM‑as‑judge** prompt with a few‑shot set once human labels stabilize (per `references/judges.md`).
- Target >90% agreement with human labels before automating.

### Run cadence
- **Level 1**: unit tests on every commit.
- **Level 2**: eval dataset on schedule (daily/weekly) or before release.
- **Smoke subset** (5–10 critical cases) for fast iteration.

### CI integration
- Add a CLI/script that:
  1. Loads a saved session trace.
  2. Runs the handoff extractor.
  3. Scores output vs expected fields.
  4. Emits JSON metrics for dashboards.

## Decisions Log

### Original Design Decisions
- **Use extraction, not instruction generation** → reduces hallucination.
- **Preserve user goal verbatim** → user intent remains explicit.
- **Require high‑quality goals** → prevents vague handoffs ("continue").
- **Include commands + metadata** → preserves execution details lost in compaction.
- **Skill inheritance** → continuity of agent capabilities across threads.
- **Structured JSON output + retry** → reliable parsing.
- **Eval harness from day 1** → prompt quality can be tuned and regression‑tested.

### Implementation Decisions (2026-02-04)

The following decisions were made during implementation planning:

#### Model Selection
- **Decision**: Make model configurable with current model as default
- **Why**: Allows users to use the same model they're working with (consistency) while also allowing override to fast/cheap models (e.g., Haiku, Flash) via settings.json for cost optimization
- **Configuration**: `handoff.model` in settings.json (e.g., `"anthropic/claude-3-haiku"`)

#### UI Implementation
- **Decision**: Use `ctx.ui.editor()` for prompt review/editing
- **Why**: Simpler than full `ctx.ui.custom()` TUI, uses Pi's built-in multi-line editor which users are familiar with

#### Context Source
- **Decision**: Use `ctx.sessionManager.buildSessionContext().messages`
- **Why**: Provides an already-compacted view that's safe for large sessions, handles compaction complexity automatically

#### Skill Tracking & Persistence
- **Decision**: Track via `pi.on("input")` event, persist via `pi.appendEntry()`
- **Why**: Input event fires before skill expansion so we can detect `/skill:` prefix; appendEntry persists to session so skill context survives reload

#### Active Tools Metadata
- **Decision**: Use `pi.getActiveTools()` to include tool list in metadata
- **Why**: Preserves execution context; new session may need to know which tools were active

#### Git Metadata
- **Decision**: Implement with `pi.exec()` for git branch and dirty state
- **Why**: Provides valuable context about the codebase state at handoff time

#### Session Creation Flow
- **Decision**: Use `ctx.newSession({ parentSession })` then `ctx.ui.setEditorText()`
- **Why**: Creates proper session lineage tracking; setEditorText prefills the prompt for user to review and submit when ready

#### Documentation
- **Decision**: Create `docs/handoff.md` with usage and examples
- **Why**: Consistent with existing extension documentation pattern in the repo

#### Testing Approach
- **Decision**: TDD - write tests first, then implement features
- **Why**: Ensures proper test coverage and catches issues early; focus on core handoff first, defer eval harness to later phase

#### Progress UI (2026-02-04)
- **Decision**: Use phase-based progress with spinner, NOT streaming JSON
- **Why**: Based on UX research:
  - Partial JSON is unreadable and confusing (not useful until complete)
  - Context extraction is a background operation, not a conversation
  - Phase labels ("Analyzing...", "Extracting...") provide meaningful feedback
  - Spinner with phases reduces user anxiety about whether system is working
- **Research sources**: Nielsen Norman Group timing guidelines, analysis of aider/Claude Code/GitHub CLI patterns
- **Implementation**: Animated braille spinner (`⠋ ⠙ ⠹...`) with phase text updates
- **Configuration**: `showProgressPhases` setting (default: true)

#### Settings File Reading (2026-02-04)
- **Decision**: Read config from `.pi/settings.json` in working directory
- **Why**: Pi's documented config location; enables model override and other settings
- **Format**: JSON under `"handoff"` key with partial overrides merged with defaults

## v1.1 Implementation Plan

Based on learnings from Amp's handoff and analysis of handoff quality issues.

### 1. File Validation (Filter Hallucinations)

**Problem**: LLM may extract file paths that were never mentioned in the conversation.

**Solution**: Post-process `relevantFiles` to validate each path was mentioned.

```typescript
function validateFilesAgainstConversation(
  files: RelevantFile[],
  conversationText: string,
): RelevantFile[] {
  return files.filter(file => {
    // Check if path (or filename) appears in conversation
    const filename = path.basename(file.path);
    return conversationText.includes(file.path) || 
           conversationText.includes(filename);
  });
}
```

**Config**: Add `validateFiles: boolean` (default: true)

### 2. Improved Extraction Prompt

**Problem**: Current prompt doesn't emphasize:
- Capturing learned behaviors/gotchas
- Avoiding obvious actions
- Being goal-focused (not history-focused)

**Changes to EXTRACTION_SYSTEM_PROMPT**:

```markdown
## What to Extract

**relevantInformation** - Key context for the goal:
- Project conventions learned (e.g., "Use TypeBox, not Zod for schemas")
- Runtime behaviors discovered (e.g., "Extensions hot-reload with /reload")
- Gotchas that could trip up the next agent
- Technical constraints or requirements
- Key findings from exploration

**What NOT to include**:
- Completed tasks or work history ("We implemented X, Y, Z")
- Obvious actions (running tests, building, linting)
- Generic observations that don't help the goal
```

### 3. Configuration Updates

Add to `HandoffConfig`:
```typescript
validateFiles: boolean;  // Filter files not in conversation (default: true)
```

### Implementation Checklist

- [x] Add `validateFilesAgainstConversation()` to `parser.ts`
- [x] Update `normalizeExtraction()` to call file validation
- [x] Add `validateFiles` config option
- [x] Update `EXTRACTION_SYSTEM_PROMPT` with improved guidelines
- [x] Add tests for file validation
- [x] Update tests for new prompt structure

## Future Enhancements

### Near-term (v1.1) - COMPLETED
- [x] **File validation**: Validate extracted files against conversation text to filter hallucinations
- [x] **Improved extraction prompt**: Focus on goal-relevant context, capture learned behaviors/gotchas
- [ ] **Eval playground**: Build testing harness with real handoff sessions

### Medium-term (v1.2)
- Allow `/handoff` as a tool callable by the model (non‑UI mode only)
- Add "handoff preview" panel with diff between raw context and extracted
- Auto‑handoff suggestion when context usage passes threshold

### Long-term (v2.0)
- **Read previous thread**: New thread can ask questions about the previous thread (like Amp)
- Handoff history nesting: collapse prior handoff blocks into a single "previous handoff" section to avoid stacking
- **Chain of handoffs**: Track lineage across multiple handoffs for long-running projects

## References
- Amp: Handoff (No More Compaction) — https://ampcode.com/news/handoff
- Amp: Context Management — https://ampcode.com/guides/context-management
- Nicolay Gerold: How I Built Handoff in Amp — https://nicolaygerold.com/posts/how-i-built-handoff-in-amp
- OpenAI Agents SDK: Handoffs (Python) — https://openai.github.io/openai-agents-python/handoffs/
- OpenAI Agents SDK: Handoff prompt prefix — https://openai.github.io/openai-agents-python/ref/extensions/handoff_prompt/
- OpenAI Agents SDK: Handoffs (JS) — https://openai.github.io/openai-agents-js/guides/handoffs/
- Pi docs: Extensions — /opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/docs/extensions.md
- Pi docs: Compaction — /opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/docs/compaction.md
- Pi docs: Session format — /opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/docs/session.md
- Pi docs: TUI — /opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/docs/tui.md
- Pi docs: Skills — /opt/homebrew/lib/node_modules/@mariozechner/pi-coding-agent/docs/skills.md
- Skill: llm-evals — /Users/jshah/.claude/skills/llm-evals/SKILL.md
