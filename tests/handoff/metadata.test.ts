import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { parseGitBranch, parseGitDirty } from "../../extensions/handoff/metadata.js";

describe("parseGitBranch", () => {
  it("parses branch name from git branch output", () => {
    const output = "main";
    const result = parseGitBranch(output, 0);
    assert.equal(result, "main");
  });

  it("trims whitespace from branch name", () => {
    const output = "  feature/handoff  \n";
    const result = parseGitBranch(output, 0);
    assert.equal(result, "feature/handoff");
  });

  it("returns null for empty output", () => {
    const result = parseGitBranch("", 0);
    assert.equal(result, null);
  });

  it("returns null for non-zero exit code", () => {
    const result = parseGitBranch("main", 1);
    assert.equal(result, null);
  });

  it("returns null for undefined exit code (command failed)", () => {
    const result = parseGitBranch("main", undefined);
    assert.equal(result, null);
  });

  it("handles detached HEAD state", () => {
    // In detached HEAD state, git rev-parse --abbrev-ref HEAD returns "HEAD"
    const output = "HEAD";
    const result = parseGitBranch(output, 0);
    assert.equal(result, null); // We treat "HEAD" as no branch
  });

  it("handles branch names with slashes", () => {
    const output = "feature/add-handoff-command";
    const result = parseGitBranch(output, 0);
    assert.equal(result, "feature/add-handoff-command");
  });
});

describe("parseGitDirty", () => {
  it("returns true when there are uncommitted changes", () => {
    const output = " M src/index.ts\n?? newfile.ts";
    const result = parseGitDirty(output, 0);
    assert.equal(result, true);
  });

  it("returns false when working directory is clean", () => {
    const output = "";
    const result = parseGitDirty(output, 0);
    assert.equal(result, false);
  });

  it("returns false for non-zero exit code", () => {
    const output = "error output";
    const result = parseGitDirty(output, 1);
    assert.equal(result, false);
  });

  it("returns false for undefined exit code", () => {
    const result = parseGitDirty("some output", undefined);
    assert.equal(result, false);
  });

  it("handles whitespace-only output as clean", () => {
    const output = "   \n\n  ";
    const result = parseGitDirty(output, 0);
    assert.equal(result, false);
  });

  it("detects staged changes", () => {
    const output = "M  src/index.ts";
    const result = parseGitDirty(output, 0);
    assert.equal(result, true);
  });

  it("detects untracked files", () => {
    const output = "?? newfile.ts";
    const result = parseGitDirty(output, 0);
    assert.equal(result, true);
  });
});
