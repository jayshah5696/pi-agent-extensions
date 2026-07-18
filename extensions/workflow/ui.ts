import type { ExtensionAPI, ExtensionUIContext } from "@earendil-works/pi-coding-agent";
import { deliverText, renderPanel, type WorkflowManager } from "./runtime.js";

type DeliveryManager = WorkflowManager & {
  __piWorkflowDeliveryInstalled?: boolean;
  __piWorkflowDeliveryApi?: ExtensionAPI;
};

export function installWorkflowResultDelivery(pi: ExtensionAPI, manager: WorkflowManager): void {
  const shared = manager as DeliveryManager;
  shared.__piWorkflowDeliveryApi = pi;
  if (shared.__piWorkflowDeliveryInstalled) return;
  shared.__piWorkflowDeliveryInstalled = true;

  const deliver = (content: string) => {
    try {
      const result = shared.__piWorkflowDeliveryApi?.sendMessage(
        { customType: "workflow-result", content, display: true },
        { triggerTurn: true, deliverAs: "followUp" },
      );
      void Promise.resolve(result).catch(() => {});
    } catch {
      // The persisted run remains available through /workflow history.
    }
  };

  manager.on("complete", ({ runId }: { runId: string }) => {
    const run = manager.getRun(runId);
    if (run?.background) deliver(deliverText(run));
  });
  manager.on("error", ({ runId, error }: { runId: string; error?: Error }) => {
    if (manager.getRun(runId)?.background) {
      deliver(`✗ Background workflow ${runId} failed: ${error?.message ?? "unknown error"}`);
    }
  });
  manager.on(
    "paused",
    ({ runId, reason, error, resetHint }: { runId: string; reason?: string; error?: Error; resetHint?: string }) => {
      if (reason !== "usage_limit" || !manager.getRun(runId)?.background) return;
      const when = resetHint ? ` (${resetHint})` : "";
      deliver(
        `⏸ Background workflow ${runId} paused: ${error?.message ?? "provider usage limit reached"}${when}. ` +
          `Completed steps are saved — run /workflow resume ${runId} after the limit resets.`,
      );
    },
  );
}

export function installWorkflowTaskPanel(manager: WorkflowManager, ui: ExtensionUIContext): void {
  ui.setWidget("workflow-tasks", (tui, theme) => {
    const render = () => tui.requestRender();
    const events = ["agentStart", "agentEnd", "phase", "complete", "error", "paused", "stopped"];
    for (const event of events) manager.on(event, render);
    return {
      render(width: number) {
        return renderPanel(manager, theme, width).map((line) =>
          line.replace("/workflows — open navigator", "/workflow active — inspect runs"),
        );
      },
      invalidate() {},
      dispose() {
        for (const event of events) manager.off(event, render);
      },
    };
  });
}
