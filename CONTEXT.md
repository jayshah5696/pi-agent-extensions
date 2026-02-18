# Repository Context

## Architecture
- **Root:** Orchestration and Configuration only (`Makefile`, `pyproject.toml`, `CONTEXT.md`).
- **projects/**: Isolated experiments with their own dependencies (e.g., `Sadhana`, `Pravaha`).
- **core/**: Shared libraries (Jadoo Core).
- **scripts/**: Maintenance and automation utilities.
- **experiments/**: One-off scripts and benchmarks.

## Standards
- **Harness Engineering:** All code must be self-contained and validated via `make`.
- **Agent-First:** Files are named descriptively. No root pollution.
- **Fractal Structure:** Each project should be a valid package or workspace member.
