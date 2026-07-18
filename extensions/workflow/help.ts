import { WORKFLOW_ROLES, type WorkflowControlSettings, type WorkflowRole } from "./types.js";

export interface WorkflowDoctorReport {
  extensionActive: boolean;
  projectTrusted: boolean;
  settings?: WorkflowControlSettings;
  availableModels: number;
  missingRoles: WorkflowRole[];
  savedWorkflows: number;
  runHistory: number;
}

export function formatWorkflowHelp(): string {
  return [
    "Workflow — inspectable, model-routed multi-agent work",
    "",
    "Quick start",
    "  1. /workflow setup",
    "     Choose Lean, Balanced, Deep, or Custom and review each model route.",
    "  2. /workflow run <what you want accomplished>",
    "     Pi generates the orchestration but does not start it yet.",
    "  3. Review the complete JavaScript approval screen.",
    "     Tab/←/→ switches code and summary · ↑/↓/PgUp/PgDn scrolls · y runs · n/Esc rejects.",
    "  4. /workflow history",
    "     Open the result, agent evidence, generated script, usage, and export actions.",
    "",
    "Run and inspect",
    "  /workflow                         open the run browser",
    "  /workflow run <prompt>            generate, review, and run a workflow",
    "  /workflow saved <name> [json]     review and run saved JavaScript",
    "  /workflow active                  inspect running or paused workflows",
    "  /workflow history                 inspect all project workflow runs",
    "  /workflow status <run-id>         print one run's status",
    "",
    "Configure and control",
    "  /workflow setup                   choose model routes, limits, and approval policy",
    "  /workflow settings                show the effective configuration",
    "  /workflow list                    list built-in, personal, and project workflows",
    "  /workflow pause|resume|stop <id>  control a live run",
    "  /workflow remove <id>             delete a persisted run",
    "",
    "Verify safely",
    "  /workflow doctor                  read-only readiness check; no model calls or workflows",
    "",
    "Background results are displayed without waking the parent model. A failed run will not retry or ask for approval again on its own.",
  ].join("\n");
}

export function formatWorkflowDoctor(report: WorkflowDoctorReport): string {
  const configured = Boolean(report.settings);
  const routesReady = configured && report.availableModels > 0 && report.missingRoles.length === 0;
  const ready = report.extensionActive && report.projectTrusted && routesReady;
  const lines = [
    "Workflow doctor — read-only readiness check",
    "",
    check(report.extensionActive, "Workflow extension is active", "Workflow tool is not active"),
    check(report.projectTrusted, "Project is trusted", "Project is not trusted; restart Pi with --approve"),
    configured
      ? check(true, `Model profile is configured: ${report.settings?.profile}`)
      : check(false, "Model profile is not configured; run /workflow setup"),
  ];

  if (!configured) {
    lines.push(check(false, "Model routes cannot be checked before setup"));
  } else if (!report.availableModels) {
    lines.push(check(false, "No authenticated models are available"));
  } else if (report.missingRoles.length) {
    lines.push(check(false, `Unavailable model routes: ${report.missingRoles.join(", ")}; run /workflow setup again`));
  } else {
    lines.push(check(true, `All ${WORKFLOW_ROLES.length} model routes are available (${report.availableModels} authenticated models)`));
  }

  lines.push(
    check(true, `${report.savedWorkflows} saved or built-in workflows discovered`),
    check(true, `${report.runHistory} project runs visible in history`),
    "",
    ready ? "Ready. Try: /workflow run inspect this repository and report the highest-risk issue" : nextStep(report),
    "Approval must show the complete JavaScript before any agents start.",
    "This check made no model calls, changed no settings, and started no workflows.",
  );
  return lines.join("\n");
}

function check(ok: boolean, success: string, failure = success): string {
  return `${ok ? "✓" : "✗"} ${ok ? success : failure}`;
}

function nextStep(report: WorkflowDoctorReport): string {
  if (!report.extensionActive) return "Not ready. Reload Pi with the workflow extension enabled.";
  if (!report.projectTrusted) return "Not ready. Restart Pi with --approve, then run /workflow doctor again.";
  if (!report.settings) return "Not ready. Run /workflow setup, then /workflow doctor again.";
  return "Not ready. Run /workflow setup again and choose available authenticated models.";
}
