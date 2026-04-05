# Changelog

All notable changes to this project will be documented in this file.

## [0.3.6] - 2026-04-05

### Changed
- **`/btw`**: Uses the currently selected model instead of auto-selecting cheap models. Simpler, more predictable.

## [0.3.5] - 2026-04-05

### Added
- **New extension: `/btw`** — Ask quick side questions without polluting conversation history.
  - Ephemeral overlay: question and answer are never persisted to the session.
  - Full conversation context visibility but no tool access (lightweight, read-only).
  - Scrollable answer overlay with keyboard navigation (↑↓/j/k, PgUp/PgDn).
  - Dismiss with Esc, Space, or q.
  - Uses the currently selected model (same quality as your session).
  - Non-UI fallback prints answer to stdout.
  - Zero context cost — no tokens wasted on history.

## [0.3.4] - 2026-04-05

### Fixed
- Migrated `todos` and `files` extensions from removed `getEditorKeybindings()` / `EditorKeybindingsManager` to `getKeybindings()` / `KeybindingsManager` (pi-tui 0.65.0).
- Updated all legacy keybinding names to namespaced IDs (`selectUp` → `tui.select.up`, `expandTools` → `app.tools.expand`, etc.).
- Fixed `keyHint()` calls in `todos` and `sessions` to use namespaced keybinding IDs.
- Fixed stale `session_switch` reference in `docs/mitsuhiko-integration-analysis.md`.

## [0.3.3] - 2026-04-04

### Fixed
- Updated extensions for the latest Pi API changes.
- Replaced deprecated `ctx.modelRegistry.getApiKey(...)` usage with the new `getApiKeyAndHeaders(...)` flow.
- Forwarded request headers alongside API keys when calling `complete(...)`.
- Migrated extensions off `session_switch` to `session_start` where appropriate.
- Updated loop compaction to the latest `compact(...)` signature.

### Changed
- Added shared auth helpers for extension model requests.
- Bumped package version to `0.3.3` and published to npm.

## [0.3.2] - 2026-04-04

### Previous
- Initial published release before the Pi API compatibility update.
