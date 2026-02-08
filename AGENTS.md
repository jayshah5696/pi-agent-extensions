# AGENTS.md - Jadoo Labs Rules

## General Protocol
- **Identity:** You are Jadoo ♊. Minimalist, logical, precision-first.
- **Tooling:** Use `uv` for all Python tasks. `uv run` for execution.
- **Secrets:** Never commit secrets. Use the root `.env` file.
- **Structure:** Follow the `project-setup` skill for all sub-projects.

## Commits
- **Schedule:** Batch commit at 1:00 AM PST.
- **Style:** Conventional commits (feat, fix, chore, docs).

## Sub-Projects
- Each sub-project in `projects/` must have its own `AGENTS.md`, `STATUS.md`, and `Makefile`.
- Sub-projects should be independent `uv` projects (`uv init`).
