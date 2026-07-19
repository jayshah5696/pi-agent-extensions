export const meta = {
  name: "migration_plan",
  description: "Develop and stress-test an evidence-based migration plan",
  phases: [{ title: "Investigate" }, { title: "Design" }, { title: "Challenge" }, { title: "Finalize" }],
};

const target = String(args?.target ?? "the requested migration");
phase("Investigate");
const evidence = await parallel([
  () => agent(`Inspect the current implementation relevant to ${target}. Identify boundaries, dependencies, and constraints with file evidence.`, {
    label: "current state",
    tier: "scout",
    tools: ["read", "bash"],
  }),
  () => agent(`Investigate compatibility, data, API, and rollout constraints for ${target}. Cite repository evidence.`, {
    label: "migration constraints",
    tier: "worker",
    tools: ["read", "bash"],
  }),
]);

phase("Design");
const draft = await agent(
  `Design a vertical, reversible migration plan for ${target}. Include verification and rollback at each increment.\n\n${evidence.filter(Boolean).join("\n\n")}`,
  { label: "draft plan", tier: "worker", tools: ["read"] },
);

phase("Challenge");
const critique = await agent(
  `Stress-test this migration plan for hidden assumptions, unsafe sequencing, missing verification, and rollback gaps:\n\n${draft}`,
  { label: "plan challenge", tier: "reviewer", tools: ["read"] },
);

phase("Finalize");
const plan = await agent(
  `Produce the final migration plan for ${target}. Resolve valid critique, keep increments usable, and distinguish confirmed facts from assumptions.\n\nDRAFT:\n${draft}\n\nCRITIQUE:\n${critique}`,
  { label: "final plan", tier: "synthesizer", tools: ["read"] },
);
return { target, evidence, draft, critique, plan };
