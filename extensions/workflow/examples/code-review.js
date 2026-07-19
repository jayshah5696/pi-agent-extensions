export const meta = {
  name: "code_review",
  description: "Review a change from correctness, testing, and maintainability angles",
  phases: [{ title: "Inspect" }, { title: "Synthesize" }],
};

const scope = String(args?.scope ?? "the current uncommitted changes");
phase("Inspect");
const findings = await parallel([
  () => agent(`Review ${scope} for correctness bugs and edge cases. Cite files and evidence.`, {
    label: "correctness review",
    tier: "reviewer",
    tools: ["read", "bash"],
  }),
  () => agent(`Review ${scope} for missing, weak, or misleading tests. Cite concrete gaps.`, {
    label: "test review",
    tier: "reviewer",
    tools: ["read", "bash"],
  }),
  () => agent(`Review ${scope} for maintainability and architecture risks. Avoid style-only comments.`, {
    label: "design review",
    tier: "reviewer",
    tools: ["read", "bash"],
  }),
]);

phase("Synthesize");
const verdict = await agent(
  `Deduplicate and rank these review findings by severity and confidence. Keep only actionable, evidenced findings:\n\n${findings.filter(Boolean).join("\n\n")}`,
  { label: "review verdict", tier: "synthesizer", tools: ["read"] },
);
return { scope, findings, verdict };
