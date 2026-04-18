import type { ExtensionAPI, ExtensionContext, ContextUsage, ReadonlyFooterDataProvider } from "@mariozechner/pi-coding-agent";
import { truncateToWidth, type Component, type Theme, type TUI } from "@mariozechner/pi-tui";
import * as child_process from "child_process";

class PowerlineFooter implements Component {
	private tui: TUI;
	private theme: Theme;
	private footerData: ReadonlyFooterDataProvider;
	private ctx: ExtensionContext;
	private interval?: ReturnType<typeof setInterval>;
	private sessionStartTime: number;

	// Cached git state (updated async every 10s)
	private gitStatusExtras: string = "";

	constructor(tui: TUI, theme: Theme, footerData: ReadonlyFooterDataProvider, ctx: ExtensionContext) {
		this.tui = tui;
		this.theme = theme;
		this.footerData = footerData;
		this.ctx = ctx;
		this.sessionStartTime = Date.now();

		this.fetchAsyncData();

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
					if (!err2 && revListOut && revListOut.includes("\t")) {
						const [b, a] = revListOut.trim().split("\t");
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
	}

	invalidate() {}
	handleInput(_data: string) {}

	private formatTokens(num: number): string {
		if (num >= 1_000_000) {
			return (num / 1_000_000).toFixed(1) + "M";
		}
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

		// --- Directory ---
		const cwd = this.ctx.cwd;
		const homeDir = process.env.HOME || process.env.USERPROFILE || "";
		let shortDir = cwd;
		if (homeDir && shortDir.startsWith(homeDir)) {
			shortDir = "~" + shortDir.slice(homeDir.length);
		}
		const parts = shortDir.split("/");
		if (parts.length > 4) {
			shortDir = parts.slice(parts.length - 4).join("/");
		}

		// --- Git ---
		let gitInfo = "";
		const branch = this.footerData.getGitBranch();
		if (branch) {
			gitInfo = ` ${DIM}on${RESET} ${MAUVE} ${branch}${RESET}`;
			if (this.gitStatusExtras) {
				gitInfo += ` ${RED}${this.gitStatusExtras}${RESET}`;
			}
		}

		// --- Model ---
		const model = this.ctx.model;
		const modelShort = model?.name || model?.id || "unknown";

		// --- Context usage ---
		const contextUsage = this.ctx.getContextUsage();
		let contextInfo = "";
		let costInfo = "";

		if (contextUsage) {
			const used = contextUsage.tokens;
			const total = contextUsage.contextWindow;
			const pct = contextUsage.percent;
			const remaining = 100 - pct;

			let ctxColor = GREEN;
			if (remaining < 20) {
				ctxColor = RED;
			} else if (remaining < 50) {
				ctxColor = YELLOW;
			}

			const pctDisplay = pct % 1 === 0 ? pct.toFixed(0) : pct.toFixed(1);
			contextInfo = `${ctxColor}${this.formatTokens(used)}/${this.formatTokens(total)} (${pctDisplay}%)${RESET}`;

			// Cost estimation from model pricing
			if (model?.cost && contextUsage.usageTokens > 0) {
				// Rough estimate: treat usageTokens as input, trailingTokens as recent output
				const inputTokens = contextUsage.usageTokens;
				const outputTokens = contextUsage.trailingTokens;
				const cost =
					(inputTokens * model.cost.input) / 1_000_000 +
					(outputTokens * model.cost.output) / 1_000_000;

				if (cost >= 0.005) {
					costInfo = ` ${DIM}|${RESET} ${PEACH}$${cost.toFixed(2)}${RESET}`;
				} else if (cost > 0) {
					costInfo = ` ${DIM}|${RESET} ${PEACH}<$0.01${RESET}`;
				}
			}
		}

		// --- Session duration ---
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

		// --- Python env ---
		let envInfo = "";
		if (process.env.CONDA_DEFAULT_ENV) {
			envInfo = ` ${SKY}(${process.env.CONDA_DEFAULT_ENV})${RESET}`;
		} else if (process.env.VIRTUAL_ENV) {
			const venvName = process.env.VIRTUAL_ENV.split("/").pop() || "";
			envInfo = ` ${SKY}(${venvName})${RESET}`;
		}

		// --- Time ---
		const date = new Date();
		const currentTime = `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;

		// --- Session name ---
		const sessionName = this.ctx.sessionManager.getSessionName();
		const sessionInfo = sessionName ? `${MAUVE}[${sessionName}]${RESET} ` : "";

		// --- Extension statuses ---
		let statusInfo = "";
		const statuses = this.footerData.getExtensionStatuses();
		if (statuses.size > 0) {
			const parts: string[] = [];
			for (const [, text] of statuses) {
				if (text) parts.push(text);
			}
			if (parts.length > 0) {
				statusInfo = ` ${DIM}|${RESET} ${parts.join(" ")}`;
			}
		}

		const line = `${sessionInfo}${BOLD}${BLUE} ${shortDir}${RESET}${gitInfo} ${DIM}|${RESET} ${OVERLAY2}${modelShort}${RESET} ${contextInfo}${costInfo}${durationInfo}${envInfo}${statusInfo} ${DIM}${currentTime}${RESET}`;
		const safeWidth = Math.max(0, width);

		return [truncateToWidth(line, safeWidth)];
	}
}

export default function (pi: ExtensionAPI) {
	pi.on("session_start", async (_event, ctx) => {
		if (!ctx.hasUI) return;
		ctx.ui.setFooter((tui, theme, footerData) => {
			return new PowerlineFooter(tui, theme, footerData, ctx);
		});
	});
}
