import {
  CancellableLoader,
  Container,
  Spacer,
  Text,
  type TUI,
} from "@mariozechner/pi-tui";
import { DynamicBorder } from "@mariozechner/pi-coding-agent";

/**
 * Theme interface for progress component styling
 */
interface ProgressTheme {
  fg: (color: string, text: string) => string;
}

/**
 * Progress phases for handoff extraction
 */
export const EXTRACTION_PHASES = [
  "Analyzing conversation...",
  "Extracting relevant context...",
  "Assembling handoff prompt...",
] as const;

export type ExtractionPhase = (typeof EXTRACTION_PHASES)[number];

/**
 * Custom progress loader that supports updating the phase message.
 * Shows a spinner with phase text and elapsed time.
 */
export class ProgressLoader extends Container {
  private loader: CancellableLoader;
  private startTime: number;
  private elapsedText: Text;
  private currentPhase: string;
  private theme: ProgressTheme;
  private tui: TUI;
  private elapsedIntervalId?: ReturnType<typeof setInterval>;

  /** Called when user presses Escape */
  onAbort?: () => void;

  constructor(tui: TUI, theme: ProgressTheme, initialPhase: string) {
    super();
    this.tui = tui;
    this.theme = theme;
    this.startTime = Date.now();
    this.currentPhase = initialPhase;

    const borderColor = (s: string) => theme.fg("border", s);

    // Top border
    this.addChild(new DynamicBorder(borderColor));

    // Spinner with message
    this.loader = new CancellableLoader(
      tui,
      (s) => theme.fg("accent", s),
      (s) => theme.fg("muted", s),
      initialPhase,
    );
    this.loader.onAbort = () => this.onAbort?.();
    this.addChild(this.loader);

    // Spacer
    this.addChild(new Spacer(1));

    // Elapsed time (updated every second)
    this.elapsedText = new Text(theme.fg("dim", ""), 1, 0);
    this.addChild(this.elapsedText);

    // Help text
    this.addChild(new Text(theme.fg("dim", "escape/ctrl+c cancel"), 1, 0));

    // Bottom border
    this.addChild(new DynamicBorder(borderColor));

    // Start elapsed time updates
    this.startElapsedUpdates();
  }

  /**
   * Update the phase message shown in the loader
   */
  setPhase(phase: string): void {
    this.currentPhase = phase;
    this.loader.setMessage(phase);
    this.tui.requestRender();
  }

  /**
   * Get the abort signal for cancellation
   */
  get signal(): AbortSignal {
    return this.loader.signal;
  }

  handleInput(data: string): void {
    this.loader.handleInput(data);
  }

  private startElapsedUpdates(): void {
    this.updateElapsed();
    this.elapsedIntervalId = setInterval(() => {
      this.updateElapsed();
      this.tui.requestRender();
    }, 1000);
  }

  private updateElapsed(): void {
    const elapsed = Math.floor((Date.now() - this.startTime) / 1000);
    this.elapsedText.setText(this.theme.fg("dim", `(${elapsed}s)`));
  }

  dispose(): void {
    if (this.elapsedIntervalId) {
      clearInterval(this.elapsedIntervalId);
      this.elapsedIntervalId = undefined;
    }
    this.loader.dispose();
  }

  /**
   * Get formatted completion message with elapsed time
   */
  getCompletionMessage(): string {
    const elapsed = ((Date.now() - this.startTime) / 1000).toFixed(1);
    return `Context ready (${elapsed}s)`;
  }
}
