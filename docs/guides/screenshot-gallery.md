# Recreating the Extension Usage Gallery

Use this guide when the README screenshots need to be refreshed. It documents the process used for the `0.5.2` gallery: run the packaged extensions in an isolated Pi profile, exercise the real TUI, capture its ANSI output from tmux, and render consistent terminal-window SVGs.

The screenshots must show extensions doing useful work. Do not replace the gallery with mocked terminal text or a startup-only resource list.

## Prerequisites

- Pi and Node.js versions supported by `package.json`
- `tmux`
- [Freeze](https://github.com/charmbracelet/freeze)
- macOS Quick Look for PNG previews (`qlmanage`)
- `xmllint` for SVG validation

Install Freeze on macOS:

```bash
brew install charmbracelet/tap/freeze
```

## 1. Create an isolated demo

Never use the normal Pi profile or a real project. Create disposable directories for the profile, project, package, and tmux socket:

```bash
DEMO_ROOT=$(mktemp -d /tmp/pi-extension-gallery.XXXXXX)
DEMO_PROFILE="$DEMO_ROOT/agent"
DEMO_PROJECT="$DEMO_ROOT/project"
TMUX_SOCKET="$DEMO_ROOT/gallery.sock"

mkdir -p "$DEMO_PROFILE" "$DEMO_PROJECT"
git -C "$DEMO_PROJECT" init
```

For a published package, install with the same command shown to users:

```bash
PI_CODING_AGENT_DIR="$DEMO_PROFILE" \
  pi install npm:pi-agent-extensions
```

For an unpublished release candidate, test the exact npm tarball instead:

```bash
npm pack
tar -xzf pi-agent-extensions-X.Y.Z.tgz -C "$DEMO_ROOT"
npm install --omit=dev --ignore-scripts --no-audit --no-fund \
  --prefix "$DEMO_ROOT/package"

PI_CODING_AGENT_DIR="$DEMO_PROFILE" \
  pi install "$DEMO_ROOT/package"
```

Pi does not install a raw `.tgz` as a package source. Extract it, install its production dependencies, and pass the extracted package directory as shown above.

Confirm the isolated profile owns the installation:

```bash
PI_CODING_AGENT_DIR="$DEMO_PROFILE" pi list
```

## 2. Seed realistic demo state

The gallery should look like an active development project. Add small, disposable files and Git changes:

```bash
printf '# Extension gallery notes\n' > "$DEMO_PROJECT/GALLERY-NOTES.md"
printf '.pi/\n' > "$DEMO_PROJECT/.gitignore"
git -C "$DEMO_PROJECT" add .gitignore
git -C "$DEMO_PROJECT" commit -m "Initialize gallery project"
printf '\nReview npm installation and release checks.\n' >> "$DEMO_PROJECT/GALLERY-NOTES.md"
```

Inside Pi, create several named sessions with short realistic prompts. Seed three todos through the `todo` tool, for example:

- Add OAuth refresh-token tests
- Polish the extension usage gallery
- Verify the npm installation flow

Useful session names include:

- Ship analytics dashboard
- Review authentication edge cases
- Plan SQLite migration
- Polish release checklist

Avoid secrets, private repositories, real customer data, personal paths, and unrelated browser or desktop content.

## 3. Start Pi in a persistent tmux session

Use a fixed terminal size so every image has the same proportions:

```bash
SESSION=Pi-extension-gallery

tmux -S "$TMUX_SOCKET" new-session -d -s "$SESSION" -x 160 -y 50 \
  "cd '$DEMO_PROJECT' && PI_CODING_AGENT_DIR='$DEMO_PROFILE' pi --verbose"

PANE=$(tmux -S "$TMUX_SOCKET" list-panes -t "$SESSION" -F '#{pane_id}')
```

Attach when manually driving the TUI:

```bash
tmux -S "$TMUX_SOCKET" attach -t "$SESSION"
```

Or inspect it without attaching:

```bash
tmux -S "$TMUX_SOCKET" capture-pane -p -J -t "$PANE"
```

Ghostty can be used to watch and interact with the tmux session, but the saved gallery should come from tmux's live ANSI state. Direct macOS window captures can become stale when a window moves to another Space or is occluded. If desktop automation cannot control Ghostty because of app restrictions, continue through tmux rather than fabricating or reusing a stale screen.

## 4. Exercise each extension

Start a clean Pi session before a new screenshot group so old prompts do not clutter the background:

```text
/new
```

Capture these interactive surfaces:

| Asset | Real interaction |
|---|---|
| `workflow-setup.svg` | `/workflow setup`, choose Balanced and stop on the final confirmation |
| `workflow-help.svg` | `/workflow help` |
| `sessions.svg` | `/sessions` with several named sessions available |
| `session-breakdown.svg` | `/session-breakdown` |
| `files.svg` | `/files` in the seeded dirty Git project |
| `review.svg` | `/review` on the review preset selector |
| `todos.svg` | `/todos` with three seeded tasks |
| `context.svg` | `/context-simple` |
| `loop.svg` | `/loop` on the preset selector |
| `control.svg` | Start Pi with `--session-control`, then run `/control-sessions` |
| `whimsical.svg` | `/whimsy` on the chaos mixer |
| `ask-user.svg` | Have the model call `ask_user` with a short release-gate question |
| `btw.svg` | `/btw What release checks should run before publishing?` |
| `answer.svg` | Ask two numbered questions, then run `/answer` |
| `handoff.svg` | `/handoff <specific next goal>` and stop in the review editor |

The powerline footer is visible throughout the gallery. CWD history and notifications are background behaviors, so explain them in the README instead of manufacturing standalone terminal panels.

## 5. Render the current Pi viewport

Capture the current pane with ANSI colors and render it into a consistent macOS-style terminal frame:

```bash
ASSET=workflow-setup

freeze \
  --execute "tmux -S $TMUX_SOCKET capture-pane -p -e -J -t $PANE" \
  --window \
  --background '#000000' \
  --margin 40 \
  --padding 24 \
  --font.family 'FiraCode Nerd Font Mono' \
  --font.size 15 \
  --output "docs/assets/gallery/$ASSET.svg"
```

Important details:

- Keep `-e` so tmux emits ANSI styling.
- Keep `-J` so wrapped lines are joined correctly.
- Do not add `-S` during the final capture. That includes scrollback and creates an excessively tall, cluttered image.
- Capture immediately while the desired overlay, picker, or editor is visible.
- Use SVG for sharp text and small npm package size.

The TUI can also be driven reproducibly from another shell:

```bash
tmux -S "$TMUX_SOCKET" send-keys -t "$PANE" '/sessions' Enter
```

Wait for a concrete UI state before capturing. A short delay can be used for a known model response, but inspect the pane before saving the asset.

## 6. Verify every image

Validate the SVG files and confirm that every capture is distinct:

```bash
for asset in docs/assets/gallery/*.svg; do
  xmllint --noout "$asset"
done

shasum docs/assets/gallery/*.svg
```

Render PNG previews with Quick Look and inspect them visually:

```bash
PREVIEW_DIR=$(mktemp -d /tmp/pi-gallery-preview.XXXXXX)
qlmanage -t -s 1000 -o "$PREVIEW_DIR" docs/assets/gallery/*.svg
open "$PREVIEW_DIR"
```

Check each preview for:

- the intended extension is visibly active;
- text is readable at README width;
- the footer is not cut off;
- old prompts do not dominate the frame;
- no duplicate or stale screen was captured;
- no secrets, usernames, personal paths, or unrelated app content are visible.

Run a text scan as an additional safeguard:

```bash
rg -n -i \
  'bearer|authorization|api[_-]?key|token=|/Users/|private repository' \
  docs/assets/gallery
```

Review matches manually because harmless UI text can contain words such as `tokens`.

## 7. Wire the gallery into README and npm

Use stable `main` branch URLs so the same README works on GitHub and npm:

```html
<img
  src="https://raw.githubusercontent.com/jayshah5696/pi-agent-extensions/main/docs/assets/gallery/workflow-setup.svg"
  alt="Pi workflow setup confirmation"
  width="100%">
```

Two-column HTML tables work well for paired extension screenshots. Keep the canonical install command above the gallery:

```bash
pi install npm:pi-agent-extensions
```

Before merging, raw `main` image URLs will still reference the previous release. Verify branch-hosted assets independently:

```bash
curl -I \
  https://raw.githubusercontent.com/jayshah5696/pi-agent-extensions/BRANCH/docs/assets/gallery/workflow-setup.svg
```

After merging, verify the rendered GitHub README and confirm every image has loaded. After publishing, repeat the visual check on the npm package page.

## 8. Verify package inclusion

The `files` field includes `docs`, so every gallery asset should appear in the npm tarball:

Record the gallery refresh under `## [Unreleased]` in `CHANGELOG.md`, then run the release gates:

```bash
npm test
npm run typecheck:workflow
npm audit --audit-level=high
npm pack --dry-run --json
node scripts/changelog.mjs check
```

Confirm the dry-run lists all expected `docs/assets/gallery/*.svg` files and no obsolete gallery image.

For the final registry smoke test:

```bash
REGISTRY_ROOT=$(mktemp -d /tmp/pi-registry-smoke.XXXXXX)
REGISTRY_PROFILE="$REGISTRY_ROOT/agent"
REGISTRY_PROJECT="$REGISTRY_ROOT/project"

mkdir -p "$REGISTRY_PROFILE" "$REGISTRY_PROJECT"
PI_CODING_AGENT_DIR="$REGISTRY_PROFILE" \
  pi install npm:pi-agent-extensions
PI_CODING_AGENT_DIR="$REGISTRY_PROFILE" pi list
```

Launch Pi from `REGISTRY_PROJECT` with the isolated profile and confirm the startup resource list contains all 17 extensions and four themes.

## 9. Clean up

Close the dedicated tmux session and remove only the exact disposable directories created for the capture:

```bash
tmux -S "$TMUX_SOCKET" kill-session -t "$SESSION"
rm -r -- "$DEMO_ROOT" "$PREVIEW_DIR" "$REGISTRY_ROOT"
```

Never use a broad glob, home directory, repository root, or shared Pi profile as a cleanup target.

## Completion checklist

- [ ] Screens show real extension behavior from an isolated Pi installation.
- [ ] All interactive extensions have a current screenshot.
- [ ] Background-only extensions are explained honestly in the README.
- [ ] All SVGs parse, are visually inspected, and have distinct hashes.
- [ ] No secrets or unrelated personal content appear in the assets.
- [ ] The README uses `pi install npm:pi-agent-extensions`.
- [ ] `CHANGELOG.md` records the refresh under `## [Unreleased]` and passes validation.
- [ ] GitHub renders every gallery image after merge.
- [ ] `npm pack --dry-run --json` includes every gallery asset.
- [ ] The published npm README renders the gallery.
- [ ] A clean registry install loads 17 extensions and four themes.
- [ ] Disposable sessions, profiles, previews, and tarballs are removed.
