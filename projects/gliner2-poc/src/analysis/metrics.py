"""
metrics.py - Shared metric utilities for GLiNER2 POC evaluation.

Provides:
- entity_f1(): Entity-level F1 using seqeval (converts spans to BIO for seqeval)
- classification_metrics(): Accuracy + macro F1 using sklearn
- latency_stats(): Descriptive statistics for timing measurements
"""

from __future__ import annotations

import statistics
from typing import Any

import numpy as np
from sklearn.metrics import accuracy_score, classification_report, f1_score


# -------------------------------------------------------------------------
# NER / Entity F1
# -------------------------------------------------------------------------


def spans_to_bio_sequence(
    tokens: list[str],
    spans: list[dict[str, Any]],
) -> list[str]:
    """Convert span-format entities to a BIO tag sequence over tokens.

    Args:
        tokens: List of word tokens from the original text.
        spans: List of entity span dicts with keys: text, label, start_token, end_token.

    Returns:
        List of BIO tag strings (same length as tokens).
    """
    tags = ["O"] * len(tokens)

    for span in spans:
        start = span.get("start_token", 0)
        end = span.get("end_token", start)
        label = span.get("label", "entity")

        # Clamp to token list bounds
        start = max(0, min(start, len(tokens) - 1))
        end = max(start, min(end, len(tokens) - 1))

        tags[start] = f"B-{label}"
        for i in range(start + 1, end + 1):
            tags[i] = f"I-{label}"

    return tags


def predicted_entities_to_spans(
    tokens: list[str],
    text: str,
    predicted_entities: dict[str, list[Any]],
) -> list[dict[str, Any]]:
    """Convert GLiNER2 extract_entities() output to span dicts with token indices.

    GLiNER2 returns character-level spans. This function maps them back to
    token-level indices using simple whitespace tokenization alignment.

    Args:
        tokens: Original token list (from dataset).
        text: Original text string (whitespace-joined tokens).
        predicted_entities: Dict mapping label -> list of entity dicts or strings.

    Returns:
        List of span dicts with start_token, end_token, label, text fields.
    """
    # Build character offset -> token index mapping
    char_to_token: dict[int, int] = {}
    char_pos = 0
    for token_idx, token in enumerate(tokens):
        for c in range(len(token)):
            char_to_token[char_pos + c] = token_idx
        char_pos += len(token) + 1  # +1 for space

    spans: list[dict[str, Any]] = []

    for label, entity_list in predicted_entities.items():
        for entity in entity_list:
            if isinstance(entity, dict):
                entity_text = entity.get("text", "")
                start_char = entity.get("start")
                end_char = entity.get("end")

                if start_char is not None and end_char is not None:
                    # Map character span to token span
                    start_token = char_to_token.get(start_char, 0)
                    # end_char is exclusive in character space; find last token
                    end_token_char = max(start_char, end_char - 1)
                    end_token = char_to_token.get(end_token_char, start_token)
                else:
                    # No char positions: skip (span matching won't work)
                    continue
            else:
                # Entity is just a string: find it in the token list
                entity_text = str(entity)
                entity_tokens = entity_text.split()
                # Search for token subsequence match
                found = False
                for i in range(len(tokens) - len(entity_tokens) + 1):
                    if tokens[i : i + len(entity_tokens)] == entity_tokens:
                        start_token = i
                        end_token = i + len(entity_tokens) - 1
                        found = True
                        break
                if not found:
                    continue

            spans.append(
                {
                    "text": entity_text,
                    "label": label,
                    "start_token": start_token,
                    "end_token": end_token,
                }
            )

    return spans


def entity_f1(
    predictions: list[dict[str, Any]],
    ground_truth: list[dict[str, Any]],
    entity_types: list[str] | None = None,
) -> dict[str, float]:
    """Compute entity-level F1 using seqeval span-based evaluation.

    Args:
        predictions: List of dicts with keys: tokens, spans (predicted).
        ground_truth: List of dicts with keys: tokens, spans (true).
        entity_types: If provided, report per-type F1 for these types only.

    Returns:
        Dict with overall precision, recall, f1, and per-type f1 if available.
    """
    from seqeval.metrics import classification_report as seqeval_report
    from seqeval.metrics import f1_score as seqeval_f1
    from seqeval.metrics import precision_score, recall_score

    true_seqs: list[list[str]] = []
    pred_seqs: list[list[str]] = []

    for gt, pred in zip(ground_truth, predictions):
        tokens = gt.get("tokens", gt.get("text", "").split())
        true_spans = gt.get("spans", [])
        pred_spans = pred.get("spans", [])

        true_tags = spans_to_bio_sequence(tokens, true_spans)
        pred_tags = spans_to_bio_sequence(tokens, pred_spans)

        # Pad/truncate pred to same length as true
        if len(pred_tags) < len(true_tags):
            pred_tags.extend(["O"] * (len(true_tags) - len(pred_tags)))
        elif len(pred_tags) > len(true_tags):
            pred_tags = pred_tags[: len(true_tags)]

        true_seqs.append(true_tags)
        pred_seqs.append(pred_tags)

    try:
        overall_f1 = seqeval_f1(true_seqs, pred_seqs)
        overall_p = precision_score(true_seqs, pred_seqs)
        overall_r = recall_score(true_seqs, pred_seqs)
        report_str = seqeval_report(true_seqs, pred_seqs, output_dict=False)
        report_dict = seqeval_report(true_seqs, pred_seqs, output_dict=True)
    except Exception as e:
        print(f"Warning: seqeval computation failed: {e}")
        return {"precision": 0.0, "recall": 0.0, "f1": 0.0}

    result: dict[str, float] = {
        "precision": overall_p,
        "recall": overall_r,
        "f1": overall_f1,
    }

    # Add per-type F1 if available in report
    for key, val in report_dict.items():
        if isinstance(val, dict) and "f1-score" in val:
            clean_key = key.replace(" ", "_").replace("-", "_")
            result[f"f1_{clean_key}"] = val["f1-score"]

    return result


# -------------------------------------------------------------------------
# Classification metrics
# -------------------------------------------------------------------------


def classification_metrics(
    predictions: list[str],
    ground_truth: list[str],
    labels: list[str] | None = None,
) -> dict[str, Any]:
    """Compute accuracy and macro F1 for classification predictions.

    Args:
        predictions: List of predicted label strings.
        ground_truth: List of true label strings.
        labels: If provided, use this ordered list for the report.

    Returns:
        Dict with accuracy, macro_f1, weighted_f1, and per_class dict.
    """
    accuracy = accuracy_score(ground_truth, predictions)
    macro_f1 = f1_score(ground_truth, predictions, average="macro", zero_division=0)
    weighted_f1 = f1_score(ground_truth, predictions, average="weighted", zero_division=0)

    try:
        report = classification_report(
            ground_truth,
            predictions,
            labels=labels,
            output_dict=True,
            zero_division=0,
        )
        per_class: dict[str, float] = {
            cls: vals.get("f1-score", 0.0)
            for cls, vals in report.items()
            if isinstance(vals, dict) and cls not in ("macro avg", "weighted avg", "accuracy")
        }
    except Exception:
        per_class = {}

    return {
        "accuracy": accuracy,
        "macro_f1": macro_f1,
        "weighted_f1": weighted_f1,
        "per_class": per_class,
        "n_examples": len(predictions),
    }


# -------------------------------------------------------------------------
# Latency statistics
# -------------------------------------------------------------------------


def latency_stats(times_ms: list[float]) -> dict[str, float]:
    """Compute descriptive statistics for a list of latency measurements.

    Args:
        times_ms: List of latency measurements in milliseconds.

    Returns:
        Dict with mean, median (p50), p95, p99, min, max, std.
    """
    if not times_ms:
        return {"mean": 0.0, "p50": 0.0, "p95": 0.0, "p99": 0.0, "min": 0.0, "max": 0.0, "std": 0.0}

    arr = sorted(times_ms)
    n = len(arr)

    def percentile(p: float) -> float:
        idx = (p / 100.0) * (n - 1)
        lower = int(idx)
        upper = min(lower + 1, n - 1)
        frac = idx - lower
        return arr[lower] * (1 - frac) + arr[upper] * frac

    return {
        "mean": statistics.mean(times_ms),
        "p50": percentile(50),
        "p95": percentile(95),
        "p99": percentile(99),
        "min": min(times_ms),
        "max": max(times_ms),
        "std": statistics.stdev(times_ms) if len(times_ms) > 1 else 0.0,
        "n": n,
    }
