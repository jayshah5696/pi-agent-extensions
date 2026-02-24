"""
exp02_classification.py - Classification Evaluation (Experiment 2).

Compares:
- GLiNER2 (fastino/gliner2-base-v1) zero-shot classification
- DeBERTa NLI (cross-encoder/nli-deberta-v3-small) zero-shot classification
- SetFit zero-shot (sentence-transformers/paraphrase-mpnet-base-v2)
- FastText zero-shot (cc.en.300.bin, bag-of-words baseline)
- Modern NLI (MoritzLaurer/deberta-v3-large-zeroshot-v2.0, SOTA NLI 2025)

Datasets:
- Banking77 (PolyAI/banking77, test, 3,080 examples, 77 intents)
- AG News (ag_news, test, 500 sampled examples, 4 topics)

Metrics: Accuracy, Macro F1
Output: results/classification_results.json

Warning: Banking77 with 77 labels and DeBERTa NLI is slow.
DeBERTa NLI runs one forward pass per label per example.
With 77 labels and 3,080 examples: approx. 238k forward passes.
Expect 2-3 hours on CPU for the Banking77 DeBERTa evaluation.
Modern NLI (large) will be even slower; skip on Banking77 by default.

Usage:
    uv run python src/experiments/exp02_classification.py
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

from tqdm import tqdm

PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.analysis.metrics import classification_metrics, latency_stats
from src.baselines.deberta_nli import DeBERTaNLIBaseline
from src.baselines.fasttext_baseline import FastTextZeroShotBaseline
from src.baselines.modernbert_nli_baseline import ModernNLIBaseline
from src.baselines.setfit_baseline import SetFitZeroShotBaseline
from src.data_loader import AG_NEWS_LABELS, BANKING77_LABELS, load_ag_news, load_banking77
from src.gliner2_model import GLiNER2Wrapper

RESULTS_DIR = PROJECT_ROOT / "results"
RESULTS_PATH = RESULTS_DIR / "classification_results.json"


def run_gliner2_classification(
    model: GLiNER2Wrapper,
    examples: list[dict],
    labels: list[str],
    field_name: str,
    desc: str = "GLiNER2",
) -> tuple[list[str], list[float]]:
    """Run GLiNER2 classification on all examples.

    Returns:
        Tuple of (predictions, latencies_ms).
    """
    predictions = []
    latencies = []

    for example in tqdm(examples, desc=desc):
        result = model.predict_classification(
            text=example["text"],
            field_name=field_name,
            labels=labels,
            multi_label=False,
            threshold=0.3,
        )
        pred = result.get("prediction")
        # Normalize prediction to string
        if isinstance(pred, list):
            pred = pred[0] if pred else ""
        elif isinstance(pred, dict):
            pred = pred.get("label", "")
        else:
            pred = str(pred) if pred else ""

        predictions.append(pred)
        latencies.append(result["latency_ms"])

    return predictions, latencies


def run_deberta_classification(
    model: DeBERTaNLIBaseline,
    examples: list[dict],
    labels: list[str],
    desc: str = "DeBERTa NLI",
    use_fast_batch: bool = True,
    batch_size: int = 8,
) -> tuple[list[str], list[float]]:
    """Run DeBERTa NLI classification on all examples.

    Args:
        use_fast_batch: If True, use batched inference (faster for large datasets).

    Returns:
        Tuple of (predictions, latencies_ms).
    """
    texts = [ex["text"] for ex in examples]

    if use_fast_batch and len(texts) > 100:
        print(f"  Using batched inference (batch_size={batch_size})...")
        results = model.predict_batch_fast(
            texts=texts,
            labels=labels,
            batch_size=batch_size,
        )
    else:
        results = []
        for text in tqdm(texts, desc=desc):
            results.append(model.predict(text=text, labels=labels))

    predictions = [r["prediction"] for r in results]
    latencies = [r["latency_ms"] for r in results]

    return predictions, latencies


def run_setfit_classification(
    model: SetFitZeroShotBaseline,
    examples: list[dict],
    labels: list[str],
    desc: str = "SetFit Zero-Shot",
    batch_size: int = 32,
) -> tuple[list[str], list[float]]:
    """Run SetFit zero-shot classification on all examples using batched encoding.

    Args:
        model: Loaded SetFitZeroShotBaseline.
        examples: Dataset examples with 'text' key.
        labels: Candidate class labels.
        desc: Progress bar description.
        batch_size: Sentence-transformers encoding batch size.

    Returns:
        Tuple of (predictions, latencies_ms).
    """
    texts = [ex["text"] for ex in examples]
    print(f"  Encoding {len(texts)} texts in batches of {batch_size}...")
    results = model.predict_batch(texts=texts, labels=labels, batch_size=batch_size)

    predictions = [r["prediction"] for r in results]
    latencies = [r["latency_ms"] for r in results]

    return predictions, latencies


def run_fasttext_classification(
    model: FastTextZeroShotBaseline,
    examples: list[dict],
    labels: list[str],
    desc: str = "FastText Zero-Shot",
) -> tuple[list[str], list[float]]:
    """Run FastText zero-shot classification on all examples.

    FastText is extremely fast (sub-millisecond per example), so no batching
    overhead is meaningful here.

    Args:
        model: Loaded FastTextZeroShotBaseline.
        examples: Dataset examples with 'text' key.
        labels: Candidate class labels.
        desc: Progress bar description.

    Returns:
        Tuple of (predictions, latencies_ms).
    """
    texts = [ex["text"] for ex in examples]
    results = model.predict_batch(texts=texts, labels=labels)

    predictions = [r["prediction"] for r in results]
    latencies = [r["latency_ms"] for r in results]

    return predictions, latencies


def run_modern_nli_classification(
    model: ModernNLIBaseline,
    examples: list[dict],
    labels: list[str],
    desc: str = "Modern NLI",
    use_fast_batch: bool = True,
    batch_size: int = 8,
) -> tuple[list[str], list[float]]:
    """Run Modern NLI classification on all examples.

    Uses the same batching strategy as DeBERTa NLI for consistency.

    Args:
        model: Loaded ModernNLIBaseline.
        examples: Dataset examples with 'text' key.
        labels: Candidate class labels.
        desc: Progress bar description.
        use_fast_batch: If True, use pipeline batching for speed.
        batch_size: Pipeline batch size.

    Returns:
        Tuple of (predictions, latencies_ms).
    """
    texts = [ex["text"] for ex in examples]

    if use_fast_batch and len(texts) > 100:
        print(f"  Using batched inference (batch_size={batch_size})...")
        results = model.predict_batch_fast(
            texts=texts,
            labels=labels,
            batch_size=batch_size,
        )
    else:
        results = []
        for text in tqdm(texts, desc=desc):
            results.append(model.predict(text=text, labels=labels))

    predictions = [r["prediction"] for r in results]
    latencies = [r["latency_ms"] for r in results]

    return predictions, latencies


def evaluate_dataset(
    dataset_name: str,
    examples: list[dict],
    labels: list[str],
    field_name: str,
    gliner2_model: GLiNER2Wrapper,
    deberta_model: DeBERTaNLIBaseline,
    setfit_model: SetFitZeroShotBaseline,
    fasttext_model: FastTextZeroShotBaseline,
    modern_nli_model: ModernNLIBaseline,
    ground_truth_key: str = "label",
    skip_nli_if_n_labels_gt: int = 50,
) -> dict:
    """Evaluate all models on a single dataset.

    Args:
        skip_nli_if_n_labels_gt: Skip NLI-based models (DeBERTa, ModernNLI)
            if label count exceeds this threshold (too slow for quick experiments).
            Set to 0 to always run all NLI models.

    Returns:
        Results dict for this dataset.
    """
    true_labels = [ex[ground_truth_key] for ex in examples]
    dataset_results: dict = {
        "n_examples": len(examples),
        "n_labels": len(labels),
        "labels": labels,
    }

    # GLiNER2
    print(f"\n  Running GLiNER2 on {dataset_name}...")
    t0 = time.perf_counter()
    gliner2_preds, gliner2_latencies = run_gliner2_classification(
        gliner2_model, examples, labels, field_name, desc=f"GLiNER2 {dataset_name}"
    )
    gliner2_total = time.perf_counter() - t0

    gliner2_metrics = classification_metrics(gliner2_preds, true_labels, labels=labels)
    gliner2_lat_stats = latency_stats(gliner2_latencies)

    print(f"  GLiNER2 Accuracy: {gliner2_metrics['accuracy']:.4f} | Macro F1: {gliner2_metrics['macro_f1']:.4f}")
    dataset_results["gliner2"] = {
        "metrics": gliner2_metrics,
        "latency": gliner2_lat_stats,
        "total_time_seconds": gliner2_total,
    }

    # DeBERTa NLI (may be skipped for large label sets)
    if len(labels) > skip_nli_if_n_labels_gt and skip_nli_if_n_labels_gt > 0:
        print(f"\n  Skipping DeBERTa NLI on {dataset_name}: {len(labels)} labels > threshold {skip_nli_if_n_labels_gt}.")
        print(f"  Run with skip_nli_if_n_labels_gt=0 to enable (very slow on CPU).")
        dataset_results["deberta_nli"] = {
            "skipped": True,
            "reason": f"Label count {len(labels)} exceeds threshold {skip_nli_if_n_labels_gt}",
        }
    else:
        print(f"\n  Running DeBERTa NLI on {dataset_name} ({len(labels)} labels)...")
        print(f"  Warning: NLI runs {len(labels)} forward passes per example.")
        t0 = time.perf_counter()
        deberta_preds, deberta_latencies = run_deberta_classification(
            deberta_model, examples, labels, desc=f"DeBERTa {dataset_name}"
        )
        deberta_total = time.perf_counter() - t0

        deberta_metrics = classification_metrics(deberta_preds, true_labels, labels=labels)
        deberta_lat_stats = latency_stats(deberta_latencies)

        print(f"  DeBERTa Accuracy: {deberta_metrics['accuracy']:.4f} | Macro F1: {deberta_metrics['macro_f1']:.4f}")
        dataset_results["deberta_nli"] = {
            "model": deberta_model.model_name,
            "metrics": deberta_metrics,
            "latency": deberta_lat_stats,
            "total_time_seconds": deberta_total,
        }

    # SetFit Zero-Shot
    print(f"\n  Running SetFit zero-shot on {dataset_name}...")
    t0 = time.perf_counter()
    setfit_preds, setfit_latencies = run_setfit_classification(
        setfit_model, examples, labels, desc=f"SetFit {dataset_name}"
    )
    setfit_total = time.perf_counter() - t0

    setfit_metrics = classification_metrics(setfit_preds, true_labels, labels=labels)
    setfit_lat_stats = latency_stats(setfit_latencies)

    print(f"  SetFit Accuracy: {setfit_metrics['accuracy']:.4f} | Macro F1: {setfit_metrics['macro_f1']:.4f}")
    dataset_results["setfit_zeroshot"] = {
        "model": setfit_model.model_name,
        "metrics": setfit_metrics,
        "latency": setfit_lat_stats,
        "total_time_seconds": setfit_total,
        "note": "Zero-shot cosine similarity: no task-specific training. Lower accuracy expected.",
    }

    # FastText Zero-Shot
    print(f"\n  Running FastText zero-shot on {dataset_name}...")
    t0 = time.perf_counter()
    fasttext_preds, fasttext_latencies = run_fasttext_classification(
        fasttext_model, examples, labels, desc=f"FastText {dataset_name}"
    )
    fasttext_total = time.perf_counter() - t0

    fasttext_metrics = classification_metrics(fasttext_preds, true_labels, labels=labels)
    fasttext_lat_stats = latency_stats(fasttext_latencies)

    print(f"  FastText Accuracy: {fasttext_metrics['accuracy']:.4f} | Macro F1: {fasttext_metrics['macro_f1']:.4f}")
    dataset_results["fasttext_zeroshot"] = {
        "model": "cc.en.300.bin",
        "metrics": fasttext_metrics,
        "latency": fasttext_lat_stats,
        "total_time_seconds": fasttext_total,
        "note": "Bag-of-words baseline. No context. Represents absolute latency floor.",
    }

    # Modern NLI (may be skipped for large label sets)
    if len(labels) > skip_nli_if_n_labels_gt and skip_nli_if_n_labels_gt > 0:
        print(f"\n  Skipping Modern NLI on {dataset_name}: {len(labels)} labels > threshold {skip_nli_if_n_labels_gt}.")
        dataset_results["modern_nli"] = {
            "skipped": True,
            "reason": f"Label count {len(labels)} exceeds threshold {skip_nli_if_n_labels_gt}",
        }
    else:
        print(f"\n  Running Modern NLI on {dataset_name} ({len(labels)} labels)...")
        print(f"  Warning: Modern NLI (large 435M model) runs {len(labels)} forward passes per example.")
        t0 = time.perf_counter()
        modern_nli_preds, modern_nli_latencies = run_modern_nli_classification(
            modern_nli_model, examples, labels, desc=f"ModernNLI {dataset_name}"
        )
        modern_nli_total = time.perf_counter() - t0

        modern_nli_metrics = classification_metrics(modern_nli_preds, true_labels, labels=labels)
        modern_nli_lat_stats = latency_stats(modern_nli_latencies)

        print(f"  Modern NLI Accuracy: {modern_nli_metrics['accuracy']:.4f} | Macro F1: {modern_nli_metrics['macro_f1']:.4f}")
        dataset_results["modern_nli"] = {
            "model": modern_nli_model.model_name,
            "metrics": modern_nli_metrics,
            "latency": modern_nli_lat_stats,
            "total_time_seconds": modern_nli_total,
        }

    return dataset_results


def main() -> None:
    """Run classification experiments and save results."""
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    print("=" * 60)
    print("Experiment 2: Zero-Shot Classification")
    print("Datasets: Banking77 + AG News")
    print("=" * 60)

    # Load datasets
    banking77_examples = load_banking77()
    ag_news_examples = load_ag_news(max_examples=500)

    # Load models
    gliner2 = GLiNER2Wrapper()
    deberta = DeBERTaNLIBaseline()
    setfit_model = SetFitZeroShotBaseline()
    fasttext_model = FastTextZeroShotBaseline()
    modern_nli = ModernNLIBaseline()

    results: dict = {}

    # -------------------------------------------------------------------------
    # Banking77: 77 fine-grained banking intents
    # NLI models skipped by default (77 labels x 3080 examples = very slow)
    # Set skip_nli_if_n_labels_gt=0 to run them (expect several hours)
    # -------------------------------------------------------------------------
    print("\n--- Banking77 (77 labels) ---")
    results["banking77"] = evaluate_dataset(
        dataset_name="Banking77",
        examples=banking77_examples,
        labels=BANKING77_LABELS,
        field_name="intent",
        gliner2_model=gliner2,
        deberta_model=deberta,
        setfit_model=setfit_model,
        fasttext_model=fasttext_model,
        modern_nli_model=modern_nli,
        ground_truth_key="label",
        skip_nli_if_n_labels_gt=50,  # Skip NLI for 77 labels (too slow on CPU)
    )

    # -------------------------------------------------------------------------
    # AG News: 4 topic categories (fast for all models)
    # -------------------------------------------------------------------------
    print("\n--- AG News (4 labels) ---")
    results["ag_news"] = evaluate_dataset(
        dataset_name="AG News",
        examples=ag_news_examples,
        labels=AG_NEWS_LABELS,
        field_name="topic",
        gliner2_model=gliner2,
        deberta_model=deberta,
        setfit_model=setfit_model,
        fasttext_model=fasttext_model,
        modern_nli_model=modern_nli,
        ground_truth_key="label",
        skip_nli_if_n_labels_gt=50,  # All NLI models run for 4 labels
    )

    # Save results
    with open(RESULTS_PATH, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    print(f"\nResults saved to: {RESULTS_PATH}")
    print("\nSummary:")
    for ds_name, ds_results in results.items():
        print(f"\n  {ds_name.upper()}:")
        for model_key in ["gliner2", "deberta_nli", "setfit_zeroshot", "fasttext_zeroshot", "modern_nli"]:
            model_data = ds_results.get(model_key, {})
            if model_data.get("skipped"):
                print(f"    {model_key}: SKIPPED ({model_data.get('reason', '')})")
            elif "metrics" in model_data:
                acc = model_data["metrics"].get("accuracy", 0)
                f1 = model_data["metrics"].get("macro_f1", 0)
                print(f"    {model_key}: accuracy={acc:.4f}, macro_f1={f1:.4f}")


if __name__ == "__main__":
    main()
