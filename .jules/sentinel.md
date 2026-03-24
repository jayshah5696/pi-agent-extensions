## 2024-05-24 - Secure Temporary File Creation
**Vulnerability:** Information Disclosure
**Learning:** Temporary files created in shared directories like `os.tmpdir()` with default permissions can be world-readable, exposing sensitive data to other users on the system.
**Prevention:** Always explicitly set secure file permissions (e.g., `{ mode: 0o600 }`) when creating temporary files using functions like `writeFileSync`.
