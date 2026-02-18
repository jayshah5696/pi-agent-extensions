# Repo Audit: Harness Engineering Standards

**Date:** 2026-02-17
**Auditor:** Gemini 3 Pro (Sub-agent)
**Target:** `github/jadoo-labs-experiments/`

## 1. Executive Summary

The repository `jadoo-labs-experiments` serves as a monorepo for various experiments, benchmarks, and tools. While it contains functional code and some documentation (`AGENTS.md`, `README.md`), the structure has degraded into a "flat" hierarchy with loose scripts and inconsistent project placement. This violates **SkyRL** (clean environment separation), **Thoughtworks** (standardized layout), and **Viv** (context-driven) engineering standards.

**Key Issues:**
- **Root Pollution:** 10+ loose Python scripts in the root directory.
- **Inconsistent Hierarchy:** Some projects are in `projects/`, others are at the root (`google_search`, `agentic_vision_poc`).
- **Missing Context:** No `CONTEXT.md` to ground LLM agents; `README.md` is outdated.
- **Automation Gaps:** `Makefile` is generic and does not leverage `uv` workspaces effectively.

---

## 2. Detailed Findings & Violations

### 2.1 Agent-Friendly Organization (SkyRL Standard)
*   **Violation:** The root directory is cluttered with file artifacts (`audit_sessions.py`, `render_banana_examples.py`, `bench_data/`, `log/`). This makes it difficult for an agent to traverse the tree and understand the primary entry points.
*   **Violation:** "Projects" are scattered. `projects/` exists but contains only 2 items, while 5+ other distinct projects live at the root level.
*   **Violation:** `bench_data/` contains thousands of `junk_*.txt` files, which can choke file context windows if not carefully excluded.

### 2.2 Self-Descriptive Documentation (Viv Standard)
*   **Pass:** `AGENTS.md` exists in key directories (`core`, `nvidia-benchmarks`), providing good agent-specific context.
*   **Fail:** No `CONTEXT.md`. The `README.md` relies on external Obsidian links ([[Internal-Links]]) which are opaque to an agent without access to the vault.
*   **Fail:** Inconsistent `README.md` quality across sub-projects.

### 2.3 Automated Validation (Thoughtworks Standard)
*   **Pass:** `uv.lock` and `pyproject.toml` are present in most active directories.
*   **Fail:** The root `Makefile` treats the repo as a single flat package, but it contains multiple independent packages (`google_search`, `source_harvester`). A `uv` workspace or recursive makefile strategy is needed.

---

## 3. Actionable Refactoring Plan

### Step 1: Structural Consolidation
Move all distinct projects into `projects/` and loose scripts into `scripts/` or `scratch/`.

**Proposed Structure:**
```text
github/jadoo-labs-experiments/
├── CONTEXT.md                  # [NEW] Repo purpose, tech stack, and boundaries
├── README.md                   # [UPDATE] Index of projects
├── Makefile                    # [UPDATE] Workspace-aware commands
├── pyproject.toml              # [UPDATE] Define uv workspace
├── scripts/                    # [MOVE] All loose root *.py scripts go here
│   ├── audit_sessions.py
│   ├── benchmark.py
│   └── ...
├── projects/
│   ├── agentic_vision_poc/     # [MOVE] From root
│   ├── google_search/          # [MOVE] From root
│   ├── source_harvester/       # [MOVE] From root
│   ├── nvidia-benchmarks/      # [MOVE] From root
│   ├── sadhana/                # [MOVE] From root (Swift)
│   ├── obsidian-sync/          # [KEEP]
│   └── llm-eval/               # [KEEP]
├── core/                       # [KEEP] Shared libraries
└── bench_data/                 # [IGNORE] Add to .gitignore or nested .cursorignore
```

### Step 2: Documentation Injection
Create a `CONTEXT.md` in the root. This file must:
1.  Define the **Mission**: "Experimentation and execution layer for Jadoo agents."
2.  Define **Tech Stack**: "Python 3.12+, `uv` for package management, `ruff` for linting."
3.  Define **Key Directories**: Explain `projects/` vs `core/` vs `scripts/`.

### Step 3: Automation Upgrade
Refactor `pyproject.toml` at the root to define a **Workspace**:
```toml
[tool.uv]
members = ["projects/*", "core"]
```
Update `Makefile` to run tests/linting across the workspace:
```makefile
test-all:
    uv run pytest projects/ core/
```

### Step 4: Cleanup
1.  Delete `bench_data/junk_*.txt` files if they are just test artifacts, or move them to a localized `.cache` directory.
2.  Unify `Assitant` (typo) to `Assistant` if it is not a hardcoded system path (requires verification).

---

## 4. Execution Command (Copy-Paste)

To apply the structural changes immediately:

```bash
# 1. Create directory structure
mkdir -p github/jadoo-labs-experiments/scripts
mkdir -p github/jadoo-labs-experiments/projects

# 2. Move Projects
mv github/jadoo-labs-experiments/agentic_vision_poc github/jadoo-labs-experiments/projects/
mv github/jadoo-labs-experiments/google_search github/jadoo-labs-experiments/projects/
mv github/jadoo-labs-experiments/source_harvester github/jadoo-labs-experiments/projects/
mv github/jadoo-labs-experiments/nvidia-benchmarks github/jadoo-labs-experiments/projects/
mv github/jadoo-labs-experiments/Sadhana github/jadoo-labs-experiments/projects/
mv github/jadoo-labs-experiments/Multilingual-Doc-Intel github/jadoo-labs-experiments/projects/

# 3. Move Scripts
mv github/jadoo-labs-experiments/*.py github/jadoo-labs-experiments/scripts/
# (Be careful not to move setup.py if it exists, though none was seen in root)

# 4. Create CONTEXT.md
touch github/jadoo-labs-experiments/CONTEXT.md
```
