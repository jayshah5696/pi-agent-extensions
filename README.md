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

<p align="center">
  <img src="https://raw.githubusercontent.com/jayshah5696/pi-agent-extensions/main/docs/assets/gallery/workflow-setup.svg" alt="Pi workflow setup showing the Balanced profile, model routes, concurrency, and approval policy" width="100%">
</p>

## See it in action

Every screenshot below comes from a real Pi session using an isolated installation of `npm:pi-agent-extensions`. The UI is not mocked: the gallery uses seeded sessions, todos, and a disposable Git project so the extensions have realistic data to display.

### Plan and navigate

<table>
  <tr>
    <td width="50%" valign="top"><strong>Workflow setup</strong><br><code>/workflow setup</code> configures profiles, model routes, concurrency, and approval.<br><br><img src="https://raw.githubusercontent.com/jayshah5696/pi-agent-extensions/main/docs/assets/gallery/workflow-setup.svg" alt="Workflow setup confirmation" width="100%"></td>
    <td width="50%" valign="top"><strong>Sessions</strong><br><code>/sessions</code> searches project sessions with a live conversation preview.<br><br><img src="https://raw.githubusercontent.com/jayshah5696/pi-agent-extensions/main/docs/assets/gallery/sessions.svg" alt="Sessions picker with live preview" width="100%"></td>
  </tr>
</table>

### Ask, answer, and hand off

<table>
  <tr>
    <td width="50%" valign="top"><strong>Structured questions</strong><br>The <code>ask_user</code> tool presents validated choices and always supports a free-text answer.<br><br><img src="https://raw.githubusercontent.com/jayshah5696/pi-agent-extensions/main/docs/assets/gallery/ask-user.svg" alt="ask_user single-select question" width="100%"></td>
    <td width="50%" valign="top"><strong>Batch answers</strong><br><code>/answer</code> collects answers to multiple questions in one focused editor.<br><br><img src="https://raw.githubusercontent.com/jayshah5696/pi-agent-extensions/main/docs/assets/gallery/answer.svg" alt="Answer extension collecting multiple answers" width="100%"></td>
  </tr>
  <tr>
    <td width="50%" valign="top"><strong>Side questions</strong><br><code>/btw</code> answers an ephemeral question without adding it to session history.<br><br><img src="https://raw.githubusercontent.com/jayshah5696/pi-agent-extensions/main/docs/assets/gallery/btw.svg" alt="BTW side-question overlay" width="100%"></td>
    <td width="50%" valign="top"><strong>Session handoff</strong><br><code>/handoff &lt;goal&gt;</code> extracts and opens a reviewable transfer prompt.<br><br><img src="https://raw.githubusercontent.com/jayshah5696/pi-agent-extensions/main/docs/assets/gallery/handoff.svg" alt="Handoff prompt editor" width="100%"></td>
  </tr>
</table>

### Inspect and manage work

<table>
  <tr>
    <td width="50%" valign="top"><strong>Files</strong><br><code>/files</code> combines fuzzy navigation, Git status, diffs, and prompt context.<br><br><img src="https://raw.githubusercontent.com/jayshah5696/pi-agent-extensions/main/docs/assets/gallery/files.svg" alt="Files browser with Git status" width="100%"></td>
    <td width="50%" valign="top"><strong>Review</strong><br><code>/review</code> selects a review scope and drives an interactive code-review flow.<br><br><img src="https://raw.githubusercontent.com/jayshah5696/pi-agent-extensions/main/docs/assets/gallery/review.svg" alt="Review scope selector" width="100%"></td>
  </tr>
  <tr>
    <td width="50%" valign="top"><strong>Todos</strong><br><code>/todos</code> manages file-backed tasks that agents can claim and update.<br><br><img src="https://raw.githubusercontent.com/jayshah5696/pi-agent-extensions/main/docs/assets/gallery/todos.svg" alt="Todo manager with seeded release tasks" width="100%"></td>
    <td width="50%" valign="top"><strong>Context</strong><br><code>/context-simple</code> explains token allocation, loaded resources, and session cost.<br><br><img src="https://raw.githubusercontent.com/jayshah5696/pi-agent-extensions/main/docs/assets/gallery/context.svg" alt="Context window dashboard" width="100%"></td>
  </tr>
</table>

### Analyze, automate, and customize

<table>
  <tr>
    <td width="50%" valign="top"><strong>Session analytics</strong><br><code>/session-breakdown</code> charts sessions, messages, tokens, cost, and model usage.<br><br><img src="https://raw.githubusercontent.com/jayshah5696/pi-agent-extensions/main/docs/assets/gallery/session-breakdown.svg" alt="Session breakdown analytics" width="100%"></td>
    <td width="50%" valign="top"><strong>Execution loops</strong><br><code>/loop</code> configures test-driven, condition-driven, or self-driven iteration.<br><br><img src="https://raw.githubusercontent.com/jayshah5696/pi-agent-extensions/main/docs/assets/gallery/loop.svg" alt="Loop preset selector" width="100%"></td>
  </tr>
  <tr>
    <td width="50%" valign="top"><strong>Session control</strong><br><code>/control-sessions</code> lists controllable Pi sessions for inter-session work.<br><br><img src="https://raw.githubusercontent.com/jayshah5696/pi-agent-extensions/main/docs/assets/gallery/control.svg" alt="Controllable Pi sessions" width="100%"></td>
    <td width="50%" valign="top"><strong>Whimsical UI</strong><br><code>/whimsy</code> tunes themed loading messages, spinners, and exits.<br><br><img src="https://raw.githubusercontent.com/jayshah5696/pi-agent-extensions/main/docs/assets/gallery/whimsical.svg" alt="Whimsical chaos mixer" width="100%"></td>
  </tr>
</table>

### Learn the workflow surface

<p align="center">
  <img src="https://raw.githubusercontent.com/jayshah5696/pi-agent-extensions/main/docs/assets/gallery/workflow-help.svg" alt="Workflow command guide" width="100%">
</p>

The gallery also shows the **powerline footer** on every screen and its live Git branch, dirty-file counts, model, context, cost, and timer. **CWD history** runs in the background and keeps the displayed working directory synchronized. **Notify** runs after agent turns and sends an OSC 777 desktop notification, so it has no persistent in-terminal panel to photograph.

## Extensions

| Extension | Type | Description | Status |
|-----------|------|-------------|--------|
| **sessions** | Command | Quick session picker with `/sessions` | ✅ Stable |
| **ask_user** | Tool | LLM can ask structured questions | ⚙️ Beta |
| **handoff** | Command | Goal-driven context transfer `/handoff` | ✅ Stable |
| **whimsical** | UI | Context-aware loading messages & exit | ✅ Stable |
| **files** | Tool | Unified file browser & git integration | ✅ Stable |
| **notify** | Automatic | OSC 777 desktop notification after agent turns | ✅ Stable |
| **context** | Command | Context breakdown dashboard with `/context-simple` | ✅ Stable |
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
