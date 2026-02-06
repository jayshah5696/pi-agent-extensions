import assert from "node:assert/strict";
import { describe, it, beforeEach, afterEach } from "node:test";
import { mkdirSync, writeFileSync, rmSync, existsSync } from "node:fs";
import { join } from "node:path";
import { mergeConfig, validateGoal, readSettingsFile, loadConfig } from "../../extensions/handoff/config.js";
import { DEFAULT_CONFIG } from "../../extensions/handoff/types.js";

// Test directory for settings file tests
const TEST_DIR = join(process.cwd(), "test-tmp-config");

describe("mergeConfig", () => {
  it("returns default config when no overrides", () => {
    const config = mergeConfig({});
    assert.deepEqual(config, DEFAULT_CONFIG);
  });

  it("returns default config when undefined", () => {
    const config = mergeConfig(undefined);
    assert.deepEqual(config, DEFAULT_CONFIG);
  });

  it("merges partial overrides with defaults", () => {
    const config = mergeConfig({ maxFiles: 10, includeMetadata: false });
    assert.equal(config.maxFiles, 10);
    assert.equal(config.includeMetadata, false);
    // Rest should be defaults
    assert.equal(config.maxCommands, DEFAULT_CONFIG.maxCommands);
    assert.equal(config.includeSkill, DEFAULT_CONFIG.includeSkill);
  });

  it("allows custom model override", () => {
    const config = mergeConfig({ model: "anthropic/claude-3-haiku" });
    assert.equal(config.model, "anthropic/claude-3-haiku");
    assert.equal(config.useCurrentModel, true); // unchanged
  });

  it("handles all config options", () => {
    const fullOverride = {
      maxFiles: 5,
      maxCommands: 3,
      maxInformationItems: 6,
      maxDecisionItems: 4,
      maxOpenQuestions: 2,
      minGoalLength: 20,
      includeMetadata: false,
      includeSkill: false,
      includeFileReasons: false,
      includeHandoffPreamble: false,
      useCurrentModel: false,
      model: "google/gemini-2.0-flash",
      showProgressPhases: false,
      validateFiles: false,
    };
    const config = mergeConfig(fullOverride);
    assert.deepEqual(config, fullOverride);
  });

  it("handles showProgressPhases option", () => {
    const config = mergeConfig({ showProgressPhases: false });
    assert.equal(config.showProgressPhases, false);
  });

  it("ignores unknown properties", () => {
    const config = mergeConfig({
      maxFiles: 15,
      unknownProp: "ignored",
    } as any);
    assert.equal(config.maxFiles, 15);
    assert.ok(!("unknownProp" in config));
  });
});

describe("validateGoal", () => {
  it("returns valid for goal meeting minimum length", () => {
    const result = validateGoal("implement the feature", 12);
    assert.ok(result.valid);
    assert.equal(result.error, undefined);
  });

  it("returns valid for goal exactly at minimum length", () => {
    const result = validateGoal("twelve chars", 12); // exactly 12 chars
    assert.ok(result.valid);
  });

  it("returns invalid for empty goal", () => {
    const result = validateGoal("", 12);
    assert.ok(!result.valid);
    assert.ok(result.error);
    assert.ok(result.error.includes("required"));
  });

  it("returns invalid for whitespace-only goal", () => {
    const result = validateGoal("   ", 12);
    assert.ok(!result.valid);
    assert.ok(result.error);
  });

  it("returns invalid for goal too short", () => {
    const result = validateGoal("fix bug", 12);
    assert.ok(!result.valid);
    assert.ok(result.error);
    assert.ok(result.error.includes("specific"));
  });

  it("returns invalid for vague goals", () => {
    // Common vague goals that should be rejected
    const vagueGoals = ["continue", "keep going", "more", "next", "proceed"];
    for (const goal of vagueGoals) {
      const result = validateGoal(goal, 5); // Pass length check
      assert.ok(!result.valid, `"${goal}" should be rejected as vague`);
      assert.ok(result.error);
    }
  });

  it("returns valid for specific goals", () => {
    const specificGoals = [
      "implement team-level handoff",
      "add unit tests for parser module",
      "fix the authentication bug in login flow",
      "refactor database connection pooling",
    ];
    for (const goal of specificGoals) {
      const result = validateGoal(goal, 12);
      assert.ok(result.valid, `"${goal}" should be accepted`);
    }
  });

  it("trims goal before validation", () => {
    const result = validateGoal("  implement feature  ", 12);
    assert.ok(result.valid);
  });

  it("returns guidance message for short goals", () => {
    const result = validateGoal("fix", 12);
    assert.ok(!result.valid);
    assert.ok(result.error);
    assert.ok(
      result.error.includes("specific") || result.error.includes("accomplish"),
    );
  });
});

describe("readSettingsFile", () => {
  beforeEach(() => {
    // Clean up test directory
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    // Clean up
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  it("returns undefined when .pi/settings.json does not exist", () => {
    const result = readSettingsFile(TEST_DIR);
    assert.equal(result, undefined);
  });

  it("returns undefined when settings.json has no handoff key", () => {
    mkdirSync(join(TEST_DIR, ".pi"), { recursive: true });
    writeFileSync(
      join(TEST_DIR, ".pi", "settings.json"),
      JSON.stringify({ someOtherKey: "value" }),
    );
    const result = readSettingsFile(TEST_DIR);
    assert.equal(result, undefined);
  });

  it("returns handoff config when present", () => {
    mkdirSync(join(TEST_DIR, ".pi"), { recursive: true });
    writeFileSync(
      join(TEST_DIR, ".pi", "settings.json"),
      JSON.stringify({
        handoff: {
          maxFiles: 15,
          model: "anthropic/claude-3-haiku",
        },
      }),
    );
    const result = readSettingsFile(TEST_DIR);
    assert.ok(result);
    assert.equal(result.maxFiles, 15);
    assert.equal(result.model, "anthropic/claude-3-haiku");
  });

  it("returns undefined for invalid JSON", () => {
    mkdirSync(join(TEST_DIR, ".pi"), { recursive: true });
    writeFileSync(join(TEST_DIR, ".pi", "settings.json"), "not valid json{");
    const result = readSettingsFile(TEST_DIR);
    assert.equal(result, undefined);
  });

  it("handles empty handoff object", () => {
    mkdirSync(join(TEST_DIR, ".pi"), { recursive: true });
    writeFileSync(
      join(TEST_DIR, ".pi", "settings.json"),
      JSON.stringify({ handoff: {} }),
    );
    const result = readSettingsFile(TEST_DIR);
    assert.ok(result);
    assert.deepEqual(result, {});
  });
});

describe("loadConfig", () => {
  beforeEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
    mkdirSync(TEST_DIR, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(TEST_DIR)) {
      rmSync(TEST_DIR, { recursive: true });
    }
  });

  it("returns defaults when no settings file", () => {
    const config = loadConfig(TEST_DIR);
    assert.deepEqual(config, DEFAULT_CONFIG);
  });

  it("merges settings file with defaults", () => {
    mkdirSync(join(TEST_DIR, ".pi"), { recursive: true });
    writeFileSync(
      join(TEST_DIR, ".pi", "settings.json"),
      JSON.stringify({
        handoff: {
          maxFiles: 10,
          useCurrentModel: false,
          model: "google/gemini-2.0-flash",
          showProgressPhases: false,
        },
      }),
    );
    const config = loadConfig(TEST_DIR);
    assert.equal(config.maxFiles, 10);
    assert.equal(config.useCurrentModel, false);
    assert.equal(config.model, "google/gemini-2.0-flash");
    assert.equal(config.showProgressPhases, false);
    // Defaults for non-overridden
    assert.equal(config.maxCommands, DEFAULT_CONFIG.maxCommands);
    assert.equal(config.includeMetadata, DEFAULT_CONFIG.includeMetadata);
  });
});
