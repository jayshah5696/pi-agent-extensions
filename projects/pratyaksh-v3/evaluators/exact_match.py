"""Exact match evaluator with normalization."""

import re
import unicodedata


def normalize(text: str) -> str:
    """Normalize text for comparison: lowercase, strip, collapse whitespace, remove punctuation."""
    text = text.strip().lower()
    text = unicodedata.normalize("NFKD", text)
    text = re.sub(r"[^\w\s]", "", text)
    text = re.sub(r"\s+", " ", text)
    return text


def evaluate(predicted: str, expected: str) -> float:
    """Return 1.0 if normalized strings match, 0.0 otherwise."""
    return 1.0 if normalize(predicted) == normalize(expected) else 0.0


def evaluate_contains(predicted: str, keywords: list[str]) -> float:
    """Return fraction of keywords found in predicted text."""
    pred_norm = normalize(predicted)
    hits = sum(1 for kw in keywords if normalize(kw) in pred_norm)
    return hits / len(keywords) if keywords else 0.0


def evaluate_batch(pairs: list[tuple[str, str]]) -> float:
    """Average exact match score over a batch of (predicted, expected) pairs."""
    if not pairs:
        return 0.0
    return sum(evaluate(p, e) for p, e in pairs) / len(pairs)
