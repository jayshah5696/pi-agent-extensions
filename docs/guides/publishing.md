# Publishing

This package is published to npm as `pi-agent-extensions`.

We use a custom release script and a task runner (`just`) to automate the verification and publishing steps.

## Prerequisites

- You are on `main`.
- Your working tree is clean.
- You have npm publish access for `pi-agent-extensions`.
- You are authenticated with npm via either:
  - `npm login`, or
  - `NPM_TOKEN` / `NODE_AUTH_TOKEN` in the environment.

For accounts with publish-time 2FA, use a fresh OTP when npm prompts. For non-interactive publishing, use a granular or automation token that is allowed to publish with 2FA bypass.

## Task Runner Commands (`just`)

Installing `just` (see [Installation](https://github.com/casey/just)) simplifies running release tasks:

### Show Available Tasks
```bash
just
```

### Run Tests
```bash
just test
```

### View Version Status
Displays local `package.json` version and currently published npm registry version:
```bash
just versions
```

### Dry-run Package Inspection
Shows what files will be packed into the release bundle:
```bash
just pack-dry-run
```

### Run Release Checks
Performs a dry-run check comparing the local version against the published version, packing, and testing:
```bash
just release-check
```

Before releasing, record user-visible changes under `## [Unreleased]` in `CHANGELOG.md`. The publish command promotes those notes to the new version and validates that release sections are unique and newest-first.

### Publish a Release
Publishes the package, bumps the version, creates a Git tag, and pushes to remote. Usage:
```bash
just release patch        # Standard patch bump
just release minor        # Standard minor bump
just release major        # Standard major bump
just release 0.5.1        # Explicit version target
```

Alternative helper tasks:
```bash
just release-patch
just release-minor
just release-major
```

Set `YES=1` to skip confirmation prompts:
```bash
YES=1 just release patch
```

---

## Alternative NPM Scripts (Wrapper Commands)

If you do not have `just` installed, you can use these `npm run` wrapper commands:

### Run Release Checks
```bash
npm run release:check
```

### Publish a Release
```bash
npm run release:publish -- patch
```

Minor release:

```bash
npm run release:publish -- minor
```

Major release:

```bash
npm run release:publish -- major
```

Explicit version:

```bash
npm run release:publish -- 0.5.1
```

The publish script will:

1. verify it is running from a clean `main` branch,
2. fetch and fast-forward from `origin/main`,
3. run `npm test`,
4. bump `package.json` and `package-lock.json` with `npm version --no-git-tag-version`,
5. promote `CHANGELOG.md`'s Unreleased notes to the new version and validate its ordering,
6. run `npm pack --dry-run`,
7. publish to npm,
8. commit the changelog and version bump,
9. create a `vX.Y.Z` git tag,
10. push `main` and tags.

Set `YES=1` to skip the publish confirmation prompt:

```bash
YES=1 npm run release:publish -- patch
```

## Token usage

The script does not print token values. If `NPM_TOKEN` or `NODE_AUTH_TOKEN` is set, it configures npm auth like this:

```bash
npm config set //registry.npmjs.org/:_authToken "$NPM_TOKEN"
```

## If publish succeeds but git push fails

The npm version cannot be unpublished/reused. Fix the git issue and push manually:

```bash
git push origin main --tags
```

## If publish fails before commit/tag

The script bumps the version and promotes the changelog before publishing. If publish fails and you do not want to retry, restore those files:

```bash
git checkout -- CHANGELOG.md package.json package-lock.json
```

## Package contents

The npm package contents are controlled by the `files` field in `package.json`:

```json
["extensions", "themes", "docs"]
```

The README usage gallery under `docs/assets/gallery/` is published with the package. Repository-only screenshots under `screenshots/` and tests are not included.

Follow [Recreating the Extension Usage Gallery](screenshot-gallery.md) when adding or refreshing README screenshots. It covers the isolated Pi profile, live TUI capture, SVG rendering, visual QA, package inclusion, and npm-page verification.
