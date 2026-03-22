## 2025-02-14 - [CRITICAL] Incomplete Path Traversal Prevention
**Vulnerability:** The session control extension validated `sessionId` and `alias` using `!includes("/")`, `!includes("\\")`, and `!includes("..")`. This blacklist approach is incomplete and susceptible to path traversal via bypasses or control characters.
**Learning:** Naive string inclusion checks are insufficient for validating file identifiers and protecting against path traversal in file system operations.
**Prevention:** Always use strict regex allowlists (e.g., `/^[a-zA-Z0-9_-]+$/` and `/^[a-zA-Z0-9_ -]+$/`) when validating user-provided identifiers before interpolating them into paths.
