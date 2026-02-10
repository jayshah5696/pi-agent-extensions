import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import os from "node:os";
import nvidiaNimExtension from "../extensions/nvidia-nim/index.ts";

test("nvidia-nim-auth command creates settings.json correctly", async (t) => {
  // Setup temp home
  const tempHome = await fs.mkdtemp(path.join(os.tmpdir(), "pi-test-"));
  const originalHome = process.env.HOME;
  process.env.HOME = tempHome;

  try {
    // Mock ExtensionAPI
    const registeredCommands = new Map<string, any>();

    const mockPi: any = {
      registerCommand: (command: string, options: any) => {
        registeredCommands.set(command, options);
      },
    };

    // Initialize extension
    nvidiaNimExtension(mockPi);

    assert.ok(registeredCommands.has("nvidia-nim-auth"));
    assert.ok(registeredCommands.has("nvidia-auth"));

    const handler = registeredCommands.get("nvidia-nim-auth").handler;

    // Mock Context
    const mockCtx: any = {
      hasUI: true,
      ui: {
        input: async (title: string, prompt: string) => {
          if (prompt.includes("API Key")) return "nvapi-test-key";
          if (prompt.includes("default model")) return "meta/llama-3.1-405b-instruct";
          return "";
        },
        notify: (message: string, type: string) => {
          // console.log(`Notify: ${type} - ${message}`);
        },
      },
    };

    // Execute handler
    await handler(undefined, mockCtx);

    // Verify file creation
    const settingsPath = path.join(tempHome, ".pi", "settings.json");
    const content = await fs.readFile(settingsPath, "utf-8");
    const settings = JSON.parse(content);

    assert.ok(settings.providers);
    assert.ok(settings.providers.nvidia);
    assert.equal(settings.providers.nvidia.type, "openai");
    assert.equal(settings.providers.nvidia.baseUrl, "https://integrate.api.nvidia.com/v1");
    assert.equal(settings.providers.nvidia.apiKey, "nvapi-test-key");
    assert.deepEqual(settings.providers.nvidia.models, ["meta/llama-3.1-405b-instruct"]);

    // Test corrupted file handling
    await fs.writeFile(settingsPath, "{ invalid json", "utf-8");

    // We expect the handler to fail (notify error) when file is corrupted
    let errorNotified = "";
    mockCtx.ui.notify = (message: string, type: string) => {
        if (type === "error") errorNotified = message;
    };

    await handler(undefined, mockCtx);
    assert.ok(errorNotified.includes("Invalid JSON"), "Should notify about invalid JSON");

  } finally {
    // Cleanup
    process.env.HOME = originalHome;
    await fs.rm(tempHome, { recursive: true, force: true });
  }
});
