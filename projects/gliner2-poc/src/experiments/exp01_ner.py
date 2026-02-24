"""
exp01_ner.py - NER Evaluation on CrossNER AI (Experiment 1).

Compares:
- GLiNER2 (fastino/gliner2-base-v1) zero-shot NER
- spaCy en_core_web_sm NER with CrossNER type mapping
- GLiNER v1 (urchade/gliner_medium-v2.1) zero-shot NER
- ModernBERT GLiNER bi-encoder (knowledgator/modern-gliner-bi-base-v1.0)
- Flair NER (flair/ner-english-fast) with CrossNER type mapping

Dataset: DFKI-SLT/cross_ner (ai config, test split, 431 examples)
Metric: Entity-level F1 using seqeval
Output: results/ner_results.json

Usage:
    uv run python src/experiments/exp01_ner.py
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

from tqdm import tqdm

# Ensure src/ is on the Python path when run from project root
PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.analysis.metrics import entity_f1, latency_stats, predicted_entities_to_spans
from src.baselines.flair_baseline import FlairNERBaseline
from src.baselines.gliner_v1_baseline import GLiNERV1Baseline
from src.baselines.modernbert_gliner_baseline import ModernBERTGLiNERBaseline
from src.baselines.spacy_baseline import SpaCyNERBaseline
from src.data_loader import CROSSNER_AI_ENTITY_TYPES, load_crossner_ai
from src.gliner2_model import GLiNER2Wrapper

RESULTS_DIR = PROJECT_ROOT / "results"
RESULTS_PATH = RESULTS_DIR / "ner_results.json"


def run_gliner2_ner(
    model: GLiNER2Wrapper,
    examples: list[dict],
) -> tuple[list[dict], list[float]]:
    """Run GLiNER2 NER on all examples and collect predictions + latencies.

    Returns:
        Tuple of (predictions_list, latency_list_ms).
        Each prediction dict has: tokens, spans (predicted).
    """
    predictions = []
    latencies = []

    print("\nRunning GLiNER2 NER evaluation...")
    for example in tqdm(examples, desc="GLiNER2 NER"):
        result = model.predict_ner(
            text=example["text"],
            labels=CROSSNER_AI_ENTITY_TYPES,
            include_spans=True,
            threshold=0.5,
        )
        latencies.append(result["latency_ms"])

        # Convert GLiNER2 entity output to span format with token indices
        pred_spans = predicted_entities_to_spans(
            tokens=example["tokens"],
            text=example["text"],
            predicted_entities=result["entities"],
        )
        predictions.append(
            {
                "tokens": example["tokens"],
                "spans": pred_spans,
            }
        )

    return predictions, latencies


def run_spacy_ner(
    model: SpaCyNERBaseline,
    examples: list[dict],
) -> tuple[list[dict], list[float]]:
    """Run spaCy NER on all examples and collect predictions + latencies.

    Returns:
        Tuple of (predictions_list, latency_list_ms).
    """
    predictions = []
    latencies = []

    print("\nRunning spaCy NER evaluation...")
    for example in tqdm(examples, desc="spaCy NER"):
        result = model.predict(
            text=example["text"],
            target_labels=CROSSNER_AI_ENTITY_TYPES,
        )
        latencies.append(result["latency_ms"])

        # Convert character-span entities to token-span format
        pred_spans = predicted_entities_to_spans(
            tokens=example["tokens"],
            text=example["text"],
            predicted_entities={
                label: [{"text": e["text"], "start": e["start"], "end": e["end"]}
                        for e in entities]
                for label, entities in result["entities"].items()
            },
        )
        predictions.append(
            {
                "tokens": example["tokens"],
                "spans": pred_spans,
            }
        )

    return predictions, latencies


def run_gliner_v1_ner(
    model: GLiNERV1Baseline,
    examples: list[dict],
) -> tuple[list[dict], list[float]]:
    """Run GLiNER v1 NER on all examples and collect predictions + latencies.

    GLiNER v1 predict() already returns a label-keyed dict format compatible
    with predicted_entities_to_spans(). The conversion from flat list to
    label-keyed dict is handled inside the baseline's predict() method.

    Returns:
        Tuple of (predictions_list, latency_list_ms).
    """
    predictions = []
    latencies = []

    print("\nRunning GLiNER v1 NER evaluation...")
    for example in tqdm(examples, desc="GLiNER v1 NER"):
        result = model.predict(
            text=example["text"],
            labels=CROSSNER_AI_ENTITY_TYPES,
            threshold=0.5,
        )
        latencies.append(result["latency_ms"])

        # Convert label-keyed entity dict to span format with token indices
        pred_spans = predicted_entities_to_spans(
            tokens=example["tokens"],
            text=example["text"],
            predicted_entities=result["entities"],
        )
        predictions.append(
            {
                "tokens": example["tokens"],
                "spans": pred_spans,
            }
        )

    return predictions, latencies


def run_modernbert_gliner_ner(
    model: ModernBERTGLiNERBaseline,
    examples: list[dict],
) -> tuple[list[dict], list[float]]:
    """Run ModernBERT GLiNER bi-encoder NER on all examples.

    Uses the same label-keyed dict output format as GLiNER v1 and GLiNER2.

    Returns:
        Tuple of (predictions_list, latency_list_ms).
    """
    predictions = []
    latencies = []

    print("\nRunning ModernBERT GLiNER bi-encoder NER evaluation...")
    for example in tqdm(examples, desc="ModernBERT GLiNER NER"):
        result = model.predict(
            text=example["text"],
            labels=CROSSNER_AI_ENTITY_TYPES,
            threshold=0.5,
        )
        latencies.append(result["latency_ms"])

        pred_spans = predicted_entities_to_spans(
            tokens=example["tokens"],
            text=example["text"],
            predicted_entities=result["entities"],
        )
        predictions.append(
            {
                "tokens": example["tokens"],
                "spans": pred_spans,
            }
        )

    return predictions, latencies


def run_flair_ner(
    model: FlairNERBaseline,
    examples: list[dict],
) -> tuple[list[dict], list[float]]:
    """Run Flair NER on all examples and collect predictions + latencies.

    Flair recognizes PER/ORG/LOC/MISC (CoNLL-2003), mapped to CrossNER AI
    types via FLAIR_TO_CROSSNER. Many CrossNER entity types will be missed
    entirely, so F1 will be lower than the transformer-based models.

    Returns:
        Tuple of (predictions_list, latency_list_ms).
    """
    predictions = []
    latencies = []

    print("\nRunning Flair NER evaluation...")
    print("  Note: Flair recognizes only PER/ORG/LOC/MISC (4 types vs 14 CrossNER types).")
    for example in tqdm(examples, desc="Flair NER"):
        result = model.predict(
            text=example["text"],
            target_labels=CROSSNER_AI_ENTITY_TYPES,
        )
        latencies.append(result["latency_ms"])

        # Convert character-span entities to token-span format
        pred_spans = predicted_entities_to_spans(
            tokens=example["tokens"],
            text=example["text"],
            predicted_entities={
                label: [{"text": e["text"], "start": e["start"], "end": e["end"]}
                        for e in entities]
                for label, entities in result["entities"].items()
            },
        )
        predictions.append(
            {
                "tokens": example["tokens"],
                "spans": pred_spans,
            }
        )

    return predictions, latencies


def main() -> None:
    """Run NER experiment and save results."""
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    print("=" * 60)
    print("Experiment 1: Zero-Shot NER on CrossNER AI")
    print("=" * 60)

    # Load dataset
    examples = load_crossner_ai()
    ground_truth = [
        {"tokens": ex["tokens"], "spans": ex["spans"]}
        for ex in examples
    ]

    # Load models
    gliner2 = GLiNER2Wrapper()
    spacy_model = SpaCyNERBaseline()
    gliner_v1 = GLiNERV1Baseline()
    modernbert_gliner = ModernBERTGLiNERBaseline()
    flair_model = FlairNERBaseline()

    results: dict = {
        "dataset": "CrossNER AI (DFKI-SLT/cross_ner, ai split, test)",
        "n_examples": len(examples),
        "entity_types": CROSSNER_AI_ENTITY_TYPES,
    }

    # -------------------------------------------------------------------------
    # GLiNER2 evaluation
    # -------------------------------------------------------------------------
    t_start = time.perf_counter()
    gliner2_preds, gliner2_latencies = run_gliner2_ner(gliner2, examples)
    gliner2_total_time = time.perf_counter() - t_start

    gliner2_metrics = entity_f1(gliner2_preds, ground_truth)
    gliner2_lat_stats = latency_stats(gliner2_latencies)

    print(f"\nGLiNER2 NER Results:")
    print(f"  Entity F1:  {gliner2_metrics['f1']:.4f}")
    print(f"  Precision:  {gliner2_metrics['precision']:.4f}")
    print(f"  Recall:     {gliner2_metrics['recall']:.4f}")
    print(f"  Latency:    {gliner2_lat_stats['mean']:.1f}ms mean, {gliner2_lat_stats['p95']:.1f}ms p95")
    print(f"  Total time: {gliner2_total_time:.1f}s")

    results["gliner2"] = {
        "model": gliner2.model_name,
        "metrics": gliner2_metrics,
        "latency": gliner2_lat_stats,
        "total_time_seconds": gliner2_total_time,
    }

    # -------------------------------------------------------------------------
    # spaCy evaluation
    # -------------------------------------------------------------------------
    t_start = time.perf_counter()
    spacy_preds, spacy_latencies = run_spacy_ner(spacy_model, examples)
    spacy_total_time = time.perf_counter() - t_start

    spacy_metrics = entity_f1(spacy_preds, ground_truth)
    spacy_lat_stats = latency_stats(spacy_latencies)

    print(f"\nspaCy NER Results:")
    print(f"  Entity F1:  {spacy_metrics['f1']:.4f}")
    print(f"  Precision:  {spacy_metrics['precision']:.4f}")
    print(f"  Recall:     {spacy_metrics['recall']:.4f}")
    print(f"  Latency:    {spacy_lat_stats['mean']:.1f}ms mean, {spacy_lat_stats['p95']:.1f}ms p95")
    print(f"  Total time: {spacy_total_time:.1f}s")
    print(f"\n  Note: spaCy uses OntoNotes entity mapping (domain mismatch with CrossNER AI).")

    results["spacy"] = {
        "model": spacy_model.model_name,
        "metrics": spacy_metrics,
        "latency": spacy_lat_stats,
        "total_time_seconds": spacy_total_time,
        "note": "Entity type mapping from OntoNotes to CrossNER AI is approximate.",
    }

    # -------------------------------------------------------------------------
    # GLiNER v1 evaluation
    # -------------------------------------------------------------------------
    t_start = time.perf_counter()
    gliner_v1_preds, gliner_v1_latencies = run_gliner_v1_ner(gliner_v1, examples)
    gliner_v1_total_time = time.perf_counter() - t_start

    gliner_v1_metrics = entity_f1(gliner_v1_preds, ground_truth)
    gliner_v1_lat_stats = latency_stats(gliner_v1_latencies)

    print(f"\nGLiNER v1 NER Results:")
    print(f"  Entity F1:  {gliner_v1_metrics['f1']:.4f}")
    print(f"  Precision:  {gliner_v1_metrics['precision']:.4f}")
    print(f"  Recall:     {gliner_v1_metrics['recall']:.4f}")
    print(f"  Latency:    {gliner_v1_lat_stats['mean']:.1f}ms mean, {gliner_v1_lat_stats['p95']:.1f}ms p95")
    print(f"  Total time: {gliner_v1_total_time:.1f}s")
    print(f"\n  Note: GLiNER v1 uni-encoder: latency grows with label count (co-encoding).")

    results["gliner_v1"] = {
        "model": gliner_v1.model_name,
        "metrics": gliner_v1_metrics,
        "latency": gliner_v1_lat_stats,
        "total_time_seconds": gliner_v1_total_time,
        "note": "Uni-encoder: label representations co-encoded with text. Latency is O(n_labels).",
    }

    # -------------------------------------------------------------------------
    # ModernBERT GLiNER bi-encoder evaluation
    # -------------------------------------------------------------------------
    t_start = time.perf_counter()
    mb_preds, mb_latencies = run_modernbert_gliner_ner(modernbert_gliner, examples)
    mb_total_time = time.perf_counter() - t_start

    mb_metrics = entity_f1(mb_preds, ground_truth)
    mb_lat_stats = latency_stats(mb_latencies)

    print(f"\nModernBERT GLiNER Bi-Encoder NER Results:")
    print(f"  Entity F1:  {mb_metrics['f1']:.4f}")
    print(f"  Precision:  {mb_metrics['precision']:.4f}")
    print(f"  Recall:     {mb_metrics['recall']:.4f}")
    print(f"  Latency:    {mb_lat_stats['mean']:.1f}ms mean, {mb_lat_stats['p95']:.1f}ms p95")
    print(f"  Total time: {mb_total_time:.1f}s")
    print(f"\n  Note: Bi-encoder: entity embeddings cached, latency near O(1) vs label count.")

    results["modernbert_gliner"] = {
        "model": modernbert_gliner.model_name,
        "metrics": mb_metrics,
        "latency": mb_lat_stats,
        "total_time_seconds": mb_total_time,
        "note": "Bi-encoder: entity embeddings independent of input. Near O(1) w.r.t. label count.",
    }

    # -------------------------------------------------------------------------
    # Flair NER evaluation
    # -------------------------------------------------------------------------
    t_start = time.perf_counter()
    flair_preds, flair_latencies = run_flair_ner(flair_model, examples)
    flair_total_time = time.perf_counter() - t_start

    flair_metrics = entity_f1(flair_preds, ground_truth)
    flair_lat_stats = latency_stats(flair_latencies)

    print(f"\nFlair NER Results:")
    print(f"  Entity F1:  {flair_metrics['f1']:.4f}")
    print(f"  Precision:  {flair_metrics['precision']:.4f}")
    print(f"  Recall:     {flair_metrics['recall']:.4f}")
    print(f"  Latency:    {flair_lat_stats['mean']:.1f}ms mean, {flair_lat_stats['p95']:.1f}ms p95")
    print(f"  Total time: {flair_total_time:.1f}s")
    print(f"\n  Note: Flair covers only 4 entity types (PER/ORG/LOC/MISC). Low F1 is expected.")

    results["flair"] = {
        "model": flair_model.model_name,
        "metrics": flair_metrics,
        "latency": flair_lat_stats,
        "total_time_seconds": flair_total_time,
        "note": "Trained on CoNLL-2003 (4 types only). Maps PER->researcher, ORG->organisation, LOC->location, MISC->miscellaneous.",
    }

    # -------------------------------------------------------------------------
    # Save results
    # -------------------------------------------------------------------------
    with open(RESULTS_PATH, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    print(f"\nResults saved to: {RESULTS_PATH}")
    print("\nSummary:")
    print(f"  GLiNER2 Entity F1:           {gliner2_metrics['f1']:.4f}")
    print(f"  GLiNER v1 Entity F1:         {gliner_v1_metrics['f1']:.4f}")
    print(f"  ModernBERT GLiNER Entity F1: {mb_metrics['f1']:.4f}")
    print(f"  spaCy Entity F1:             {spacy_metrics['f1']:.4f}")
    print(f"  Flair Entity F1:             {flair_metrics['f1']:.4f}")


if __name__ == "__main__":
    main()
