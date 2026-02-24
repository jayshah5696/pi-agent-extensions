"""
setfit_baseline.py - SetFit zero-shot classification baseline.

Uses a sentence-transformers model in zero-shot mode: text and label name
embeddings are computed separately, then cosine similarity is used to pick
the closest label. This is NOT the standard SetFit few-shot fine-tuning
workflow; it is a pure zero-shot approach using the pre-trained embedding space.

The key insight: sentence-transformer models embed text into a semantic space
where similar meanings are close together. By embedding each candidate label
name as a sentence and computing cosine similarity with the input text, we
get a reasonable zero-shot classifier without any task-specific training.

Architecture: Sentence-BERT (SBERT) bi-encoder. Text and label embeddings are
computed independently using the same encoder, then scored via cosine similarity.
Model: sentence-transformers/paraphrase-mpnet-base-v2 (420MB)
Package: setfit (pip install setfit>=1.0.0)
Task support: Classification only (Banking77, AG News)
Latency profile: O(n_labels) for first call, near-O(1) for repeated calls if
                 label embeddings are cached (which this implementation does).

Usage:
    from src.baselines.setfit_baseline import SetFitZeroShotBaseline
    model = SetFitZeroShotBaseline()
    result = model.predict("My card was declined at the ATM.", labels=["card_not_working", "atm_support"])
"""

from __future__ import annotations

import time
from typing import Any

import numpy as np
from setfit import SetFitModel

DEFAULT_MODEL = "sentence-transformers/paraphrase-mpnet-base-v2"


def _cosine_similarity(a: np.ndarray, b: np.ndarray) -> np.ndarray:
    """Compute cosine similarity between a single vector a and matrix b.

    Args:
        a: 1D array of shape (d,).
        b: 2D array of shape (n, d).

    Returns:
        1D array of shape (n,) with cosine similarities.
    """
    a_norm = a / (np.linalg.norm(a) + 1e-10)
    b_norms = b / (np.linalg.norm(b, axis=1, keepdims=True) + 1e-10)
    return b_norms @ a_norm


class SetFitZeroShotBaseline:
    """Zero-shot text classification using SetFit/sentence-transformers embeddings.

    Embeds candidate label names once and caches them. For each input text,
    computes cosine similarity against all cached label embeddings and returns
    the argmax as the predicted label.

    This baseline is faster than NLI-based zero-shot because it requires only
    two encoder passes (text + labels), rather than one pass per label.
    However, it may underperform NLI baselines on tasks where the label names
    are ambiguous or domain-specific without context (e.g., Banking77 intents).
    """

    def __init__(self, model_name: str = DEFAULT_MODEL) -> None:
        """Load sentence-transformers model via SetFit.

        Args:
            model_name: HuggingFace model ID.
                        Default: sentence-transformers/paraphrase-mpnet-base-v2.
                        Downloads approx. 420MB on first run.
        """
        self.model_name = model_name
        print(f"Loading SetFit/sentence-transformers model: {model_name}")
        print("  Note: First load downloads approx. 420MB to HuggingFace cache.")
        t0 = time.perf_counter()
        self.model: SetFitModel = SetFitModel.from_pretrained(model_name)
        self.load_time_seconds = time.perf_counter() - t0
        print(f"  SetFit model loaded in {self.load_time_seconds:.1f}s")

        # Cache for label embeddings: keyed by tuple(sorted(labels))
        self._label_embedding_cache: dict[tuple, tuple[list[str], np.ndarray]] = {}

    def _get_label_embeddings(self, labels: list[str]) -> tuple[list[str], np.ndarray]:
        """Get or compute label embeddings, using cache for repeated calls.

        Args:
            labels: List of candidate label strings.

        Returns:
            Tuple of (ordered_labels, label_embeddings array of shape [n_labels, d]).
        """
        cache_key = tuple(sorted(labels))
        if cache_key not in self._label_embedding_cache:
            # Encode label names as sentences
            label_embeddings = self.model.encode(labels, show_progress_bar=False)
            label_embeddings = np.array(label_embeddings)
            self._label_embedding_cache[cache_key] = (labels, label_embeddings)
        return self._label_embedding_cache[cache_key]

    def predict(
        self,
        text: str,
        labels: list[str],
    ) -> dict[str, Any]:
        """Run zero-shot classification on a single text.

        Args:
            text: Input text string.
            labels: Candidate class labels.

        Returns:
            Dict with keys:
                prediction: Top predicted label string.
                scores: dict mapping label -> cosine similarity score.
                latency_ms: Inference time in milliseconds (includes label embedding
                            on first call, cached on subsequent calls).
        """
        t0 = time.perf_counter()

        ordered_labels, label_embeddings = self._get_label_embeddings(labels)

        # Encode the input text
        text_embedding = np.array(self.model.encode([text], show_progress_bar=False)[0])

        # Compute cosine similarities
        similarities = _cosine_similarity(text_embedding, label_embeddings)

        # Pick the closest label
        best_idx = int(np.argmax(similarities))
        predicted_label = ordered_labels[best_idx]

        latency_ms = (time.perf_counter() - t0) * 1000.0

        scores = {lbl: float(sim) for lbl, sim in zip(ordered_labels, similarities)}

        return {
            "prediction": predicted_label,
            "scores": scores,
            "latency_ms": latency_ms,
        }

    def predict_batch(
        self,
        texts: list[str],
        labels: list[str],
        batch_size: int = 32,
    ) -> list[dict[str, Any]]:
        """Run zero-shot classification on a list of texts.

        Encodes all texts in one batch for efficiency, then scores against
        cached label embeddings.

        Args:
            texts: List of input text strings.
            labels: Candidate class labels.
            batch_size: Encoding batch size.

        Returns:
            List of prediction dicts.
        """
        t0 = time.perf_counter()

        ordered_labels, label_embeddings = self._get_label_embeddings(labels)

        # Encode all texts in one batch
        text_embeddings = np.array(
            self.model.encode(texts, show_progress_bar=False, batch_size=batch_size)
        )

        total_time_ms = (time.perf_counter() - t0) * 1000.0
        per_example_ms = total_time_ms / max(len(texts), 1)

        results = []
        for text_emb in text_embeddings:
            similarities = _cosine_similarity(text_emb, label_embeddings)
            best_idx = int(np.argmax(similarities))
            predicted_label = ordered_labels[best_idx]
            scores = {lbl: float(sim) for lbl, sim in zip(ordered_labels, similarities)}
            results.append(
                {
                    "prediction": predicted_label,
                    "scores": scores,
                    "latency_ms": per_example_ms,
                }
            )

        return results
