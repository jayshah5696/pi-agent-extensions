"""
exp04_composition.py - Task Composition Test (Experiment 4).

Tests GLiNER2's multi-task composition claim:
- Single pass: NER + classification in one forward pass via schema API
- Two passes: NER first, then classification separately

Both operate on the same 100 CrossNER AI examples with synthetic topic labels.
Compares:
- Combined F1 and accuracy
- Total wall-clock time (single pass vs two separate passes)

Dataset: 100 CrossNER AI examples
NER labels: 14 AI domain entity types
Classification labels: ["tech news", "academic paper", "tutorial", "product announcement"]

Output: results/composition_results.json

Usage:
    uv run python src/experiments/exp04_composition.py
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

from tqdm import tqdm

PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.analysis.metrics import entity_f1, latency_stats, predicted_entities_to_spans
from src.data_loader import CROSSNER_AI_ENTITY_TYPES, load_crossner_ai
from src.gliner2_model import GLiNER2Wrapper

RESULTS_DIR = PROJECT_ROOT / "results"
RESULTS_PATH = RESULTS_DIR / "composition_results.json"

# Synthetic classification labels for the composition test
# (CrossNER AI is AI domain text, so these are reasonable proxies)
COMPOSITION_CLS_LABELS = [
    "tech news",
    "academic paper",
    "tutorial or guide",
    "product announcement",
]
COMPOSITION_CLS_FIELD = "document_type"

# Number of examples for the composition test
N_COMPOSITION_EXAMPLES = 100


def run_single_pass(
    model: GLiNER2Wrapper,
    examples: list[dict],
) -> tuple[list[dict], list[dict], list[float]]:
    """Run NER + classification in a single forward pass using composed schema.

    Args:
        model: Loaded GLiNER2Wrapper.
        examples: List of CrossNER AI examples.

    Returns:
        Tuple of (ner_predictions, cls_predictions, latencies_ms).
    """
    ner_predictions = []
    cls_predictions = []
    latencies = []

    for example in tqdm(examples, desc="Single-pass (NER + CLS)"):
        result = model.predict_composed(
            text=example["text"],
            ner_labels=CROSSNER_AI_ENTITY_TYPES,
            cls_field=COMPOSITION_CLS_FIELD,
            cls_labels=COMPOSITION_CLS_LABELS,
            ner_threshold=0.5,
            cls_threshold=0.3,
        )
        latencies.append(result["latency_ms"])

        # Convert entities to span format for seqeval comparison
        pred_spans = []
        for label, entity_texts in result["entities"].items():
            for entity_text in entity_texts:
                # Find token index for the entity text
                entity_tokens = entity_text.split()
                tokens = example["tokens"]
                for i in range(len(tokens) - len(entity_tokens) + 1):
                    if tokens[i : i + len(entity_tokens)] == entity_tokens:
                        pred_spans.append(
                            {
                                "text": entity_text,
                                "label": label,
                                "start_token": i,
                                "end_token": i + len(entity_tokens) - 1,
                            }
                        )
                        break

        ner_predictions.append({"tokens": example["tokens"], "spans": pred_spans})

        # Normalize classification output
        cls_pred = result.get("classification")
        if isinstance(cls_pred, list):
            cls_pred = cls_pred[0] if cls_pred else ""
        elif isinstance(cls_pred, dict):
            cls_pred = cls_pred.get("label", "")
        cls_predictions.append({"prediction": str(cls_pred) if cls_pred else ""})

    return ner_predictions, cls_predictions, latencies


def run_two_pass(
    model: GLiNER2Wrapper,
    examples: list[dict],
) -> tuple[list[dict], list[dict], list[float]]:
    """Run NER and classification as two separate forward passes.

    Args:
        model: Loaded GLiNER2Wrapper.
        examples: List of CrossNER AI examples.

    Returns:
        Tuple of (ner_predictions, cls_predictions, latencies_ms).
    """
    ner_predictions = []
    cls_predictions = []
    latencies = []

    for example in tqdm(examples, desc="Two-pass (NER then CLS)"):
        result = model.predict_ner_then_classification(
            text=example["text"],
            ner_labels=CROSSNER_AI_ENTITY_TYPES,
            cls_field=COMPOSITION_CLS_FIELD,
            cls_labels=COMPOSITION_CLS_LABELS,
            ner_threshold=0.5,
            cls_threshold=0.3,
        )
        latencies.append(result["latency_ms"])

        # Convert entities to span format
        pred_spans = []
        for label, entity_texts in result["entities"].items():
            for entity_text in entity_texts:
                entity_tokens = entity_text.split()
                tokens = example["tokens"]
                for i in range(len(tokens) - len(entity_tokens) + 1):
                    if tokens[i : i + len(entity_tokens)] == entity_tokens:
                        pred_spans.append(
                            {
                                "text": entity_text,
                                "label": label,
                                "start_token": i,
                                "end_token": i + len(entity_tokens) - 1,
                            }
                        )
                        break

        ner_predictions.append({"tokens": example["tokens"], "spans": pred_spans})

        cls_pred = result.get("classification")
        if isinstance(cls_pred, list):
            cls_pred = cls_pred[0] if cls_pred else ""
        elif isinstance(cls_pred, dict):
            cls_pred = cls_pred.get("label", "")
        cls_predictions.append({"prediction": str(cls_pred) if cls_pred else ""})

    return ner_predictions, cls_predictions, latencies


def main() -> None:
    """Run composition experiment and save results."""
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    print("=" * 60)
    print("Experiment 4: Task Composition Test")
    print("Single-pass vs Two-pass NER + Classification")
    print("=" * 60)

    # Load data (first 100 examples)
    all_examples = load_crossner_ai()
    examples = all_examples[:N_COMPOSITION_EXAMPLES]
    ground_truth = [{"tokens": ex["tokens"], "spans": ex["spans"]} for ex in examples]

    print(f"\nUsing {len(examples)} CrossNER AI examples.")
    print(f"NER labels: {len(CROSSNER_AI_ENTITY_TYPES)} types")
    print(f"CLS labels: {COMPOSITION_CLS_LABELS}")
    print(f"\nNote: Classification ground truth is unavailable for CrossNER AI.")
    print(f"  We compare single-pass vs two-pass NER F1 only (classification is qualitative).")

    # Load model
    gliner2 = GLiNER2Wrapper()

    results: dict = {
        "dataset": "CrossNER AI (100 examples)",
        "n_examples": len(examples),
        "ner_labels": CROSSNER_AI_ENTITY_TYPES,
        "cls_labels": COMPOSITION_CLS_LABELS,
        "cls_field": COMPOSITION_CLS_FIELD,
    }

    # -------------------------------------------------------------------------
    # Single-pass evaluation
    # -------------------------------------------------------------------------
    print("\n--- Single Pass (NER + CLS in one forward call) ---")
    t_start = time.perf_counter()
    sp_ner_preds, sp_cls_preds, sp_latencies = run_single_pass(gliner2, examples)
    sp_total = time.perf_counter() - t_start

    sp_ner_metrics = entity_f1(sp_ner_preds, ground_truth)
    sp_lat_stats = latency_stats(sp_latencies)

    print(f"\nSingle-pass results:")
    print(f"  NER Entity F1:  {sp_ner_metrics['f1']:.4f}")
    print(f"  Precision:      {sp_ner_metrics['precision']:.4f}")
    print(f"  Recall:         {sp_ner_metrics['recall']:.4f}")
    print(f"  Latency (mean): {sp_lat_stats['mean']:.1f}ms")
    print(f"  Total time:     {sp_total:.1f}s")

    # Sample classification outputs (qualitative)
    cls_sample = [p["prediction"] for p in sp_cls_preds[:10]]
    print(f"  Sample CLS outputs: {cls_sample}")

    results["single_pass"] = {
        "ner_metrics": sp_ner_metrics,
        "latency": sp_lat_stats,
        "total_time_seconds": sp_total,
        "cls_sample_outputs": [p["prediction"] for p in sp_cls_preds[:20]],
    }

    # -------------------------------------------------------------------------
    # Two-pass evaluation
    # -------------------------------------------------------------------------
    print("\n--- Two Passes (NER first, then CLS separately) ---")
    t_start = time.perf_counter()
    tp_ner_preds, tp_cls_preds, tp_latencies = run_two_pass(gliner2, examples)
    tp_total = time.perf_counter() - t_start

    tp_ner_metrics = entity_f1(tp_ner_preds, ground_truth)
    tp_lat_stats = latency_stats(tp_latencies)

    print(f"\nTwo-pass results:")
    print(f"  NER Entity F1:  {tp_ner_metrics['f1']:.4f}")
    print(f"  Precision:      {tp_ner_metrics['precision']:.4f}")
    print(f"  Recall:         {tp_ner_metrics['recall']:.4f}")
    print(f"  Latency (mean): {tp_lat_stats['mean']:.1f}ms")
    print(f"  Total time:     {tp_total:.1f}s")

    results["two_pass"] = {
        "ner_metrics": tp_ner_metrics,
        "latency": tp_lat_stats,
        "total_time_seconds": tp_total,
        "cls_sample_outputs": [p["prediction"] for p in tp_cls_preds[:20]],
    }

    # -------------------------------------------------------------------------
    # Comparison summary
    # -------------------------------------------------------------------------
    speedup = tp_lat_stats["mean"] / max(sp_lat_stats["mean"], 1e-6)
    f1_diff = sp_ner_metrics["f1"] - tp_ner_metrics["f1"]

    results["comparison"] = {
        "speedup_factor": speedup,
        "single_pass_mean_ms": sp_lat_stats["mean"],
        "two_pass_mean_ms": tp_lat_stats["mean"],
        "f1_difference_single_minus_two": f1_diff,
        "single_pass_total_seconds": sp_total,
        "two_pass_total_seconds": tp_total,
    }

    print(f"\n--- Composition Comparison ---")
    print(f"  Single-pass latency: {sp_lat_stats['mean']:.1f}ms mean")
    print(f"  Two-pass latency:    {tp_lat_stats['mean']:.1f}ms mean")
    print(f"  Speedup (two/single): {speedup:.2f}x")
    print(f"  NER F1 delta (single - two): {f1_diff:+.4f}")

    # Save results
    with open(RESULTS_PATH, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    print(f"\nResults saved to: {RESULTS_PATH}")


if __name__ == "__main__":
    main()
