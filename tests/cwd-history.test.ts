import { describe, it, type TestContext } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setImmediate } from "node:timers/promises";
import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import cwdHistory from "../extensions/cwd-history/index.js";

type Handler = (event: unknown, ctx: ExtensionContext) => unknown;
type EditorFactory = NonNullable<Parameters<ExtensionContext["ui"]["setEditorComponent"]>[0]>;

function createHarness() {
	const handlers = new Map<string, Handler>();
	cwdHistory({
		on: (name: string, handler: Handler) => handlers.set(name, handler),
		getThinkingLevel: () => "off",
	} as unknown as ExtensionAPI);

	let stale = false;
	let uiReads = 0;
	let installs = 0;
	let text = "";
	let onGetText = () => {};
	let editorFactory: EditorFactory | undefined;
	const ctx = {
		mode: "tui",
		hasUI: true,
		cwd: "/cwd-history-test",
		sessionManager: {
			getSessionFile: () => undefined,
			getBranch: () => [{ type: "message", message: {
				role: "user", timestamp: 2, content: [{ type: "text", text: "current prompt" }],
			} }],
		},
		get ui() {
			uiReads++;
			if (stale) throw new Error("This extension ctx is stale after session replacement or reload.");
			return {
				setEditorComponent: (factory: EditorFactory) => {
					editorFactory = factory;
					installs++;
				},
				getEditorText: () => { onGetText(); return text; },
			};
		},
	} as unknown as ExtensionContext;

	return {
		start: () => handlers.get("session_start")!({}, ctx),
		shutdown: () => handlers.get("session_shutdown")!({}, ctx),
		makeStale: () => { stale = true; },
		setText: (value: string) => { text = value; },
		onGetText: (callback: () => void) => { onGetText = callback; },
		createEditor: () => {
			assert.ok(editorFactory);
			const identity = (text: string) => text;
			return editorFactory(
				{ requestRender: () => {} } as Parameters<EditorFactory>[0],
				{ borderColor: identity, selectList: {
					selectedPrefix: identity, selectedText: identity, description: identity,
					scrollInfo: identity, noMatch: identity,
				} },
				{ matches: () => false } as unknown as Parameters<EditorFactory>[2],
			);
		},
		get uiReads() { return uiReads; },
		get installs() { return installs; },
	};
}

function deferHistoryRead(t: TestContext) {
	let release!: () => void;
	const pending = new Promise<void>((resolve) => { release = resolve; });
	const read = t.mock.method(fs, "readdir", async () => {
		await pending;
		return [];
	});
	return { release, read };
}

describe("cwd-history extension", () => {
	for (const mode of ["rpc", "print", "json"] as const) {
		it(`does not load history or access editor APIs in ${mode} mode`, (t) => {
			const read = t.mock.method(fs, "readdir", async () => []);
			const handlers = new Map<string, Handler>();
			cwdHistory({ on: (name: string, handler: Handler) => handlers.set(name, handler) } as unknown as ExtensionAPI);
			const ctx = new Proxy({ mode }, {
				get(target, property) {
					if (property === "mode") return target.mode;
					throw new Error(`Unexpected ${String(property)} access in ${mode} mode`);
				},
			}) as ExtensionContext;
			handlers.get("session_start")!({}, ctx);
			assert.equal(read.mock.callCount(), 0);
		});
	}

	it("installs the terminal editor immediately while history loads", async (t) => {
		const { release, read } = deferHistoryRead(t);
		const harness = createHarness();
		harness.start();
		assert.equal(harness.installs, 1);
		assert.equal(read.mock.callCount(), 1);
		release();
		await setImmediate();
		assert.equal(harness.installs, 1, "empty history must not replace the editor again");
	});

	for (const edited of [false, true]) {
		it(edited ? "preserves text typed while history loads" : "loads previous prompts into the terminal editor", { timeout: 5_000 }, async (t) => {
			const home = await fs.mkdtemp(path.join(os.tmpdir(), "cwd-history-editor-"));
			t.after(() => fs.rm(home, { recursive: true, force: true }));
			t.mock.method(os, "homedir", () => home);
			const sessionDir = path.join(home, ".pi", "agent", "sessions", "--cwd-history-test--");
			await fs.mkdir(sessionDir, { recursive: true });
			await fs.writeFile(path.join(sessionDir, "previous.jsonl"), JSON.stringify({
				type: "message", message: {
					role: "user", timestamp: 1, content: [{ type: "text", text: "previous prompt" }],
				},
			}) + "\n");
			const readdir = fs.readdir;
			let release!: () => void;
			const pending = new Promise<void>((resolve) => { release = resolve; });
			t.mock.method(fs, "readdir", async () => {
				await pending;
				return readdir(sessionDir, { withFileTypes: true });
			});
			const harness = createHarness();
			harness.start();
			if (edited) harness.setText("unfinished prompt");
			const checkedText = new Promise<void>((resolve) => harness.onGetText(resolve));
			release();
			await checkedText;
			await setImmediate();
			assert.equal(harness.installs, edited ? 1 : 2);
			if (!edited) {
				const editor = harness.createEditor();
				editor.handleInput?.("\u001b[A");
				assert.equal(editor.getText(), "current prompt");
				editor.handleInput?.("\u001b[A");
				assert.equal(editor.getText(), "previous prompt");
			}
		});
	}

	it("does not access the old context after shutdown", async (t) => {
		const { release } = deferHistoryRead(t);
		const harness = createHarness();
		harness.start();
		harness.shutdown();
		harness.makeStale();
		const readsBeforeCompletion = harness.uiReads;
		release();
		await setImmediate();
		assert.equal(harness.uiReads, readsBeforeCompletion);
		assert.equal(harness.installs, 1);
	});

	it("discards a load superseded by another session start", async (t) => {
		const { release } = deferHistoryRead(t);
		const oldSession = createHarness();
		oldSession.start();
		oldSession.makeStale();
		const freshSession = createHarness();
		freshSession.start();
		const oldReads = oldSession.uiReads;
		release();
		await setImmediate();
		assert.equal(oldSession.uiReads, oldReads);
		assert.equal(freshSession.installs, 1);
	});

	it("contains late stale-context errors even without a shutdown event", async (t) => {
		const { release } = deferHistoryRead(t);
		const harness = createHarness();
		harness.start();
		harness.makeStale();
		release();
		await setImmediate();
		assert.equal(harness.installs, 1);
	});

	it("contains failures from the background history read", async (t) => {
		t.mock.method(fs, "readdir", async () => { throw new Error("history unavailable"); });
		const harness = createHarness();
		harness.start();
		await setImmediate();
		assert.equal(harness.installs, 1);
	});
});
