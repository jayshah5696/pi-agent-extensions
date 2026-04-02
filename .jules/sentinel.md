## 2024-05-14 - Prevent Information Disclosure in Temporary Files
**Vulnerability:** Temporary files created using `writeFileSync` with just an encoding string (e.g., `"utf8"`) or default permissions in shared directories like `os.tmpdir()` can be read or modified by other users on the system, leading to local information disclosure or tampering.
**Learning:** Node.js file creation functions use the process's `umask` by default, which is often overly permissive (like `0o644` or `0o666`) for temporary files holding potentially sensitive data (like source code edits or diffs). We must explicitly set restrictive permissions.
**Prevention:** To prevent information disclosure vulnerabilities, always explicitly set secure file permissions (e.g., `{ mode: 0o600 }`) when creating temporary files in shared directories like `os.tmpdir()` using functions like `writeFileSync`.
## 2026-04-02 - Secure Lockfiles and Configuration Files
**Vulnerability:** Lockfiles and configuration files (like `.pi/todos/*.lock` and `.pi/agent/settings.json`) created without explicit file modes could inherit permissive umask defaults.
**Learning:** The memory constraints learned for temporary files must also be strictly applied to local state, persistent lockfiles, and configuration files, to prevent any local privilege escalation or sensitive information disclosure to other system users.
**Prevention:** Pass explicit mode flags (e.g. `0o600`) when using `fs.open`, `fs.writeFile` and `fs.promises.writeFile` for config and lock paths.
