## 2026-02-04 - [Fix Path Traversal in Todo Extension]
**Vulnerability:** Path traversal vulnerability in `extensions/todos/index.ts`. The `id` parameter provided by the user was concatenated directly into the file paths in `getTodoPath` and `getLockPath` without validation.
**Learning:** File paths generated from user input must always be validated to prevent directory traversal payloads (like `../../../etc/passwd`).
**Prevention:** Always validate user-provided file identifiers against an allowlist (e.g., regex `/^[a-zA-Z0-9_-]+$/`) before concatenating them into file paths.
