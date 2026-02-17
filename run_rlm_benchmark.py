import dspy
import os
import json
import time

# 1. Define the RLM Signature for the Benchmark
class MultiHopBenchmarkSignature(dspy.Signature):
    """
    Analyze the corpus to find the root cause and remediation.
    Mandatory: You must find the Cause ID and extract ALL physical configuration details.
    """
    context = dspy.InputField(desc="The entire corpus of logs")
    query = dspy.InputField(desc="The user query")
    physical_source = dspy.OutputField(desc="The physical sensor/threshold value")
    remediation_requirement = dspy.OutputField(desc="The required valve/hardware setting")

# 2. Benchmark Logic
class RLMBenchmark(dspy.Module):
    def __init__(self):
        super().__init__()
        self.rlm = dspy.RLM(MultiHopBenchmarkSignature, max_iterations=10)

    def forward(self, context, query):
        return self.rlm(context=context, query=query)

def load_bench_data(data_dir: str) -> str:
    all_content = []
    for filename in os.listdir(data_dir):
        with open(os.path.join(data_dir, filename), 'r') as f:
            all_content.append(f.read())
    return "\n---\n".join(all_content)

from dotenv import load_dotenv
load_dotenv()

def execute_benchmark():
    # Setup LM
    lm = dspy.LM("gemini/gemini-3-pro-preview", api_key=os.getenv("GEMINI_API_KEY"))
    dspy.configure(lm=lm)

    print(f"--- Loading Benchmark Data ---")
    corpus = load_bench_data("github/jadoo-labs-experiments/bench_data")
    query = "What specific physical configuration caused the outage referenced in the logs?"

    print(f"--- Running Challenger (RLM) ---")
    start_time = time.time()
    rlm_bench = RLMBenchmark()
    # No cache
    with dspy.context(cache=False):
        result = rlm_bench(context=corpus, query=query)
    end_time = time.time()

    print(f"\n[RLM RESULT]")
    print(f"Time: {end_time - start_time:.2f}s")
    print(f"Source: {result.physical_source}")
    print(f"Requirement: {result.remediation_requirement}")
    
    # Verification (Log Z content: 0.85v and Open (Full Flow))
    if "0.85v" in result.physical_source and "Open" in result.remediation_requirement:
        print("\n✅ BENCHMARK PASSED: RLM successfully identified the multi-hop link.")
    else:
        print("\n❌ BENCHMARK FAILED: RLM missed or incomplete.")

if __name__ == "__main__":
    execute_benchmark()
