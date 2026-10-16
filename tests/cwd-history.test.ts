import { describe, it } from "node:test";
import assert from "node:assert/strict";
import os from "node:os";
import cwdHistory from "../extensions/cwd-history/index.js";

// Pi throws on any ctx access after a session is replaced. An unhandled
// rejection from the async history load kills `pi --mode rpc`.
describe("cwd-history extension", () => {
	it("does not leak an unhandled rejection when ctx goes stale during history load", async () => {
		const handlers = new Map<string, (event: unknown, ctx: unknown) => unknown>();
		const pi = {
			on: (name: string, handler: (event: unknown, ctx: unknown) => unknown) => handlers.set(name, handler),
			getThinkingLevel: () => "off",
		};

		let stale = false;
		const ctx = {
			hasUI: true,
			cwd: os.tmpdir(),
			sessionManager: { getSessionFile: () => undefined, getBranch: () => [] },
			ui: {
				setEditorComponent: () => {},
				getEditorText: () => {
					if (stale) throw new Error("This extension ctx is stale after session replacement or reload.");
					return "";
				},
			},
		};

		const rejections: unknown[] = [];
		const onRejection = (err: unknown) => rejections.push(err);
		process.on("unhandledRejection", onRejection);
		try {
			cwdHistory(pi as never);
			handlers.get("session_start")!({}, ctx);
			stale = true; // session replaced before the async load finishes
			await new Promise((resolve) => setTimeout(resolve, 200));
		} finally {
			process.off("unhandledRejection", onRejection);
		}
		assert.deepEqual(rejections, []);
	});
});
