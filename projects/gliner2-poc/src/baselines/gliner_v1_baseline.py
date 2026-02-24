"""
gliner_v1_baseline.py - GLiNER v1 NER baseline.

Uses the original GLiNER architecture (urchade/gliner_medium-v2.1), a 209M
parameter model with a DeBERTa-v3 backbone. In contrast to GLiNER2, the original
GLiNER uses a uni-encoder design where label representations are co-encoded with
the input text. This means latency grows with the number of labels, since adding
more labels increases the input length to the encoder.

Architecture: Uni-encoder span extraction. Text and label tokens are concatenated
and passed through DeBERTa-v3 together. Entity spans are scored against label
representations extracted from the same forward pass.

Model: urchade/gliner_medium-v2.1 (209M parameters, DeBERTa-v3 backbone)
Package: gliner (pip install gliner>=0.2.19)
Task support: NER only (no classification)
Latency profile: O(n_labels) - grows with label count due to co-encoding
Context window: 512 tokens (original GLiNER limit)
HuggingFace: https://huggingface.co/urchade/gliner_medium-v2.1

Usage:
    from src.baselines.gliner_v1_baseline import GLiNERV1Baseline
    model = GLiNERV1Baseline()
    result = model.predict("Apple CEO Tim Cook announced...", ["person", "company"])
"""

from __future__ import annotations

import time
from typing import Any

from gliner import GLiNER

DEFAULT_MODEL = "urchade/gliner_medium-v2.1"


class GLiNERV1Baseline:
    """GLiNER v1 NER baseline (original uni-encoder architecture).

    Wraps urchade/gliner_medium-v2.1 with the same interface as SpaCyNERBaseline
    for drop-in comparison in NER experiments.

    Latency note: Because labels are co-encoded with text in a single DeBERTa
    forward pass, adding more candidate labels increases input length and thus
    inference time. This contrasts with GLiNER2's label-agnostic encoder.
    """

    def __init__(self, model_name: str = DEFAULT_MODEL) -> None:
        """Load GLiNER v1 model from HuggingFace hub.

        Args:
            model_name: HuggingFace model ID. Default: urchade/gliner_medium-v2.1.
                        Downloads approx. 830MB on first run.
        """
        self.model_name = model_name
        print(f"Loading GLiNER v1 model: {model_name}")
        print("  Note: First load downloads approx. 830MB to HuggingFace cache.")
        t0 = time.perf_counter()
        self.model: GLiNER = GLiNER.from_pretrained(model_name)
        self.load_time_seconds = time.perf_counter() - t0
        print(f"  GLiNER v1 model loaded in {self.load_time_seconds:.1f}s")

    def predict(
        self,
        text: str,
        labels: list[str],
        threshold: float = 0.5,
    ) -> dict[str, Any]:
        """Run NER on a single text.

        GLiNER v1 predict_entities() returns a flat list of dicts with keys:
        text, start, end, label, score.

        This method returns a label-keyed dict compatible with the span
        format expected by predicted_entities_to_spans().

        Args:
            text: Input text string.
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
