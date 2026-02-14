import type { ExtensionAPI, ExtensionCommandContext } from "@mariozechner/pi-coding-agent";
import { Key, Loader, matchesKey } from "@mariozechner/pi-tui";
import * as fs from "node:fs/promises";
import * as os from "node:os";
import * as path from "node:path";
import {
  ABSURD_NERD_LINES,
  BOLLYWOOD_MESSAGES,
  BOSS_PHASE_MESSAGES,
  CONTEXT_MESSAGES,
  FAKE_COMPILER_PANIC,
  GOODBYE_MESSAGES_BY_BUCKET,
  PI_TIPS,
  TERMINAL_MEME_LINES,
  WHIMSICAL_VERBS,
} from "./messages.js";

type ChaosBucket = "A" | "B" | "C" | "D" | "E" | "F" | "G";

const ALL_BUCKETS: ChaosBucket[] = ["A", "B", "C", "D", "E", "F", "G"];

const SPINNER_PRESETS = {
  sleekOrbit: ["◜", "◠", "◝", "◞", "◡", "◟"],
  neonPulse: ["∙∙●∙∙", "∙●∙●∙", "●∙∙∙●", "∙●∙●∙"],
  scanline: ["▏", "▎", "▍", "▌", "▋", "▊", "▉", "█", "▉", "▊", "▋", "▌", "▍", "▎"],
  chevronFlow: [">>>", ">>·", ">··", "···", "·<<", "<<<"],
  matrixGlyph: ["┆", "╎", "┊", "╏", "┋"],
} as const;

type SpinnerPresetId = keyof typeof SPINNER_PRESETS;

const SPINNER_PRESET_ORDER: SpinnerPresetId[] = [
  "sleekOrbit",
  "neonPulse",
  "scanline",
  "chevronFlow",
  "matrixGlyph",
];

const SPINNER_PRESET_LABELS: Record<SpinnerPresetId, string> = {
  sleekOrbit: "Sleek Orbit",
  neonPulse: "Neon Pulse",
  scanline: "Scanline",
  chevronFlow: "Chevron Flow",
  matrixGlyph: "Matrix Glyph",
};

interface WhimsyState {
  enabled: boolean;
  chaosWeights: Record<ChaosBucket, number>;
  spinnerPreset: SpinnerPresetId;
}

interface PersistedWhimsyConfig {
  enabled?: boolean;
  weights?: Partial<Record<ChaosBucket, number>>;
  spinnerPreset?: string;
}

interface TunerResult {
  weights: Record<ChaosBucket, number>;
  spinnerPreset: SpinnerPresetId;
}

const BUCKET_META: Array<{ key: ChaosBucket; title: string; description: string }> = [
  { key: "A", title: "Absurd Nerd Lines", description: "Grepping the void, refactoring by vibes" },
  { key: "B", title: "Boss Progression", description: "Phase-based messages by wait duration" },
  { key: "C", title: "Fake Compiler Panic", description: "Chaotic fake diagnostics" },
  { key: "D", title: "Terminal Meme Lines", description: "CLI one-liners and git jokes" },
  { key: "E", title: "Bollywood & Hinglish", description: "Dialogues, movie vibes, desi dev humor" },
  { key: "F", title: "Whimsical Verbs", description: "Combobulating... Skedaddling... Noodling..." },
  { key: "G", title: "Pi Tips", description: "Helpful tips for using Pi effectively" },
];

const DEFAULT_WEIGHTS: Record<ChaosBucket, number> = {
  A: 10, B: 10, C: 10, D: 10, E: 30, F: 15, G: 15,
};
const DEFAULT_SPINNER_PRESET: SpinnerPresetId = "sleekOrbit";

const state: WhimsyState = {
  enabled: true,
  chaosWeights: { ...DEFAULT_WEIGHTS },
  spinnerPreset: DEFAULT_SPINNER_PRESET,
};

let loadedGlobalState = false;
let loaderSpinnerPatched = false;

const MIN_WORKING_MESSAGE_INTERVAL_MS = 10_000;
const SPINNER_FRAME_INTERVAL_MS = 100;

let activeWhimsyTicker: ReturnType<typeof setInterval> | null = null;
let activeTurnStartedAtMs = Date.now();
let nextWorkingMessageAtMs = Date.now();
let currentWorkingMessage = "";

function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function getSpinnerFrames(preset: SpinnerPresetId): readonly string[] {
  return SPINNER_PRESETS[preset];
}

function patchGlobalLoaderSpinner(): void {
  if (loaderSpinnerPatched) return;

  const proto = Loader.prototype as any;
  const originalUpdateDisplay = proto.updateDisplay;
  if (typeof originalUpdateDisplay !== "function") return;

  proto.updateDisplay = function patchedUpdateDisplay(this: any, ...args: unknown[]) {
    const frames = getSpinnerFrames(state.spinnerPreset);
    if (Array.isArray(frames) && frames.length > 0) {
      this.frames = [...frames];
      const current = Number(this.currentFrame ?? 0);
      this.currentFrame = Number.isFinite(current) ? current % this.frames.length : 0;
    }
    return originalUpdateDisplay.apply(this, args);
  };

  loaderSpinnerPatched = true;
}

function formatWeights(weights: Record<ChaosBucket, number>): string {
  return ALL_BUCKETS.map((k) => `${k}=${weights[k]}%`).join(" ");
}

function formatStatus(): string {
  return `Whimsy ${state.enabled ? "on" : "off"} | ${formatWeights(state.chaosWeights)} | spinner=${SPINNER_PRESET_LABELS[state.spinnerPreset]}`;
}

function getTimeContext(): "morning" | "night" | "day" {
  const hour = new Date().getHours();
  if (hour >= 5 && hour < 11) return "morning";
  if (hour >= 0 && hour < 4) return "night";
  return "day";
}

function pickBossProgression(durationSeconds: number): string {
  if (durationSeconds < 5) return pick(BOSS_PHASE_MESSAGES.early);
  if (durationSeconds < 15) return pick(BOSS_PHASE_MESSAGES.mid);
  return pick(BOSS_PHASE_MESSAGES.late);
}

function chooseWeightedBucket(weights: Record<ChaosBucket, number>): ChaosBucket {
  const roll = Math.random() * 100;
  let cumulative = 0;
  for (const bucket of ALL_BUCKETS) {
    cumulative += weights[bucket];
    if (roll < cumulative) return bucket;
  }
  return "E"; // fallback
}

function pickMessageForBucket(bucket: ChaosBucket, durationSeconds: number): string {
  switch (bucket) {
    case "A": return pick(ABSURD_NERD_LINES);
    case "B": return pickBossProgression(durationSeconds);
    case "C": return pick(FAKE_COMPILER_PANIC);
    case "D": return pick(TERMINAL_MEME_LINES);
    case "E": return pick(BOLLYWOOD_MESSAGES);
    case "F": return pick(WHIMSICAL_VERBS);
    case "G": return pick(PI_TIPS);
  }
}

function pickWorkingMessageFor(weights: Record<ChaosBucket, number>, durationSeconds: number): string {
  // Context-aware overrides: time of day and long waits
  if (durationSeconds > 5 && Math.random() > 0.5) {
    return pick(CONTEXT_MESSAGES.longWait);
  }

  const timeContext = getTimeContext();
  if (timeContext !== "day" && Math.random() > 0.7) {
    return pick(CONTEXT_MESSAGES[timeContext]);
  }

  const selected = chooseWeightedBucket(weights);
  return pickMessageForBucket(selected, durationSeconds);
}

function pickGoodbyeMessage(): string {
  const selected = chooseWeightedBucket(state.chaosWeights);
  return pick(GOODBYE_MESSAGES_BY_BUCKET[selected]);
}

function adjustWeightsByStep(
  weights: Record<ChaosBucket, number>,
  selected: ChaosBucket,
  delta: 5 | -5,
): boolean {
  const next = weights[selected] + delta;
  if (next < 0) return false;
  weights[selected] = next;
  return true;
}

function sanitizeWeights(raw?: Partial<Record<ChaosBucket, number>>): Record<ChaosBucket, number> {
  if (!raw) return { ...DEFAULT_WEIGHTS };

  const out: Record<ChaosBucket, number> = { A: 0, B: 0, C: 0, D: 0, E: 0, F: 0, G: 0 };

  for (const key of ALL_BUCKETS) {
    const v = Number(raw[key] ?? 0);
    if (!Number.isFinite(v) || v < 0 || v % 5 !== 0) return { ...DEFAULT_WEIGHTS };
    out[key] = v;
  }

  const total = ALL_BUCKETS.reduce((sum, k) => sum + out[k], 0);
  if (total !== 100) return { ...DEFAULT_WEIGHTS };
  return out;
}

function sanitizeSpinnerPreset(raw?: string): SpinnerPresetId {
  if (!raw) return DEFAULT_SPINNER_PRESET;
  return (SPINNER_PRESET_ORDER as string[]).includes(raw) ? (raw as SpinnerPresetId) : DEFAULT_SPINNER_PRESET;
}

function cycleSpinnerPreset(current: SpinnerPresetId, direction: -1 | 1): SpinnerPresetId {
  const index = SPINNER_PRESET_ORDER.indexOf(current);
  const next = (index + direction + SPINNER_PRESET_ORDER.length) % SPINNER_PRESET_ORDER.length;
  return SPINNER_PRESET_ORDER[next];
}

function getSettingsPath(): string {
  return path.join(os.homedir(), ".pi", "agent", "settings.json");
}

async function loadStateFromSettings(): Promise<void> {
  const settingsPath = getSettingsPath();
  try {
    const text = await fs.readFile(settingsPath, "utf-8");
    const parsed = JSON.parse(text) as Record<string, unknown>;
    const whimsical = (parsed?.whimsical ?? {}) as PersistedWhimsyConfig;

    state.enabled = typeof whimsical.enabled === "boolean" ? whimsical.enabled : true;
    state.chaosWeights = sanitizeWeights(whimsical.weights);
    state.spinnerPreset = sanitizeSpinnerPreset(whimsical.spinnerPreset);
  } catch {
    state.enabled = true;
    state.chaosWeights = { ...DEFAULT_WEIGHTS };
    state.spinnerPreset = DEFAULT_SPINNER_PRESET;
  }
}

async function saveStateToSettings(): Promise<void> {
  const settingsPath = getSettingsPath();
  const dir = path.dirname(settingsPath);

  let parsed: Record<string, unknown> = {};
  try {
    const text = await fs.readFile(settingsPath, "utf-8");
    parsed = text.trim() ? (JSON.parse(text) as Record<string, unknown>) : {};
  } catch {
    parsed = {};
  }

  parsed.whimsical = {
    enabled: state.enabled,
    weights: { ...state.chaosWeights },
    spinnerPreset: state.spinnerPreset,
  } satisfies PersistedWhimsyConfig;

  await fs.mkdir(dir, { recursive: true });
  await fs.writeFile(settingsPath, JSON.stringify(parsed, null, 2), "utf-8");
}

async function ensureStateLoaded(): Promise<void> {
  if (loadedGlobalState) return;
  await loadStateFromSettings();
  loadedGlobalState = true;
}

function stopActiveTicker(): void {
  if (activeWhimsyTicker) {
    clearInterval(activeWhimsyTicker);
    activeWhimsyTicker = null;
  }
}

function renderWorkingLine(): string {
  // Interactive mode already renders its own spinner glyph.
  // Return message-only text to avoid double spinners.
  return currentWorkingMessage;
}

async function openWeightsTuner(ctx: ExtensionCommandContext) {
  if (!ctx.hasUI) return null;

  return ctx.ui.custom<TunerResult | null>((tui, theme, _kb, done) => {
    const workingWeights = { ...state.chaosWeights };
    let workingSpinnerPreset: SpinnerPresetId = state.spinnerPreset;
    let selectedRow = 0; // 0-6 buckets, 7 spinner row
    let warning = "";

    const previewStartedAt = Date.now();
    let previewSpinnerIndex = 0;
    let nextPreviewMessageAt = Date.now() + MIN_WORKING_MESSAGE_INTERVAL_MS;
    let previewMessage = pickWorkingMessageFor(workingWeights, 0);

    const previewTicker = setInterval(() => {
      previewSpinnerIndex += 1;
      const now = Date.now();
      if (now >= nextPreviewMessageAt) {
        const elapsed = (now - previewStartedAt) / 1000;
        previewMessage = pickWorkingMessageFor(workingWeights, elapsed);
        nextPreviewMessageAt = now + MIN_WORKING_MESSAGE_INTERVAL_MS;
      }
      tui.requestRender();
    }, SPINNER_FRAME_INTERVAL_MS);

    const finish = (result: TunerResult | null) => {
      clearInterval(previewTicker);
      done(result);
    };

    function totalWeight(): number {
      return ALL_BUCKETS.reduce((sum, k) => sum + workingWeights[k], 0);
    }

    function currentPreviewFrame(): string {
      const frames = getSpinnerFrames(workingSpinnerPreset);
      return frames[previewSpinnerIndex % frames.length];
    }

    function render(width: number): string[] {
      const lines: string[] = [];
      const hr = theme.fg("accent", "─".repeat(Math.max(8, width)));
      const add = (line: string) => lines.push(line);
      const total = totalWeight();
      const canSave = total === 100;

      add(hr);
      add(theme.fg("accent", theme.bold(" Whimsy Chaos Mixer")));
      add(theme.fg("muted", " ↑/↓ move • ←/→ adjust • Enter save (only when total=100) • Esc cancel"));
      add("");

      for (let i = 0; i < BUCKET_META.length; i++) {
        const bucket = BUCKET_META[i];
        const focused = i === selectedRow;
        const prefix = focused ? theme.fg("accent", "> ") : "  ";
        const title = `${bucket.key}. ${bucket.title}`;
        const pct = `${workingWeights[bucket.key]}%`;
        const main = focused ? theme.fg("accent", `${title.padEnd(30)} ${pct}`) : `${title.padEnd(30)} ${pct}`;
        add(prefix + main);
        add(`   ${theme.fg("dim", bucket.description)}`);
      }

      add("");
      const spinnerFocused = selectedRow === BUCKET_META.length;
      const spinnerPrefix = spinnerFocused ? theme.fg("accent", "> ") : "  ";
      const presetLabel = SPINNER_PRESET_LABELS[workingSpinnerPreset];
      const sampleFrames = getSpinnerFrames(workingSpinnerPreset).slice(0, 4).join(" ");
      const spinnerLine = `Spinner Preset: ${presetLabel}  [${sampleFrames}]`;
      add(spinnerPrefix + (spinnerFocused ? theme.fg("accent", spinnerLine) : spinnerLine));
      add(`   ${theme.fg("dim", "Use ←/→ on this row to switch between 5 presets")}`);

      add("");
      add(theme.fg("muted", " Preview"));
      add(` ${theme.fg("accent", currentPreviewFrame())} ${theme.fg("text", previewMessage)}`);

      add("");
      add(canSave ? theme.fg("text", ` Total: ${total}%`) : theme.fg("warning", ` Total: ${total}%`));
      if (!canSave) add(theme.fg("warning", " ⚠ Total must be exactly 100% to save."));
      if (warning) add(theme.fg("warning", ` ⚠ ${warning}`));
      add(hr);

      return lines;
    }

    function handleInput(data: string) {
      if (matchesKey(data, Key.up)) {
        warning = "";
        selectedRow = Math.max(0, selectedRow - 1);
        tui.requestRender();
        return;
      }
      if (matchesKey(data, Key.down)) {
        warning = "";
        selectedRow = Math.min(BUCKET_META.length, selectedRow + 1);
        tui.requestRender();
        return;
      }
      if (matchesKey(data, Key.left)) {
        warning = "";
        if (selectedRow < BUCKET_META.length) {
          adjustWeightsByStep(workingWeights, BUCKET_META[selectedRow].key, -5);
        } else {
          workingSpinnerPreset = cycleSpinnerPreset(workingSpinnerPreset, -1);
        }
        tui.requestRender();
        return;
      }
      if (matchesKey(data, Key.right)) {
        warning = "";
        if (selectedRow < BUCKET_META.length) {
          adjustWeightsByStep(workingWeights, BUCKET_META[selectedRow].key, 5);
        } else {
          workingSpinnerPreset = cycleSpinnerPreset(workingSpinnerPreset, 1);
        }
        tui.requestRender();
        return;
      }
      if (matchesKey(data, Key.enter)) {
        if (totalWeight() !== 100) {
          warning = "Cannot save until total equals 100%.";
          tui.requestRender();
          return;
        }
        finish({ weights: workingWeights, spinnerPreset: workingSpinnerPreset });
        return;
      }
      if (matchesKey(data, Key.escape)) {
        finish(null);
      }
    }

    return {
      render,
      invalidate: () => undefined,
      handleInput,
    };
  });
}

export default function whimsicalExtension(pi: ExtensionAPI) {
  patchGlobalLoaderSpinner();

  pi.registerCommand("whimsy", {
    description: "Open chaos mixer + spinner tuner",
    handler: async (args, ctx) => {
      await ensureStateLoaded();
      const sub = (args[0] ?? "").toLowerCase();

      if (sub === "on") {
        state.enabled = true;
        await saveStateToSettings();
        return "Whimsy enabled.";
      }
      if (sub === "off") {
        state.enabled = false;
        stopActiveTicker();
        if (ctx.hasUI) ctx.ui.setWorkingMessage();
        await saveStateToSettings();
        return "Whimsy disabled.";
      }
      if (sub === "reset") {
        state.chaosWeights = { ...DEFAULT_WEIGHTS };
        state.spinnerPreset = DEFAULT_SPINNER_PRESET;
        await saveStateToSettings();
        return `Whimsy reset: ${formatStatus()}`;
      }
      if (sub === "status") {
        return formatStatus();
      }

      if (!ctx.hasUI) {
        return `${formatStatus()}\nUse interactive mode and run /whimsy to tune weights + spinner.`;
      }

      const tuned = await openWeightsTuner(ctx);
      if (!tuned) return "Whimsy unchanged.";

      state.chaosWeights = tuned.weights;
      state.spinnerPreset = tuned.spinnerPreset;
      await saveStateToSettings();
      return `Whimsy updated: ${formatStatus()}`;
    },
  });

  pi.registerCommand("exit", {
    description: "Exit Pi with a whimsical goodbye",
    handler: async (_args, ctx) => {
      await ensureStateLoaded();
      const msg = pickGoodbyeMessage();
      if (ctx.hasUI) ctx.ui.notify(`👋 ${msg}`, "info");
      setImmediate(() => ctx.shutdown());
    },
  });

  pi.registerCommand("bye", {
    description: "Exit Pi with a whimsical goodbye (alias)",
    handler: async (_args, ctx) => {
      await ensureStateLoaded();
      const msg = pickGoodbyeMessage();
      if (ctx.hasUI) ctx.ui.notify(`👋 ${msg}`, "info");
      setImmediate(() => ctx.shutdown());
    },
  });

  pi.on("turn_start", async (_event, ctx) => {
    await ensureStateLoaded();
    if (!state.enabled) return;

    stopActiveTicker();

    activeTurnStartedAtMs = Date.now();
    nextWorkingMessageAtMs = activeTurnStartedAtMs + MIN_WORKING_MESSAGE_INTERVAL_MS;
    currentWorkingMessage = pickWorkingMessageFor(state.chaosWeights, 0);

    ctx.ui.setWorkingMessage(renderWorkingLine());

    activeWhimsyTicker = setInterval(() => {
      if (!state.enabled) {
        stopActiveTicker();
        return;
      }

      const now = Date.now();
      if (now >= nextWorkingMessageAtMs) {
        const elapsed = (now - activeTurnStartedAtMs) / 1000;
        currentWorkingMessage = pickWorkingMessageFor(state.chaosWeights, elapsed);
        nextWorkingMessageAtMs = now + MIN_WORKING_MESSAGE_INTERVAL_MS;
        ctx.ui.setWorkingMessage(renderWorkingLine());
      }
    }, SPINNER_FRAME_INTERVAL_MS);
  });

  // Keep running until the next turn_start replaces cadence.
  pi.on("turn_end", async () => {
    // no-op by design
  });
}
