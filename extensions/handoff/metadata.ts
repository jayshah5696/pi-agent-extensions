import type { GitMetadata, SessionMetadata } from "./types.js";

/**
 * Parses git branch name from command output.
 *
 * @param output - Output from `git rev-parse --abbrev-ref HEAD`
 * @param exitCode - Exit code from the command
 * @returns Branch name or null if not in a git repo or detached HEAD
 */
export function parseGitBranch(
  output: string,
  exitCode: number | undefined,
): string | null {
  if (exitCode !== 0) {
    return null;
  }

  const branch = output.trim();

  // Empty output means not a git repo
  if (!branch) {
    return null;
  }

  // "HEAD" means detached HEAD state
  if (branch === "HEAD") {
    return null;
  }

  return branch;
}

/**
 * Parses git dirty state from command output.
 *
 * @param output - Output from `git status --porcelain`
 * @param exitCode - Exit code from the command
 * @returns true if there are uncommitted changes
 */
export function parseGitDirty(
  output: string,
  exitCode: number | undefined,
): boolean {
  if (exitCode !== 0) {
    return false;
  }

  // Any non-whitespace output means dirty
  return output.trim().length > 0;
}

/**
 * Result of an exec command
 */
interface ExecResult {
  stdout: string;
  stderr: string;
  code: number | undefined;
  killed: boolean;
}

/**
 * Exec function type (matches pi.exec signature)
 */
type ExecFn = (
  command: string,
  args: string[],
  options?: { signal?: AbortSignal; timeout?: number },
) => Promise<ExecResult>;

/**
 * Collects git metadata from the current repository.
 *
 * @param exec - Exec function (pi.exec)
 * @param signal - Optional abort signal
 * @returns Git metadata or undefined if not in a git repo
 */
export async function collectGitMetadata(
  exec: ExecFn,
  signal?: AbortSignal,
): Promise<GitMetadata | undefined> {
  try {
    // Get current branch
    const branchResult = await exec(
      "git",
      ["rev-parse", "--abbrev-ref", "HEAD"],
      { signal, timeout: 5000 },
    );

    const branch = parseGitBranch(branchResult.stdout, branchResult.code);

    // If we couldn't get a branch, we're probably not in a git repo
    if (branch === null && branchResult.code !== 0) {
      return undefined;
    }

    // Get dirty state
    const statusResult = await exec("git", ["status", "--porcelain"], {
      signal,
      timeout: 5000,
    });

    const isDirty = parseGitDirty(statusResult.stdout, statusResult.code);

    return { branch, isDirty };
  } catch {
    // Command failed (not a git repo, git not installed, etc.)
    return undefined;
  }
}

/**
 * Builds session metadata from various sources.
 *
 * @param options - Metadata collection options
 * @returns Session metadata object
 */
export async function collectSessionMetadata(options: {
  model?: { provider: string; id: string };
  thinkingLevel?: string;
  tools?: string[];
  sessionName?: string;
  lastSkill?: string;
  exec?: ExecFn;
  signal?: AbortSignal;
}): Promise<SessionMetadata> {
  const metadata: SessionMetadata = {};

  if (options.model) {
    metadata.model = `${options.model.provider}/${options.model.id}`;
  }

  if (options.thinkingLevel) {
    metadata.thinkingLevel = options.thinkingLevel;
  }

  if (options.tools && options.tools.length > 0) {
    metadata.tools = options.tools;
  }

  if (options.sessionName) {
    metadata.sessionName = options.sessionName;
  }

  if (options.lastSkill) {
    metadata.lastSkill = options.lastSkill;
  }

  // Collect git metadata if exec is provided
  if (options.exec) {
    metadata.git = await collectGitMetadata(options.exec, options.signal);
  }

  return metadata;
}
