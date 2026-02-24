"""
modernbert_nli_baseline.py - SOTA NLI zero-shot classification baseline (2025).

Uses MoritzLaurer/deberta-v3-large-zeroshot-v2.0, the state-of-the-art NLI-based
zero-shot classification model as of 2025. This is a large DeBERTa-v3 model
(435M parameters) fine-tuned on a curated mixture of NLI and zero-shot
classification datasets, achieving substantially higher accuracy than the smaller
cross-encoder/nli-deberta-v3-small used as the primary DeBERTa baseline.

Use this baseline to understand the accuracy ceiling of the NLI zero-shot
paradigm before switching to GLiNER2. If ModernNLI still underperforms GLiNER2,
it strengthens the case for the unified extraction approach.

Architecture: Cross-encoder NLI. For each candidate label, the model scores
whether the input text entails "This text is about {label}." All labels must be
scored in separate forward passes. Latency therefore scales as O(n_labels).

Key difference from DeBERTaNLIBaseline (cross-encoder/nli-deberta-v3-small):
- 435M vs 184M parameters (larger, more accurate, slower)
- Trained on v2.0 dataset mix with improved multilingual NLI data
- Substantially better on fine-grained classification tasks like Banking77

Model: MoritzLaurer/deberta-v3-large-zeroshot-v2.0 (435M parameters)
Package: transformers (pip install transformers>=4.40.0)
Task support: Classification only
Latency profile: O(n_labels) per example. Slower than small DeBERTa but more accurate.
HuggingFace: https://huggingface.co/MoritzLaurer/deberta-v3-large-zeroshot-v2.0

Usage:
    from src.baselines.modernbert_nli_baseline import ModernNLIBaseline
    baseline = ModernNLIBaseline()
    result = baseline.predict("My card was declined at the ATM.", labels=["card_not_working", "atm_support"])
"""

from __future__ import annotations

import time
from typing import Any

from transformers import pipeline

DEFAULT_MODEL = "MoritzLaurer/deberta-v3-large-zeroshot-v2.0"


class ModernNLIBaseline:
    """SOTA NLI zero-shot classification baseline using DeBERTa-v3-large.

    Uses MoritzLaurer/deberta-v3-large-zeroshot-v2.0, a 435M parameter model
    representing the accuracy ceiling of the NLI zero-shot paradigm as of 2025.

    API is identical to DeBERTaNLIBaseline for drop-in comparison.

    Latency warning: This model is approx. 2.4x larger than nli-deberta-v3-small.
    For Banking77 (77 labels), expect 3-4x longer runtime than the small baseline.
    Consider using skip_deberta_if_n_labels_gt threshold when running experiments.
    """

    def __init__(self, model_name: str = DEFAULT_MODEL) -> None:
        """Load the NLI pipeline on CPU.

        Args:
            model_name: HuggingFace model ID.
                        Default: MoritzLaurer/deberta-v3-large-zeroshot-v2.0.
                        Downloads approx. 1.7GB on first run.
        """
        self.model_name = model_name
        print(f"Loading Modern NLI pipeline: {model_name}")
        print("  Note: First load downloads approx. 1.7GB to HuggingFace cache.")
        t0 = time.perf_counter()
        # Explicitly use CPU (device=-1) for fair comparison with GLiNER2
        self.pipeline = pipeline(
            "zero-shot-classification",
            model=model_name,
            device=-1,  # CPU only
        )
        self.load_time_seconds = time.perf_counter() - t0
        print(f"  Modern NLI pipeline loaded in {self.load_time_seconds:.1f}s")

    def predict(
        self,
        text: str,
        labels: list[str],
        multi_label: bool = False,
        hypothesis_template: str = "This text is about {}.",
    ) -> dict[str, Any]:
        """Run zero-shot classification on a single text.

        Args:
            text: Input text string.
            labels: Candidate class labels.
            multi_label: If True, run multi-label classification.
            hypothesis_template: NLI hypothesis template with {} for label.

        Returns:
            Dict with keys:
                prediction: Top predicted label.
                scores: dict mapping label -> score.
                latency_ms: Inference time in milliseconds.
        """
        t0 = time.perf_counter()
        result = self.pipeline(
            text,
            candidate_labels=labels,
            multi_label=multi_label,
            hypothesis_template=hypothesis_template,
        )
        latency_ms = (time.perf_counter() - t0) * 1000.0

        scores = dict(zip(result["labels"], result["scores"]))

        return {
            "prediction": result["labels"][0],
            "scores": scores,
            "latency_ms": latency_ms,
        }

    def predict_batch(
        self,
        texts: list[str],
        labels: list[str],
        multi_label: bool = False,
        hypothesis_template: str = "This text is about {}.",
        batch_size: int = 8,
    ) -> list[dict[str, Any]]:
        """Run zero-shot classification on a list of texts.

        Note: Latency scales with len(labels) per example.
        For Banking77 (77 labels), expect approx. 77x slower than single-label.

        Args:
            texts: Input text strings.
            labels: Candidate class labels.
            multi_label: Allow multiple labels per prediction.
            hypothesis_template: NLI hypothesis template.
            batch_size: HuggingFace pipeline batch size.

        Returns:
            List of prediction dicts.
        """
        results = []
        for text in texts:
            results.append(
                self.predict(
                    text,
                    labels,
                    multi_label=multi_label,
                    hypothesis_template=hypothesis_template,
                )
            )
        return results

    def predict_batch_fast(
        self,
        texts: list[str],
        labels: list[str],
        multi_label: bool = False,
        hypothesis_template: str = "This text is about {}.",
        batch_size: int = 8,
    ) -> list[dict[str, Any]]:
        """Run classification using pipeline's built-in batching (faster overall).

        Measures approximate per-example latency by dividing total time.
        Use this for large datasets where per-example timing is less critical.

        Args:
            texts: Input text strings.
            labels: Candidate class labels.
            multi_label: Allow multiple labels.
            hypothesis_template: NLI hypothesis template.
            batch_size: Pipeline batch size.

        Returns:
            List of prediction dicts with approximate latency_ms.
        """
        t0 = time.perf_counter()
        raw_results = self.pipeline(
            texts,
            candidate_labels=labels,
            multi_label=multi_label,
            hypothesis_template=hypothesis_template,
            batch_size=batch_size,
        )
        total_time_ms = (time.perf_counter() - t0) * 1000.0
        per_example_ms = total_time_ms / max(len(texts), 1)

        results = []
        for result in raw_results:
            scores = dict(zip(result["labels"], result["scores"]))
            results.append(
                {
                    "prediction": result["labels"][0],
                    "scores": scores,
                    "latency_ms": per_example_ms,
                }
            )
        return results
