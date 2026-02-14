import { test, describe } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import nvidiaNimExtension, {
  parseModelLines,
  loadModelsConfig,
  loadModelsConfigSync,
  saveModelsConfig,
  getConfigPath,
  type NvidiaModelsConfig,
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

// --- Models config persistence tests ---

describe("models config persistence", () => {
  let tempHome: string;
  let originalHome: string | undefined;

  test("saveModelsConfig + loadModelsConfig round-trip", async () => {
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "pi-nim-test-"));
    originalHome = process.env.HOME;
    process.env.HOME = tempHome;

    try {
      const config: NvidiaModelsConfig = {
        models: [
          { id: "meta/llama-3.1-405b-instruct", name: "Llama 3.1 405B Instruct", reasoning: false },
          { id: "deepseek-ai/deepseek-r1", name: "Deepseek R1", reasoning: true },
        ],
      };

      await saveModelsConfig(config);
      const loaded = await loadModelsConfig();

      assert.ok(loaded);
      assert.equal(loaded.models.length, 2);
      assert.equal(loaded.models[0].id, "meta/llama-3.1-405b-instruct");
      assert.equal(loaded.models[1].reasoning, true);
    } finally {
      process.env.HOME = originalHome;
      await fs.rm(tempHome, { recursive: true, force: true });
    }
  });

  test("loadModelsConfig returns null when no file exists", async () => {
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "pi-nim-test-"));
    originalHome = process.env.HOME;
    process.env.HOME = tempHome;

    try {
      const loaded = await loadModelsConfig();
      assert.equal(loaded, null);
    } finally {
      process.env.HOME = originalHome;
      await fs.rm(tempHome, { recursive: true, force: true });
    }
  });

  test("loadModelsConfigSync returns saved config", async () => {
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "pi-nim-test-"));
    originalHome = process.env.HOME;
    process.env.HOME = tempHome;

    try {
      const config: NvidiaModelsConfig = {
        models: [{ id: "test/model", name: "Test", reasoning: false }],
      };
      await saveModelsConfig(config);

      const loaded = loadModelsConfigSync();
      assert.ok(loaded);
      assert.equal(loaded.models.length, 1);
    } finally {
      process.env.HOME = originalHome;
      await fs.rm(tempHome, { recursive: true, force: true });
    }
  });

  test("loadModelsConfigSync returns null when no file exists", () => {
    const originalHome = process.env.HOME;
    process.env.HOME = "/tmp/nonexistent-pi-test-dir";
    try {
      const loaded = loadModelsConfigSync();
      assert.equal(loaded, null);
    } finally {
      process.env.HOME = originalHome;
    }
  });

  test("loadModelsConfig returns null for invalid JSON", async () => {
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "pi-nim-test-"));
    originalHome = process.env.HOME;
    process.env.HOME = tempHome;

    try {
      const configPath = path.join(tempHome, ".pi", "nvidia-nim.json");
      await fs.mkdir(path.dirname(configPath), { recursive: true });
      await fs.writeFile(configPath, "{ invalid json", "utf-8");

      const loaded = await loadModelsConfig();
      assert.equal(loaded, null);
    } finally {
      process.env.HOME = originalHome;
      await fs.rm(tempHome, { recursive: true, force: true });
    }
  });

  test("loadModelsConfig handles legacy format with apiKey", async () => {
    tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "pi-nim-test-"));
    originalHome = process.env.HOME;
    process.env.HOME = tempHome;

    try {
      // Write legacy format (with apiKey field)
      const configPath = path.join(tempHome, ".pi", "nvidia-nim.json");
      await fs.mkdir(path.dirname(configPath), { recursive: true });
      await fs.writeFile(
        configPath,
        JSON.stringify({
          apiKey: "nvapi-old-key",
          models: [{ id: "meta/llama-3.1-405b-instruct", name: "Llama", reasoning: false }],
        }),
        "utf-8",
      );

      const loaded = await loadModelsConfig();
      assert.ok(loaded, "should load legacy config");
      assert.equal(loaded.models.length, 1);
      assert.equal(loaded.models[0].id, "meta/llama-3.1-405b-instruct");
      // apiKey should NOT be in the returned config
      assert.equal((loaded as any).apiKey, undefined);
    } finally {
      process.env.HOME = originalHome;
      await fs.rm(tempHome, { recursive: true, force: true });
    }
  });
});

// --- Provider registration + OAuth ---

describe("nvidia-nim provider registration", () => {
  test("registers provider with OAuth and models on init", () => {
    const registeredProviders = new Map<string, any>();
    const registeredCommands = new Map<string, any>();

    const mockPi: any = {
      registerCommand: (name: string, opts: any) => registeredCommands.set(name, opts),
      registerProvider: (name: string, config: any) => registeredProviders.set(name, config),
    };

    nvidiaNimExtension(mockPi);

    // Provider should always be registered (for /login nvidia)
    assert.ok(registeredProviders.has("nvidia"), "should register nvidia provider");

    const config = registeredProviders.get("nvidia");
    assert.equal(config.baseUrl, "https://integrate.api.nvidia.com/v1");
    assert.equal(config.api, "openai-completions");
    assert.ok(config.oauth, "should include OAuth config");
    assert.equal(config.oauth.name, "Nvidia NIM");
    assert.equal(typeof config.oauth.login, "function");
    assert.equal(typeof config.oauth.refreshToken, "function");
    assert.equal(typeof config.oauth.getApiKey, "function");
  });

  test("registers nvidia-nim-models command (no auth commands)", () => {
    const registeredCommands = new Map<string, any>();

    const mockPi: any = {
      registerCommand: (name: string, opts: any) => registeredCommands.set(name, opts),
      registerProvider: () => {},
    };

    nvidiaNimExtension(mockPi);

    assert.ok(registeredCommands.has("nvidia-nim-models"), "should register nvidia-nim-models");
    assert.ok(!registeredCommands.has("nvidia-nim-auth"), "should NOT register nvidia-nim-auth");
    assert.ok(!registeredCommands.has("nvidia-auth"), "should NOT register nvidia-auth alias");
  });

  test("OAuth getApiKey returns access token", () => {
    let oauthConfig: any = null;

    const mockPi: any = {
      registerCommand: () => {},
      registerProvider: (_name: string, config: any) => { oauthConfig = config.oauth; },
    };

    nvidiaNimExtension(mockPi);

    const credentials = { access: "nvapi-test-key", refresh: "nvapi-test-key", expires: Date.now() + 1000 };
    assert.equal(oauthConfig.getApiKey(credentials), "nvapi-test-key");
  });

  test("OAuth refreshToken extends expiry without changing key", async () => {
    let oauthConfig: any = null;

    const mockPi: any = {
      registerCommand: () => {},
      registerProvider: (_name: string, config: any) => { oauthConfig = config.oauth; },
    };

    nvidiaNimExtension(mockPi);

    const now = Date.now();
    const credentials = { access: "nvapi-test-key", refresh: "nvapi-test-key", expires: now };
    const refreshed = await oauthConfig.refreshToken(credentials);

    assert.equal(refreshed.access, "nvapi-test-key");
    assert.equal(refreshed.refresh, "nvapi-test-key");
    assert.ok(refreshed.expires > now, "expiry should be extended");
  });

  test("OAuth login rejects empty API key", async () => {
    let oauthConfig: any = null;

    const mockPi: any = {
      registerCommand: () => {},
      registerProvider: (_name: string, config: any) => { oauthConfig = config.oauth; },
    };

    nvidiaNimExtension(mockPi);

    const mockCallbacks: any = {
      onPrompt: async () => "",
      onAuth: () => {},
    };

    await assert.rejects(
      () => oauthConfig.login(mockCallbacks),
      (err: Error) => err.message.includes("API key is required"),
    );
  });
});

// --- /nvidia-nim-models command ---

describe("nvidia-nim-models command", () => {
  test("models handler saves config and re-registers provider", async () => {
    const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "pi-nim-test-"));
    const originalHome = process.env.HOME;
    process.env.HOME = tempHome;

    try {
      const registeredCommands = new Map<string, any>();
      const providerCalls: any[] = [];

      const mockPi: any = {
        registerCommand: (name: string, opts: any) => registeredCommands.set(name, opts),
        registerProvider: (name: string, config: any) => providerCalls.push({ name, config }),
      };

      nvidiaNimExtension(mockPi);

      const handler = registeredCommands.get("nvidia-nim-models").handler;

      const mockCtx: any = {
        hasUI: true,
        ui: {
          editor: async () => "meta/llama-3.1-405b-instruct\ndeepseek-ai/deepseek-r1\n",
          notify: () => {},
        },
      };

      await handler(undefined, mockCtx);

      // Verify models config was saved (without apiKey)
      const configPath = path.join(tempHome, ".pi", "nvidia-nim.json");
      const content = await fs.readFile(configPath, "utf-8");
      const saved = JSON.parse(content);
      assert.equal((saved as any).apiKey, undefined, "should not save apiKey in config");
      assert.equal(saved.models.length, 2);

      // Verify provider was re-registered (last call is from the handler)
      const lastCall = providerCalls[providerCalls.length - 1];
      assert.equal(lastCall.name, "nvidia");
      assert.equal(lastCall.config.models.length, 2);
      assert.equal(lastCall.config.models[0].id, "meta/llama-3.1-405b-instruct");
      assert.equal(lastCall.config.models[1].id, "deepseek-ai/deepseek-r1");
      assert.ok(lastCall.config.oauth, "should preserve OAuth config on re-register");
    } finally {
      process.env.HOME = originalHome;
      await fs.rm(tempHome, { recursive: true, force: true });
    }
  });

  test("models handler uses default model when no existing config", async () => {
    const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "pi-nim-test-"));
    const originalHome = process.env.HOME;
    process.env.HOME = tempHome;

    try {
      const registeredCommands = new Map<string, any>();
      let editorPrefill = "";

      const mockPi: any = {
        registerCommand: (name: string, opts: any) => registeredCommands.set(name, opts),
        registerProvider: () => {},
      };

      nvidiaNimExtension(mockPi);

      const handler = registeredCommands.get("nvidia-nim-models").handler;

      const mockCtx: any = {
        hasUI: true,
        ui: {
          editor: async (_title: string, prefill: string) => {
            editorPrefill = prefill;
            return "meta/llama-3.1-405b-instruct\n";
          },
          notify: () => {},
        },
      };

      await handler(undefined, mockCtx);

      assert.ok(
        editorPrefill.includes("meta/llama-3.1-405b-instruct"),
        "should prefill with default model when no existing config",
      );
    } finally {
      process.env.HOME = originalHome;
      await fs.rm(tempHome, { recursive: true, force: true });
    }
  });

  test("models handler does nothing when editor is cancelled", async () => {
    const registeredCommands = new Map<string, any>();
    let notifyMsg = "";

    const mockPi: any = {
      registerCommand: (name: string, opts: any) => registeredCommands.set(name, opts),
      registerProvider: () => {},
    };

    nvidiaNimExtension(mockPi);

    const handler = registeredCommands.get("nvidia-nim-models").handler;

    const mockCtx: any = {
      hasUI: true,
      ui: {
        editor: async () => "",
        notify: (msg: string) => { notifyMsg = msg; },
      },
    };

    await handler(undefined, mockCtx);

    assert.ok(notifyMsg.includes("Cancelled"), "should notify cancellation");
  });

  test("models handler requires interactive mode", async () => {
    const registeredCommands = new Map<string, any>();

    const mockPi: any = {
      registerCommand: (name: string, opts: any) => registeredCommands.set(name, opts),
      registerProvider: () => {},
    };

    nvidiaNimExtension(mockPi);

    const handler = registeredCommands.get("nvidia-nim-models").handler;

    const mockCtx: any = {
      hasUI: false,
    };

    // Should return without error (prints to console)
    await handler(undefined, mockCtx);
  });
});
