import os
import requests
import json
from dotenv import load_dotenv

load_dotenv()

def call_glm5(prompt):
    api_key = os.getenv("MODAL_GLM_KEY")
    base_url = os.getenv("MODAL_GLM_BASE_URL")
    
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json"
    }
    
    data = {
        "model": "zai-org/GLM-5-FP8",
        "messages": [{"role": "user", "content": prompt}],
        "temperature": 0.1
    }
    
    print(f"--- Calling GLM-5 via Modal ---")
    response = requests.post(f"{base_url}/chat/completions", headers=headers, json=data)
    
    if response.status_code == 200:
        return response.json()['choices'][0]['message']['content']
    else:
        return f"Error: {response.status_code} - {response.text}"

if __name__ == "__main__":
    # Audit Query: SOTA alignment check
    audit_prompt = """
    I have a Trace-Audit-RLM script (attached) that uses DSPy.RLM to audit LLM session logs.
    I also have the Hübotter et al. (2026) SDPO research integrated into my vault.
    
    QUESTION:
    1. Does this script (which currently uses standard iterative RLM) effectively implement a 'Self-Teacher' state as defined in SDPO?
    2. How can I modify the RLM 'llm_query' loop to use the rich textual feedback (tracebacks/errors) to accelerate discovery by 3x, as per the paper?
    3. Propose a specific Pydantic Reward Schema for the self-distillation step.
    
    SCRIPT CONTENT:
    \"\"\"
    import dspy
    class TraceAuditSignature(dspy.Signature):
        log_data = dspy.InputField()
        audit_query = dspy.InputField()
        audit_report = dspy.OutputField()
    
    class SessionAuditor(dspy.Module):
        def __init__(self):
            super().__init__()
            self.auditor = dspy.RLM(TraceAuditSignature, max_iterations=10)
    \"\"\"
    """
    print(call_glm5(audit_prompt))
