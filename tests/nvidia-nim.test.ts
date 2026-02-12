import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import nvidiaNimExtension, {
  parseModelLines,
  loadConfig,
  loadConfigSync,
  saveConfig,
  getConfigPath,
  getAgentSettingsPath,
  updateEnabledModels,
  type NvidiaNimConfig,
  type NvidiaModelEntry,
} from "../extensions/nvidia-nim/index.ts";

// --- Unit tests for parseModelLines ---

describe("parseModelLines", () => {
  test("parses simple model IDs", () => {
    const result = parseModelLines("meta/llama-3.1-405b-instruct\nnvidia/nemotron-4-340b-instruct");
    assert.equal(result.length, 2);
    assert.equal(result[0].id, "meta/llama-3.1-405b-instruct");
    assert.equal(result[1].id, "nvidia/nemotron-4-340b-instruct");
  });

  test("ignores comments and blank lines", () => {
    const text = `# This is a comment
meta/llama-3.1-405b-instruct

# Another comment
deepseek-ai/deepseek-r1
`;
    const result = parseModelLines(text);
    assert.equal(result.length, 2);
    assert.equal(result[0].id, "meta/llama-3.1-405b-instruct");
    assert.equal(result[1].id, "deepseek-ai/deepseek-r1");
  });

  test("deduplicates model IDs", () => {
    const text = "meta/llama-3.1-405b-instruct\nmeta/llama-3.1-405b-instruct\nmeta/llama-3.1-405b-instruct";
    const result = parseModelLines(text);
    assert.equal(result.length, 1);
  });

  test("trims whitespace from lines", () => {
    const text = "  meta/llama-3.1-405b-instruct  \n   nvidia/nemotron-4-340b-instruct   ";
    const result = parseModelLines(text);
    assert.equal(result[0].id, "meta/llama-3.1-405b-instruct");
    assert.equal(result[1].id, "nvidia/nemotron-4-340b-instruct");
  });

  test("generates human-readable name from model ID", () => {
    const result = parseModelLines("meta/llama-3.1-405b-instruct");
    assert.equal(result[0].name, "Llama 3.1 405b Instruct");
  });

  test("sets reasoning=true for deepseek-r1", () => {
    const result = parseModelLines("deepseek-ai/deepseek-r1");
    assert.equal(result[0].reasoning, true);
  });

  test("sets reasoning=false for non-reasoning models", () => {
    const result = parseModelLines("meta/llama-3.1-405b-instruct");
    assert.equal(result[0].reasoning, false);
  });

  test("returns empty array for all-comment input", () => {
    const result = parseModelLines("# comment\n# another comment\n");
    assert.equal(result.length, 0);
  });

  test("returns empty array for empty string", () => {
    const result = parseModelLines("");
    assert.equal(result.length, 0);
  });

  test("keeps valid org/model format", () => {
    const result = parseModelLines("nvidia/nemotron-4-340b-instruct\nmoonshotai/kimi-k2.5");
    assert.equal(result.length, 2);
    assert.equal(result[0].id, "nvidia/nemotron-4-340b-instruct");
    assert.equal(result[1].id, "moonshotai/kimi-k2.5");
  });

  test("skips lines with more than one slash", () => {
    const result = parseModelLines("nvidia/moonshotai/kimi-k2.5\nmoonshotai/kimi-k2.5");
    assert.equal(result.length, 1);
    assert.equal(result[0].id, "moonshotai/kimi-k2.5");
  });

  test("skips lines with no slash", () => {
    const result = parseModelLines("just-a-model-name\nmeta/llama-3.1-405b-instruct");
    assert.equal(result.length, 1);
    assert.equal(result[0].id, "meta/llama-3.1-405b-instruct");
  });
});

// --- Config persistence tests ---

describe("config persistence", () => {
  let tempHome: string;
  let originalHome: string | undefined;

  test("saveConfig + loadConfig round-trip", async () => {
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "pi-nim-test-"));
    originalHome = process.env.HOME;
    process.env.HOME = tempHome;

    try {
      const config: NvidiaNimConfig = {
        apiKey: "nvapi-test-key-123",
        models: [
          { id: "meta/llama-3.1-405b-instruct", name: "Llama 3.1 405B Instruct", reasoning: false },
          { id: "deepseek-ai/deepseek-r1", name: "Deepseek R1", reasoning: true },
        ],
      };

      await saveConfig(config);
      const loaded = await loadConfig();

      assert.ok(loaded);
      assert.equal(loaded.apiKey, "nvapi-test-key-123");
      assert.equal(loaded.models.length, 2);
      assert.equal(loaded.models[0].id, "meta/llama-3.1-405b-instruct");
      assert.equal(loaded.models[1].reasoning, true);
    } finally {
      process.env.HOME = originalHome;
      await fs.rm(tempHome, { recursive: true, force: true });
    }
  });

  test("loadConfig returns null when no file exists", async () => {
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "pi-nim-test-"));
    originalHome = process.env.HOME;
    process.env.HOME = tempHome;

    try {
      const loaded = await loadConfig();
      assert.equal(loaded, null);
    } finally {
      process.env.HOME = originalHome;
      await fs.rm(tempHome, { recursive: true, force: true });
    }
  });

  test("loadConfigSync returns saved config", async () => {
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "pi-nim-test-"));
    originalHome = process.env.HOME;
    process.env.HOME = tempHome;

    try {
      const config: NvidiaNimConfig = {
        apiKey: "nvapi-sync-test",
        models: [{ id: "test/model", name: "Test", reasoning: false }],
      };
      await saveConfig(config);

      const loaded = loadConfigSync();
      assert.ok(loaded);
      assert.equal(loaded.apiKey, "nvapi-sync-test");
      assert.equal(loaded.models.length, 1);
    } finally {
      process.env.HOME = originalHome;
      await fs.rm(tempHome, { recursive: true, force: true });
    }
  });

  test("loadConfigSync returns null when no file exists", () => {
    const originalHome = process.env.HOME;
    process.env.HOME = "/tmp/nonexistent-pi-test-dir";
    try {
      const loaded = loadConfigSync();
      assert.equal(loaded, null);
    } finally {
      process.env.HOME = originalHome;
    }
  });

  test("loadConfig returns null for invalid JSON", async () => {
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "pi-nim-test-"));
    originalHome = process.env.HOME;
    process.env.HOME = tempHome;

    try {
      const configPath = path.join(tempHome, ".pi", "nvidia-nim.json");
      await fs.mkdir(path.dirname(configPath), { recursive: true });
      await fs.writeFile(configPath, "{ invalid json", "utf-8");

      const loaded = await loadConfig();
      assert.equal(loaded, null);
    } finally {
      process.env.HOME = originalHome;
      await fs.rm(tempHome, { recursive: true, force: true });
    }
  });
});

// --- updateEnabledModels tests ---

describe("updateEnabledModels", () => {
  let tempHome: string;
  let originalHome: string | undefined;

  async function setup() {
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "pi-nim-test-"));
    originalHome = process.env.HOME;
    process.env.HOME = tempHome;
  }

  async function cleanup() {
    process.env.HOME = originalHome;
    await fs.rm(tempHome, { recursive: true, force: true });
  }

  test("adds nvidia models to empty enabledModels", async () => {
    await setup();
    try {
      // Create settings without enabledModels
      const settingsPath = getAgentSettingsPath();
      await fs.mkdir(path.dirname(settingsPath), { recursive: true });
      await fs.writeFile(settingsPath, JSON.stringify({ defaultModel: "claude" }), "utf-8");

      const models: NvidiaModelEntry[] = [
        { id: "meta/llama-3.1-405b-instruct", name: "Llama", reasoning: false },
      ];
      await updateEnabledModels(models);

      const content = JSON.parse(await fs.readFile(settingsPath, "utf-8"));
      assert.deepEqual(content.enabledModels, ["nvidia/meta/llama-3.1-405b-instruct"]);
      assert.equal(content.defaultModel, "claude", "should preserve other settings");
    } finally {
      await cleanup();
    }
  });

  test("appends nvidia models to existing enabledModels", async () => {
    await setup();
    try {
      const settingsPath = getAgentSettingsPath();
      await fs.mkdir(path.dirname(settingsPath), { recursive: true });
      await fs.writeFile(settingsPath, JSON.stringify({
        enabledModels: ["anthropic/claude-sonnet-4-5", "openai/gpt-4o"],
      }), "utf-8");

      const models: NvidiaModelEntry[] = [
        { id: "meta/llama-3.1-405b-instruct", name: "Llama", reasoning: false },
      ];
      await updateEnabledModels(models);

      const content = JSON.parse(await fs.readFile(settingsPath, "utf-8"));
      assert.deepEqual(content.enabledModels, [
        "anthropic/claude-sonnet-4-5",
        "openai/gpt-4o",
        "nvidia/meta/llama-3.1-405b-instruct",
      ]);
    } finally {
      await cleanup();
    }
  });

  test("replaces old nvidia models with new ones", async () => {
    await setup();
    try {
      const settingsPath = getAgentSettingsPath();
      await fs.mkdir(path.dirname(settingsPath), { recursive: true });
      await fs.writeFile(settingsPath, JSON.stringify({
        enabledModels: [
          "anthropic/claude-sonnet-4-5",
          "nvidia/old-model/removed",
          "nvidia/another-old/model",
          "openai/gpt-4o",
        ],
      }), "utf-8");

      const models: NvidiaModelEntry[] = [
        { id: "meta/llama-3.1-405b-instruct", name: "Llama", reasoning: false },
        { id: "deepseek-ai/deepseek-r1", name: "DeepSeek", reasoning: true },
      ];
      await updateEnabledModels(models);

      const content = JSON.parse(await fs.readFile(settingsPath, "utf-8"));
      assert.deepEqual(content.enabledModels, [
        "anthropic/claude-sonnet-4-5",
        "openai/gpt-4o",
        "nvidia/meta/llama-3.1-405b-instruct",
        "nvidia/deepseek-ai/deepseek-r1",
      ]);
    } finally {
      await cleanup();
    }
  });

  test("creates settings file if it doesn't exist", async () => {
    await setup();
    try {
      const models: NvidiaModelEntry[] = [
        { id: "meta/llama-3.1-405b-instruct", name: "Llama", reasoning: false },
      ];
      await updateEnabledModels(models);

      const content = JSON.parse(await fs.readFile(getAgentSettingsPath(), "utf-8"));
      assert.deepEqual(content.enabledModels, ["nvidia/meta/llama-3.1-405b-instruct"]);
    } finally {
      await cleanup();
    }
  });
});

// --- Command registration + handler integration ---

describe("nvidia-nim extension commands", () => {
  test("registers nvidia-nim-auth, nvidia-auth, and nvidia-nim-models commands", () => {
    const registeredCommands = new Map<string, any>();
    const registeredProviders = new Map<string, any>();

    const mockPi: any = {
      registerCommand: (name: string, opts: any) => registeredCommands.set(name, opts),
      registerProvider: (name: string, config: any) => registeredProviders.set(name, config),
    };

    nvidiaNimExtension(mockPi);

    assert.ok(registeredCommands.has("nvidia-nim-auth"), "should register nvidia-nim-auth");
    assert.ok(registeredCommands.has("nvidia-auth"), "should register nvidia-auth alias");
    assert.ok(registeredCommands.has("nvidia-nim-models"), "should register nvidia-nim-models");
  });

  test("auth handler saves config and calls registerProvider", async () => {
    const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "pi-nim-test-"));
    const originalHome = process.env.HOME;
    process.env.HOME = tempHome;

    try {
      const registeredCommands = new Map<string, any>();
      let providerConfig: any = null;

      const mockPi: any = {
        registerCommand: (name: string, opts: any) => registeredCommands.set(name, opts),
        registerProvider: (name: string, config: any) => { providerConfig = { name, config }; },
      };

      nvidiaNimExtension(mockPi);

      const handler = registeredCommands.get("nvidia-nim-auth").handler;

      let inputCallCount = 0;
      const mockCtx: any = {
        hasUI: true,
        ui: {
          input: async (title: string, placeholder: string) => {
            inputCallCount++;
            // First call is API key
            return "nvapi-test-key-456";
          },
          editor: async (title: string, prefill: string) => {
            // Return model lines
            return "meta/llama-3.1-405b-instruct\ndeepseek-ai/deepseek-r1\n";
          },
          notify: (message: string, type: string) => {},
          confirm: async () => true,
        },
      };

      await handler(undefined, mockCtx);

      // Verify config was saved
      const configPath = path.join(tempHome, ".pi", "nvidia-nim.json");
      const content = await fs.readFile(configPath, "utf-8");
      const saved = JSON.parse(content);
      assert.equal(saved.apiKey, "nvapi-test-key-456");
      assert.equal(saved.models.length, 2);

      // Verify registerProvider was called
      assert.ok(providerConfig, "registerProvider should have been called");
      assert.equal(providerConfig.name, "nvidia");
      assert.equal(providerConfig.config.baseUrl, "https://integrate.api.nvidia.com/v1");
      assert.equal(providerConfig.config.api, "openai-completions");
      assert.equal(providerConfig.config.models.length, 2);
      assert.equal(providerConfig.config.models[0].id, "meta/llama-3.1-405b-instruct");
      assert.equal(providerConfig.config.models[1].id, "deepseek-ai/deepseek-r1");
      assert.equal(providerConfig.config.models[1].reasoning, true);
    } finally {
      process.env.HOME = originalHome;
      await fs.rm(tempHome, { recursive: true, force: true });
    }
  });

  test("models handler requires existing config", async () => {
    const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "pi-nim-test-"));
    const originalHome = process.env.HOME;
    process.env.HOME = tempHome;

    try {
      const registeredCommands = new Map<string, any>();

      const mockPi: any = {
        registerCommand: (name: string, opts: any) => registeredCommands.set(name, opts),
        registerProvider: () => {},
      };

      nvidiaNimExtension(mockPi);

      const handler = registeredCommands.get("nvidia-nim-models").handler;
      let notifyType = "";
      let notifyMsg = "";

      const mockCtx: any = {
        hasUI: true,
        ui: {
          notify: (message: string, type: string) => { notifyMsg = message; notifyType = type; },
        },
      };

      await handler(undefined, mockCtx);

      assert.equal(notifyType, "error");
      assert.ok(notifyMsg.includes("/nvidia-nim-auth"), "should tell user to run auth first");
    } finally {
      process.env.HOME = originalHome;
      await fs.rm(tempHome, { recursive: true, force: true });
    }
  });

  test("auth handler keeps existing key on empty input", async () => {
    const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "pi-nim-test-"));
    const originalHome = process.env.HOME;
    process.env.HOME = tempHome;

    try {
      // Pre-save a config
      const configDir = path.join(tempHome, ".pi");
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(
        path.join(configDir, "nvidia-nim.json"),
        JSON.stringify({ apiKey: "nvapi-existing-key", models: [{ id: "old/model", name: "Old Model", reasoning: false }] }),
      );

      const registeredCommands = new Map<string, any>();
      let savedApiKey = "";

      const mockPi: any = {
        registerCommand: (name: string, opts: any) => registeredCommands.set(name, opts),
        registerProvider: (name: string, config: any) => { savedApiKey = config.apiKey; },
      };

      nvidiaNimExtension(mockPi);

      const handler = registeredCommands.get("nvidia-nim-auth").handler;

      const mockCtx: any = {
        hasUI: true,
        ui: {
          input: async () => "",  // empty input → keep existing
          editor: async () => "new/model\n",
          notify: () => {},
          confirm: async () => true,
        },
      };

      await handler(undefined, mockCtx);

      assert.equal(savedApiKey, "nvapi-existing-key", "should keep existing API key");
    } finally {
      process.env.HOME = originalHome;
      await fs.rm(tempHome, { recursive: true, force: true });
    }
  });
});
