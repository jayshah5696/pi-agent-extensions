# Handoff Eval Strategy

A practical guide for evaluating and improving the `/handoff` command's extraction quality.

## Overview

The handoff command uses an LLM to extract context from a conversation. The quality of this extraction directly impacts whether the next session can successfully continue the work. This document outlines how to:

1. Collect real handoff examples
2. Define what "good" looks like
3. Build a test dataset
4. Measure quality
5. Iterate on the extraction prompt

## Core Principles

From the llm-evals skill:

1. **Look at data constantly** - Read traces until you stop learning
2. **Binary pass/fail** - Not 1-5 scales. Pass/fail with written critique
3. **Domain experts set the bar** - You (the user) define what's good
4. **Task-specific** - Generic benchmarks don't apply here
5. **Start small** - 30 hand-picked examples before automation

---

## Phase 1: Trace Collection

### What to Capture

For each handoff run, save:

```json
{
  "trace_id": "handoff_001",
  "timestamp": "2026-02-04T10:30:00Z",
  "session_file": "~/.pi/sessions/abc123.jsonl",
  "conversation_summary": "Implementing handoff extension for Pi",
  "conversation_length": 45,
  "user_goal": "implement file validation and improve extraction prompt",
  "extraction_input": {
    "conversation_text": "...(serialized conversation)...",
    "goal": "implement file validation..."
  },
  "extraction_output": {
    "relevantFiles": [...],
    "relevantCommands": [...],
    "relevantInformation": [...],
    "decisions": [...],
    "openQuestions": [...]
  },
  "final_prompt": "# Handoff Context\n...",
  "model_used": "anthropic/claude-sonnet-4-5",
  "latency_ms": 2150,
  "tokens": { "input": 8500, "output": 450 }
}
```

### How to Collect

#### Option A: Manual Collection (Recommended to Start)

1. Use `/handoff` naturally during your work
2. Before submitting, copy the generated prompt
3. After using the new session, note whether the handoff was successful
4. Save examples to `evals/handoff/traces/`

#### Option B: Instrumented Collection

Add logging to the handoff extension:

```typescript
// In index.ts, after extraction
if (process.env.HANDOFF_TRACE_DIR) {
  const trace = {
    trace_id: `handoff_${Date.now()}`,
    timestamp: new Date().toISOString(),
    session_file: currentSessionFile,
    user_goal: goal,
    extraction_output: extractionResult.extraction,
    final_prompt: handoffPrompt,
    model_used: extractionModel.id,
  };
  const tracePath = join(
    process.env.HANDOFF_TRACE_DIR,
    `${trace.trace_id}.json`
  );
  writeFileSync(tracePath, JSON.stringify(trace, null, 2));
}
```

#### Option C: Session Replay

Pi sessions are stored as JSONL. Build a replay tool:

```bash
# Replay a session through handoff extraction
node scripts/replay-handoff.ts \
  --session ~/.pi/sessions/abc123.jsonl \
  --goal "implement feature X" \
  --output evals/handoff/traces/
```

### Collection Target

- **Initial goal**: 30 diverse examples
- **Ongoing**: Add 5-10 per week from real usage
- **Regression**: Add any failure as a test case

---

## Phase 2: Dataset Design

### Dimensions to Cover

| Dimension | Examples |
|-----------|----------|
| Session length | Short (5 turns), Medium (20 turns), Long (50+ turns) |
| Task type | Feature implementation, bug fix, refactoring, exploration |
| Complexity | Single file, multi-file, cross-cutting |
| Goal specificity | Vague-ish, specific, highly detailed |
| Context density | Few files mentioned, many files, many commands |

### Category Distribution

Following llm-evals guidance:

| Category | % | Description |
|----------|---|-------------|
| Happy path | 60% | Clear sessions with good goals |
| Edge cases | 25% | Compacted sessions, minimal context, ambiguous goals |
| Adversarial | 10% | Goals that could mislead, sessions with noise |
| Regression | 5% | Previously failed cases that were fixed |

### Dataset Schema

Store in `evals/handoff/dataset.jsonl`:

```json
{
  "id": "handoff_001",
  "category": "happy_path",
  "session_type": "feature_implementation",
  "session_length": "medium",
  "goal": "implement file validation and improve extraction prompt",
  "conversation_file": "traces/handoff_001_conversation.txt",
  "expected_files": [
    "extensions/handoff/parser.ts",
    "extensions/handoff/extraction.ts"
  ],
  "expected_commands": ["npm test"],
  "expected_context": [
    "file validation filters hallucinated paths",
    "extraction prompt focuses on goal-relevant context"
  ],
  "expected_decisions": [
    "Use case-insensitive matching for file validation"
  ],
  "pass_criteria": {
    "files_coverage": 0.8,
    "context_coverage": 0.7,
    "no_hallucinated_files": true,
    "no_completed_tasks_in_context": true
  },
  "notes": "Session where we implemented v1.1 improvements"
}
```

---

## Phase 3: Pass/Fail Criteria

### What Makes a Good Handoff?

A handoff extraction PASSES if:

1. **File coverage** - At least 80% of expected files are included
2. **No hallucinations** - No invented file paths that weren't in the conversation
3. **Context coverage** - At least 70% of expected context facts are captured
4. **Goal-relevance** - Extracted info relates to the stated goal
5. **No history dump** - Doesn't list completed tasks ("We implemented X, Y, Z")
6. **No obvious actions** - Doesn't tell agent to "run tests" or "build"

### Failure Modes

| Failure Mode | Description | Severity |
|--------------|-------------|----------|
| Hallucinated files | Files extracted that weren't mentioned | High |
| Missing critical file | Key file for goal not included | High |
| History dump | Lists what was done instead of what's needed | Medium |
| Obvious actions | Tells agent to run tests, build, etc. | Low |
| Missing gotcha | Doesn't capture learned convention/behavior | Medium |
| Vague context | Generic statements that don't help | Low |
| Wrong priorities | Includes irrelevant files, misses relevant ones | Medium |

---

## Phase 4: Evaluation Process

### Manual Evaluation (Start Here)

For each test case:

1. Load the conversation and goal
2. Run the extraction
3. Compare output to expected values
4. Score pass/fail on each criterion
5. Write a critique explaining the judgment

#### Scoring Template

```markdown
## Case: handoff_001

**Goal**: implement file validation and improve extraction prompt

### File Coverage
- Expected: parser.ts, extraction.ts, types.ts
- Got: parser.ts, extraction.ts, index.ts
- Score: 2/3 (67%) - FAIL (below 80%)
- Critique: Missed types.ts which had the config changes

### Hallucination Check
- Invented files: None
- Score: PASS

### Context Coverage
- Expected: "file validation filters hallucinated paths"
- Got: "Added validateFilesAgainstConversation function"
- Score: PASS (captured the concept)

### No History Dump
- Found: "We implemented the following changes..."
- Score: FAIL - Should not list completed work

### Overall: FAIL
Priority fix: Remove history dump pattern from prompt
```

### Automated Checks (Level 1)

Add to test suite:

```typescript
// tests/handoff/eval.test.ts
import { describe, it } from "node:test";
import { runExtraction } from "./helpers.js";
import dataset from "../evals/handoff/dataset.json";

describe("handoff extraction quality", () => {
  for (const testCase of dataset.slice(0, 10)) { // Smoke subset
    it(`${testCase.id}: ${testCase.goal.slice(0, 50)}...`, async () => {
      const result = await runExtraction(testCase.conversation_file, testCase.goal);
      
      // Check no hallucinated files
      const mentionedFiles = extractMentionedFiles(testCase.conversation_file);
      for (const file of result.relevantFiles) {
        assert(
          mentionedFiles.has(file.path) || mentionedFiles.has(basename(file.path)),
          `Hallucinated file: ${file.path}`
        );
      }
      
      // Check file coverage
      const gotPaths = new Set(result.relevantFiles.map(f => f.path));
      const coverage = testCase.expected_files.filter(f => 
        gotPaths.has(f) || [...gotPaths].some(g => g.endsWith(basename(f)))
      ).length / testCase.expected_files.length;
      assert(coverage >= 0.8, `File coverage ${coverage} < 0.8`);
    });
  }
});
```

### LLM-as-Judge (Level 2)

After manual labeling stabilizes, build an automated judge:

```typescript
const JUDGE_PROMPT = `You are evaluating the quality of a handoff extraction.

## Conversation Summary
{conversation_summary}

## User's Goal
{goal}

## Extraction Output
{extraction_json}

## Evaluation Criteria

1. **File Relevance**: Are the extracted files actually relevant to the goal?
2. **No Hallucinations**: Were all files actually mentioned in the conversation?
3. **Context Quality**: Does relevantInformation capture what the next agent needs?
4. **No History Dump**: Does it avoid listing completed work?
5. **Captures Gotchas**: Are learned conventions/behaviors included?

## Examples

### Good Extraction (PASS)
Goal: "add dark mode support"
relevantInformation: 
- "Theme colors are defined in src/theme.ts"
- "Use CSS variables for dynamic theming"
- "The app uses Tailwind, so use dark: prefix"
Critique: Captures specific, actionable context for the goal.

### Bad Extraction (FAIL)
Goal: "add dark mode support"
relevantInformation:
- "We discussed the theme system"
- "Made several changes to the codebase"
- "Tests are passing"
Critique: Vague, lists completed work, no actionable context.

## Your Task

Evaluate the extraction and output JSON:
{
  "file_relevance": { "pass": true/false, "critique": "..." },
  "no_hallucinations": { "pass": true/false, "critique": "..." },
  "context_quality": { "pass": true/false, "critique": "..." },
  "no_history_dump": { "pass": true/false, "critique": "..." },
  "captures_gotchas": { "pass": true/false, "critique": "..." },
  "overall_pass": true/false,
  "priority_fix": "What should be improved first"
}`;
```

---

## Phase 5: Iteration Workflow

### The Prompt Tuning Loop

```
1. Run eval dataset
2. Identify top failure mode
3. Add/modify prompt instruction
4. Re-run affected cases
5. Verify fix, check for regressions
6. Commit if improved
7. Repeat
```

### Tracking Progress

Maintain a metrics table:

| Date | Pass Rate | Top Failure | Action Taken |
|------|-----------|-------------|--------------|
| 2026-02-04 | 65% | Hallucinated files | Added file validation |
| 2026-02-04 | 78% | History dump | Updated prompt guidelines |
| 2026-02-05 | 85% | Missing gotchas | Added "What to Extract" section |

### When to Stop

Stop tuning when:
- Pass rate > 85% on full dataset
- No new failure modes in 10 consecutive cases
- Marginal improvements < 2% per iteration

---

## Phase 6: CI Integration

### Test Levels

| Level | What | When | Time |
|-------|------|------|------|
| 1 | Unit tests (schema, parsing) | Every commit | <5s |
| 1 | Smoke eval (5 cases) | Every commit | <30s |
| 2 | Full eval (30+ cases) | Daily/weekly | <5min |
| 2 | LLM judge review | Before release | <10min |

### CI Configuration

```yaml
# .github/workflows/eval.yml
name: Handoff Evals

on:
  push:
    paths:
      - 'extensions/handoff/**'
  schedule:
    - cron: '0 6 * * *'  # Daily at 6am

jobs:
  smoke-eval:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm install
      - run: npm test  # Includes smoke eval cases
      
  full-eval:
    if: github.event_name == 'schedule'
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - run: npm install
      - run: npm run eval:full
      - run: npm run eval:report
```

---

## Directory Structure

```
evals/
└── handoff/
    ├── dataset.jsonl         # Test cases with expected values
    ├── traces/               # Raw conversation + extraction pairs
    │   ├── handoff_001.json
    │   ├── handoff_002.json
    │   └── ...
    ├── judgments/            # Manual and LLM judge results
    │   ├── 2026-02-04.jsonl
    │   └── ...
    ├── metrics/              # Historical metrics
    │   └── history.jsonl
    └── scripts/
        ├── run-eval.ts       # Run extraction on dataset
        ├── judge.ts          # LLM judge implementation
        ├── report.ts         # Generate metrics report
        └── replay.ts         # Replay sessions for testing
```

---

## Quick Start Checklist

- [ ] Create `evals/handoff/` directory structure
- [ ] Collect first 10 handoff traces manually
- [ ] Define expected values for each trace
- [ ] Run extractions and score pass/fail
- [ ] Identify top 3 failure modes
- [ ] Update extraction prompt
- [ ] Re-run and verify improvement
- [ ] Add smoke tests to CI
- [ ] Collect 20 more examples
- [ ] Build LLM judge when manual labels stabilize
- [ ] Set up daily eval runs

---

## References

- [Hamel Husain's LLM Evals Course](https://maven.com/parlance-labs/evals)
- [Nicolay Gerold: How I Built Handoff](https://nicolaygerold.com/posts/how-i-built-handoff-in-amp)
- llm-evals skill: `~/.config/opencode/skill/llm-evals/`
- Handoff spec: `docs/spec_handoff.md`
