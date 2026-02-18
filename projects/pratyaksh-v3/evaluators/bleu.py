"""Simple unigram/bigram BLEU score implementation from scratch."""

import math
from collections import Counter
from typing import List


def get_ngrams(tokens: List[str], n: int) -> Counter:
    """Extract n-grams from token list."""
    return Counter(tuple(tokens[i:i+n]) for i in range(len(tokens) - n + 1))


def brevity_penalty(candidate_len: int, reference_len: int) -> float:
    """Compute brevity penalty."""
    if candidate_len == 0:
        return 0.0
    if candidate_len >= reference_len:
        return 1.0
    return math.exp(1.0 - reference_len / candidate_len)


def modified_precision(candidate_tokens: List[str], reference_tokens: List[str], n: int) -> float:
    """Compute modified (clipped) precision for n-grams."""
    candidate_ngrams = get_ngrams(candidate_tokens, n)
    reference_ngrams = get_ngrams(reference_tokens, n)
    
    if not candidate_ngrams:
        return 0.0
    
    clipped_count = 0
    for ngram, count in candidate_ngrams.items():
        clipped_count += min(count, reference_ngrams.get(ngram, 0))
    
    total_count = sum(candidate_ngrams.values())
    return clipped_count / total_count if total_count > 0 else 0.0


def tokenize(text: str) -> List[str]:
    """Simple whitespace + lowercased tokenization."""
    return text.lower().split()


def bleu_score(candidate: str, reference: str, max_n: int = 2, weights: List[float] = None) -> float:
    """Compute BLEU score using unigram and bigram precision.
    
    Args:
        candidate: Generated text.
        reference: Reference text.
        max_n: Maximum n-gram order (default 2 for unigram+bigram).
        weights: Weights for each n-gram level. Default: uniform.
    
    Returns:
        BLEU score between 0.0 and 1.0.
    """
    if weights is None:
        weights = [1.0 / max_n] * max_n
    
    cand_tokens = tokenize(candidate)
    ref_tokens = tokenize(reference)
    
    if not cand_tokens or not ref_tokens:
        return 0.0
    
    # Compute modified precision for each n-gram level
    log_precisions = []
    for n in range(1, max_n + 1):
        p = modified_precision(cand_tokens, ref_tokens, n)
        if p == 0:
            return 0.0  # If any precision is 0, BLEU is 0
        log_precisions.append(weights[n-1] * math.log(p))
    
    # Apply brevity penalty
    bp = brevity_penalty(len(cand_tokens), len(ref_tokens))
    
    return bp * math.exp(sum(log_precisions))


def evaluate(candidate: str, reference: str) -> float:
    """Main evaluation entry point. Returns BLEU score."""
    return bleu_score(candidate, reference)


def evaluate_batch(pairs: List[tuple]) -> float:
    """Average BLEU over batch of (candidate, reference) pairs."""
    if not pairs:
        return 0.0
    scores = [bleu_score(c, r) for c, r in pairs]
    return sum(scores) / len(scores)
