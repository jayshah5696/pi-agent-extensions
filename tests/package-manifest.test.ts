import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, it } from "node:test";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8")) as {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
};

/**
 * Packages Pi supplies to extensions through its virtual module mapping. Listing
 * one in `dependencies` makes Pi install a duplicate physical copy that can
 * bypass that mapping, so Pi reports an extension warning. See
 * `docs/packages.md` in the Pi coding agent.
 */
const HOST_PROVIDED_PACKAGES = [
  "@earendil-works/pi-agent-core",
  "@earendil-works/pi-ai",
  "@earendil-works/pi-coding-agent",
  "@earendil-works/pi-tui",
  "@sinclair/typebox",
  "typebox",
];

const LEGACY_TYPEBOX_IMPORT = /["']@sinclair\/typebox(?:\/[^"']*)?["']/;
const SELF = relative(root, fileURLToPath(import.meta.url));

function collectTypeScriptFiles(dir: string): string[] {
  const files: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...collectTypeScriptFiles(fullPath));
    } else if (entry.name.endsWith(".ts")) {
      files.push(fullPath);
    }
  }
  return files;
}

describe("package manifest host dependencies", () => {
  it("declares no host-provided package as a runtime dependency", () => {
    for (const name of HOST_PROVIDED_PACKAGES) {
      assert.equal(
        manifest.dependencies?.[name],
        undefined,
        `${name} must be declared in peerDependencies, not dependencies`,
      );
    }
  });

  it("declares TypeBox as a wildcard peer dependency", () => {
    assert.equal(manifest.peerDependencies?.typebox, "*");
  });

  it("imports TypeBox through the host-provided `typebox` package only", () => {
    const offenders = [
      ...collectTypeScriptFiles(join(root, "extensions")),
      ...collectTypeScriptFiles(join(root, "tests")),
    ]
      .filter((file) => relative(root, file) !== SELF)
      .filter((file) => LEGACY_TYPEBOX_IMPORT.test(readFileSync(file, "utf8")))
      .map((file) => relative(root, file));

    assert.deepEqual(offenders, [], `legacy @sinclair/typebox imports found: ${offenders.join(", ")}`);
  });
});
