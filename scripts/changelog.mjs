#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const changelogPath = resolve(root, process.env.CHANGELOG_PATH ?? "CHANGELOG.md");
const packagePath = resolve(root, process.env.PACKAGE_JSON_PATH ?? "package.json");
const action = process.argv[2] ?? "check";
const requestedVersion = process.argv[3];
const semverPattern = /^\d+\.\d+\.\d+$/;

function fail(message) {
  console.error(`changelog error: ${message}`);
  process.exit(1);
}

function packageVersion() {
  return JSON.parse(readFileSync(packagePath, "utf8")).version;
}

function releaseHeadings(text) {
  return [...text.matchAll(/^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})$/gm)].map(
    (match) => ({ version: match[1], date: match[2] }),
  );
}

function compareVersions(left, right) {
  const a = left.split(".").map(Number);
  const b = right.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (a[index] !== b[index]) return a[index] - b[index];
  }
  return 0;
}

function check(expectedVersion = packageVersion()) {
  if (!semverPattern.test(expectedVersion)) fail(`invalid expected version ${expectedVersion}`);
  const text = readFileSync(changelogPath, "utf8");
  if (!text.startsWith("# Changelog\n")) fail("CHANGELOG.md must start with '# Changelog'");
  if (!/^## \[Unreleased\]$/m.test(text)) fail("missing [Unreleased] section");

  const headings = releaseHeadings(text);
  if (!headings.length) fail("no versioned release sections found");
  const seen = new Set();
  for (const heading of headings) {
    if (seen.has(heading.version)) fail(`duplicate release section ${heading.version}`);
    seen.add(heading.version);
    if (Number.isNaN(Date.parse(`${heading.date}T00:00:00Z`))) {
      fail(`invalid release date for ${heading.version}: ${heading.date}`);
    }
  }
  for (let index = 1; index < headings.length; index += 1) {
    if (compareVersions(headings[index - 1].version, headings[index].version) <= 0) {
      fail(`release sections are not newest-first near ${headings[index].version}`);
    }
  }
  if (headings[0].version !== expectedVersion) {
    fail(`latest release section is ${headings[0].version}; expected ${expectedVersion}`);
  }
  console.log(`Changelog is consistent through ${expectedVersion} (${headings.length} releases).`);
}

function promote(version) {
  if (!version || !semverPattern.test(version)) fail("promote requires an X.Y.Z version");
  const text = readFileSync(changelogPath, "utf8");
  if (releaseHeadings(text).some((heading) => heading.version === version)) {
    check(version);
    return;
  }

  const match = text.match(/^## \[Unreleased\]\n\n([\s\S]*?)(?=^## \[\d+\.\d+\.\d+\] - )/m);
  if (!match || !match[1].trim()) fail("[Unreleased] has no notes to promote");
  const date = new Date().toISOString().slice(0, 10);
  const promoted = text.replace(
    /^## \[Unreleased\]\n\n/m,
    `## [Unreleased]\n\n## [${version}] - ${date}\n\n`,
  );
  writeFileSync(changelogPath, promoted, "utf8");
  check(version);
}

if (action === "check") check(requestedVersion);
else if (action === "promote") promote(requestedVersion);
else fail(`unknown action ${action}; use check or promote`);
