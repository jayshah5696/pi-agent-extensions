#!/usr/bin/env node
/**
 * Run handoff extraction evaluation on the dataset.
 * 
 * Usage:
 *   npx tsx evals/handoff/scripts/run-eval.ts [--smoke] [--full]
 * 
 * Options:
 *   --smoke  Run only first 5 cases (default)
 *   --full   Run all cases
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const EVALS_DIR = join(__dirname, "..");

interface TestCase {
  id: string;
  category: string;
  session_type: string;
  session_length: string;
  goal: string;
  conversation_file: string;
  expected_files: string[];
  expected_commands: string[];
  expected_context: string[];
  expected_decisions: string[];
  pass_criteria: {
    files_coverage: number;
    context_coverage: number;
    no_hallucinated_files: boolean;
    no_completed_tasks_in_context: boolean;
  };
  notes: string;
}

interface EvalResult {
  id: string;
  timestamp: string;
  goal: string;
  extraction: any | null;
  scores: {
    files_coverage: number;
    context_found: string[];
    context_missing: string[];
    hallucinated_files: string[];
    has_history_dump: boolean;
  };
  pass: boolean;
  critique: string;
}

function loadDataset(): TestCase[] {
  const datasetPath = join(EVALS_DIR, "dataset.jsonl");
  if (!existsSync(datasetPath)) {
    console.error("Dataset not found:", datasetPath);
    process.exit(1);
  }
  
  const lines = readFileSync(datasetPath, "utf-8")
    .split("\n")
    .filter(line => line.trim().length > 0);
  
  return lines.map(line => JSON.parse(line));
}

function loadConversation(testCase: TestCase): string | null {
  const convPath = join(EVALS_DIR, testCase.conversation_file);
  if (!existsSync(convPath)) {
    console.warn(`Conversation file not found: ${convPath}`);
    return null;
  }
  return readFileSync(convPath, "utf-8");
}

/**
 * Simulate extraction for now - in real usage, this would call the actual extractor
 */
async function runExtraction(conversationText: string, goal: string): Promise<any> {
  // TODO: Integrate with actual handoff extraction
  // For now, return a placeholder that will fail
  console.log(`  [Would run extraction with goal: "${goal.slice(0, 50)}..."]`);
  return {
    relevantFiles: [],
    relevantCommands: [],
    relevantInformation: [],
    decisions: [],
    openQuestions: [],
  };
}

function evaluateExtraction(
  testCase: TestCase,
  extraction: any,
  conversationText: string,
): EvalResult {
  const scores = {
    files_coverage: 0,
    context_found: [] as string[],
    context_missing: [] as string[],
    hallucinated_files: [] as string[],
    has_history_dump: false,
  };
  
  const critiques: string[] = [];
  
  // Check file coverage
  const gotPaths = new Set(
    extraction.relevantFiles?.map((f: any) => f.path) ?? []
  );
  const expectedFound = testCase.expected_files.filter(f => 
    gotPaths.has(f) || [...gotPaths].some(g => g.endsWith(f.split("/").pop()!))
  );
  scores.files_coverage = expectedFound.length / testCase.expected_files.length;
  
  if (scores.files_coverage < testCase.pass_criteria.files_coverage) {
    const missing = testCase.expected_files.filter(f => !expectedFound.includes(f));
    critiques.push(`File coverage ${(scores.files_coverage * 100).toFixed(0)}% < ${(testCase.pass_criteria.files_coverage * 100)}%. Missing: ${missing.join(", ")}`);
  }
  
  // Check for hallucinated files
  const lowerConv = conversationText.toLowerCase();
  for (const file of extraction.relevantFiles ?? []) {
    const path = file.path.toLowerCase();
    const filename = path.split("/").pop();
    if (!lowerConv.includes(path) && (!filename || !lowerConv.includes(filename))) {
      scores.hallucinated_files.push(file.path);
    }
  }
  
  if (scores.hallucinated_files.length > 0 && testCase.pass_criteria.no_hallucinated_files) {
    critiques.push(`Hallucinated files: ${scores.hallucinated_files.join(", ")}`);
  }
  
  // Check context coverage
  const infoText = (extraction.relevantInformation ?? []).join(" ").toLowerCase();
  for (const expected of testCase.expected_context) {
    // Simple keyword matching - could be improved with semantic similarity
    const keywords = expected.toLowerCase().split(" ").filter(w => w.length > 4);
    const found = keywords.filter(k => infoText.includes(k)).length / keywords.length;
    if (found > 0.5) {
      scores.context_found.push(expected);
    } else {
      scores.context_missing.push(expected);
    }
  }
  
  const contextCoverage = scores.context_found.length / testCase.expected_context.length;
  if (contextCoverage < testCase.pass_criteria.context_coverage) {
    critiques.push(`Context coverage ${(contextCoverage * 100).toFixed(0)}% < ${(testCase.pass_criteria.context_coverage * 100)}%. Missing: ${scores.context_missing.join("; ")}`);
  }
  
  // Check for history dump patterns
  const historyPatterns = [
    /we (implemented|added|created|built|completed)/i,
    /was (implemented|added|created|completed)/i,
    /the following (was|were) (done|completed|implemented)/i,
  ];
  const allInfo = (extraction.relevantInformation ?? []).join(" ");
  scores.has_history_dump = historyPatterns.some(p => p.test(allInfo));
  
  if (scores.has_history_dump && testCase.pass_criteria.no_completed_tasks_in_context) {
    critiques.push("Contains history dump pattern (lists completed work)");
  }
  
  // Determine pass/fail
  const pass = 
    scores.files_coverage >= testCase.pass_criteria.files_coverage &&
    (scores.hallucinated_files.length === 0 || !testCase.pass_criteria.no_hallucinated_files) &&
    contextCoverage >= testCase.pass_criteria.context_coverage &&
    (!scores.has_history_dump || !testCase.pass_criteria.no_completed_tasks_in_context);
  
  return {
    id: testCase.id,
    timestamp: new Date().toISOString(),
    goal: testCase.goal,
    extraction,
    scores,
    pass,
    critique: critiques.length > 0 ? critiques.join("\n") : "All checks passed",
  };
}

async function main() {
  const args = process.argv.slice(2);
  const isSmoke = args.includes("--smoke") || !args.includes("--full");
  
  console.log(`\nHandoff Eval Runner (${isSmoke ? "smoke" : "full"} mode)\n`);
  console.log("=".repeat(50));
  
  const dataset = loadDataset();
  const cases = isSmoke ? dataset.slice(0, 5) : dataset;
  
  console.log(`Running ${cases.length} test cases...\n`);
  
  const results: EvalResult[] = [];
  let passed = 0;
  let skipped = 0;
  
  for (const testCase of cases) {
    console.log(`[${testCase.id}] ${testCase.goal.slice(0, 60)}...`);
    
    const conversationText = loadConversation(testCase);
    if (!conversationText) {
      console.log("  SKIPPED (no conversation file)\n");
      skipped++;
      continue;
    }
    
    const extraction = await runExtraction(conversationText, testCase.goal);
    const result = evaluateExtraction(testCase, extraction, conversationText);
    results.push(result);
    
    if (result.pass) {
      console.log("  PASS");
      passed++;
    } else {
      console.log("  FAIL");
      console.log(`  ${result.critique.split("\n").join("\n  ")}`);
    }
    console.log();
  }
  
  // Summary
  console.log("=".repeat(50));
  console.log(`\nResults: ${passed}/${results.length} passed (${skipped} skipped)`);
  console.log(`Pass rate: ${((passed / results.length) * 100).toFixed(1)}%\n`);
  
  // Save results
  const outputPath = join(EVALS_DIR, "judgments", `${new Date().toISOString().split("T")[0]}.jsonl`);
  const output = results.map(r => JSON.stringify(r)).join("\n");
  writeFileSync(outputPath, output);
  console.log(`Results saved to: ${outputPath}`);
  
  // Exit with error if pass rate is below threshold
  if (passed / results.length < 0.85) {
    process.exit(1);
  }
}

main().catch(console.error);
