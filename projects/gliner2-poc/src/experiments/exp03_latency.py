"""
exp03_latency.py - Latency Scaling Experiment (Experiment 3).

Measures inference latency as a function of label count for:
- GLiNER2 (fastino/gliner2-base-v1)
- GLiNER v1 (urchade/gliner_medium-v2.1, uni-encoder, O(n_labels))
- ModernBERT GLiNER (knowledgator/modern-gliner-bi-base-v1.0, bi-encoder, near O(1))
- spaCy en_core_web_sm (constant, no label scaling)
- DeBERTa NLI (cross-encoder/nli-deberta-v3-small, O(n_labels))

Protocol:
- 100 examples from CrossNER AI test set
- Label counts: [5, 10, 20, 50]
- GLiNER2, GLiNER v1, ModernBERT GLiNER, and DeBERTa use NER labels for the
  latency test (label count is the variable being tested)
- spaCy is label-count-agnostic (NER fixed regardless of labels)
- Each model runs 3 warmup examples before timing

Output: results/latency_results.json

Usage:
    uv run python src/experiments/exp03_latency.py
"""

from __future__ import annotations

import json
import sys
import time
from pathlib import Path

from tqdm import tqdm

PROJECT_ROOT = Path(__file__).parent.parent.parent
sys.path.insert(0, str(PROJECT_ROOT))

from src.analysis.metrics import latency_stats
from src.baselines.deberta_nli import DeBERTaNLIBaseline
from src.baselines.gliner_v1_baseline import GLiNERV1Baseline
from src.baselines.modernbert_gliner_baseline import ModernBERTGLiNERBaseline
from src.baselines.spacy_baseline import SpaCyNERBaseline
from src.data_loader import CROSSNER_AI_ENTITY_TYPES, load_crossner_ai
from src.gliner2_model import GLiNER2Wrapper

RESULTS_DIR = PROJECT_ROOT / "results"
RESULTS_PATH = RESULTS_DIR / "latency_results.json"

# Label counts to test
LABEL_COUNTS = [5, 10, 20, 50]

# Number of examples to use for latency measurement
N_LATENCY_EXAMPLES = 100

# Number of warmup examples (not included in timing)
N_WARMUP = 3


def get_label_subset(all_labels: list[str], n: int) -> list[str]:
    """Return the first n labels from the full label list.

    For counts > len(all_labels), the list is padded with synthetic labels.

    Args:
        all_labels: Full label list.
        n: Desired label count.

    Returns:
        List of n labels.
    """
    if n <= len(all_labels):
        return all_labels[:n]
    # Pad with synthetic labels for stress testing
    labels = list(all_labels)
    i = 0
    while len(labels) < n:
        labels.append(f"entity_type_{i}")
        i += 1
    return labels[:n]


def warmup(model_fn, text: str, labels: list[str], n: int = 3) -> None:
    """Run warmup passes to JIT-compile and stabilize inference timing."""
    for _ in range(n):
        model_fn(text, labels)


def measure_gliner2_latency(
    model: GLiNER2Wrapper,
    texts: list[str],
    label_count: int,
) -> list[float]:
    """Measure GLiNER2 NER latency for a given label count.

    GLiNER2 uses a label-agnostic encoder: latency should remain nearly flat
    as label count increases. This is the core latency claim being tested.

    Args:
        model: Loaded GLiNER2Wrapper.
        texts: Input texts.
        label_count: Number of labels to use in the NER query.

    Returns:
        List of per-example latency measurements (ms).
    """
    labels = get_label_subset(CROSSNER_AI_ENTITY_TYPES, label_count)

    # Warmup
    warmup(
        lambda t, l: model.predict_ner(t, l, include_spans=False),
        texts[0],
        labels,
        n=N_WARMUP,
    )

    latencies = []
    for text in texts:
        result = model.predict_ner(text, labels, include_spans=False)
        latencies.append(result["latency_ms"])

    return latencies


def measure_gliner_v1_latency(
    model: GLiNERV1Baseline,
    texts: list[str],
    label_count: int,
) -> list[float]:
    """Measure GLiNER v1 NER latency for a given label count.

    GLiNER v1 uses a uni-encoder: label tokens are co-encoded with text, so
    latency grows as label count increases. This demonstrates the scaling
    disadvantage of the uni-encoder design vs GLiNER2 and ModernBERT GLiNER.

    Args:
        model: Loaded GLiNERV1Baseline.
        texts: Input texts.
        label_count: Number of labels to use in the NER query.

    Returns:
        List of per-example latency measurements (ms).
    """
    labels = get_label_subset(CROSSNER_AI_ENTITY_TYPES, label_count)

    # Warmup
    warmup(
        lambda t, l: model.predict(t, l),
        texts[0],
        labels,
        n=N_WARMUP,
    )

    latencies = []
    for text in texts:
        result = model.predict(text, labels)
        latencies.append(result["latency_ms"])

    return latencies


def measure_modernbert_gliner_latency(
    model: ModernBERTGLiNERBaseline,
    texts: list[str],
    label_count: int,
) -> list[float]:
    """Measure ModernBERT GLiNER bi-encoder latency for a given label count.

    The bi-encoder architecture caches entity embeddings independently of
    the input text, so latency should be near-constant across label counts.
    This tests whether the bi-encoder delivers on its theoretical O(1) promise.

    Args:
        model: Loaded ModernBERTGLiNERBaseline.
        texts: Input texts.
        label_count: Number of labels to use in the NER query.

    Returns:
        List of per-example latency measurements (ms).
    """
    labels = get_label_subset(CROSSNER_AI_ENTITY_TYPES, label_count)

    # Warmup (also warms up the entity embedding cache)
    warmup(
        lambda t, l: model.predict(t, l),
        texts[0],
        labels,
        n=N_WARMUP,
    )

    latencies = []
    for text in texts:
        result = model.predict(text, labels)
        latencies.append(result["latency_ms"])

    return latencies


def measure_spacy_latency(
    model: SpaCyNERBaseline,
    texts: list[str],
    label_count: int,
) -> list[float]:
    """Measure spaCy NER latency (label_count does not affect spaCy timing).

    spaCy runs a fixed NER pipeline regardless of the requested label set.
    This demonstrates the label-count-agnostic behavior of supervised NER
    (though it cannot predict unseen entity types).

    Args:
        model: Loaded SpaCyNERBaseline.
        texts: Input texts.
        label_count: Unused for spaCy (included for API consistency).

    Returns:
        List of per-example latency measurements (ms).
    """
    # Warmup
    for _ in range(N_WARMUP):
        model.predict(texts[0])

    latencies = []
    for text in texts:
        result = model.predict(text)
        latencies.append(result["latency_ms"])

    return latencies


def measure_deberta_latency(
    model: DeBERTaNLIBaseline,
    texts: list[str],
    label_count: int,
) -> list[float]:
    """Measure DeBERTa NLI classification latency for a given label count.

    DeBERTa NLI runs one forward pass per label, so latency scales linearly.
    This is the key disadvantage of NLI framing vs schema-driven extraction.

    Args:
        model: Loaded DeBERTaNLIBaseline.
        texts: Input texts.
        label_count: Number of candidate labels (controls NLI scaling).

    Returns:
        List of per-example latency measurements (ms).
    """
    # Use classification labels (reuse NER label strings as proxy for count)
    labels = get_label_subset(CROSSNER_AI_ENTITY_TYPES, label_count)

    # Warmup
    for _ in range(N_WARMUP):
        model.predict(texts[0], labels[:5])  # Warmup with fewer labels to save time

    latencies = []
    for text in tqdm(texts, desc=f"DeBERTa ({label_count} labels)", leave=False):
        result = model.predict(text, labels)
        latencies.append(result["latency_ms"])

    return latencies


def main() -> None:
    """Run latency scaling experiment and save results."""
    RESULTS_DIR.mkdir(parents=True, exist_ok=True)

    print("=" * 60)
    print("Experiment 3: Latency Scaling Analysis")
    print(f"Label counts: {LABEL_COUNTS}")
    print(f"Examples per measurement: {N_LATENCY_EXAMPLES}")
    print("=" * 60)

    # Load data
    all_examples = load_crossner_ai()
    # Use first N_LATENCY_EXAMPLES examples (fixed subset for reproducibility)
    examples = all_examples[:N_LATENCY_EXAMPLES]
    texts = [ex["text"] for ex in examples]
    print(f"\nUsing {len(texts)} CrossNER AI examples for latency measurement.")

    # Load models
    gliner2 = GLiNER2Wrapper()
    gliner_v1 = GLiNERV1Baseline()
    modernbert_gliner = ModernBERTGLiNERBaseline()
    spacy_model = SpaCyNERBaseline()
    deberta_model = DeBERTaNLIBaseline()

    results: dict = {
        "label_counts": LABEL_COUNTS,
        "n_examples": len(texts),
        "n_warmup": N_WARMUP,
        "gliner2": {},
        "gliner_v1": {},
        "modernbert_gliner": {},
        "spacy": {},
        "deberta_nli": {},
    }

    # -------------------------------------------------------------------------
    # Measure latency for each label count
    # -------------------------------------------------------------------------
    for n_labels in LABEL_COUNTS:
        print(f"\n--- Label count: {n_labels} ---")

        # GLiNER2
        print(f"  GLiNER2 ({n_labels} labels)...")
        gliner2_lat = measure_gliner2_latency(gliner2, texts, n_labels)
        gliner2_stats = latency_stats(gliner2_lat)
        results["gliner2"][str(n_labels)] = gliner2_stats
        print(f"    mean={gliner2_stats['mean']:.1f}ms, p95={gliner2_stats['p95']:.1f}ms")

        # GLiNER v1
        print(f"  GLiNER v1 ({n_labels} labels, uni-encoder)...")
        gliner_v1_lat = measure_gliner_v1_latency(gliner_v1, texts, n_labels)
        gliner_v1_stats = latency_stats(gliner_v1_lat)
        results["gliner_v1"][str(n_labels)] = gliner_v1_stats
        print(f"    mean={gliner_v1_stats['mean']:.1f}ms, p95={gliner_v1_stats['p95']:.1f}ms")

        # ModernBERT GLiNER
        print(f"  ModernBERT GLiNER ({n_labels} labels, bi-encoder)...")
        mb_lat = measure_modernbert_gliner_latency(modernbert_gliner, texts, n_labels)
        mb_stats = latency_stats(mb_lat)
        results["modernbert_gliner"][str(n_labels)] = mb_stats
        print(f"    mean={mb_stats['mean']:.1f}ms, p95={mb_stats['p95']:.1f}ms")

        # spaCy (label count doesn't change timing, run for each to show consistency)
        print(f"  spaCy ({n_labels} labels -> same NER pipeline)...")
        spacy_lat = measure_spacy_latency(spacy_model, texts, n_labels)
        spacy_stats = latency_stats(spacy_lat)
        results["spacy"][str(n_labels)] = spacy_stats
        print(f"    mean={spacy_stats['mean']:.1f}ms, p95={spacy_stats['p95']:.1f}ms")

        # DeBERTa NLI
        print(f"  DeBERTa NLI ({n_labels} labels)...")
        deberta_lat = measure_deberta_latency(deberta_model, texts, n_labels)
        deberta_stats = latency_stats(deberta_lat)
        results["deberta_nli"][str(n_labels)] = deberta_stats
        print(f"    mean={deberta_stats['mean']:.1f}ms, p95={deberta_stats['p95']:.1f}ms")

    # -------------------------------------------------------------------------
    # Save results and print summary table
    # -------------------------------------------------------------------------
    with open(RESULTS_PATH, "w", encoding="utf-8") as f:
        json.dump(results, f, indent=2, ensure_ascii=False)

    print(f"\nResults saved to: {RESULTS_PATH}")
    print("\n--- Latency Summary (mean ms per example) ---")
    header = (
        f"{'Labels':>8} {'GLiNER2':>10} {'GLiNERv1':>10} {'MBert-GL':>10}"
        f" {'spaCy':>8} {'DeBRTa':>10}"
    )
    print(header)
    print("-" * len(header))
    for n_labels in LABEL_COUNTS:
        g2 = results["gliner2"].get(str(n_labels), {}).get("mean", 0)
        gv1 = results["gliner_v1"].get(str(n_labels), {}).get("mean", 0)
        mb = results["modernbert_gliner"].get(str(n_labels), {}).get("mean", 0)
        sp = results["spacy"].get(str(n_labels), {}).get("mean", 0)
        db = results["deberta_nli"].get(str(n_labels), {}).get("mean", 0)
        print(f"{n_labels:>8} {g2:>10.1f} {gv1:>10.1f} {mb:>10.1f} {sp:>8.1f} {db:>10.1f}")


if __name__ == "__main__":
    main()
