export const meta = {
  name: "repository_audit",
  description: "Audit a repository across architecture, security, testing, and operability",
  phases: [{ title: "Map" }, { title: "Audit" }, { title: "Synthesize" }],
};

phase("Map");
const map = await agent(
  "Map the repository architecture, entry points, state boundaries, and test strategy. Cite the most relevant paths.",
  { label: "repository map", tier: "scout", tools: ["read", "bash"] },
);

phase("Audit");
const audits = await parallel([
  () => agent(`Using this repository map, find concrete architecture and maintainability risks:\n${map}`, {
    label: "architecture audit",
    tier: "worker",
    tools: ["read", "bash"],
  }),
  () => agent(`Using this repository map, find concrete security and trust-boundary risks:\n${map}`, {
    label: "security audit",
    tier: "reviewer",
    tools: ["read", "bash"],
  }),
  () => agent(`Using this repository map, find important test and verification gaps:\n${map}`, {
    label: "testing audit",
    tier: "worker",
    tools: ["read", "bash"],
  }),
  () => agent(`Using this repository map, find deployment, recovery, and operability risks:\n${map}`, {
    label: "operations audit",
    tier: "reviewer",
    tools: ["read", "bash"],
  }),
]);

phase("Synthesize");
const report = await agent(
  `Produce a prioritized repository audit. Deduplicate claims, preserve file evidence, state uncertainty, and cap the final list at ten findings.\n\n${audits.filter(Boolean).join("\n\n")}`,
  { label: "audit report", tier: "synthesizer", tools: ["read"] },
);
return { map, audits, report };
