"""Evolution Loop — mutation-per-failure-mode benchmark evolution.

After a benchmark run, for each UC × model where score < threshold:
1. Call Opus judge: "This model failed this task. Generate 3 harder variants."
2. Parse the 3 new samples
3. Append to bench_data/UC-XX/evolved_YYYY-MM-DD.jsonl

Next run automatically picks up evolved samples.
"""

import json
import os
import re
from datetime import datetime
from pathlib import Path

from openai import OpenAI
from dotenv import load_dotenv

load_dotenv("/home/node/.openclaw/workspace/.env")

JUDGE_MODEL = "anthropic/claude-opus-4.6"
OPENROUTER_BASE = "https://openrouter.ai/api/v1"
SCORE_THRESHOLD = 0.7


def get_client() -> OpenAI:
    return OpenAI(
        base_url=OPENROUTER_BASE,
        api_key=os.getenv("OPENROUTER_API_KEY"),
    )


# Per-UC evolution prompts that understand the sample format
EVOLUTION_PROMPTS = {
    "UC-01": """You are generating harder variants of a multi-hop log reasoning task.
The model failed to find the correct values in system logs.

Original task context: The model must extract specific physical configuration values 
(sensor thresholds, valve settings) from multi-hop log cross-references.

Generate 3 harder variants where:
- The answer requires cross-referencing more documents
- Key values are embedded in more noise
- The causal chain has more intermediate hops

Return as a JSON array of 3 objects, each with: {{"query": "...", "answer_keywords": ["..."]}}""",

    "UC-02": """You are generating harder variants of a RAG retrieval ranking task.
The model failed to correctly rank document chunks by relevance.

Original sample: {sample}

Generate 3 harder variants where:
- Distractor chunks are more semantically similar to relevant ones
- Relevance requires deeper domain understanding
- Some chunks contain partially relevant but ultimately misleading information

Return as a JSON array of 3 objects matching this format:
{{"query": "...", "chunks": ["...", "..."], "relevant_ids": [0, 2]}}""",

    "UC-03": """You are generating harder variants of a B2B intent classification task.
The model misclassified buyer intent signals.

Original sample: {sample}

Generate 3 harder variants where:
- The intent signal is more ambiguous
- There are conflicting cues (urgent language but no budget mention, etc.)
- Classification requires understanding implicit business context

Return as a JSON array of 3 objects: {{"text": "...", "label": "high_intent|low_intent|no_intent"}}""",

    "UC-04": """You are generating harder variants of a Python code generation task.
The model's code failed test assertions.

Original sample: {sample}

Generate 3 harder variants where:
- Edge cases are trickier (empty inputs, large inputs, boundary conditions)
- The spec requires handling more complex data structures
- Test assertions are more comprehensive

Return as a JSON array of 3 objects: {{"spec": "...", "test": "..."}}""",

    "UC-05": """You are generating harder variants of an Indic NLP task (translation/classification).
The model failed on translation or classification of Gujarati/Hindi text.

Original sample: {sample}

Generate 3 harder variants where:
- Text contains code-mixed language (Hinglish/Gujarlish)
- Technical or domain-specific vocabulary
- Idiomatic expressions that don't translate literally

Return as a JSON array of 3 objects: {{"text": "...", "task": "translate|classify", "expected": "..."}}""",

    "UC-06": """You are generating harder variants of a reward model scoring (preference) task.
The model failed to identify the preferred response.

Original sample: {sample}

Generate 3 harder variants where:
- Both responses are high quality but differ subtly
- The preferred response is better in non-obvious ways (e.g., more nuanced, better caveats)
- Surface-level features (length, jargon) don't correlate with quality

Return as a JSON array of 3 objects: {{"prompt": "...", "response_a": "...", "response_b": "...", "preferred": "a|b"}}""",

    "UC-07": """You are generating harder variants of an agent trace audit task.
The model failed to identify hallucinations and reasoning gaps in an agent trace.

Original sample: {sample}

Generate 3 harder variants where:
- Hallucinations are more subtle (plausible but unverifiable claims)
- Reasoning gaps involve implicit assumptions rather than missing steps
- The trace is longer with more steps to analyze

Return as a JSON array of 3 objects: {{"trace": "...", "known_issues": ["..."], "required_hops": ["..."]}}""",

    "UC-08": """You are generating harder variants of a paper abstract → ArXiv ID extraction task.
The model failed to correctly extract the ArXiv ID from a paper abstract.

Original sample: {sample}

Generate 3 harder variants where:
- The abstract mentions multiple papers/IDs and the model must pick the correct one
- The abstract is more technical and domain-specific
- The format is unusual (e.g., embedded in a citation, partial ID mentioned)

Return as a JSON array of 3 objects: {{"abstract": "...", "expected_arxiv_id": "...", "expected_title": "..."}}

IMPORTANT: Use real ArXiv IDs that actually resolve. Known valid IDs: 
2204.05862, 2212.08073, 2310.01377, 2110.14168, 2403.13787, 2411.15124""",

    "UC-09": """You are generating harder variants of an agent planning task.
The model failed to produce a valid step-by-step plan.

Original sample: {sample}

Generate 3 harder variants where:
- The goal has more implicit dependencies between steps
- There are more constraints and forbidden patterns
- The minimum number of steps is higher, requiring more granular decomposition

Return as a JSON array of 3 objects: {{"goal": "...", "forbidden_patterns": ["..."], "min_steps": N}}""",
}


def evolve_sample(uc_id: str, sample: dict, model_name: str, score: float) -> list[dict]:
    """Generate 3 harder variants of a failed sample.
    
    Args:
        uc_id: Use case ID (e.g., "UC-03")
        sample: The original sample that was failed
        model_name: Which model failed
        score: The score achieved
    
    Returns:
        List of 3 new sample dicts, or empty list on failure
    """
    prompt_template = EVOLUTION_PROMPTS.get(uc_id)
    if not prompt_template:
        return []
    
    sample_str = json.dumps(sample, ensure_ascii=False)
    if len(sample_str) > 2000:
        sample_str = sample_str[:2000] + "..."
    
    prompt = prompt_template.format(sample=sample_str)
    
    context = f"""The model '{model_name}' scored {score:.2f} on this task (threshold: {SCORE_THRESHOLD}).
    
{prompt}"""
    
    client = get_client()
    
    try:
        completion = client.chat.completions.create(
            model=JUDGE_MODEL,
            messages=[
                {"role": "system", "content": "You generate harder benchmark samples for LLM evaluation. Always return valid JSON arrays."},
                {"role": "user", "content": context},
            ],
            temperature=0.7,
            max_tokens=2048,
        )
        
        raw = completion.choices[0].message.content.strip()
        
        # Extract JSON array from response
        # Try to find a JSON array in the response
        json_match = re.search(r'\[[\s\S]*\]', raw)
        if json_match:
            variants = json.loads(json_match.group())
            if isinstance(variants, list) and len(variants) > 0:
                return variants[:3]  # Cap at 3
        
        return []
    
    except Exception as e:
        print(f"  ⚠ Evolution failed for {uc_id}/{model_name}: {e}")
        return []


def run_evolution(results: dict, bench_data_dir: Path) -> dict:
    """Run evolution loop on all failed UC × model pairs.
    
    Args:
        results: {model_name: {uc_id: {"score": float, "samples": list, ...}}}
        bench_data_dir: Path to bench_data directory
    
    Returns:
        Summary dict: {uc_id: {"evolved_count": int, "file": str}}
    """
    today = datetime.now().strftime("%Y-%m-%d")
    summary = {}
    
    for model_name, uc_results in results.items():
        for uc_id, result in uc_results.items():
            score = result.get("score", 0.0)
            
            if score >= SCORE_THRESHOLD:
                continue
            
            print(f"\n  🧬 Evolving {uc_id} for {model_name} (score={score:.2f})...")
            
            # Load original samples to pick the ones to evolve
            samples_path = bench_data_dir / uc_id / "samples.jsonl"
            if not samples_path.exists():
                continue
            
            with open(samples_path, 'r') as f:
                samples = [json.loads(l) for l in f if l.strip()]
            
            if not samples:
                continue
            
            # Pick a sample to evolve (use the first one as representative)
            sample = samples[0]
            
            variants = evolve_sample(uc_id, sample, model_name, score)
            
            if not variants:
                continue
            
            # Write evolved samples
            evolved_path = bench_data_dir / uc_id / f"evolved_{today}.jsonl"
            
            # Append (don't overwrite — multiple models may fail same UC)
            with open(evolved_path, 'a') as f:
                for v in variants:
                    f.write(json.dumps(v, ensure_ascii=False) + "\n")
            
            if uc_id not in summary:
                summary[uc_id] = {"evolved_count": 0, "file": str(evolved_path)}
            summary[uc_id]["evolved_count"] += len(variants)
            
            print(f"    → Generated {len(variants)} variants → {evolved_path.name}")
    
    return summary
