#!/usr/bin/env python3
"""Pratyaksh v3 — Jay's Evolved Personal LLM Eval Harness.

Adds use-case-specific eval dimensions (D1-D7), three new use cases (UC-07/08/09),
a composite score that blends quality + dimensions + latency, and a self-evolving
benchmark loop that generates harder samples for failure modes.
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

# Add project root to path for imports
sys.path.insert(0, str(Path(__file__).parent))

from evaluators import exact_match, ndcg, sandbox_exec, llm_judge, bleu
from evaluators import set_invariance, citation_fidelity, edge_case, transliteration_guard
from evolution.evolve import run_evolution

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
    {"id": "UC-01", "name": "Multi-hop Log Reasoning", "eval": "exact_match", "dimensions": ["D4"]},
    {"id": "UC-02", "name": "RAG Retrieval Quality", "eval": "ndcg", "dimensions": []},
    {"id": "UC-03", "name": "B2B Intent Classification", "eval": "exact_match", "dimensions": ["D1", "D2"]},
    {"id": "UC-04", "name": "Code Generation", "eval": "sandbox_exec", "dimensions": ["D5"]},
    {"id": "UC-05", "name": "Indic NLP", "eval": "bleu", "dimensions": ["D7"]},
    {"id": "UC-06", "name": "Reward Model Scoring", "eval": "llm_judge", "dimensions": []},
    {"id": "UC-07", "name": "Trace Audit", "eval": "llm_judge", "dimensions": ["D4", "D6"]},
    {"id": "UC-08", "name": "Harvest Quality", "eval": "citation_fidelity", "dimensions": ["D3"]},
    {"id": "UC-09", "name": "Agent Planning", "eval": "llm_judge", "dimensions": []},
]

DIMENSION_NAMES = {
    "D1": "Signal Attribution",
    "D2": "Set Invariance",
    "D3": "Citation Fidelity",
    "D4": "Hop Completeness",
    "D5": "Edge Case Survival",
    "D6": "Script Convergence",
    "D7": "Transliteration Guard",
}

# ---------------------------------------------------------------------------
# Client Setup
# ---------------------------------------------------------------------------

def get_client(provider: str) -> OpenAI:
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
    samples = []
    with open(path, 'r', encoding='utf-8') as f:
        for line in f:
            line = line.strip()
            if line:
                samples.append(json.loads(line))
    return samples


def load_all_samples(uc_id: str) -> list[dict]:
    """Load base samples + any evolved samples for a UC."""
    uc_dir = BENCH_DATA_DIR / uc_id
    samples = []

    # Base samples
    base_path = uc_dir / "samples.jsonl"
    if base_path.exists():
        samples.extend(load_jsonl(base_path))

    # Evolved samples (any evolved_*.jsonl files)
    for f in sorted(uc_dir.glob("evolved_*.jsonl")):
        samples.extend(load_jsonl(f))

    return samples


def load_uc01_corpus() -> str:
    uc01_dir = BENCH_DATA_DIR / "UC-01"
    parts = []
    for fp in sorted(uc01_dir.iterdir()):
        if fp.is_file() and fp.suffix == '.txt':
            parts.append(fp.read_text())
    return "\n---\n".join(parts)


# ---------------------------------------------------------------------------
# Dimension Evaluators (D1-D7)
# ---------------------------------------------------------------------------

def eval_d1_signal_attribution(response: str, input_text: str) -> float:
    """D1: Signal Attribution — did model cite ≥2 specific features from input?
    Uses Opus judge.
    """
    client = get_client("openrouter")
    prompt = f"""You are evaluating whether an LLM's intent classification response properly attributes 
its decision to specific input signals.

INPUT TEXT that was classified:
{input_text}

MODEL'S CLASSIFICATION RESPONSE:
{response}

SCORING CRITERIA:
- 0.0: No attribution — model just stated the label with no explanation of why
- 0.5: Vague attribution — model mentioned general reasons but not specific text features
- 1.0: Specific attribution — model named ≥2 specific features/phrases from the input text

Respond with ONLY a JSON object: {{"score": 0.0|0.5|1.0, "reasoning": "..."}}"""

    try:
        completion = client.chat.completions.create(
            model="anthropic/claude-opus-4.6",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
            max_tokens=256,
        )
        raw = completion.choices[0].message.content.strip()
        match = re.search(r'\{[^}]+\}', raw)
        if match:
            result = json.loads(match.group())
            return float(result.get("score", 0.0))
    except Exception as e:
        print(f"    ⚠ D1 judge error: {e}")
    return 0.0


def eval_d2_set_invariance(model: dict, sample: dict) -> float:
    """D2: Set Invariance — shuffle input signals 3 times, measure confidence variance."""
    text = sample["text"]
    variants = set_invariance.shuffle_signals(text, n_shuffles=3)

    responses = []
    for variant in variants:
        prompt = f"""Classify the following text as buyer intent. 
Respond with ONLY one of: high_intent, low_intent, no_intent
Then state your confidence (0-100%).

Text: {variant}"""
        resp, _ = call_model(model, prompt, max_tokens=64)
        responses.append(resp)

    return set_invariance.evaluate_from_responses(
        responses, ["high_intent", "low_intent", "no_intent"]
    )


def eval_d4_hop_completeness(response: str, required_hops: list[str]) -> float:
    """D4: Hop Completeness — judge checks each required hop is addressed."""
    if not required_hops:
        return 1.0

    client = get_client("openrouter")
    hops_str = "\n".join(f"- {h}" for h in required_hops)

    prompt = f"""You are evaluating whether an LLM's response addressed all required reasoning hops.

REQUIRED HOPS (each must be explicitly addressed):
{hops_str}

MODEL'S RESPONSE:
{response}

For each hop, determine if it was explicitly addressed in the response.
Respond with ONLY a JSON object: {{"hops_covered": ["hop1", "hop2"], "hops_missed": ["hop3"], "score": 0.67}}
The score should be the fraction of hops covered (covered / total)."""

    try:
        completion = client.chat.completions.create(
            model="anthropic/claude-opus-4.6",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
            max_tokens=512,
        )
        raw = completion.choices[0].message.content.strip()
        match = re.search(r'\{[^}]*"score"[^}]*\}', raw, re.DOTALL)
        if match:
            result = json.loads(match.group())
            return float(result.get("score", 0.0))
    except Exception as e:
        print(f"    ⚠ D4 judge error: {e}")
    return 0.0


def eval_d6_script_convergence(response: str) -> float:
    """D6: Script Convergence — did model reach a definitive answer?"""
    client = get_client("openrouter")

    prompt = f"""You are evaluating whether an LLM reached a definitive conclusion in its analysis.

MODEL'S RESPONSE:
{response}

SCORING CRITERIA:
- 1.0: Definitive answer with supporting evidence cited
- 0.5: Partial answer — some conclusions but hedged or incomplete
- 0.0: No definitive answer — "I cannot determine", excessive hedging, or circular reasoning

Respond with ONLY a JSON object: {{"score": 0.0|0.5|1.0, "reasoning": "..."}}"""

    try:
        completion = client.chat.completions.create(
            model="anthropic/claude-opus-4.6",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.0,
            max_tokens=256,
        )
        raw = completion.choices[0].message.content.strip()
        match = re.search(r'\{[^}]+\}', raw)
        if match:
            result = json.loads(match.group())
            return float(result.get("score", 0.0))
    except Exception as e:
        print(f"    ⚠ D6 judge error: {e}")
    return 0.0


# ---------------------------------------------------------------------------
# UC Runners (UC-01 through UC-09)
# ---------------------------------------------------------------------------

def run_uc01(model: dict) -> dict:
    """UC-01: Multi-hop Log Reasoning + D4 (Hop Completeness)."""
    corpus = load_uc01_corpus()
    query = "What specific physical configuration caused the outage referenced in the logs? Provide the sensor threshold value and the required valve setting."
    required_hops = ["error_code_lookup", "sensor_threshold", "valve_setting"]

    system = "You are analyzing system logs to find root causes. Be precise and extract exact values."
    prompt = f"Corpus:\n{corpus}\n\nQuery: {query}"

    response, latency = call_model(model, prompt, system)
    quality = exact_match.evaluate_contains(response, ["0.85v", "Open", "Full Flow"])

    # D4: Hop Completeness
    d4 = eval_d4_hop_completeness(response, required_hops)

    return {
        "score": quality,
        "latency": latency,
        "response": response[:200],
        "dimensions": {"D4": d4},
    }


def run_uc02(model: dict) -> dict:
    """UC-02: RAG Retrieval Quality."""
    samples = load_all_samples("UC-02")
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

        try:
            match = re.search(r'\[[\d,\s]+\]', response)
            if match:
                predicted_ranking = json.loads(match.group())
            else:
                nums = re.findall(r'\d+', response)
                predicted_ranking = [int(n) for n in nums]
        except Exception:
            predicted_ranking = list(range(len(sample["chunks"])))

        results.append((predicted_ranking, sample["relevant_ids"]))

    score = ndcg.evaluate_batch(results)
    avg_latency = total_latency / len(samples) if samples else 0

    return {"score": score, "latency": avg_latency, "n_samples": len(samples), "dimensions": {}}


def run_uc03(model: dict) -> dict:
    """UC-03: B2B Intent Classification + D1 (Signal Attribution) + D2 (Set Invariance)."""
    samples = load_all_samples("UC-03")
    pairs = []
    total_latency = 0.0
    d1_scores = []
    d2_scores = []

    for sample in samples:
        # Main classification (with attribution request for D1)
        prompt = f"""Classify the following text as buyer intent.
Respond with the label (high_intent, low_intent, or no_intent) AND explain which specific 
phrases or signals in the text drove your classification.

Text: {sample['text']}"""

        response, latency = call_model(model, prompt, max_tokens=256)
        total_latency += latency

        # Parse label
        resp_clean = response.lower().strip().replace(" ", "_")
        for label in ["high_intent", "low_intent", "no_intent"]:
            if label in resp_clean:
                resp_clean = label
                break
        pairs.append((resp_clean, sample["label"]))

        # D1: Signal Attribution (sample 3 to limit judge calls)
        if len(d1_scores) < 3:
            d1 = eval_d1_signal_attribution(response, sample["text"])
            d1_scores.append(d1)

        # D2: Set Invariance (sample 3 to limit API calls)
        if len(d2_scores) < 3:
            d2 = eval_d2_set_invariance(model, sample)
            d2_scores.append(d2)

    score = exact_match.evaluate_batch(pairs)
    avg_latency = total_latency / len(samples) if samples else 0

    return {
        "score": score,
        "latency": avg_latency,
        "n_samples": len(samples),
        "dimensions": {
            "D1": float(np.mean(d1_scores)) if d1_scores else 0.0,
            "D2": float(np.mean(d2_scores)) if d2_scores else 0.0,
        },
    }


def run_uc04(model: dict) -> dict:
    """UC-04: Code Generation + D5 (Edge Case Survival)."""
    samples = load_all_samples("UC-04")
    results = []
    total_latency = 0.0
    d5_scores = []

    for sample in samples:
        prompt = f"""Write Python code for the following specification.
Return ONLY the Python code, no markdown fences, no explanation.

Specification: {sample['spec']}"""

        response, latency = call_model(model, prompt, max_tokens=512)
        total_latency += latency

        code = response
        code = re.sub(r'^```python\s*\n?', '', code, flags=re.MULTILINE)
        code = re.sub(r'^```\s*\n?', '', code, flags=re.MULTILINE)
        code = code.strip()

        results.append((code, sample["test"]))

        # D5: Edge Case Survival
        happy_passed = sandbox_exec.evaluate(code, sample["test"])
        if happy_passed > 0:
            d5 = edge_case.evaluate(code)
            d5_scores.append(d5)

    score = sandbox_exec.evaluate_batch(results)
    avg_latency = total_latency / len(samples) if samples else 0

    return {
        "score": score,
        "latency": avg_latency,
        "n_samples": len(samples),
        "dimensions": {
            "D5": float(np.mean(d5_scores)) if d5_scores else 0.0,
        },
    }


def run_uc05(model: dict) -> dict:
    """UC-05: Indic NLP + D7 (Transliteration Guard)."""
    samples = load_all_samples("UC-05")
    translate_pairs = []
    classify_pairs = []
    total_latency = 0.0
    d7_scores = []

    for sample in samples:
        if sample["task"] == "translate":
            prompt = f"Translate the following text to English. Return ONLY the translation.\n\nText: {sample['text']}"
            response, latency = call_model(model, prompt, max_tokens=256)
            total_latency += latency
            translate_pairs.append((response, sample["expected"]))

            # D7: Transliteration Guard
            d7 = transliteration_guard.evaluate(response)
            d7_scores.append(d7)

        elif sample["task"] == "classify":
            prompt = f"""Classify the sentiment/type of this text. 
Respond with ONLY one word: positive, negative, complaint, or neutral.

Text: {sample['text']}"""
            response, latency = call_model(model, prompt, max_tokens=32)
            total_latency += latency
            classify_pairs.append((response.strip().lower(), sample["expected"]))

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
        "dimensions": {
            "D7": float(np.mean(d7_scores)) if d7_scores else 0.0,
        },
    }


def run_uc06(model: dict) -> dict:
    """UC-06: Reward Model Scoring."""
    samples = load_all_samples("UC-06")
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
            predicted = "a"

        if predicted == sample["preferred"]:
            agreements += 1

    score = agreements / len(samples) if samples else 0.0
    avg_latency = total_latency / len(samples) if samples else 0

    return {
        "score": score,
        "latency": avg_latency,
        "n_samples": len(samples),
        "agreements": agreements,
        "dimensions": {},
    }


def run_uc07(model: dict) -> dict:
    """UC-07: Trace Audit + D4 (Hop Completeness) + D6 (Convergence)."""
    samples = load_all_samples("UC-07")
    total_latency = 0.0
    quality_scores = []
    d4_scores = []
    d6_scores = []

    for sample in samples:
        prompt = f"""Analyze the following agent session trace. Identify ALL hallucinations 
(claims not supported by the data) and reasoning gaps (missing verification steps).

Be specific: for each issue, cite the step number and explain what's wrong.

AGENT TRACE:
{sample['trace']}"""

        response, latency = call_model(model, prompt, system="You are an expert auditor of AI agent reasoning traces. Be thorough and precise.", max_tokens=1024)
        total_latency += latency

        # Quality: judge how well it identified known issues
        known_str = "\n".join(f"- {i}" for i in sample["known_issues"])
        q_score = llm_judge.evaluate(
            prompt,
            response,
            task_description=f"Identify these specific issues in the trace: {known_str}"
        )
        quality_scores.append(q_score)

        # D4: Hop Completeness
        d4 = eval_d4_hop_completeness(response, sample["required_hops"])
        d4_scores.append(d4)

        # D6: Script Convergence
        d6 = eval_d6_script_convergence(response)
        d6_scores.append(d6)

    avg_quality = float(np.mean(quality_scores)) if quality_scores else 0.0
    avg_latency = total_latency / len(samples) if samples else 0

    return {
        "score": avg_quality,
        "latency": avg_latency,
        "n_samples": len(samples),
        "dimensions": {
            "D4": float(np.mean(d4_scores)) if d4_scores else 0.0,
            "D6": float(np.mean(d6_scores)) if d6_scores else 0.0,
        },
    }


def run_uc08(model: dict) -> dict:
    """UC-08: Harvest Quality + D3 (Citation Fidelity)."""
    samples = load_all_samples("UC-08")
    total_latency = 0.0
    d3_scores = []

    for sample in samples:
        prompt = f"""Extract the paper title and ArXiv ID from the following abstract.

Respond in this exact format:
Title: <paper title>
ArXiv ID: <XXXX.XXXXX>

Abstract:
{sample['abstract']}"""

        response, latency = call_model(model, prompt, max_tokens=128)
        total_latency += latency

        # D3: Citation Fidelity — does the extracted ArXiv ID resolve?
        result = citation_fidelity.evaluate_exact(response, sample["expected_arxiv_id"])
        d3_scores.append(result["score"])

    avg_d3 = float(np.mean(d3_scores)) if d3_scores else 0.0
    avg_latency = total_latency / len(samples) if samples else 0

    return {
        "score": avg_d3,  # For UC-08, quality IS citation fidelity
        "latency": avg_latency,
        "n_samples": len(samples),
        "dimensions": {
            "D3": avg_d3,
        },
    }


def run_uc09(model: dict) -> dict:
    """UC-09: Agent Planning — judge checks atomicity, completeness, no circular deps."""
    samples = load_all_samples("UC-09")
    total_latency = 0.0
    quality_scores = []

    for sample in samples:
        forbidden_str = "\n".join(f"- {p}" for p in sample["forbidden_patterns"])
        prompt = f"""Produce a step-by-step plan to achieve the following goal.
Each step must be atomic (one action) and executable.
Minimum {sample['min_steps']} steps required.

GOAL: {sample['goal']}

CONSTRAINTS (your plan must NOT violate these):
{forbidden_str}

Format each step as:
Step N: <action>
  Depends on: Step X (or "none")"""

        response, latency = call_model(model, prompt, system="You are an expert technical project planner. Be precise and thorough.", max_tokens=1024)
        total_latency += latency

        # Judge: check quality
        judge_prompt = f"""Evaluate this step-by-step plan on three criteria:

1. NO CIRCULAR DEPENDENCIES: Steps don't reference future steps as dependencies
2. ATOMICITY: Each step is a single, concrete action (not "do X and Y and Z")
3. COMPLETENESS: Plan covers all aspects of the goal with at least {sample['min_steps']} steps

FORBIDDEN PATTERNS that should NOT appear:
{forbidden_str}

PLAN:
{response}

Score 0.0-1.0 based on how well the plan meets all three criteria.
Respond with ONLY a JSON object: {{"score": 0.0-1.0, "circular_deps": true/false, "atomic": true/false, "complete": true/false, "reasoning": "..."}}"""

        client = get_client("openrouter")
        try:
            completion = client.chat.completions.create(
                model="anthropic/claude-opus-4.6",
                messages=[{"role": "user", "content": judge_prompt}],
                temperature=0.0,
                max_tokens=512,
            )
            raw = completion.choices[0].message.content.strip()
            match = re.search(r'\{[^}]*"score"[^}]*\}', raw, re.DOTALL)
            if match:
                result = json.loads(match.group())
                quality_scores.append(float(result.get("score", 0.0)))
            else:
                quality_scores.append(0.0)
        except Exception as e:
            print(f"    ⚠ UC-09 judge error: {e}")
            quality_scores.append(0.0)

    avg_quality = float(np.mean(quality_scores)) if quality_scores else 0.0
    avg_latency = total_latency / len(samples) if samples else 0

    return {
        "score": avg_quality,
        "latency": avg_latency,
        "n_samples": len(samples),
        "dimensions": {},
    }


UC_RUNNERS = {
    "UC-01": run_uc01,
    "UC-02": run_uc02,
    "UC-03": run_uc03,
    "UC-04": run_uc04,
    "UC-05": run_uc05,
    "UC-06": run_uc06,
    "UC-07": run_uc07,
    "UC-08": run_uc08,
    "UC-09": run_uc09,
}


# ---------------------------------------------------------------------------
# Composite Scoring (v3: quality × 0.6 + dimensions × 0.4) × (1/normalized_latency)
# ---------------------------------------------------------------------------

def compute_composite_scores(results: dict) -> dict:
    """Compute v3 composite scores incorporating dimension metrics."""
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
            speed_factor = 1.0 / normalized_lat if normalized_lat > 0 else 1.0

            # Get dimension scores for this UC
            dims = r.get("dimensions", {})
            dim_values = list(dims.values()) if dims else []
            dim_avg = float(np.mean(dim_values)) if dim_values else 1.0  # Default to 1.0 if no dims

            # v3 composite: (quality × 0.6 + dim_avg × 0.4) × speed_factor
            blended = r["score"] * 0.6 + dim_avg * 0.4
            composite = blended * speed_factor

            if model_name not in composites:
                composites[model_name] = {}
            composites[model_name][uc_id] = {
                "quality": r["score"],
                "dim_avg": dim_avg,
                "dimensions": dims,
                "latency": r["latency"],
                "normalized_latency": normalized_lat,
                "blended": blended,
                "composite": composite,
            }

    return composites


# ---------------------------------------------------------------------------
# Report Generation
# ---------------------------------------------------------------------------

def generate_report(results: dict, composites: dict) -> str:
    now = datetime.now()
    lines = [
        f"# Pratyaksh v3 — Benchmark Report",
        f"**Date:** {now.strftime('%Y-%m-%d %H:%M')}",
        f"**Models:** {', '.join(m['name'] for m in MODEL_ROSTER)}",
        f"**Use Cases:** {len(USE_CASES)} (UC-01 through UC-09)",
        f"**Dimensions:** D1-D7 (use-case-specific eval metrics)",
        "",
        "---",
        "",
        "## Per-UC Results",
        "",
    ]

    for uc in USE_CASES:
        uc_id = uc["id"]
        dim_labels = uc.get("dimensions", [])
        dim_str = f" [{', '.join(dim_labels)}]" if dim_labels else ""

        lines.append(f"### {uc_id}: {uc['name']}{dim_str}")
        lines.append("")

        header = "| Model | Quality | Latency (s)"
        separator = "|:------|--------:|------------:"
        for d in dim_labels:
            header += f" | {d}"
            separator += " | ---:"
        header += " | Composite |"
        separator += " |-----------:|"

        lines.append(header)
        lines.append(separator)

        for model in MODEL_ROSTER:
            mn = model["name"]
            if mn in results and uc_id in results[mn]:
                r = results[mn][uc_id]
                comp = composites.get(mn, {}).get(uc_id, {})
                row = f"| {mn} | {r['score']:.3f} | {r['latency']:.2f}"
                dims = r.get("dimensions", {})
                for d in dim_labels:
                    row += f" | {dims.get(d, 0):.3f}"
                row += f" | {comp.get('composite', 0):.3f} |"
                lines.append(row)
            else:
                lines.append(f"| {mn} | — | — | — |")

        lines.append("")

    # Dimension summary
    lines.append("---")
    lines.append("")
    lines.append("## Dimension Summary (D1-D7)")
    lines.append("")
    lines.append("| Model | D1 Attr | D2 Invar | D3 Cite | D4 Hops | D5 Edge | D6 Conv | D7 Trans | Avg |")
    lines.append("|:------|--------:|---------:|--------:|--------:|--------:|--------:|---------:|----:|")

    for model in MODEL_ROSTER:
        mn = model["name"]
        all_dims = {}
        for uc_id, uc_result in results.get(mn, {}).items():
            for dk, dv in uc_result.get("dimensions", {}).items():
                if dk not in all_dims:
                    all_dims[dk] = []
                all_dims[dk].append(dv)

        dim_avgs = {d: float(np.mean(v)) if v else 0.0 for d, v in all_dims.items()}
        all_values = [v for vals in all_dims.values() for v in vals]
        overall_avg = float(np.mean(all_values)) if all_values else 0.0

        row = f"| {mn}"
        for d in ["D1", "D2", "D3", "D4", "D5", "D6", "D7"]:
            row += f" | {dim_avgs.get(d, 0):.3f}"
        row += f" | {overall_avg:.3f} |"
        lines.append(row)

    lines.append("")

    # Overall leaderboard
    lines.append("---")
    lines.append("")
    lines.append("## Overall Leaderboard")
    lines.append("")
    lines.append("| Rank | Model | Avg Quality | Avg Dim | Avg Latency (s) | Avg Composite |")
    lines.append("|:-----|:------|------------:|--------:|----------------:|--------------:|")

    model_summaries = []
    for model in MODEL_ROSTER:
        mn = model["name"]
        if mn not in composites:
            continue
        quals = [v["quality"] for v in composites[mn].values()]
        dims = [v["dim_avg"] for v in composites[mn].values()]
        lats = [v["latency"] for v in composites[mn].values()]
        comps = [v["composite"] for v in composites[mn].values()]
        model_summaries.append({
            "name": mn,
            "avg_quality": float(np.mean(quals)) if quals else 0,
            "avg_dim": float(np.mean(dims)) if dims else 0,
            "avg_latency": float(np.mean(lats)) if lats else 0,
            "avg_composite": float(np.mean(comps)) if comps else 0,
        })

    model_summaries.sort(key=lambda x: x["avg_composite"], reverse=True)

    for rank, ms in enumerate(model_summaries, 1):
        lines.append(
            f"| {rank} | {ms['name']} | {ms['avg_quality']:.3f} | {ms['avg_dim']:.3f} | {ms['avg_latency']:.2f} | {ms['avg_composite']:.3f} |"
        )

    lines.append("")
    lines.append("---")
    lines.append(f"*Generated by Pratyaksh v3 at {now.isoformat()}*")

    return "\n".join(lines)


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    print("=" * 60)
    print("  Pratyaksh v3 — Evolved LLM Eval Harness")
    print("  Dimensions: D1-D7 | Use Cases: UC-01 through UC-09")
    print("  Evolution: Self-mutating benchmark loop")
    print("=" * 60)
    print()

    # Validate env
    for key in ["NVIDIA_API_KEY", "OPENROUTER_API_KEY"]:
        if not os.getenv(key):
            print(f"⚠ Missing {key} in environment!")
            sys.exit(1)

    results = {}  # {model_name: {uc_id: {score, latency, dimensions, ...}}}

    for model in MODEL_ROSTER:
        print(f"\n{'─' * 50}")
        print(f"Model: {model['name']} ({model['provider']})")
        print(f"{'─' * 50}")

        results[model["name"]] = {}

        for uc in USE_CASES:
            uc_id = uc["id"]
            runner = UC_RUNNERS[uc_id]
            dim_str = f" [{', '.join(uc.get('dimensions', []))}]" if uc.get('dimensions') else ""

            print(f"\n  ▶ {uc_id}: {uc['name']}{dim_str}...", end="", flush=True)

            try:
                result = runner(model)
                results[model["name"]][uc_id] = result

                dims = result.get("dimensions", {})
                dim_info = " | ".join(f"{k}={v:.2f}" for k, v in dims.items())
                dim_display = f" dims=[{dim_info}]" if dim_info else ""
                print(f" score={result['score']:.3f} latency={result['latency']:.2f}s{dim_display}")
            except Exception as e:
                print(f" ✗ ERROR: {e}")
                import traceback
                traceback.print_exc()
                results[model["name"]][uc_id] = {"score": 0.0, "latency": 0.0, "dimensions": {}, "error": str(e)}

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

    # Dump raw results
    raw_path = RESULTS_DIR / f"{datetime.now().strftime('%Y-%m-%d')}_raw.json"

    def make_serializable(obj):
        if isinstance(obj, (np.floating, np.integer)):
            return float(obj)
        if isinstance(obj, np.ndarray):
            return obj.tolist()
        return obj

    raw_path.write_text(json.dumps(results, indent=2, default=make_serializable))
    print(f"✅ Raw results written to {raw_path}")

    # Evolution loop: generate harder samples for failures
    print("\n" + "=" * 60)
    print("  Evolution Loop — Mutating Failed Samples")
    print("=" * 60)

    evolution_summary = run_evolution(results, BENCH_DATA_DIR)

    if evolution_summary:
        print(f"\n🧬 Evolution complete:")
        for uc_id, info in evolution_summary.items():
            print(f"  {uc_id}: {info['evolved_count']} new samples → {info['file']}")

        # Save evolution summary
        evo_path = RESULTS_DIR / f"{datetime.now().strftime('%Y-%m-%d')}_evolution.json"
        evo_path.write_text(json.dumps(evolution_summary, indent=2))
        print(f"\n✅ Evolution summary written to {evo_path}")
    else:
        print("\n✅ No failures below threshold — no evolution needed!")


if __name__ == "__main__":
    main()
