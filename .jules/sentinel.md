## 2024-05-24 - [Information Disclosure in Shared Temporary Directories]
**Vulnerability:** Temporary files created in shared directories (like `os.tmpdir()`) without explicit permissions could be read or modified by other local users on the system.
**Learning:** `writeFileSync` defaults to the standard umask if not provided. In multi-user environments, this can lead to sensitive information leakage.
**Prevention:** Always explicitly set secure file permissions (e.g., `{ encoding: "utf8", mode: 0o600 }`) when creating temporary files in shared directories using functions like `writeFileSync`.
