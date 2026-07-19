# Changelog

All notable changes to this project are documented here. Release dates match the npm registry publication dates.

## [Unreleased]

## [0.5.1] - 2026-07-19

### Added
- Added a real Ghostty screenshot captured from an isolated npm installation, showing all 17 extensions and four bundled themes. The asset lives under `docs/assets/` so it is included in the npm package.

### Changed
- Redesigned the README around the canonical `pi install npm:pi-agent-extensions` path and added direct package, runtime, update, removal, and verification guidance.
- Reconciled the changelog with every version published to npm from `0.1.0` through `0.5.0`, including previously missing releases and corrected publication dates.
- Added changelog validation and automatic promotion of Unreleased notes to the release version in the publishing workflow.

## [0.5.0] - 2026-07-19

### Added
- Added the `/workflow` dynamic-workflow extension with Lean, Balanced, Deep, and Custom profiles; role-based model routing; searchable model setup; generated-script approval; trusted-project enforcement; background execution; saved JavaScript workflows; durable history; and journaled pause/resume.
- Added an interactive workflow run browser with rendered results, phase and agent drill-down, token and cost usage, prompt and recent tool-activity capture, Markdown and self-contained HTML exports, reusable-script saving, and live run controls.
- Added `/workflow help` and the side-effect-free `/workflow doctor` readiness check.

### Fixed
- Workflow approval now opens on the complete line-numbered JavaScript and requires an explicit `y` before execution.
- Background workflow failures no longer wake the parent model into an automatic retry and repeated approval loop.
- Generated `agent(persona)(task)`, `phase(title, callback)`, plain `run()` wrappers, and trailing `run();` scripts now execute inside the managed workflow.
- Model setup now respects Pi's enabled-model scope, and exact model patterns no longer expand into similarly named variants.

### Changed
- Raised the supported Pi core packages to `0.80.10` or newer and Node.js to `22.19.0` or newer.
- Clarified that the published package is the unscoped `npm:pi-agent-extensions` source.

## [0.4.6] - 2026-06-24

### Fixed
- Migrated Pi AI imports to the public compatibility entrypoint required by Pi `0.80.x`.

## [0.4.5] - 2026-06-14

### Added
- Added repeatable npm release scripts and `just` commands for tests, package inspection, version checks, and publishing.
- Added a split-pane sessions picker with live semantic previews and a repository screenshot.

### Changed
- Migrated the sessions extension and package peers to the `@earendil-works` Pi packages.
- Consolidated the documentation into the current README, extensions reference, manual-testing guide, and publishing guide.
- Removed the bundled NVIDIA NIM extension after Pi gained standard provider support.

## [0.4.4] - 2026-05-31

### Added
- Added the full-window `/sessions` picker with a session list and live selected-session preview.
- Added semantic preview blocks for user, assistant, tool, bash, thinking, summary, and error content.
- Added preview scrolling, tool-activity expansion, thinking visibility controls, debounced loading, stale-load protection, and preview caching.

## [0.4.3] - 2026-04-28

### Fixed
- Fixed handoff using a stale command context after session replacement.

## [0.4.2] - 2026-04-26

### Fixed
- Prevented the powerline footer from overflowing narrow terminals.
- Fixed stale footer and session state and polished the `/btw` overlay.

## [0.4.1] - 2026-04-09

### Fixed
- Limited the footer context percentage to one decimal place and removed unnecessary trailing decimals.
- Kept cost visible for very small sessions by displaying `<$0.01`.

## [0.4.0] - 2026-04-08

### Added
- Added the powerline footer with asynchronous git status, model, context, cost, session-duration, environment, and extension indicators.

### Fixed
- Replaced blacklist path validation in the control extension with strict allowlists.
- Sanitized notification title and body input to prevent terminal escape injection.

## [0.3.6] - 2026-04-05

### Changed
- Updated `/btw` to use the currently selected model instead of automatically choosing a cheaper model.

## [0.3.5] - 2026-04-05

### Added
- Added `/btw`, an ephemeral side-question overlay that uses conversation context without persisting the question or answer to the session.

## [0.3.4] - 2026-04-05

### Fixed
- Migrated extension keybindings to the namespaced Pi TUI `0.65.0` APIs.
- Updated todos, files, sessions, and documentation for the current keybinding names.

## [0.3.3] - 2026-04-04

### Fixed
- Updated extensions for the current Pi API, including provider authentication, request headers, session events, and compaction signatures.

## [0.3.2] - 2026-02-15

### Fixed
- Renamed the context command to `/context-simple` to avoid a command-name conflict.

## [0.3.1] - 2026-02-15

### Changed
- Switched NVIDIA NIM authentication to Pi's standard OAuth flow.
- Expanded the whimsical message mixer while restoring the full original message collection.

## [0.3.0] - 2026-02-12

### Added
- Added the NVIDIA NIM provider extension with authenticated model setup, scoped model synchronization, validation, documentation, and tests.

## [0.2.3] - 2026-02-07

### Fixed
- Deferred whimsical shutdown so the final notification can render before Pi exits.

## [0.2.2] - 2026-02-07

### Added
- Added README update, uninstall, troubleshooting, and npm-versus-local testing guidance.

## [0.2.1] - 2026-02-07

### Fixed
- Routed whimsical exit messages through Pi's UI notification API instead of writing directly to the console.

## [0.2.0] - 2026-02-07

### Added
- Expanded the package from three extensions to 14 with notifications, context, files, review, loop, answers, control, directory history, session analytics, todos, and whimsical UI.
- Added four bundled themes and comprehensive installation, deployment, publishing, testing, quick-start, and customization documentation.

## [0.1.0] - 2026-02-06

### Added
- Published the initial npm package with the sessions picker, structured `ask_user` tool, and goal-driven handoff command.
