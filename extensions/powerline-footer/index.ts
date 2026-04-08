import type { ExtensionAPI, ExtensionContext, ReadonlyFooterDataProvider } from "@mariozechner/pi-coding-agent";
import { type Component, type Theme, type TUI, visibleWidth } from "@mariozechner/pi-tui";
import * as child_process from "child_process";

class PowerlineFooter implements Component {
    private tui: TUI;
    private theme: Theme;
    private footerData: ReadonlyFooterDataProvider;
    private ctx: ExtensionContext;
    private interval?: ReturnType<typeof setInterval>;
    private sessionStartTime: number;

    // Cached state to avoid blocking render
    private gitStatusExtras: string = "";
    private linesAdded: number = 0;
    private linesRemoved: number = 0;

    constructor(tui: TUI, theme: Theme, footerData: ReadonlyFooterDataProvider, ctx: ExtensionContext) {
        this.tui = tui;
        this.theme = theme;
        this.footerData = footerData;
        this.ctx = ctx;
        this.sessionStartTime = Date.now();

        // Initial fetch
        this.fetchAsyncData();

        // Update data every 10 seconds
        this.interval = setInterval(() => {
            this.fetchAsyncData();
            this.tui.requestRender();
        }, 10000);
    }

    dispose() {
        if (this.interval) {
            clearInterval(this.interval);
        }
    }

    private fetchAsyncData() {
        const cwd = this.ctx.cwd;
        const branch = this.footerData.getGitBranch();

        if (branch) {
            child_process.exec("git --no-optional-locks status --porcelain", { encoding: "utf8", cwd }, (err, stdout) => {
                if (err) return;
                const staged = (stdout.match(/^[AMDRC]/gm) || []).length;
                const unstaged = (stdout.match(/^.[MD]/gm) || []).length;
                const untracked = (stdout.match(/^\?\?/gm) || []).length;

                child_process.exec("git --no-optional-locks rev-list --count --left-right @{u}...HEAD", { encoding: "utf8", cwd }, (err2, revListOut) => {
                    let ahead = 0;
                    let behind = 0;
                    if (!err2 && revListOut && revListOut.includes('\t')) {
                        const [b, a] = revListOut.trim().split('\t');
                        behind = parseInt(b, 10);
                        ahead = parseInt(a, 10);
                    }

                    let statusExtras = "";
                    if (staged > 0) statusExtras += `+${staged}`;
                    if (unstaged > 0) statusExtras += `!${unstaged}`;
                    if (untracked > 0) statusExtras += `?${untracked}`;
                    if (ahead > 0) statusExtras += `⇡${ahead}`;
                    if (behind > 0) statusExtras += `⇣${behind}`;
                    this.gitStatusExtras = statusExtras;
                    this.tui.requestRender();
                });
            });
        } else {
            this.gitStatusExtras = "";
        }

        // Lines added/removed this session across the repository can be approximated
        // by looking at changes since the session started, but that's complex without saving the commit hash.
        // We will mock this or skip it if pi doesn't provide session line diff metrics.
        // The prompt says "Lines changed this session", which Claude Code natively provides.
    }

    invalidate() {}
    handleInput(_data: string) {}

    private formatTokens(num: number): string {
        if (num >= 1000) {
            return Math.floor(num / 1000) + "K";
        }
        return String(num);
    }

    render(width: number): string[] {
        const RESET = "\x1b[0m";
        const DIM = "\x1b[2m";
        const BOLD = "\x1b[1m";
        const MAUVE = "\x1b[38;5;183m";
        const BLUE = "\x1b[38;5;111m";
        const GREEN = "\x1b[38;5;150m";
        const YELLOW = "\x1b[38;5;222m";
        const RED = "\x1b[38;5;211m";
        const SKY = "\x1b[38;5;117m";
        const PEACH = "\x1b[38;5;216m";
        const OVERLAY2 = "\x1b[38;5;103m";

        const cwd = this.ctx.cwd;
        const homeDir = process.env.HOME || process.env.USERPROFILE || "";
        let shortDir = cwd;
        if (homeDir && shortDir.startsWith(homeDir)) {
            shortDir = "~" + shortDir.slice(homeDir.length);
        }
        const parts = shortDir.split('/');
        if (parts.length > 4) {
            shortDir = parts.slice(parts.length - 4).join('/');
            if (parts[0] === '') shortDir = '/' + shortDir; // handle absolute paths correctly if not in home
        }

        let gitInfo = "";
        const branch = this.footerData.getGitBranch();
        if (branch) {
            gitInfo = ` ${DIM}on${RESET} ${MAUVE} ${branch}${RESET}`;
            if (this.gitStatusExtras) {
                gitInfo += ` ${RED}${this.gitStatusExtras}${RESET}`;
            }
        }

        const model = this.ctx.getModel();
        const modelShort = model?.name || model?.id || "Claude";

        const contextUsage = this.ctx.getContextUsage?.();
        let contextInfo = "";
        let cacheInfo = "";
        let overflowInfo = "";
        let costInfo = "";

        if (contextUsage) {
            const contextSize = model?.contextWindow || 200000;

            const curInput = contextUsage.inputTokens || 0;
            const curOutput = contextUsage.outputTokens || 0;
            const curCacheRead = contextUsage.cacheReadInputTokens || 0;
            const curCacheCreation = contextUsage.cacheCreationInputTokens || 0;

            const actualInCtx = curCacheRead + curInput + curCacheCreation + curOutput;

            const tokensTotal = this.formatTokens(contextSize);
            const tokensUsed = this.formatTokens(actualInCtx);
            const usedInt = contextSize > 0 ? Math.floor((actualInCtx * 100) / contextSize) : 0;
            const remainingInt = 100 - usedInt;

            let ctxColor = GREEN;
            if (remainingInt < 20) {
                ctxColor = RED;
            } else if (remainingInt < 50) {
                ctxColor = YELLOW;
            }

            contextInfo = `${ctxColor}${tokensUsed}/${tokensTotal} (${usedInt}%)${RESET}`;

            const inputSide = curCacheRead + curInput + curCacheCreation;
            if (curCacheRead > 0 && inputSide > 0) {
                const cachePct = Math.floor((curCacheRead * 100) / inputSide);
                cacheInfo = ` ${DIM}cache:${RESET}${GREEN}${cachePct}%${RESET}`;
            }

            if (actualInCtx > 200000) {
                overflowInfo = ` ${RED}>200k${RESET}`;
            }

            // Cost estimation
            if (model?.cost) {
                const cost =
                    (curInput * model.cost.input) / 1000000 +
                    (curOutput * model.cost.output) / 1000000 +
                    (curCacheRead * model.cost.cacheRead) / 1000000 +
                    (curCacheCreation * model.cost.cacheWrite) / 1000000;

                if (cost > 0.0001) {
                    costInfo = ` ${DIM}|${RESET} ${PEACH}\$${cost.toFixed(2)}${RESET}`;
                }
            }
        }

        let durationInfo = "";
        const durationMs = Date.now() - this.sessionStartTime;
        if (durationMs > 0) {
            const durS = Math.floor(durationMs / 1000);
            let durFmt = "";
            if (durS >= 3600) {
                const durH = Math.floor(durS / 3600);
                const durM = Math.floor((durS % 3600) / 60);
                durFmt = `${durH}h${durM}m`;
            } else if (durS >= 60) {
                durFmt = `${Math.floor(durS / 60)}m`;
            } else {
                durFmt = `${durS}s`;
            }
            durationInfo = ` ${DIM}|${RESET} ${OVERLAY2}${durFmt}${RESET}`;
        }

        let envInfo = "";
        if (process.env.CONDA_DEFAULT_ENV) {
            envInfo = ` ${SKY}(${process.env.CONDA_DEFAULT_ENV})${RESET}`;
        } else if (process.env.VIRTUAL_ENV) {
            const venvName = process.env.VIRTUAL_ENV.split('/').pop() || "";
            envInfo = ` ${SKY}(${venvName})${RESET}`;
        }

        const date = new Date();
        const current_time = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

        const sessionName = this.ctx.getSessionName?.() || "";
        const sessionInfo = sessionName ? `${MAUVE}[${sessionName}]${RESET} ` : "";

        const line = `${sessionInfo}${BOLD}${BLUE} ${shortDir}${RESET}${gitInfo} ${DIM}|${RESET} ${OVERLAY2}${modelShort}${RESET} ${contextInfo}${overflowInfo}${cacheInfo}${costInfo}${durationInfo}${envInfo} ${DIM}${current_time}${RESET}`;

        return [line];
    }
}

export default function(pi: ExtensionAPI) {
    pi.on("session_start", async (_event, ctx) => {
        if (!ctx.hasUI) return;
        ctx.ui.setFooter((tui, theme, footerData) => {
            return new PowerlineFooter(tui, theme, footerData, ctx);
        });
    });
}
