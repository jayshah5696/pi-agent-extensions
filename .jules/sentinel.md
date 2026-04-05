## 2024-05-14 - Prevent Information Disclosure in Temporary Files
**Vulnerability:** Temporary files created using `writeFileSync` with just an encoding string (e.g., `"utf8"`) or default permissions in shared directories like `os.tmpdir()` can be read or modified by other users on the system, leading to local information disclosure or tampering.
**Learning:** Node.js file creation functions use the process's `umask` by default, which is often overly permissive (like `0o644` or `0o666`) for temporary files holding potentially sensitive data (like source code edits or diffs). We must explicitly set restrictive permissions.
**Prevention:** To prevent information disclosure vulnerabilities, always explicitly set secure file permissions (e.g., `{ mode: 0o600 }`) when creating temporary files in shared directories like `os.tmpdir()` using functions like `writeFileSync`.
## 2026-04-05 - Prevent Path Traversal via Strict Input Validation
**Vulnerability:** Path validation using a blocklist (checking for specific substrings like `/`, `\`, and `..`) is prone to bypasses and path traversal vulnerabilities.
**Learning:** Relying on blocklists to filter out dangerous characters for filesystem paths is a security anti-pattern.
**Prevention:** Always validate user-provided file identifiers and aliases using strict allowlist regular expressions (e.g., `/^[a-zA-Z0-9_\-]+$/`) before concatenating them into file paths.
