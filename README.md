# pi-agent-extensions

[![npm version](https://img.shields.io/npm/v/pi-agent-extensions?color=cb3837&logo=npm)](https://www.npmjs.com/package/pi-agent-extensions)
[![Pi 0.80.10+](https://img.shields.io/badge/Pi-0.80.10%2B-67e8f9)](https://github.com/earendil-works/pi)
[![Node 22.19+](https://img.shields.io/badge/Node-%3E%3D22.19.0-5fa04e?logo=node.js&logoColor=white)](package.json)
[![MIT license](https://img.shields.io/badge/license-MIT-blue)](LICENSE)

A single install for **17 extensions and four themes** for the [Pi coding agent](https://github.com/earendil-works/pi): session tools, structured questions, handoffs, multi-agent workflows, review utilities, analytics, UI enhancements, and more.

## Install

```bash
pi install npm:pi-agent-extensions
```

The npm package is unscoped: use `npm:pi-agent-extensions`, with no `@scope/` prefix. Requires Pi `0.80.10` or newer and Node.js `22.19.0` or newer.

![Pi loading all 17 extensions and four themes from npm:pi-agent-extensions in Ghostty](https://raw.githubusercontent.com/jayshah5696/pi-agent-extensions/main/docs/assets/pi-agent-extensions-showcase.png)

The screenshot is a real Pi startup from an isolated installation of the published npm package. Press `Ctrl+O` at startup to show the full loaded-resource list.

## Extensions

| Extension | Type | Description | Status |
|-----------|------|-------------|--------|
| **sessions** | Command | Quick session picker with `/sessions` | ✅ Stable |
| **ask_user** | Tool | LLM can ask structured questions | ⚙️ Beta |
| **handoff** | Command | Goal-driven context transfer `/handoff` | ✅ Stable |
| **whimsical** | UI | Context-aware loading messages & exit | ✅ Stable |
| **files** | Tool | Unified file browser & git integration | ✅ Stable |
| **notify** | Tool | Desktop notifications via OSC 777 | ✅ Stable |
| **context** | UI | Context breakdown dashboard | ✅ Stable |
| **review** | Tool | Interactive code review system | ✅ Stable |
| **loop** | Tool | Iterative execution loop | ✅ Stable |
| **todos** | Tool | File-based todo list management | ✅ Stable |
| **control** | RPC | Inter-session communication & control | ⚙️ Beta |
| **answer** | Tool | Structured Q&A for complex queries | ⚙️ Beta |
| **cwd_history** | Tracker | Tracks directory changes in context | ✅ Stable |
| **btw** | Command | Quick side questions without history | ✅ Stable |
| **powerline-footer** | UI | Custom powerline-style footer bar | ✅ Stable |
| **session-breakdown** | Command | Session analytics dashboard | ✅ Stable |
| **workflow** | Tool / Command | Model-routed dynamic workflows with `/workflow` | ⚙️ Beta |

## Verify Installation

Confirm that Pi registered the package:

```bash
pi list
# User packages:
#   npm:pi-agent-extensions
```

Start Pi and press `Ctrl+O` to expand the startup resources. The `[Extensions]` section should contain all 17 `pi-agent-extensions:*` entries shown above.

Useful smoke tests:

```bash
pi
/sessions
/workflow help
```

`/sessions` opens the session picker. `/workflow help` renders the workflow guide without making a model call.

## Development Installation

```bash
git clone https://github.com/jayshah5696/pi-agent-extensions.git
cd pi-agent-extensions

# Install globally from this checkout
pi install .

# Or install only for the current project
pi install /path/to/pi-agent-extensions -l --approve
```

`--approve` trusts project-local code. Use it only after reviewing the checkout you are installing.

Load individual extensions without installing the package:

```bash
pi -e /path/to/pi-agent-extensions/extensions/sessions/index.ts \
   -e /path/to/pi-agent-extensions/extensions/ask-user/index.ts \
   -e /path/to/pi-agent-extensions/extensions/handoff/index.ts
```

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release history.

## Update

```bash
# Update to latest version
pi update npm:pi-agent-extensions

# Or update all packages
pi update --extensions
```

## Uninstall

```bash
pi remove npm:pi-agent-extensions
```

## Troubleshooting

### Extensions not showing after install

If you installed via `npm install` or `npm update`, the package won't be registered with Pi. You must use **Pi's package manager**:

```bash
# Wrong (npm only - won't register with Pi)
npm install pi-agent-extensions

# Correct (registers with Pi)
pi install npm:pi-agent-extensions
```

### Verify installation

Check that the package appears in your settings:

```bash
cat ~/.pi/agent/settings.json | grep pi-agent-extensions
```

You should see:
```json
"packages": [
  "npm:pi-agent-extensions",
  ...
]
```

### Local development vs npm

When running Pi from the `pi-agent-extensions` directory, it loads **local** extensions (your development copy), not the npm-installed version. This is useful for development but can cause confusion.

To test the npm version, run Pi from a different directory:

```bash
cd ~/some-other-project
pi
# Check: should show npm:pi-agent-extensions in [Extensions]
```

## Documentation & Extensions Reference

For in-depth explanations, options, and commands for all 17 extensions, refer to the [Extensions Reference](docs/extensions.md).

For installation, manual testing, and setup guides, see the [Documentation Index](docs/README.md).

## Development

This repository uses [just](https://github.com/casey/just) as a command runner for local testing and package releases.

```bash
# Install package dependencies
npm install

# Run the full test suite
just test

# Show local vs. published npm version
just versions

# Inspect package files packed in npm bundle
just pack-dry-run

# Check release validity (fails if version is not bumped)
just release-check

# Bump version, tag, commit, push, and publish to npm
just release patch
```

If you do not have `just` installed, you can use the equivalent `npm` wrapper scripts:
```bash
npm test
npm run release:check
npm run release:publish -- patch
```

## Acknowledgments

This project includes extensions adapted from [mitsuhiko/agent-stuff](https://github.com/mitsuhiko/agent-stuff) (Apache 2.0 / MIT License).

Special thanks to Armin Ronacher ([@mitsuhiko](https://github.com/mitsuhiko)) for creating and open-sourcing the original notification, context, file-browser, review, and loop extensions.

## License

MIT
