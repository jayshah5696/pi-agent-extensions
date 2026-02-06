# Log

## 2026-02-04 14:13
- Added project scaffolding (package.json with test script and peer deps).
- Added session helper stubs in src/sessions.ts to enable test-first workflow.
- Added node:test coverage for parsing limits, timestamp formatting, label/description formatting, and filtering behavior.

## 2026-02-04 14:18
- Implemented session helpers: limit parsing, timestamp formatting, label/description formatting, and name/path prefix filtering.

## 2026-02-04 14:29
- Implemented /sessions extension with progress loader, filterable SelectList UI, and session switching.
- Added non-UI output handling plus README and MIT license for packaging.
- Attempted `npm test` (fails until `npm install` provides tsx).

## 2026-02-04 14:41
- Added fuzzy substring + multi-token session filtering across name, id, cwd, and first message.
- Updated filter tests for substring and token matching.

## 2026-02-04 14:44
- Cached per-session search text with WeakMap to avoid recomputing on each keypress.

## 2026-02-04 14:50
- Precomputed session search entries for faster filtering and updated tests to cover entry-based matching.
