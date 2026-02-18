#!/usr/bin/env python3
"""Pratyaksh v2 — Jay's Personal LLM Eval Harness.

Runs 6 use cases across a model roster, evaluates quality + latency,
and produces a composite leaderboard report.
"""

import json
import os
import sys
import time
import re
from datetime import datetime
from pathlib import Path
from typing import Any

import numpy as np
from openai import OpenAI
from dotenv import load_dotenv

# Load env from workspace root
load_dotenv("/home/node/.openclaw/workspace/.env")

# Add project root to path for evaluator imports
sys.path.insert(0, str(Path(__file__).parent))

from evaluators import exact_match, ndcg, sandbox_exec, llm_judge, bleu

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------

PROJECT_DIR = Path(__file__).parent
BENCH_DATA_DIR = PROJECT_DIR / "bench_data"
RESULTS_DIR = PROJECT_DIR / "results"

MODEL_ROSTER = [
    {"name": "minimax-m2.1", "provider": "nvidia", "model_id": "minimaxai/minimax-m2.1"},
    {"name": "mistral-devstral", "provider": "nvidia", "model_id": "mistralai/devstral-2-123b-instruct-2512"},
    {"name": "claude-sonnet-4.6", "provider": "openrouter", "model_id": "anthropic/claude-sonnet-4.6"},
    {"name": "claude-opus-4.6", "provider": "openrouter", "model_id": "anthropic/claude-opus-4.6"},
]

USE_CASES = [
    {"id": "UC-01", "name": "Multi-hop Log Reasoning", "eval": "exact_match"},
    {"id": "UC-02", "name": "RAG Retrieval Quality", "eval": "ndcg"},
    {"id": "UC-03", "name": "B2B Intent Classification", "eval": "exact_match"},
    {"id": "UC-04", "name": "Code Generation", "eval": "sandbox_exec"},
    {"id": "UC-05", "name": "Indic NLP", "eval": "bleu"},
    {"id": "UC-06", "name": "Reward Model Scoring", "eval": "llm_judge"},
]

# ---------------------------------------------------------------------------
# Client Setup
# ---------------------------------------------------------------------------

def get_client(provider: str) -> OpenAI:
    """Get an OpenAI-compatible client for the given provider."""
    if provider == "nvidia":
        return OpenAI(
            base_url="https://integrate.api.nvidia.com/v1",
            api_key=os.getenv("NVIDIA_API_KEY"),
        )
    elif provider == "openrouter":
        return OpenAI(
            base_url="https://openrouter.ai/api/v1",
            api_key=os.getenv("OPENROUTER_API_KEY"),
        )
    else:
        raise ValueError(f"Unknown provider: {provider}")


def call_model(model: dict, prompt: str, system: str = "", max_tokens: int = 1024) -> tuple[str, float]:
    """Call a model and return (response_text, latency_seconds)."""
    client = get_client(model["provider"])
    
    messages = []
    if system:
        messages.append({"role": "system", "content": system})
    messages.append({"role": "user", "content": prompt})
    
    start = time.time()
    try:
        completion = client.chat.completions.create(
            model=model["model_id"],
            messages=messages,
            temperature=0.0,
            max_tokens=max_tokens,
        )
        latency = time.time() - start
        response = completion.choices[0].message.content or ""
        return response.strip(), latency
    except Exception as e:
        latency = time.time() - start
        print(f"  ⚠ Error calling {model['name']}: {e}")
        return f"ERROR: {e}", latency


# ---------------------------------------------------------------------------
# Data Loaders
# ---------------------------------------------------------------------------

def load_jsonl(path: Path) -> list[dict]:
    """Load JSONL file."""
    samples = []
    with open(path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line:
                samples.append(json.loads(line))
    return samples


def load_uc01_corpus() -> str:
    """Load UC-01 log corpus into a single string."""
    uc01_dir = BENCH_DATA_DIR / "UC-01"
    parts = []
    for fp in sorted(uc01_dir.iterdir()):
        if fp.is_file():
            parts.append(fp.read_text())
    return "\n---\n".join(parts)


# ---------------------------------------------------------------------------
# UC Runners
# ---------------------------------------------------------------------------

def run_uc01(model: dict) -> dict:
    """UC-01: Multi-hop Log Reasoning."""
    corpus = load_uc01_corpus()
    query = "What specific physical configuration caused the outage referenced in the logs? Provide the sensor threshold value and the required valve setting."
    
    system = "You are analyzing system logs to find root causes. Be precise and extract exact values."
    prompt = f"Corpus:\n{corpus}\n\nQuery: {query}"
    
    response, latency = call_model(model, prompt, system)
    
    # Evaluate: check for key values (0.85v and Open (Full Flow))
    score = exact_match.evaluate_contains(response, ["0.85v", "Open", "Full Flow"])
    
    return {"score": score, "latency": latency, "response": response[:200]}


def run_uc02(model: dict) -> dict:
    """UC-02: RAG Retrieval Quality."""
    samples = load_jsonl(BENCH_DATA_DIR / "UC-02" / "samples.jsonl")
    
    results = []
    total_latency = 0.0
    
    for sample in samples:
        chunks_text = "\n".join(f"[Chunk {i}]: {c}" for i, c in enumerate(sample["chunks"]))
        prompt = f"""Given the following document chunks, rank them by relevance to the query.
Return ONLY the chunk IDs in order of relevance as a JSON list, e.g. [2, 0, 3, 1].

Query: {sample['query']}

{chunks_text}"""
        
        response, latency = call_model(model, prompt, max_tokens=128)
        total_latency += latency
        
        # Parse ranking from response
        try:
            # Find a JSON list in the response
            match = re.search(r'\[[\d,\s]+\]', response)
            if match:
                predicted_ranking = json.loads(match.group())
            else:
                # Try to extract numbers
                nums = re.findall(r'\d+', response)
                predicted_ranking = [int(n) for n in nums]
        except Exception:
            predicted_ranking = list(range(len(sample["chunks"])))
        
        results.append((predicted_ranking, sample["relevant_ids"]))
    
    score = ndcg.evaluate_batch(results)
    avg_latency = total_latency / len(samples) if samples else 0
    
    return {"score": score, "latency": avg_latency, "n_samples": len(samples)}


def run_uc03(model: dict) -> dict:
    """UC-03: B2B Intent Classification."""
    samples = load_jsonl(BENCH_DATA_DIR / "UC-03" / "samples.jsonl")
    
    pairs = []
    total_latency = 0.0
    
    for sample in samples:
        prompt = f"""Classify the following text as buyer intent. 
Respond with ONLY one of: high_intent, low_intent, no_intent

Text: {sample['text']}"""
        
        response, latency = call_model(model, prompt, max_tokens=32)
        total_latency += latency
        
        # Normalize response to match label format
        resp_clean = response.lower().strip().replace(" ", "_")
        for label in ["high_intent", "low_intent", "no_intent"]:
            if label in resp_clean:
                resp_clean = label
                break
        
        pairs.append((resp_clean, sample["label"]))
    
    score = exact_match.evaluate_batch(pairs)
    avg_latency = total_latency / len(samples) if samples else 0
    
    return {"score": score, "latency": avg_latency, "n_samples": len(samples)}


def run_uc04(model: dict) -> dict:
    """UC-04: Code Generation."""
    samples = load_jsonl(BENCH_DATA_DIR / "UC-04" / "samples.jsonl")
    
    results = []
    total_latency = 0.0
    
    for sample in samples:
        prompt = f"""Write Python code for the following specification.
Return ONLY the Python code, no markdown fences, no explanation.

Specification: {sample['spec']}"""
        
        response, latency = call_model(model, prompt, max_tokens=512)
        total_latency += latency
        
        # Strip markdown code fences if present
        code = response
        code = re.sub(r'^```python\s*\n?', '', code, flags=re.MULTILINE)
        code = re.sub(r'^```\s*\n?', '', code, flags=re.MULTILINE)
        code = code.strip()
        
        detail = sandbox_exec.evaluate_with_detail(code, sample["test"])
        results.append((code, sample["test"]))
        
        if not detail["passed"]:
            print(f"  ✗ Failed: {sample['spec'][:60]}...")
    
    score = sandbox_exec.evaluate_batch(results)
    avg_latency = total_latency / len(samples) if samples else 0
    
    return {"score": score, "latency": avg_latency, "n_samples": len(samples)}


def run_uc05(model: dict) -> dict:
    """UC-05: Indic NLP (Translation & Classification)."""
    samples = load_jsonl(BENCH_DATA_DIR / "UC-05" / "samples.jsonl")
    
    translate_pairs = []
    classify_pairs = []
    total_latency = 0.0
    
    for sample in samples:
        if sample["task"] == "translate":
            prompt = f"Translate the following text to English. Return ONLY the translation.\n\nText: {sample['text']}"
            response, latency = call_model(model, prompt, max_tokens=256)
            total_latency += latency
            translate_pairs.append((response, sample["expected"]))
        
        elif sample["task"] == "classify":
            prompt = f"""Classify the sentiment/type of this text. 
Respond with ONLY one word: positive, negative, complaint, or neutral.

Text: {sample['text']}"""
            response, latency = call_model(model, prompt, max_tokens=32)
            total_latency += latency
            classify_pairs.append((response.strip().lower(), sample["expected"]))
    
    # Combine scores: BLEU for translations, exact match for classification
    bleu_score = bleu.evaluate_batch(translate_pairs) if translate_pairs else 0.0
    classify_score = exact_match.evaluate_batch(classify_pairs) if classify_pairs else 0.0
    
    n_total = len(translate_pairs) + len(classify_pairs)
    combined = (bleu_score * len(translate_pairs) + classify_score * len(classify_pairs)) / n_total if n_total else 0.0
    avg_latency = total_latency / len(samples) if samples else 0
    
    return {
        "score": combined,
        "bleu": bleu_score,
        "classify_accuracy": classify_score,
        "latency": avg_latency,
        "n_samples": len(samples),
    }


def run_uc06(model: dict) -> dict:
    """UC-06: Reward Model Scoring (preference agreement)."""
    samples = load_jsonl(BENCH_DATA_DIR / "UC-06" / "samples.jsonl")
    
    agreements = 0
    total_latency = 0.0
    
    for sample in samples:
        prompt = f"""Given two responses to a prompt, which is better? 
Respond with ONLY "a" or "b".

Prompt: {sample['prompt']}

Response A: {sample['response_a']}

Response B: {sample['response_b']}"""
        
        response, latency = call_model(model, prompt, max_tokens=16)
        total_latency += latency
        
        # Parse preference
        resp_lower = response.strip().lower()
        if "b" in resp_lower and "a" not in resp_lower:
            predicted = "b"
        elif "a" in resp_lower and "b" not in resp_lower:
            predicted = "a"
        elif resp_lower.startswith("a"):
            predicted = "a"
        elif resp_lower.startswith("b"):
            predicted = "b"
        else:
            predicted = "a"  # Default
        
        if predicted == sample["preferred"]:
            agreements += 1
    
    score = agreements / len(samples) if samples else 0.0
    avg_latency = total_latency / len(samples) if samples else 0
    
    return {"score": score, "latency": avg_latency, "n_samples": len(samples), "agreements": agreements}


UC_RUNNERS = {
    "UC-01": run_uc01,
    "UC-02": run_uc02,
    "UC-03": run_uc03,
    "UC-04": run_uc04,
    "UC-05": run_uc05,
    "UC-06": run_uc06,
}

# ---------------------------------------------------------------------------
# Scoring
# ---------------------------------------------------------------------------

def compute_composite_scores(results: dict) -> dict:
    """Compute composite scores: quality × (1 / normalized_latency).
    
    results: {model_name: {uc_id: {"score": float, "latency": float}}}
    """
    composites = {}
    
    # Collect all latencies per UC for normalization
    for uc in USE_CASES:
        uc_id = uc["id"]
        latencies = []
        for model_name, uc_results in results.items():
            if uc_id in uc_results:
                latencies.append(uc_results[uc_id]["latency"])
        
        if not latencies:
            continue
        
        max_lat = max(latencies) if max(latencies) > 0 else 1.0
        
        for model_name, uc_results in results.items():
            if uc_id not in uc_results:
                continue
            
            r = uc_results[uc_id]
            normalized_lat = r["latency"] / max_lat if max_lat > 0 else 1.0
            # Avoid division by zero
            speed_factor = 1.0 / normalized_lat if normalized_lat > 0 else 1.0
            composite = r["score"] * speed_factor
            
            if model_name not in composites:
                composites[model_name] = {}
            composites[model_name][uc_id] = {
                "quality": r["score"],
                "latency": r["latency"],
                "normalized_latency": normalized_lat,
                "composite": composite,
            }
    
    return composites


# ---------------------------------------------------------------------------
# Report Generation
# ---------------------------------------------------------------------------

def generate_report(results: dict, composites: dict) -> str:
    """Generate markdown report."""
    now = datetime.now()
    lines = [
        f"# Pratyaksh v2 — Benchmark Report",
        f"**Date:** {now.strftime('%Y-%m-%d %H:%M')}",
        f"**Models:** {', '.join(m['name'] for m in MODEL_ROSTER)}",
        "",
        "---",
        "",
        "## Per-UC Results",
        "",
    ]
    
    for uc in USE_CASES:
        uc_id = uc["id"]
        lines.append(f"### {uc_id}: {uc['name']}")
        lines.append("")
        lines.append("| Model | Quality | Latency (s) | Composite |")
        lines.append("|:------|--------:|------------:|-----------:|")
        
        for model in MODEL_ROSTER:
            mn = model["name"]
            if mn in results and uc_id in results[mn]:
                r = results[mn][uc_id]
                comp = composites.get(mn, {}).get(uc_id, {})
                lines.append(
                    f"| {mn} | {r['score']:.3f} | {r['latency']:.2f} | {comp.get('composite', 0):.3f} |"
                )
            else:
                lines.append(f"| {mn} | — | — | — |")
        
        lines.append("")
    
    # Overall leaderboard
    lines.append("---")
    lines.append("")
    lines.append("## Overall Leaderboard")
    lines.append("")
    lines.append("| Rank | Model | Avg Quality | Avg Latency (s) | Avg Composite |")
    lines.append("|:-----|:------|------------:|----------------:|--------------:|")
    
    model_summaries = []
    for model in MODEL_ROSTER:
        mn = model["name"]
        if mn not in composites:
            continue
        quals = [v["quality"] for v in composites[mn].values()]
        lats = [v["latency"] for v in composites[mn].values()]
        comps = [v["composite"] for v in composites[mn].values()]
        model_summaries.append({
            "name": mn,
            "avg_quality": np.mean(quals) if quals else 0,
            "avg_latency": np.mean(lats) if lats else 0,
            "avg_composite": np.mean(comps) if comps else 0,
        })
    
    model_summaries.sort(key=lambda x: x["avg_composite"], reverse=True)
    
    for rank, ms in enumerate(model_summaries, 1):
        lines.append(
            f"| {rank} | {ms['name']} | {ms['avg_quality']:.3f} | {ms['avg_latency']:.2f} | {ms['avg_composite']:.3f} |"
        )
    
    lines.append("")
    lines.append("---")
    lines.append(f"*Generated by Pratyaksh v2 at {now.isoformat()}*")
    
    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    """Run the full benchmark suite."""
    print("=" * 60)
    print("  Pratyaksh v2 — LLM Eval Harness")
    print("=" * 60)
    print()
    
    # Validate env
    for key in ["NVIDIA_API_KEY", "OPENROUTER_API_KEY"]:
        if not os.getenv(key):
            print(f"⚠ Missing {key} in environment!")
            sys.exit(1)
    
    results = {}  # {model_name: {uc_id: {score, latency, ...}}}
    
    for model in MODEL_ROSTER:
        print(f"\n{'─' * 50}")
        print(f"Model: {model['name']} ({model['provider']})")
        print(f"{'─' * 50}")
        
        results[model["name"]] = {}
        
        for uc in USE_CASES:
            uc_id = uc["id"]
            runner = UC_RUNNERS[uc_id]
            
            print(f"\n  ▶ {uc_id}: {uc['name']}...", end="", flush=True)
            
            try:
                result = runner(model)
                results[model["name"]][uc_id] = result
                print(f" score={result['score']:.3f} latency={result['latency']:.2f}s")
            except Exception as e:
                print(f" ✗ ERROR: {e}")
                results[model["name"]][uc_id] = {"score": 0.0, "latency": 0.0, "error": str(e)}
    
    # Compute composites
    print("\n\nComputing composite scores...")
    composites = compute_composite_scores(results)
    
    # Generate report
    report = generate_report(results, composites)
    
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)
    report_path = RESULTS_DIR / f"{datetime.now().strftime('%Y-%m-%d')}.md"
    report_path.write_text(report)
    
    print(f"\n✅ Report written to {report_path}")
    print("\n" + report)
    
    # Also dump raw results as JSON
    raw_path = RESULTS_DIR / f"{datetime.now().strftime('%Y-%m-%d')}_raw.json"
    
    # Make results JSON-serializable
    def make_serializable(obj):
        if isinstance(obj, (np.floating, np.integer)):
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        return obj
    
    raw_path.write_text(json.dumps(results, indent=2, default=make_serializable))
    print(f"✅ Raw results written to {raw_path}")


if __name__ == "__main__":
    main()
