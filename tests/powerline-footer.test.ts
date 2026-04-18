import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { visibleWidth } from "@mariozechner/pi-tui";
import powerlineFooterExtension from "../extensions/powerline-footer/index.js";

describe("powerline-footer", () => {
	it("truncates the rendered footer to the available width", async () => {
		let sessionStartHandler: ((event: any, ctx: any) => Promise<void> | void) | undefined;
		let footerFactory: ((tui: any, theme: any, footerData: any) => any) | undefined;

		const mockPi = {
			on: (event: string, handler: (event: any, ctx: any) => Promise<void> | void) => {
				if (event === "session_start") sessionStartHandler = handler;
			},
		};

		powerlineFooterExtension(mockPi as any);
		assert.ok(sessionStartHandler);

		const mockCtx = {
			hasUI: true,
			cwd: "/Users/jshah/emdash/worktrees/pi-agent-extensions/emdash/fix-powershell-issue-1k389",
			model: {
				name: "OpenAI: GPT-5.4 with a surprisingly long display name",
				id: "openai/gpt-5.4",
				cost: { input: 10, output: 30 },
			},
			getContextUsage: () => ({
				tokens: 12_345,
				contextWindow: 1_100_000,
				percent: 9.4,
				usageTokens: 50_000,
				trailingTokens: 10_000,
			}),
			sessionManager: {
				getSessionName: () => "very-long-session-name-for-powerline-footer-tests",
			},
			ui: {
				setFooter: (factory: (tui: any, theme: any, footerData: any) => any) => {
					footerFactory = factory;
				},
			},
		};

		await sessionStartHandler?.({}, mockCtx);
		assert.ok(footerFactory);

		const component = footerFactory?.(
			{ requestRender: () => {} },
			{},
			{
				getGitBranch: () => null,
				getExtensionStatuses: () =>
					new Map([
						["one", "status-one"],
						["two", "status-two"],
					]),
			},
		);
		assert.ok(component);

		const width = 40;
		const [line] = component.render(width);
		component.dispose();

		assert.ok(visibleWidth(line) <= width, `expected footer width <= ${width}, got ${visibleWidth(line)}`);
	});

	it("keeps the footer safe across multiple narrow widths", async () => {
		let sessionStartHandler: ((event: any, ctx: any) => Promise<void> | void) | undefined;
		let footerFactory: ((tui: any, theme: any, footerData: any) => any) | undefined;

		const mockPi = {
			on: (event: string, handler: (event: any, ctx: any) => Promise<void> | void) => {
				if (event === "session_start") sessionStartHandler = handler;
			},
		};

		powerlineFooterExtension(mockPi as any);
		assert.ok(sessionStartHandler);

		const mockCtx = {
			hasUI: true,
			cwd: "/Users/jshah/projects/some/deeply/nested/path/that/should/not/crash/the/footer/renderer",
			model: {
				name: "gpt-5.4",
				id: "openai/gpt-5.4",
			},
			getContextUsage: () => ({
				tokens: 999,
				contextWindow: 128_000,
				percent: 1,
				usageTokens: 0,
				trailingTokens: 0,
			}),
			sessionManager: {
				getSessionName: () => "session-name",
			},
			ui: {
				setFooter: (factory: (tui: any, theme: any, footerData: any) => any) => {
					footerFactory = factory;
				},
			},
		};

		await sessionStartHandler?.({}, mockCtx);
		assert.ok(footerFactory);

		const component = footerFactory?.(
			{ requestRender: () => {} },
			{},
			{
				getGitBranch: () => null,
				getExtensionStatuses: () => new Map(),
			},
		);
		assert.ok(component);

		for (const width of [80, 30, 20, 10]) {
			const [line] = component.render(width);
			assert.ok(visibleWidth(line) <= width, `expected footer width <= ${width}, got ${visibleWidth(line)}`);
		}

		component.dispose();
	});
});
