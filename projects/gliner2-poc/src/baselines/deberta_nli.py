"""
deberta_nli.py - DeBERTa NLI zero-shot classification baseline.

Uses HuggingFace pipeline("zero-shot-classification") with
cross-encoder/nli-deberta-v3-small for lighter CPU inference on Apple Silicon.

The NLI framing: for each candidate label, the model scores whether
the text entails "This text is about {label}", then picks the highest score.

Note on scaling: NLI zero-shot runs one forward pass per label, so
latency scales linearly with the number of candidate labels. This is
the key disadvantage compared to GLiNER2's label-agnostic forward pass.

Usage:
    from src.baselines.deberta_nli import DeBERTaNLIBaseline
    baseline = DeBERTaNLIBaseline()
    result = baseline.predict(text, labels=["sports", "business", "tech"])
"""

from __future__ import annotations

import time
from typing import Any

from transformers import pipeline

# Lighter DeBERTa-v3 model for CPU inference on Apple Silicon
DEFAULT_MODEL = "cross-encoder/nli-deberta-v3-small"


class DeBERTaNLIBaseline:
    """Zero-shot classification baseline using DeBERTa NLI.

    Wraps HuggingFace zero-shot-classification pipeline.
    Explicitly uses CPU to match the GLiNER2 benchmark conditions.
    """

    def __init__(self, model_name: str = DEFAULT_MODEL) -> None:
        """Load the NLI pipeline on CPU.

        Args:
            model_name: HuggingFace model ID. Default: cross-encoder/nli-deberta-v3-small.
        """
        self.model_name = model_name
        print(f"Loading DeBERTa NLI pipeline: {model_name}")
        print("  Note: First load downloads ~280MB to HuggingFace cache.")
        t0 = time.perf_counter()
        # Explicitly use CPU (device=-1) for fair comparison with GLiNER2
        self.pipeline = pipeline(
            "zero-shot-classification",
            model=model_name,
            device=-1,  # CPU only
        )
        self.load_time_seconds = time.perf_counter() - t0
        print(f"  Pipeline loaded in {self.load_time_seconds:.1f}s")

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

        # Build score dict
        scores = dict(zip(result["labels"], result["scores"]))

        return {
            "prediction": result["labels"][0],  # Top label
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

        Note: DeBERTa NLI latency scales with len(labels) per example.
        For Banking77 (77 labels), expect ~77x slower than 1-label inference.

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

        # Process individually to track per-example latency accurately
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
