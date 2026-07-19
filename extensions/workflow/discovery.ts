import { existsSync, readFileSync, readdirSync } from "node:fs";
import { homedir } from "node:os";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseWorkflowScript } from "./runtime.js";
import type { SavedWorkflowFile } from "./types.js";

export interface WorkflowDiscoveryOptions {
  projectDir?: string;
  userDir?: string;
  builtInDir?: string | null;
}

export function getProjectWorkflowDir(cwd: string): string {
  return join(cwd, ".pi", "workflows");
}

export function getUserWorkflowDir(): string {
  return join(homedir(), ".pi", "workflows", "saved");
}

export function getBuiltInWorkflowDir(): string {
  return join(dirname(fileURLToPath(import.meta.url)), "examples");
}

export function discoverWorkflowFiles(
  cwd: string,
  options: WorkflowDiscoveryOptions = {},
): SavedWorkflowFile[] {
  const project = readWorkflowDir(options.projectDir ?? getProjectWorkflowDir(cwd), "project");
  const user = readWorkflowDir(options.userDir ?? getUserWorkflowDir(), "user");
  const builtIn = readWorkflowDir(
    options.builtInDir === undefined ? getBuiltInWorkflowDir() : options.builtInDir,
    "built-in",
  );
  const discovered = new Map<string, SavedWorkflowFile>();

  for (const workflow of builtIn) discovered.set(workflow.id, workflow);
  for (const workflow of user) discovered.set(workflow.id, workflow);
  for (const workflow of project) discovered.set(workflow.id, workflow);
  return [...discovered.values()].sort((a, b) => a.id.localeCompare(b.id));
}

export function loadWorkflowFile(
  cwd: string,
  name: string,
  options: WorkflowDiscoveryOptions = {},
): SavedWorkflowFile | undefined {
  const normalized = name.trim().replace(/\.js$/i, "");
  return discoverWorkflowFiles(cwd, options).find(
    (workflow) => workflow.id === normalized || workflow.name === normalized,
  );
}

function readWorkflowDir(dir: string | null, location: "project" | "user" | "built-in"): SavedWorkflowFile[] {
  if (!dir) return [];
  if (!existsSync(dir)) return [];
  const files: SavedWorkflowFile[] = [];

  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith(".js")) continue;
    const path = join(dir, entry.name);
    try {
      const script = readFileSync(path, "utf8");
      const { meta } = parseWorkflowScript(script);
      files.push({
        id: basename(entry.name, ".js"),
        name: meta.name,
        description: meta.description,
        phases: meta.phases?.map((phase) => phase.title) ?? [],
        path,
        location,
        script,
      });
    } catch {
      // Invalid JavaScript workflows stay invisible until they pass runtime parsing.
    }
  }
  return files;
}
