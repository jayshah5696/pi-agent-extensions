# Publishing

This package is published to npm as `pi-agent-extensions`.

## Prerequisites

- You are on `main`.
- Your working tree is clean.
- You have npm publish access for `pi-agent-extensions`.
- You are authenticated with npm via either:
  - `npm login`, or
  - `NPM_TOKEN` / `NODE_AUTH_TOKEN` in the environment.

For accounts with publish-time 2FA, use a fresh OTP when npm prompts. For non-interactive publishing, use a granular or automation token that is allowed to publish with 2FA bypass.

## Check a release

Run tests and inspect package contents:

```bash
npm run release:check
```

`release:check` expects the local `package.json` version to be greater than the currently published npm version. If you have not bumped the version yet, it will fail intentionally.

## Publish a release

Patch release:

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
npm run release:publish -- 0.4.5
```

The publish script will:

1. verify it is running from a clean `main` branch,
2. fetch and fast-forward from `origin/main`,
3. run `npm test`,
4. bump `package.json` and `package-lock.json` with `npm version --no-git-tag-version`,
5. run `npm pack --dry-run`,
6. publish to npm,
7. commit the version bump,
8. create a `vX.Y.Z` git tag,
9. push `main` and tags.

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

The script bumps the version before publishing. If publish fails and you do not want to retry, restore the version files:

```bash
git checkout -- package.json package-lock.json
```

## Package contents

The npm package contents are controlled by the `files` field in `package.json`:

```json
["extensions", "themes", "docs"]
```

Screenshots and tests are kept in the repository but are not published to npm unless added to `files`.
