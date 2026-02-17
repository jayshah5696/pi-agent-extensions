import dspy
import json
import os
from typing import List

from dotenv import load_dotenv
load_dotenv()

# 1. Define the RLM Signature for Session Auditing
class TraceAuditSignature(dspy.Signature):
    """
    Audit an LLM session log (JSONL) for logic drift, context rot, or unmasked secrets.
    The system writes Python code to filter and analyze the trace metadata before submitting findings.
    """
    log_data = dspy.InputField(desc="Raw session logs in JSONL format")
    audit_query = dspy.InputField(desc="The specific audit goal (e.g., 'Find all tool calls for Git')")
    audit_report = dspy.OutputField(desc="Structured findings: [PASS/FAIL], Discrepancy Log, and Token Efficiency")

# 2. Configure the RLM Module
class SessionAuditor(dspy.Module):
    def __init__(self):
        super().__init__()
        # Initialize RLM with a 10-iteration reasoning budget
        self.auditor = dspy.RLM(TraceAuditSignature, max_iterations=10)

    def forward(self, log_data, audit_query):
        return self.auditor(log_data=log_data, audit_query=audit_query)

def run_audit(log_path: str, query: str):
    # Setup standard LM (Gemini 3 Pro)
    # Note: Antigravity bypassed per user instruction.
    lm = dspy.LM("gemini/gemini-3-pro-preview", api_key=os.getenv("GEMINI_API_KEY"))
    dspy.configure(lm=lm)

    # Load logs
    if not os.path.exists(log_path):
        return f"[ERROR] Log file not found: {log_path}"
    
    with open(log_path, 'r') as f:
        log_content = f.read()

    # Execute Audit
    auditor = SessionAuditor()
    result = auditor(log_data=log_content, audit_query=query)
    
    return result.audit_report

if __name__ == "__main__":
    # Test case: Audit the latest session for Git Sync status
    latest_session = "/home/node/.openclaw/agents/main/sessions/7a34e857-d5cf-4a8c-83e4-f97817913784.jsonl"
    sample_query = "Find the exact message where the model established the root Assitant symlink."
    print(f"--- Starting Trace-Audit-RLM MVP ---")
    report = run_audit(latest_session, sample_query)
    print(f"Audit Report:\n{report}")
