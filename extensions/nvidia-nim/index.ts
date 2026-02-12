import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

/** Persisted config shape */
export interface NvidiaNimConfig {
  apiKey: string;
  models: NvidiaModelEntry[];
}

export interface NvidiaModelEntry {
  id: string;
  name: string;
  reasoning: boolean;
}

const NVIDIA_BASE_URL = "https://integrate.api.nvidia.com/v1";
const NVIDIA_PROVIDER_NAME = "nvidia";
const MODEL_EDITOR_TEMPLATE = `# Nvidia NIM Models — one model ID per line
# Lines starting with # are ignored.
#
# Browse available models at: https://build.nvidia.com/models
#
# Examples:
#   meta/llama-3.1-405b-instruct
#   nvidia/llama-3.1-nemotron-70b-instruct
#   deepseek-ai/deepseek-r1
#   google/gemma-2-27b-it
#   mistralai/mixtral-8x22b-instruct-v0.1
#   qwen/qwen2.5-72b-instruct
`;

export function getConfigPath(): string {
  return path.join(os.homedir(), ".pi", "nvidia-nim.json");
}

export async function loadConfig(): Promise<NvidiaNimConfig | null> {
  try {
    const content = await fs.readFile(getConfigPath(), "utf-8");
    const parsed = JSON.parse(content);
    if (parsed.apiKey && Array.isArray(parsed.models)) {
      return parsed as NvidiaNimConfig;
    }
    return null;
  } catch {
    return null;
  }
}

/** Synchronous version for use during extension init (before Pi finishes loading) */
export function loadConfigSync(): NvidiaNimConfig | null {
  try {
    const content = fsSync.readFileSync(getConfigPath(), "utf-8");
    const parsed = JSON.parse(content);
    if (parsed.apiKey && Array.isArray(parsed.models)) {
      return parsed as NvidiaNimConfig;
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveConfig(config: NvidiaNimConfig): Promise<void> {
  const configPath = getConfigPath();
  await fs.mkdir(path.dirname(configPath), { recursive: true });
  await fs.writeFile(configPath, JSON.stringify(config, null, 2), "utf-8");
}

/** Parse model IDs from editor text, ignoring comments and blank lines.
 *  Model IDs must be in "org/model" format (exactly one "/").
 *  Lines with more than one "/" are skipped (e.g. "nvidia/moonshotai/kimi-k2.5" is invalid). */
export function parseModelLines(text: string): NvidiaModelEntry[] {
  const seen = new Set<string>();
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"))
    .filter((line) => (line.match(/\//g) || []).length === 1)
    .reduce<NvidiaModelEntry[]>((acc, id) => {
      if (!seen.has(id)) {
        seen.add(id);
        acc.push({
          id,
          name: formatModelName(id),
          reasoning: /deepseek-r1|reasoning/i.test(id),
        });
      }
      return acc;
    }, []);
}

/** Turn "meta/llama-3.1-405b-instruct" → "Llama 3.1 405B Instruct" */
function formatModelName(id: string): string {
  const base = id.includes("/") ? id.split("/").pop()! : id;
  return base
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Get the path to ~/.pi/agent/settings.json */
export function getAgentSettingsPath(): string {
  return path.join(os.homedir(), ".pi", "agent", "settings.json");
}

/**
 * Add nvidia model IDs to enabledModels in ~/.pi/agent/settings.json
 * so they show up in the scoped /model view and Ctrl+P cycling.
 * Removes any stale nvidia/ entries first, then appends the new ones.
 */
export async function updateEnabledModels(models: NvidiaModelEntry[]): Promise<void> {
  const settingsPath = getAgentSettingsPath();

  let settings: Record<string, any> = {};
  try {
    const content = await fs.readFile(settingsPath, "utf-8");
    if (content.trim()) {
      settings = JSON.parse(content);
    }
  } catch (err: any) {
    if (err.code !== "ENOENT") throw err;
  }

  const existing: string[] = Array.isArray(settings.enabledModels) ? settings.enabledModels : [];

  // Remove old nvidia/ entries
  const filtered = existing.filter((id: string) => !id.startsWith(`${NVIDIA_PROVIDER_NAME}/`));

  // Add new nvidia models with provider prefix
  const nvidiaIds = models.map((m) => `${NVIDIA_PROVIDER_NAME}/${m.id}`);
  settings.enabledModels = [...filtered, ...nvidiaIds];

  await fs.mkdir(path.dirname(settingsPath), { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify(settings, null, 2), "utf-8");
}

/**
 * Fetch available model IDs from the Nvidia NIM API.
 * Returns the set of valid model IDs, or null on failure.
 */
export async function fetchAvailableModels(apiKey: string): Promise<Set<string> | null> {
  try {
    const res = await fetch(`${NVIDIA_BASE_URL}/models`, {
      headers: { Authorization: `Bearer ${apiKey}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { data?: { id: string }[] };
    if (!data.data) return null;
    return new Set(data.data.map((m) => m.id));
  } catch {
    return null;
  }
}

/** Register the nvidia provider with pi so models appear in /model */
export function registerProvider(pi: ExtensionAPI, config: NvidiaNimConfig): void {
  pi.registerProvider("nvidia", {
    baseUrl: NVIDIA_BASE_URL,
    apiKey: config.apiKey,
    api: "openai-completions",
    models: config.models.map((m) => ({
      id: m.id,
      name: m.name,
      reasoning: m.reasoning,
      input: ["text"] as ("text" | "image")[],
      cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
      contextWindow: 128000,
      maxTokens: 16384,
    })),
  });
}

export default function nvidiaNimExtension(pi: ExtensionAPI) {
  // Register synchronously at init so models are available before Pi finishes loading
  const savedConfig = loadConfigSync();
  if (savedConfig && savedConfig.models.length > 0) {
    registerProvider(pi, savedConfig);
  }

  // --- /nvidia-nim-auth: full setup (API key + models) ---
  const authHandler = async (args: string | undefined, ctx: ExtensionCommandContext) => {
    if (!ctx.hasUI) {
      console.log("This command requires interactive mode.");
      return;
    }

    const existing = await loadConfig();

    // Step 1: API Key
    let apiKey = await ctx.ui.input(
      "Nvidia NIM — Enter API Key",
      existing ? "(current key saved — paste new key or press Enter to keep)" : "Paste your nvapi-... key from build.nvidia.com",
    );

    if (!apiKey?.trim() && existing?.apiKey) {
      apiKey = existing.apiKey;
    } else if (!apiKey?.trim()) {
      ctx.ui.notify("Setup cancelled — API key is required.", "error");
      return;
    }

    apiKey = apiKey.trim();
    if (!apiKey.startsWith("nvapi-")) {
      const proceed = await ctx.ui.confirm(
        "Nvidia NIM — API Key Warning",
        `Key doesn't start with "nvapi-". Nvidia NIM keys usually do.\n\nContinue anyway?`,
      );
      if (!proceed) return;
    }

    // Step 2: Models via multi-line editor
    const existingModelIds = existing?.models.map((m) => m.id).join("\n") ?? "";
    const prefill = MODEL_EDITOR_TEMPLATE + "\n" + (existingModelIds || "meta/llama-3.1-405b-instruct") + "\n";

    const modelText = await ctx.ui.editor("Nvidia NIM — Edit Models (one per line)", prefill);

    if (!modelText?.trim()) {
      ctx.ui.notify("Setup cancelled — at least one model is required.", "error");
      return;
    }

    let models = parseModelLines(modelText);
    if (models.length === 0) {
      ctx.ui.notify("No valid model IDs found. Add at least one non-comment line.", "error");
      return;
    }

    // Validate model IDs against the Nvidia API
    ctx.ui.notify("Validating model IDs against Nvidia NIM API...", "info");
    const available = await fetchAvailableModels(apiKey);
    if (available) {
      const invalid = models.filter((m) => !available.has(m.id));
      if (invalid.length > 0) {
        const names = invalid.map((m) => m.id).join(", ");
        const proceed = await ctx.ui.confirm(
          "Nvidia NIM — Invalid Model IDs",
          `These model IDs were not found on the API:\n\n  ${names}\n\nSave anyway (they'll 404), or cancel to fix them?`,
        );
        if (!proceed) return;
      }
    }

    // Save + register + add to scoped models
    const config: NvidiaNimConfig = { apiKey, models };
    try {
      await saveConfig(config);
      registerProvider(pi, config);
      await updateEnabledModels(models);
      const names = models.map((m) => m.id).join(", ");
      ctx.ui.notify(`Nvidia NIM configured — ${models.length} model(s): ${names}. Available in /model.`, "info");
    } catch (error) {
      ctx.ui.notify(`Failed to save: ${error instanceof Error ? error.message : String(error)}`, "error");
    }
  };

  // --- /nvidia-nim-models: quick add/edit models without re-entering key ---
  const modelsHandler = async (args: string | undefined, ctx: ExtensionCommandContext) => {
    if (!ctx.hasUI) {
      console.log("This command requires interactive mode.");
      return;
    }

    const existing = await loadConfig();
    if (!existing) {
      ctx.ui.notify("Run /nvidia-nim-auth first to set up your API key.", "error");
      return;
    }

    const existingModelIds = existing.models.map((m) => m.id).join("\n");
    const prefill = MODEL_EDITOR_TEMPLATE + "\n" + existingModelIds + "\n";

    const modelText = await ctx.ui.editor("Nvidia NIM — Edit Models (one per line)", prefill);
    if (!modelText?.trim()) {
      ctx.ui.notify("Cancelled — models unchanged.", "info");
      return;
    }

    const models = parseModelLines(modelText);
    if (models.length === 0) {
      ctx.ui.notify("No valid model IDs found. Models unchanged.", "error");
      return;
    }

    const config: NvidiaNimConfig = { apiKey: existing.apiKey, models };
    try {
      await saveConfig(config);
      registerProvider(pi, config);
      await updateEnabledModels(models);
      ctx.ui.notify(`Nvidia NIM models updated — ${models.length} model(s). Available in /model.`, "info");
    } catch (error) {
      ctx.ui.notify(`Failed to save: ${error instanceof Error ? error.message : String(error)}`, "error");
    }
  };

  pi.registerCommand("nvidia-nim-auth", {
    description: "Configure Nvidia NIM API key and models",
    handler: authHandler,
  });

  pi.registerCommand("nvidia-auth", {
    description: "Configure Nvidia NIM (alias for /nvidia-nim-auth)",
    handler: authHandler,
  });

  pi.registerCommand("nvidia-nim-models", {
    description: "Add or edit Nvidia NIM models",
    handler: modelsHandler,
  });
}
