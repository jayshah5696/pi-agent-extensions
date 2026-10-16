import { it } from "node:test";
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, mkdir, writeFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

it("keeps the real RPC process alive through session replacement with a pending history read", { timeout: 20_000 }, async (t) => {
	const home = await mkdtemp(path.join(os.tmpdir(), "cwd-history-rpc-"));
	t.after(() => rm(home, { recursive: true, force: true }));
	const cwd = path.join(home, "project");
	await mkdir(cwd);
	const target = path.join(home, "target.jsonl");
	await writeFile(target, JSON.stringify({
		type: "session", version: 3, id: "rpc-target", timestamp: new Date().toISOString(), cwd,
	}) + "\n");

	// Control the race without sleeps: finish the old history read during the
	// replacement runtime's extension factory, after Pi invalidates the old ctx.
	const preload = path.join(home, "pending-history.mjs");
	await writeFile(preload, `
import fs from "node:fs/promises";
const pending = [];
globalThis[Symbol.for("cwd-history-test.release")] = () => {
  for (const resolve of pending.splice(0)) resolve();
};
const readdir = fs.readdir;
fs.readdir = async function (dir, ...args) {
  if (String(dir) === process.env.CWD_HISTORY_TEST_DIR) {
    await new Promise(resolve => pending.push(resolve));
    return [];
  }
  return readdir.call(this, dir, ...args);
};
`);
	const startup = path.join(home, "replacement-startup.ts");
	await writeFile(startup, `
export default async function () {
  globalThis[Symbol.for("cwd-history-test.release")]();
  await new Promise(resolve => setImmediate(resolve));
}
`);

	const cli = fileURLToPath(new URL("./cli.js", import.meta.resolve("@earendil-works/pi-coding-agent")));
	const extension = fileURLToPath(new URL("../../extensions/cwd-history/index.ts", import.meta.url));
	const child = spawn(process.execPath, [
		"--import", preload, cli, "--mode", "rpc", "--offline", "--no-session",
		"--no-extensions", "--no-skills", "--no-prompt-templates", "--no-themes", "--no-context-files",
		"--extension", startup, "--extension", extension,
	], {
		cwd,
		env: {
			...process.env,
			HOME: home,
			PI_CODING_AGENT_DIR: path.join(home, ".pi", "agent"),
			CWD_HISTORY_TEST_DIR: path.join(home, ".pi", "agent", "sessions", `--${cwd.replace(/^[/\\]/, "").replace(/[/\\:]/g, "-")}--`),
		},
	});
	t.after(() => { if (child.exitCode === null) child.kill("SIGKILL"); });
	const deadline = setTimeout(() => child.kill("SIGKILL"), 15_000);
	t.after(() => clearTimeout(deadline));
	const exited = once(child, "close");
	let stderr = "";
	let buffer = "";
	const responses: Array<{ type: string; id?: string; success?: boolean; data?: { cancelled?: boolean } }> = [];
	const commands = [
		{ id: "switch", type: "switch_session", sessionPath: target },
		{ id: "new", type: "new_session" },
		{ id: "state", type: "get_state" },
	];
	child.stderr.setEncoding("utf8").on("data", (chunk) => { stderr += chunk; });
	child.stdin.on("error", () => { /* Report an early process exit with its stderr below. */ });
	child.stdout.setEncoding("utf8").on("data", (chunk) => {
		buffer += chunk;
		let end: number;
		while ((end = buffer.indexOf("\n")) !== -1) {
			const record = JSON.parse(buffer.slice(0, end));
			buffer = buffer.slice(end + 1);
			if (record.type !== "response") continue;
			responses.push(record);
			const next = commands.shift();
			if (next) child.stdin.write(JSON.stringify(next) + "\n");
			else child.stdin.end();
		}
	});
	child.stdin.write(JSON.stringify({ id: "ready", type: "get_state" }) + "\n");
	const [code, signal] = await exited;
	assert.equal(code, 0, `Pi exited with signal ${signal}:\n${stderr}`);
	assert.equal(stderr, "");
	assert.deepEqual(responses.map(({ id, success }) => ({ id, success })), [
		{ id: "ready", success: true },
		{ id: "switch", success: true },
		{ id: "new", success: true },
		{ id: "state", success: true },
	]);
	assert.equal(responses[1].data?.cancelled, false);
	assert.equal(responses[2].data?.cancelled, false);
});
