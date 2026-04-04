# Changelog

All notable changes to this project will be documented in this file.

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
