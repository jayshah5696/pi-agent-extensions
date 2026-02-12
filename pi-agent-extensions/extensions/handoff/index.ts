/**
 * Handoff Extension
 *
 * Provides a `/handoff` command that generates a high-quality "new thread prompt"
 * from the current session, then starts a new session with that prompt pre-filled
 * for the user to review and send.
 *
 * Usage:
 *   /handoff implement team-level handoff with proper tests
 *   /handoff fix the authentication bug in login flow
 *   /handoff add unit tests for the parser module
 */

import { complete, getModel, type Message, type Model } from "@mariozechner/pi-ai";
import type {
  ExtensionAPI,
  ExtensionCommandContext,
} from "@mariozechner/pi-coding-agent";
import {
  BorderedLoader,
  convertToLlm,
  serializeConversation,
} from "@mariozechner/pi-coding-agent";

import { loadConfig, validateGoal } from "./config.js";
import { ProgressLoader, EXTRACTION_PHASES } from "./progress.js";
import {
  EXTRACTION_SYSTEM_PROMPT,
  EXTRACTION_RETRY_PROMPT,
  buildExtractionUserMessage,
  processExtractionResponse,
  extractTextFromAssistantMessage,
} from "./extraction.js";
import { collectSessionMetadata } from "./metadata.js";
import { assembleHandoffPrompt } from "./prompt.js";
import {
  SKILL_ENTRY_TYPE,
  type HandoffConfig,
  type SkillEntry,
} from "./types.js";

/**
 * Resolves the model to use for extraction based on config
 */
function resolveExtractionModel(
  ctx: ExtensionCommandContext,
  config: HandoffConfig,
): Model<any> | undefined {
  // Use current model if configured to do so or no override specified
  if (config.useCurrentModel || !config.model) {
    return ctx.model;
  }

  // Try to get the override model
  const [provider, ...modelParts] = config.model.split("/");
  const modelId = modelParts.join("/");

  if (!provider || !modelId) {
    // Invalid format, fall back to current
    return ctx.model;
  }

  const overrideModel = getModel(provider, modelId);
  if (!overrideModel) {
    // Model not found, fall back to current
    console.warn(`Handoff: Model ${config.model} not found, using current model`);
    return ctx.model;
  }

  return overrideModel;
}

/**
 * Main handoff command handler
 */
async function runHandoffCommand(
  args: string | undefined,
  ctx: ExtensionCommandContext,
  pi: ExtensionAPI,
  lastSkill: string | undefined,
): Promise<void> {
  // Load config from .pi/settings.json
  const cwd = ctx.sessionManager.getCwd();
  const config = loadConfig(cwd);

  // Validate goal
  const goal = args?.trim() ?? "";
  const goalValidation = validateGoal(goal, config.minGoalLength);

  if (!goalValidation.valid) {
    if (ctx.hasUI) {
      ctx.ui.notify(goalValidation.error!, "error");
    } else {
      console.error(goalValidation.error);
    }
    return;
  }

  // Check for model
  if (!ctx.model) {
    const errorMsg = "No model selected. Use /model to select a model first.";
    if (ctx.hasUI) {
      ctx.ui.notify(errorMsg, "error");
    } else {
      console.error(errorMsg);
    }
    return;
  }

  // Get conversation context
  const sessionContext = ctx.sessionManager.buildSessionContext();
  const messages = sessionContext.messages;

  if (messages.length === 0) {
    const errorMsg = "No conversation to hand off.";
    if (ctx.hasUI) {
      ctx.ui.notify(errorMsg, "error");
    } else {
      console.error(errorMsg);
    }
    return;
  }

  // Convert messages to LLM format and serialize
  const llmMessages = convertToLlm(messages);
  const conversationText = serializeConversation(llmMessages);
  const currentSessionFile = ctx.sessionManager.getSessionFile();

  // Collect metadata
  const activeTools = pi.getActiveTools();
  const sessionName = ctx.sessionManager.getSessionName();
  const thinkingLevel = pi.getThinkingLevel();

  const metadata = await collectSessionMetadata({
    model: ctx.model ? { provider: ctx.model.provider, id: ctx.model.id } : undefined,
    thinkingLevel: thinkingLevel !== "off" ? thinkingLevel : undefined,
    tools: activeTools,
    sessionName: sessionName ?? undefined,
    lastSkill,
    exec: (cmd, args, opts) => pi.exec(cmd, args, opts),
  });

  // Resolve which model to use for extraction
  const extractionModel = resolveExtractionModel(ctx, config);
  if (!extractionModel) {
    const errorMsg = "No model available for extraction.";
    if (ctx.hasUI) {
      ctx.ui.notify(errorMsg, "error");
    } else {
      console.error(errorMsg);
    }
    return;
  }

  // Generate extraction via LLM
  const extractionResult = await generateExtraction(
    conversationText,
    goal,
    config,
    ctx,
    extractionModel,
  );

  if (!extractionResult.success || !extractionResult.extraction) {
    if (ctx.hasUI) {
      ctx.ui.notify(
        extractionResult.error ?? "Failed to generate handoff context",
        "error",
      );
    } else {
      console.error(extractionResult.error ?? "Failed to generate handoff context");
    }
    return;
  }

  // Assemble the handoff prompt
  const handoffPrompt = assembleHandoffPrompt(
    extractionResult.extraction,
    goal,
    metadata,
    config,
  );

  // Non-UI mode: just print the prompt
  if (!ctx.hasUI) {
    console.log(handoffPrompt);
    return;
  }

  // Interactive mode: let user edit the prompt
  const editedPrompt = await ctx.ui.editor("Edit handoff prompt", handoffPrompt);

  if (editedPrompt === undefined) {
    ctx.ui.notify("Handoff cancelled", "info");
    return;
  }

  // Create new session with parent tracking
  const newSessionResult = await ctx.newSession({
    parentSession: currentSessionFile,
  });

  if (newSessionResult.cancelled) {
    ctx.ui.notify("New session cancelled", "info");
    return;
  }

  // Set the edited prompt in the editor for submission
  ctx.ui.setEditorText(editedPrompt);
  ctx.ui.notify("Handoff ready. Press Enter to send.", "info");
}

/**
 * Extraction result type
 */
interface ExtractionResult {
  success: boolean;
  extraction?: ReturnType<typeof processExtractionResponse>["normalized"];
  error?: string;
  completionMessage?: string;
}

/**
 * Generates the extraction by calling the LLM with retry on parse failure
 */
async function generateExtraction(
  conversationText: string,
  goal: string,
  config: HandoffConfig,
  ctx: ExtensionCommandContext,
  model: Model<any>,
): Promise<ExtractionResult> {
  if (!ctx.hasUI) {
    // Non-UI mode: direct call without loader
    return await doExtraction(conversationText, goal, config, ctx, model);
  }

  // Interactive mode: show loader during extraction
  if (config.showProgressPhases) {
    // Use phase-based progress loader
    return await ctx.ui.custom<ExtractionResult>((tui, theme, _kb, done) => {
      const loader = new ProgressLoader(tui, theme, EXTRACTION_PHASES[0]);
      loader.onAbort = () => {
        loader.dispose();
        done({ success: false, error: "Cancelled" });
      };

      doExtractionWithPhases(conversationText, goal, config, ctx, model, loader.signal, (phase) => {
        loader.setPhase(phase);
      })
        .then((result) => {
          const completionMessage = loader.getCompletionMessage();
          loader.dispose();
          done({ ...result, completionMessage });
        })
        .catch((err) => {
          loader.dispose();
          console.error("Handoff extraction failed:", err);
          done({ success: false, error: err.message ?? "Unknown error" });
        });

      return loader;
    });
  } else {
    // Use simple bordered loader
    return await ctx.ui.custom<ExtractionResult>((tui, theme, _kb, done) => {
      const loader = new BorderedLoader(tui, theme, "Generating handoff context...");
      loader.onAbort = () => done({ success: false, error: "Cancelled" });

      doExtraction(conversationText, goal, config, ctx, model, loader.signal)
        .then(done)
        .catch((err) => {
          console.error("Handoff extraction failed:", err);
          done({ success: false, error: err.message ?? "Unknown error" });
        });

      return loader;
    });
  }
}

/**
 * Performs the actual LLM extraction call with retry
 */
async function doExtraction(
  conversationText: string,
  goal: string,
  config: HandoffConfig,
  ctx: ExtensionCommandContext,
  model: Model<any>,
  signal?: AbortSignal,
): Promise<ExtractionResult> {
  const apiKey = await ctx.modelRegistry.getApiKey(model);

  // Build user message
  const userMessage: Message = {
    role: "user",
    content: [
      { type: "text", text: buildExtractionUserMessage(conversationText, goal) },
    ],
    timestamp: Date.now(),
  };

  // First attempt
  const response = await complete(
    model,
    { systemPrompt: EXTRACTION_SYSTEM_PROMPT, messages: [userMessage] },
    { apiKey, signal },
  );

  if (response.stopReason === "aborted") {
    return { success: false, error: "Cancelled" };
  }

  if (response.stopReason === "error") {
    return { success: false, error: response.errorMessage ?? "LLM error" };
  }

  const responseText = extractTextFromAssistantMessage(response.content);
  const result = processExtractionResponse(responseText, config, conversationText);

  if (result.success && result.normalized) {
    return { success: true, extraction: result.normalized };
  }

  // Retry with stricter prompt
  const retryMessage: Message = {
    role: "user",
    content: [{ type: "text", text: EXTRACTION_RETRY_PROMPT }],
    timestamp: Date.now(),
  };

  const assistantMessage: Message = {
    role: "assistant",
    content: response.content,
    api: response.api,
    provider: response.provider,
    model: response.model,
    usage: response.usage,
    stopReason: response.stopReason,
    timestamp: response.timestamp,
  };

  const retryResponse = await complete(
    model,
    {
      systemPrompt: EXTRACTION_SYSTEM_PROMPT,
      messages: [userMessage, assistantMessage, retryMessage],
    },
    { apiKey, signal },
  );

  if (retryResponse.stopReason === "aborted") {
    return { success: false, error: "Cancelled" };
  }

  if (retryResponse.stopReason === "error") {
    return { success: false, error: retryResponse.errorMessage ?? "LLM error on retry" };
  }

  const retryText = extractTextFromAssistantMessage(retryResponse.content);
  const retryResult = processExtractionResponse(retryText, config, conversationText);

  if (retryResult.success && retryResult.normalized) {
    return { success: true, extraction: retryResult.normalized };
  }

  return {
    success: false,
    error: `Failed to parse extraction after retry: ${retryResult.error}`,
  };
}

/**
 * Performs extraction with phase updates for progress UI
 */
async function doExtractionWithPhases(
  conversationText: string,
  goal: string,
  config: HandoffConfig,
  ctx: ExtensionCommandContext,
  model: Model<any>,
  signal: AbortSignal,
  onPhase: (phase: string) => void,
): Promise<ExtractionResult> {
  const apiKey = await ctx.modelRegistry.getApiKey(model);

  // Phase 1: Analyzing conversation
  onPhase(EXTRACTION_PHASES[0]);

  // Build user message
  const userMessage: Message = {
    role: "user",
    content: [
      { type: "text", text: buildExtractionUserMessage(conversationText, goal) },
    ],
    timestamp: Date.now(),
  };

  // Phase 2: Extracting context (LLM call)
  onPhase(EXTRACTION_PHASES[1]);

  // First attempt
  const response = await complete(
    model,
    { systemPrompt: EXTRACTION_SYSTEM_PROMPT, messages: [userMessage] },
    { apiKey, signal },
  );

  if (response.stopReason === "aborted") {
    return { success: false, error: "Cancelled" };
  }

  if (response.stopReason === "error") {
    return { success: false, error: response.errorMessage ?? "LLM error" };
  }

  // Phase 3: Assembling prompt
  onPhase(EXTRACTION_PHASES[2]);

  const responseText = extractTextFromAssistantMessage(response.content);
  const result = processExtractionResponse(responseText, config, conversationText);

  if (result.success && result.normalized) {
    return { success: true, extraction: result.normalized };
  }

  // Retry needed - stay on phase 2
  onPhase("Retrying extraction...");

  const retryMessage: Message = {
    role: "user",
    content: [{ type: "text", text: EXTRACTION_RETRY_PROMPT }],
    timestamp: Date.now(),
  };

  const assistantMessage: Message = {
    role: "assistant",
    content: response.content,
    api: response.api,
    provider: response.provider,
    model: response.model,
    usage: response.usage,
    stopReason: response.stopReason,
    timestamp: response.timestamp,
  };

  const retryResponse = await complete(
    model,
    {
      systemPrompt: EXTRACTION_SYSTEM_PROMPT,
      messages: [userMessage, assistantMessage, retryMessage],
    },
    { apiKey, signal },
  );

  if (retryResponse.stopReason === "aborted") {
    return { success: false, error: "Cancelled" };
  }

  if (retryResponse.stopReason === "error") {
    return { success: false, error: retryResponse.errorMessage ?? "LLM error on retry" };
  }

  // Back to phase 3
  onPhase(EXTRACTION_PHASES[2]);

  const retryText = extractTextFromAssistantMessage(retryResponse.content);
  const retryResult = processExtractionResponse(retryText, config, conversationText);

  if (retryResult.success && retryResult.normalized) {
    return { success: true, extraction: retryResult.normalized };
  }

  return {
    success: false,
    error: `Failed to parse extraction after retry: ${retryResult.error}`,
  };
}

/**
 * Main extension entry point
 */
export default function handoffExtension(pi: ExtensionAPI) {
  // Track last used skill
  let lastSkill: string | undefined;

  // Restore last skill from session on startup
  pi.on("session_start", async (_event, ctx) => {
    lastSkill = undefined;
    for (const entry of ctx.sessionManager.getEntries()) {
      if (
        entry.type === "custom" &&
        (entry as any).customType === SKILL_ENTRY_TYPE
      ) {
        const data = (entry as any).data as SkillEntry | undefined;
        if (data?.skillName) {
          lastSkill = data.skillName;
        }
      }
    }
  });

  // Track skill usage via input event
  pi.on("input", async (event, _ctx) => {
    const text = event.text.trim();

    // Check if this is a skill command
    if (text.startsWith("/skill:")) {
      const skillMatch = text.match(/^\/skill:([^\s]+)/);
      if (skillMatch) {
        const skillName = skillMatch[1];
        lastSkill = skillName;

        // Persist to session
        pi.appendEntry(SKILL_ENTRY_TYPE, {
          skillName,
          timestamp: Date.now(),
        } as SkillEntry);
      }
    }

    // Let the input continue processing
    return { action: "continue" };
  });

  // Register the /handoff command
  pi.registerCommand("handoff", {
    description: "Transfer context to a new focused session",
    handler: async (args, ctx) => {
      await runHandoffCommand(args, ctx, pi, lastSkill);
    },
  });
}
