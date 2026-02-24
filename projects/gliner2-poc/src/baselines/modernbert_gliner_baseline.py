"""
modernbert_gliner_baseline.py - ModernBERT GLiNER bi-encoder NER baseline.

Uses knowledgator/modern-gliner-bi-base-v1.0, a 194M parameter GLiNER model
built on the ModernBERT backbone using a bi-encoder (dual-encoder) architecture.

Bi-encoder architecture: entity embeddings are independent of input, allowing
unlimited label counts and faster inference when labels are pre-cached.

In a bi-encoder setup, entity type representations are computed once and stored.
At inference time, only the input text is encoded; entity scores are computed
via dot-product between text span representations and cached entity embeddings.
This means adding more labels does NOT significantly increase inference latency,
giving this model a similar latency profile to GLiNER2's label-agnostic encoder.

Architecture: Bi-encoder span extraction. Text encoder and entity encoder are
separate; entity embeddings can be pre-computed and reused across examples.
ModernBERT backbone supports 8192-token context windows, compared to 512 tokens
for the original DeBERTa-based GLiNER.

Model: knowledgator/modern-gliner-bi-base-v1.0 (194M parameters)
Package: gliner (pip install gliner>=0.2.19)
Task support: NER only (no classification)
Latency profile: Near O(1) with respect to label count (entity embeddings cached)
Context window: 8192 tokens (ModernBERT)
HuggingFace: https://huggingface.co/knowledgator/modern-gliner-bi-base-v1.0

Usage:
    from src.baselines.modernbert_gliner_baseline import ModernBERTGLiNERBaseline
    model = ModernBERTGLiNERBaseline()
    result = model.predict("Apple CEO Tim Cook announced...", ["person", "company"])
"""

from __future__ import annotations

import time
from typing import Any

from gliner import GLiNER

DEFAULT_MODEL = "knowledgator/modern-gliner-bi-base-v1.0"


class ModernBERTGLiNERBaseline:
    """ModernBERT GLiNER bi-encoder NER baseline.

    Wraps knowledgator/modern-gliner-bi-base-v1.0 for NER evaluation.
    Uses the same gliner package API as GLiNERV1Baseline but benefits from
    the bi-encoder architecture for label-count-independent latency and
    the ModernBERT backbone for longer context (8192 tokens).

    Key architectural difference vs GLiNER v1: entity type embeddings are
    encoded independently of the input text, enabling:
    1. Pre-caching of label embeddings for repeated inference
    2. Unlimited label count without growing input length
    3. Faster inference at high label counts
    """

    def __init__(self, model_name: str = DEFAULT_MODEL) -> None:
        """Load ModernBERT GLiNER model from HuggingFace hub.

        Args:
            model_name: HuggingFace model ID.
                        Default: knowledgator/modern-gliner-bi-base-v1.0.
                        Downloads approx. 740MB on first run.
        """
        self.model_name = model_name
        print(f"Loading ModernBERT GLiNER bi-encoder model: {model_name}")
        print("  Note: First load downloads approx. 740MB to HuggingFace cache.")
        t0 = time.perf_counter()
        self.model: GLiNER = GLiNER.from_pretrained(model_name)
        self.load_time_seconds = time.perf_counter() - t0
        print(f"  ModernBERT GLiNER model loaded in {self.load_time_seconds:.1f}s")

    def predict(
        self,
        text: str,
        labels: list[str],
        threshold: float = 0.5,
    ) -> dict[str, Any]:
        """Run NER on a single text.

        GLiNER predict_entities() returns a flat list of dicts with keys:
        text, start, end, label, score.

        This method returns a label-keyed dict compatible with the span
        format expected by predicted_entities_to_spans().

        Args:
            text: Input text string. ModernBERT supports up to 8192 tokens.
            labels: List of entity type labels.
            threshold: Confidence threshold for entity inclusion.

        Returns:
            Dict with keys:
                entities: dict mapping label -> list of entity dicts (text, start, end).
                latency_ms: Inference time in milliseconds.
        """
        t0 = time.perf_counter()
        raw_entities = self.model.predict_entities(text, labels, threshold=threshold)
        latency_ms = (time.perf_counter() - t0) * 1000.0

        # Convert flat list to label-keyed dict (same format as GLiNER2 output)
        entities_by_label: dict[str, list[dict[str, Any]]] = {}
        for ent in raw_entities:
            label = ent["label"]
            if label not in entities_by_label:
                entities_by_label[label] = []
            entities_by_label[label].append(
                {
                    "text": ent["text"],
                    "start": ent["start"],
                    "end": ent["end"],
                }
            )

        return {
            "entities": entities_by_label,
            "latency_ms": latency_ms,
        }

    def predict_batch(
        self,
        texts: list[str],
        labels: list[str],
        threshold: float = 0.5,
    ) -> list[dict[str, Any]]:
        """Run NER on a list of texts sequentially.

        Args:
            texts: List of input text strings.
            labels: Entity type labels.
            threshold: Confidence threshold.

        Returns:
            List of result dicts, each with entities and latency_ms.
        """
        results = []
        for text in texts:
            results.append(self.predict(text, labels, threshold=threshold))
        return results
