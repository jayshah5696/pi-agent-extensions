"""
fasttext_baseline.py - FastText zero-shot classification baseline.

This is a bag-of-words baseline (no context). Represents the absolute latency
floor. Expect low accuracy on fine-grained tasks like Banking77.

Uses pretrained FastText word vectors (cc.en.300.bin, trained on Common Crawl +
Wikipedia with 300-dimensional subword vectors). Zero-shot classification is
performed by:
1. Embedding the input text by averaging its word-level subword vectors.
2. Embedding each candidate label name the same way.
3. Picking the label with highest cosine similarity to the text embedding.

FastText uses subword n-gram embeddings, meaning out-of-vocabulary words are
handled via character n-gram decomposition. This makes it robust to typos and
morphological variations, but it still has no contextual understanding: the
embedding for "bank" is identical regardless of whether it means a financial
institution or a river bank.

Architecture: Bag-of-words. No attention, no positional encoding, no context.
              Word embeddings are averaged to produce a sentence-level vector.
Model: cc.en.300.bin (Common Crawl + Wikipedia, 300d, 2M vocabulary, 4.2GB)
Package: fasttext-wheel (pip install fasttext-wheel>=0.9.2)
Task support: Classification only
Latency profile: Sub-millisecond per example. Absolute speed floor for NLP.

Model download: fasttext.util.download_model('en', if_exists='ignore')
Saves to: cc.en.300.bin in the working directory (4.2GB file).

Usage:
    from src.baselines.fasttext_baseline import FastTextZeroShotBaseline
    model = FastTextZeroShotBaseline()
    result = model.predict("My card was declined at the ATM.", labels=["card_not_working", "atm_support"])
"""

from __future__ import annotations

import time
from pathlib import Path
from typing import Any

import fasttext
import fasttext.util
import numpy as np


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


def _embed_text(model: Any, text: str) -> np.ndarray:
    """Embed text by averaging FastText subword word vectors.

    FastText get_sentence_vector() computes the average of word vectors
    (each word itself decomposed into subword n-grams) after normalizing.

    Args:
        model: Loaded FastText model.
        text: Input text string.

    Returns:
        1D numpy array of shape (300,).
    """
    # get_sentence_vector handles tokenization and averaging internally
    vec = model.get_sentence_vector(text.replace("\n", " "))
    return np.array(vec, dtype=np.float32)


class FastTextZeroShotBaseline:
    """FastText zero-shot classification baseline.

    This is a bag-of-words baseline (no context). Represents the absolute
    latency floor. Expect low accuracy on fine-grained tasks like Banking77.

    Downloads cc.en.300.bin (4.2GB) on first use. This file is cached in
    the working directory (typically the project root).

    Latency is sub-millisecond per example after model load because there
    is no neural network forward pass: just vector averaging and dot products.
    """

    def __init__(self, model_path: str | Path | None = None) -> None:
        """Load FastText pretrained English word vectors.

        Downloads cc.en.300.bin if not already present.

        Args:
            model_path: Path to cc.en.300.bin. If None, downloads to cwd.
        """
        print("Loading FastText pretrained English vectors (cc.en.300.bin).")
        print("  Note: cc.en.300.bin is 4.2GB. First download may take several minutes.")

        if model_path is not None:
            model_file = Path(model_path)
        else:
            model_file = Path("cc.en.300.bin")

        t0 = time.perf_counter()
        if not model_file.exists():
            print("  Downloading cc.en.300.bin from fasttext servers...")
            fasttext.util.download_model("en", if_exists="ignore")

        self.model = fasttext.load_model(str(model_file))
        self.load_time_seconds = time.perf_counter() - t0
        print(f"  FastText model loaded in {self.load_time_seconds:.1f}s")

        # Cache for label embeddings: keyed by tuple(sorted(labels))
        self._label_embedding_cache: dict[tuple, tuple[list[str], np.ndarray]] = {}

    def _get_label_embeddings(self, labels: list[str]) -> tuple[list[str], np.ndarray]:
        """Get or compute label embeddings from FastText vectors.

        Label names are embedded by replacing underscores with spaces and
        passing through get_sentence_vector (word average).

        Args:
            labels: List of candidate label strings.

        Returns:
            Tuple of (ordered_labels, label_embeddings array of shape [n_labels, 300]).
        """
        cache_key = tuple(sorted(labels))
        if cache_key not in self._label_embedding_cache:
            label_embeddings = []
            for label in labels:
                # Replace underscores with spaces for better token coverage
                readable_label = label.replace("_", " ")
                emb = _embed_text(self.model, readable_label)
                label_embeddings.append(emb)
            label_matrix = np.stack(label_embeddings, axis=0)
            self._label_embedding_cache[cache_key] = (labels, label_matrix)
        return self._label_embedding_cache[cache_key]

    def predict(
        self,
        text: str,
        labels: list[str],
    ) -> dict[str, Any]:
        """Run zero-shot classification on a single text.

        Embeds text via FastText word vector averaging, then picks the
        label with highest cosine similarity.

        Args:
            text: Input text string.
            labels: Candidate class labels.

        Returns:
            Dict with keys:
                prediction: Top predicted label string.
                scores: dict mapping label -> cosine similarity score.
                latency_ms: Inference time in milliseconds.
        """
        t0 = time.perf_counter()

        ordered_labels, label_embeddings = self._get_label_embeddings(labels)

        text_embedding = _embed_text(self.model, text)
        similarities = _cosine_similarity(text_embedding, label_embeddings)

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
    ) -> list[dict[str, Any]]:
        """Run zero-shot classification on a list of texts.

        Args:
            texts: List of input text strings.
            labels: Candidate class labels.

        Returns:
            List of prediction dicts.
        """
        t0 = time.perf_counter()

        ordered_labels, label_embeddings = self._get_label_embeddings(labels)
        text_embeddings = np.stack(
            [_embed_text(self.model, text) for text in texts], axis=0
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
