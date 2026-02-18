"""D2: Set Invariance evaluator — deterministic, no judge needed.

Shuffles the input signals in a prompt 3 times and measures variance
in the model's label confidence across runs. High variance = order-sensitive = bad.

Score = 1 - std_dev(label_confidences)
"""

import random
import re
import json
from typing import Callable

import numpy as np


def shuffle_signals(text: str, n_shuffles: int = 3, seed: int = 42) -> list[str]:
    """Given a text with comma-separated or newline-separated signals,
    produce n_shuffles shuffled variants.
    
    Heuristic: split on newlines first, then commas if single-line.
    """
    rng = random.Random(seed)
    
    # Try to identify signal list vs prose
    lines = [l.strip() for l in text.strip().split("\n") if l.strip()]
    
    if len(lines) > 2:
        # Multi-line: treat each line as a signal
        signals = lines
    else:
        # Single-line: try comma-split
        parts = [p.strip() for p in text.split(",") if p.strip()]
        if len(parts) > 2:
            signals = parts
        else:
            # Can't meaningfully shuffle — return original repeated
            return [text] * n_shuffles
    
    variants = []
    for _ in range(n_shuffles):
        shuffled = signals.copy()
        rng.shuffle(shuffled)
        if len(lines) > 2:
            variants.append("\n".join(shuffled))
        else:
            variants.append(", ".join(shuffled))
    
    return variants


def extract_label_index(response: str, all_labels: list[str]) -> int:
    """Extract which label the model predicted, return its index.
    
    Used for set invariance: we compare label indices across shuffled runs.
    If model is order-invariant, it should pick the same label index.
    Returns -1 if no label found.
    """
    resp_lower = response.lower().strip()
    for i, label in enumerate(all_labels):
        if label.lower().replace("_", " ") in resp_lower or label.lower() in resp_lower:
            return i
    return -1


def extract_confidence(response: str, expected_labels: list[str]) -> float:
    """Extract a confidence-like signal from model response.
    
    Tries to find explicit confidence score first.
    Falls back to label index (normalized 0-1) so different labels
    produce different float values and std_dev reflects label variance.
    """
    resp_lower = response.lower().strip()
    
    # Try to find explicit confidence/probability
    conf_patterns = [
        r'confidence[:\s]+(\d+\.?\d*)',
        r'(\d+\.?\d*)\s*%',
        r'probability[:\s]+(\d+\.?\d*)',
        r'score[:\s]+(\d+\.?\d*)',
    ]
    
    for pattern in conf_patterns:
        match = re.search(pattern, resp_lower)
        if match:
            val = float(match.group(1))
            if val > 1.0:
                val /= 100.0  # Convert percentage
            return min(val, 1.0)
    
    # Fallback: encode the predicted label as a normalized index (0.0, 0.5, 1.0, ...)
    # so that DIFFERENT labels produce DIFFERENT float values
    # This makes std_dev meaningful: same label across shuffles = 0 variance = score 1.0
    idx = extract_label_index(resp_lower, expected_labels)
    if idx >= 0 and len(expected_labels) > 1:
        return idx / (len(expected_labels) - 1)
    
    return 0.0


def evaluate(confidences: list[float]) -> float:
    """Given a list of confidence values from shuffled runs,
    return invariance score = 1 - std_dev.
    
    Perfect invariance (all same) = 1.0
    High variance = low score
    """
    if len(confidences) < 2:
        return 1.0
    
    # If all binary (0/1 with no intermediate values), measure label consistency instead
    if all(c in (0.0, 1.0) for c in confidences):
        # Invariance = 1.0 if all same label, 0.0 if labels differ
        return 1.0 if len(set(confidences)) == 1 else 0.0
    
    std = float(np.std(confidences))
    return max(0.0, 1.0 - std)


def evaluate_from_responses(responses: list[str], expected_labels: list[str]) -> float:
    """Full pipeline: extract confidences from responses, compute invariance."""
    confidences = [extract_confidence(r, expected_labels) for r in responses]
    return evaluate(confidences)
