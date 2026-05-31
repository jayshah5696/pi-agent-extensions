# pi-agent-extensions

A collection of extensions for the [pi coding agent](https://github.com/badlogic/pi-mono/tree/main/packages/coding-agent).

## Acknowledgments

This project includes extensions adapted from [mitsuhiko/agent-stuff](https://github.com/mitsuhiko/agent-stuff) (Apache 2.0 / MIT License).

**Special thanks to Armin Ronacher ([@mitsuhiko](https://github.com/mitsuhiko))** for creating and open-sourcing these excellent production-ready extensions:
- `notify.ts` - Desktop notifications via OSC 777
- `context.ts` - Context breakdown dashboard  
- `files.ts` - Unified file browser with git integration
- `review.ts` - Code review system
- `loop.ts` - Iterative execution loop

Original repository: https://github.com/mitsuhiko/agent-stuff

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

## Install

### From npm (Recommended)

```bash
pi install npm:pi-agent-extensions
```

All extensions will be available immediately after installation.

### From Source (For Development)

```bash
# Clone the repository
git clone https://github.com/jayshah5696/pi-agent-extensions.git
cd pi-agent-extensions

# Install globally
pi install .

# Or install to specific project
cd ~/your-project
pi install -l /path/to/pi-agent-extensions
```

### Quick Test Without Installing

```bash
pi -e /path/to/pi-agent-extensions/extensions/sessions/index.ts \
   -e /path/to/pi-agent-extensions/extensions/ask-user/index.ts \
   -e /path/to/pi-agent-extensions/extensions/handoff/index.ts
```

## Verify Installation

After installing, start pi and look for the startup message:

```
Extensions: sessions, ask_user, handoff
```

**Test sessions:**
```bash
pi
/sessions
```

**Test ask_user:**
```bash
pi
> Ask me which database I prefer: PostgreSQL or SQLite
```

The LLM should call the `ask_user` tool and show you options to select.

**Test handoff:**
```bash
pi
# Have a conversation first, then:
/handoff implement the next feature with proper tests
```

You'll see a loader while context is extracted, then an editor to review the handoff prompt.

## Changelog

See [CHANGELOG.md](CHANGELOG.md) for release history.

## Update

```bash
# Update to latest version
pi update pi-agent-extensions

# Or update all packages
pi --update-packages
```

## Uninstall

```bash
pi remove pi-agent-extensions
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

For in-depth explanations, options, and commands for all 16 extensions, refer to the [Extensions Reference](docs/extensions.md).

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

## License

MIT

