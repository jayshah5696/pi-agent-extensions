import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import * as fs from "node:fs/promises";
import * as path from "node:path";
import * as os from "node:os";

export default function nvidiaNimExtension(pi: ExtensionAPI) {
  const handler = async (args: string | undefined, ctx: ExtensionCommandContext) => {
    if (!ctx.hasUI) {
      console.log("This command requires interactive mode.");
      return;
    }

    let apiKey = await ctx.ui.input("Nvidia NIM Setup", "Enter your Nvidia NIM API Key (nvapi-...)");
    if (!apiKey) {
      ctx.ui.notify("API Key is required", "error");
      return;
    }

    apiKey = apiKey.trim();
    if (!apiKey.startsWith("nvapi-")) {
        ctx.ui.notify("Warning: API Key usually starts with 'nvapi-'", "warning");
    }

    const defaultModel = "meta/llama-3.1-405b-instruct";
    let model = await ctx.ui.input("Nvidia NIM Setup", `Enter default model (default: ${defaultModel})`);

    if (!model) {
      model = defaultModel;
    }
    model = model.trim();

    try {
      await saveNvidiaNimConfig(apiKey, model);
      ctx.ui.notify("Nvidia NIM configured successfully. Use /model to switch.", "success");
    } catch (error) {
      ctx.ui.notify(`Failed to save configuration: ${error instanceof Error ? error.message : String(error)}`, "error");
    }
  };

  pi.registerCommand("nvidia-nim-auth", {
    description: "Configure Nvidia NIM provider",
    handler,
  });

  pi.registerCommand("nvidia-auth", {
    description: "Configure Nvidia NIM provider (alias)",
    handler,
  });
}

async function saveNvidiaNimConfig(apiKey: string, model: string): Promise<void> {
  const homeDir = os.homedir();
  const settingsDir = path.join(homeDir, ".pi");
  const settingsPath = path.join(settingsDir, "settings.json");

  // Ensure directory exists
  try {
    await fs.mkdir(settingsDir, { recursive: true });
  } catch (err) {
    // Ignore if exists
  }

  let settings: any = {};
  try {
    const content = await fs.readFile(settingsPath, "utf-8");
    if (content.trim()) {
        try {
            settings = JSON.parse(content);
        } catch (parseError: any) {
            throw new Error(`Invalid JSON in settings file (${settingsPath}): ${parseError.message}`);
        }
    }
  } catch (err: any) {
    if (err.code !== 'ENOENT') {
        throw err;
    }
    // If ENOENT or empty, start with empty settings
  }

  if (!settings.providers) {
    settings.providers = {};
  }

  settings.providers["nvidia"] = {
    type: "openai",
    baseUrl: "https://integrate.api.nvidia.com/v1",
    apiKey: apiKey,
    models: [model]
  };

  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
}
