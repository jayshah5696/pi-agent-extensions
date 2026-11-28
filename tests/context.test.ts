import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { getCommandSourcePath } from "../extensions/context/index.js";

describe("context getCommandSourcePath", () => {
  it("prefers sourceInfo.path (current Pi)", () => {
    assert.equal(
      getCommandSourcePath({ sourceInfo: { path: "/ext/a.ts" }, path: "/legacy/b.ts" }),
      "/ext/a.ts",
    );
  });

  it("falls back to legacy top-level path", () => {
    assert.equal(getCommandSourcePath({ path: "/legacy/b.ts" }), "/legacy/b.ts");
  });

  it("returns undefined when no provenance is present", () => {
    assert.equal(getCommandSourcePath({}), undefined);
  });
});
