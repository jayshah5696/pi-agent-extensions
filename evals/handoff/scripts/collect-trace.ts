#!/usr/bin/env node
/**
 * Collect a handoff trace from a Pi session file.
 * 
 * Usage:
 *   npx tsx evals/handoff/scripts/collect-trace.ts <session-file> <goal> [trace-id]
 * 
 * Example:
 *   npx tsx evals/handoff/scripts/collect-trace.ts ~/.pi/sessions/abc123.jsonl "implement dark mode" handoff_001
 * 
 * This will:
 * 1. Read the session file
 * 2. Serialize the conversation
 * 3. Save the trace to evals/handoff/traces/<trace-id>.json
 * 4. Save the conversation text to evals/handoff/traces/<trace-id>_conversation.txt
 */

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { join, dirname, basename } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const TRACES_DIR = join(__dirname, "..", "traces");

interface SessionEntry {
  type: string;
  role?: string;
  content?: any;
  text?: string;
  timestamp?: number;
  [key: string]: any;
}

function loadSession(sessionPath: string): SessionEntry[] {
  if (!existsSync(sessionPath)) {
    throw new Error(`Session file not found: ${sessionPath}`);
  }
  
  const content = readFileSync(sessionPath, "utf-8");
  const lines = content.split("\n").filter(line => line.trim().length > 0);
  
  return lines.map(line => JSON.parse(line));
}

function serializeConversation(entries: SessionEntry[]): string {
  const parts: string[] = [];
  
  for (const entry of entries) {
    if (entry.type === "user" && entry.text) {
      parts.push(`USER: ${entry.text}`);
    } else if (entry.type === "assistant" && entry.content) {
      const textParts = entry.content
        .filter((c: any) => c.type === "text")
        .map((c: any) => c.text);
      if (textParts.length > 0) {
        parts.push(`ASSISTANT: ${textParts.join("\n")}`);
      }
    } else if (entry.type === "tool_call") {
      parts.push(`TOOL CALL: ${entry.toolName}(${JSON.stringify(entry.input).slice(0, 200)}...)`);
    } else if (entry.type === "tool_result") {
      const resultPreview = JSON.stringify(entry.result).slice(0, 500);
      parts.push(`TOOL RESULT: ${resultPreview}...`);
    }
  }
  
  return parts.join("\n\n");
}

function extractSessionMetadata(entries: SessionEntry[]): any {
  const meta: any = {};
  
  // Find session header
  const header = entries.find(e => e.type === "session");
  if (header) {
    meta.sessionId = header.id;
    meta.startTime = header.startTime;
    meta.cwd = header.cwd;
  }
  
  // Count messages
  meta.userMessages = entries.filter(e => e.type === "user").length;
  meta.assistantMessages = entries.filter(e => e.type === "assistant").length;
  meta.toolCalls = entries.filter(e => e.type === "tool_call").length;
  
  // Extract mentioned files (simple heuristic)
  const allText = entries
    .filter(e => e.type === "user" || e.type === "assistant")
    .map(e => e.text || (e.content?.map((c: any) => c.text).join(" ") ?? ""))
    .join(" ");
  
  const filePatterns = allText.match(/[\w\-./]+\.(ts|js|tsx|jsx|json|md|py|rs|go|rb)/g) ?? [];
  meta.mentionedFiles = [...new Set(filePatterns)].slice(0, 50);
  
  return meta;
}

function main() {
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log("Usage: npx tsx collect-trace.ts <session-file> <goal> [trace-id]");
    console.log("");
    console.log("Example:");
    console.log('  npx tsx collect-trace.ts ~/.pi/sessions/abc123.jsonl "implement dark mode"');
    process.exit(1);
  }
  
  const sessionPath = args[0];
  const goal = args[1];
  const traceId = args[2] || `handoff_${Date.now()}`;
  
  console.log(`\nCollecting trace from: ${sessionPath}`);
  console.log(`Goal: ${goal}`);
  console.log(`Trace ID: ${traceId}\n`);
  
  // Load and process session
  const entries = loadSession(sessionPath);
  console.log(`Loaded ${entries.length} entries`);
  
  const conversationText = serializeConversation(entries);
  console.log(`Serialized ${conversationText.length} chars of conversation`);
  
  const metadata = extractSessionMetadata(entries);
  console.log(`Found ${metadata.mentionedFiles?.length ?? 0} mentioned files`);
  
  // Build trace object
  const trace = {
    trace_id: traceId,
    timestamp: new Date().toISOString(),
    session_file: sessionPath,
    goal,
    metadata,
    conversation_length: conversationText.length,
    conversation_preview: conversationText.slice(0, 500) + "...",
  };
  
  // Save trace
  const tracePath = join(TRACES_DIR, `${traceId}.json`);
  writeFileSync(tracePath, JSON.stringify(trace, null, 2));
  console.log(`\nSaved trace to: ${tracePath}`);
  
  // Save conversation text
  const convPath = join(TRACES_DIR, `${traceId}_conversation.txt`);
  writeFileSync(convPath, conversationText);
  console.log(`Saved conversation to: ${convPath}`);
  
  // Print template for dataset entry
  console.log("\n--- Dataset Entry Template ---\n");
  const datasetEntry = {
    id: traceId,
    category: "happy_path",
    session_type: "TODO",
    session_length: metadata.userMessages > 30 ? "long" : metadata.userMessages > 10 ? "medium" : "short",
    goal,
    conversation_file: `traces/${traceId}_conversation.txt`,
    expected_files: metadata.mentionedFiles?.slice(0, 5) ?? [],
    expected_commands: [],
    expected_context: ["TODO: Add expected context facts"],
    expected_decisions: [],
    pass_criteria: {
      files_coverage: 0.8,
      context_coverage: 0.7,
      no_hallucinated_files: true,
      no_completed_tasks_in_context: true,
    },
    notes: "TODO: Add notes about this case",
  };
  console.log(JSON.stringify(datasetEntry));
  console.log("\n--- End Template ---\n");
  console.log("Copy the above JSON and add it to evals/handoff/dataset.jsonl");
  console.log("Then edit the expected_* fields based on what SHOULD be extracted.");
}

main();
