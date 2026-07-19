#!/usr/bin/env bash
set -euo pipefail

PACKAGE_NAME="${PACKAGE_NAME:-pi-agent-extensions}"

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

info "Running tests"
npm test

local_version="$(node -p "require('./package.json').version")"
info "Local package version: ${local_version}"
node scripts/changelog.mjs check "${local_version}"

published_version="$(npm view "${PACKAGE_NAME}" version 2>/dev/null || true)"
if [[ -n "${published_version}" ]]; then
  info "Published npm version: ${published_version}"
  if [[ "${local_version}" == "${published_version}" ]]; then
    fail "local version ${local_version} is already published. Run npm version patch/minor/major first."
  fi
  if ! version_gt "${local_version}" "${published_version}"; then
    fail "local version ${local_version} is not greater than published version ${published_version}."
  fi
else
  info "No published npm version found for ${PACKAGE_NAME}"
fi

info "Checking package contents"
npm pack --dry-run

info "Release check passed for ${PACKAGE_NAME}@${local_version}"
