#!/usr/bin/env bash
set -euo pipefail

PACKAGE_NAME="${PACKAGE_NAME:-pi-agent-extensions}"
VERSION_ARG="${1:-patch}"
ASSUME_YES="${YES:-${CI:-}}"

info() {
  printf '\033[1;34m==>\033[0m %s\n' "$*"
}

fail() {
  printf '\033[1;31merror:\033[0m %s\n' "$*" >&2
  exit 1
}

version_gt() {
  node - "$1" "$2" <<'NODE'
const [a, b] = process.argv.slice(2);
const parse = (version) => version.split(/[.-]/).map((part) => /^\d+$/.test(part) ? Number(part) : part);
const av = parse(a);
const bv = parse(b);
const len = Math.max(av.length, bv.length);
for (let i = 0; i < len; i++) {
  const x = av[i] ?? 0;
  const y = bv[i] ?? 0;
  if (typeof x === 'number' && typeof y === 'number') {
    if (x > y) process.exit(0);
    if (x < y) process.exit(1);
  } else {
    const xs = String(x);
    const ys = String(y);
    if (xs > ys) process.exit(0);
    if (xs < ys) process.exit(1);
  }
}
process.exit(1);
NODE
}

confirm() {
  local prompt="$1"
  if [[ -n "${ASSUME_YES}" ]]; then
    info "${prompt} yes"
    return 0
  fi
  read -r -p "${prompt} [y/N] " answer
  [[ "${answer}" == "y" || "${answer}" == "Y" || "${answer}" == "yes" || "${answer}" == "YES" ]]
}

[[ -f package.json ]] || fail "run from the repository root"

branch="$(git branch --show-current)"
[[ "${branch}" == "main" ]] || fail "release must be run from main, currently on ${branch}"

git diff --quiet || fail "working tree has unstaged changes"
git diff --cached --quiet || fail "index has staged changes"

info "Fetching origin/main"
git fetch origin main --tags
info "Fast-forwarding main"
git pull --ff-only origin main

info "Running tests"
npm test

old_version="$(node -p "require('./package.json').version")"
published_version="$(npm view "${PACKAGE_NAME}" version 2>/dev/null || true)"
info "Current local version: ${old_version}"
if [[ -n "${published_version}" ]]; then
  info "Current published version: ${published_version}"
fi

info "Bumping version: ${VERSION_ARG}"
npm version "${VERSION_ARG}" --no-git-tag-version
new_version="$(node -p "require('./package.json').version")"

if [[ -n "${published_version}" ]] && ! version_gt "${new_version}" "${published_version}"; then
  fail "new version ${new_version} is not greater than published version ${published_version}"
fi

info "Promoting and validating changelog notes"
node scripts/changelog.mjs promote "${new_version}"

info "Checking package contents"
npm pack --dry-run

if [[ -n "${NPM_TOKEN:-}" ]]; then
  info "Using NPM_TOKEN from environment"
  npm config set //registry.npmjs.org/:_authToken "${NPM_TOKEN}" >/dev/null
elif [[ -n "${NODE_AUTH_TOKEN:-}" ]]; then
  info "Using NODE_AUTH_TOKEN from environment"
  npm config set //registry.npmjs.org/:_authToken "${NODE_AUTH_TOKEN}" >/dev/null
fi

npm whoami >/dev/null || fail "npm is not authenticated. Run npm login or export NPM_TOKEN/NODE_AUTH_TOKEN."

confirm "Publish ${PACKAGE_NAME}@${new_version} to npm?" || fail "publish cancelled"

info "Publishing ${PACKAGE_NAME}@${new_version}"
npm publish --access public

info "Committing release metadata"
git add CHANGELOG.md package.json package-lock.json
git commit -m "chore(release): ${new_version}"

tag="v${new_version}"
info "Tagging ${tag}"
git tag "${tag}"

info "Pushing main and ${tag}"
git push origin main --tags

info "Published ${PACKAGE_NAME}@${new_version} and pushed ${tag}"
