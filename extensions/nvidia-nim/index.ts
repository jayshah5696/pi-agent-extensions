import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import type { OAuthCredentials, OAuthLoginCallbacks } from "@mariozechner/pi-ai/dist/utils/oauth/types.js";
import * as fs from "node:fs/promises";
import * as fsSync from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

/** Persisted model config (API key is now managed via OAuth in ~/.pi/agent/auth.json) */
export interface NvidiaModelsConfig {
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

/** Load models config from ~/.pi/nvidia-nim.json (async).
 *  Handles both new format (models only) and legacy format (with apiKey). */
export async function loadModelsConfig(): Promise<NvidiaModelsConfig | null> {
  try {
    const content = await fs.readFile(getConfigPath(), "utf-8");
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed.models) && parsed.models.length > 0) {
      return { models: parsed.models };
    }
    return null;
  } catch {
    return null;
  }
}

/** Synchronous version for use during extension init (before Pi finishes loading).
 *  Handles both new format (models only) and legacy format (with apiKey). */
export function loadModelsConfigSync(): NvidiaModelsConfig | null {
  try {
    const content = fsSync.readFileSync(getConfigPath(), "utf-8");
    const parsed = JSON.parse(content);
    if (Array.isArray(parsed.models) && parsed.models.length > 0) {
      return { models: parsed.models };
    }
    return null;
  } catch {
    return null;
  }
}

export async function saveModelsConfig(config: NvidiaModelsConfig): Promise<void> {
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

/** Build the provider model descriptors from our model entries. */
function buildModelDescriptors(models: NvidiaModelEntry[]) {
  return models.map((m) => ({
    id: m.id,
    name: m.name,
    reasoning: m.reasoning,
    input: ["text"] as ("text" | "image")[],
    cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
    contextWindow: 128000,
    maxTokens: 16384,
  }));
}

/** Build the OAuth config for Nvidia NIM API key authentication. */
function buildOAuthConfig() {
  return {
    name: "Nvidia NIM",

    async login(callbacks: OAuthLoginCallbacks): Promise<OAuthCredentials> {
      const apiKey = await callbacks.onPrompt({
        message: "Enter your Nvidia NIM API key (nvapi-... from build.nvidia.com):",
        placeholder: "nvapi-...",
      });

      if (!apiKey?.trim()) {
        throw new Error("API key is required. Get one at https://build.nvidia.com");
      }

      const key = apiKey.trim();

      // Validate by hitting the models endpoint
      const res = await fetch(`${NVIDIA_BASE_URL}/models`, {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!res.ok) {
        throw new Error(
          `API key validation failed (HTTP ${res.status}). Check your key at build.nvidia.com`,
        );
      }

      return {
        access: key,
        refresh: key, // API keys don't have refresh tokens
        expires: Date.now() + 365 * 24 * 60 * 60 * 1000, // effectively never
      };
    },

    async refreshToken(credentials: OAuthCredentials): Promise<OAuthCredentials> {
      // Nvidia API keys don't expire — return as-is with extended expiry
      return {
        ...credentials,
        expires: Date.now() + 365 * 24 * 60 * 60 * 1000,
      };
    },

    getApiKey(credentials: OAuthCredentials): string {
      return credentials.access;
    },
  };
}

export default function nvidiaNimExtension(pi: ExtensionAPI) {
  // Load saved models synchronously at init so they're available before Pi finishes loading.
  // The provider is always registered (even without models) so `/login nvidia` works.
  const savedModels = loadModelsConfigSync();
  const models = savedModels?.models ?? [];

  pi.registerProvider(NVIDIA_PROVIDER_NAME, {
    baseUrl: NVIDIA_BASE_URL,
    api: "openai-completions",
    models: buildModelDescriptors(models),
    oauth: buildOAuthConfig(),
  });

  // --- /nvidia-nim-models: add/edit models ---
  const modelsHandler = async (args: string | undefined, ctx: ExtensionCommandContext) => {
    if (!ctx.hasUI) {
      console.log("This command requires interactive mode.");
      return;
    }

    const existing = await loadModelsConfig();
    const existingModelIds = existing?.models.map((m) => m.id).join("\n") ?? "";
    const prefill =
      MODEL_EDITOR_TEMPLATE + "\n" + (existingModelIds || "meta/llama-3.1-405b-instruct") + "\n";

    const modelText = await ctx.ui.editor("Nvidia NIM — Edit Models (one per line)", prefill);
    if (!modelText?.trim()) {
      ctx.ui.notify("Cancelled — models unchanged.", "info");
      return;
    }

    const parsedModels = parseModelLines(modelText);
    if (parsedModels.length === 0) {
      ctx.ui.notify("No valid model IDs found. Models unchanged.", "error");
      return;
    }

    try {
      await saveModelsConfig({ models: parsedModels });

      // Re-register provider with updated models (preserving OAuth config)
      pi.registerProvider(NVIDIA_PROVIDER_NAME, {
        baseUrl: NVIDIA_BASE_URL,
        api: "openai-completions",
        models: buildModelDescriptors(parsedModels),
        oauth: buildOAuthConfig(),
      });

      const names = parsedModels.map((m) => m.id).join(", ");
      ctx.ui.notify(
        `Nvidia NIM models updated — ${parsedModels.length} model(s): ${names}. Use /login nvidia to authenticate.`,
        "info",
      );
    } catch (error) {
      ctx.ui.notify(
        `Failed to save: ${error instanceof Error ? error.message : String(error)}`,
        "error",
      );
    }
  };

  pi.registerCommand("nvidia-nim-models", {
    description: "Add or edit Nvidia NIM models",
    handler: modelsHandler,
  });
}
