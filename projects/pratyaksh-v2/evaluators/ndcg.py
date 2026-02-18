"""NDCG@K evaluator implemented from scratch (numpy only)."""

import numpy as np
from typing import List


def dcg_at_k(relevance_scores: List[float], k: int = 5) -> float:
    """Compute DCG@K.
    
    DCG = sum_{i=1}^{k} (2^rel_i - 1) / log2(i + 1)
    """
    relevance_scores = np.array(relevance_scores[:k], dtype=np.float64)
    if len(relevance_scores) == 0:
        return 0.0
    positions = np.arange(1, len(relevance_scores) + 1)
    discounts = np.log2(positions + 1)
    gains = (2.0 ** relevance_scores - 1.0) / discounts
    return float(np.sum(gains))


def ndcg_at_k(predicted_ranking: List[int], relevant_ids: List[int], k: int = 5) -> float:
    """Compute NDCG@K.
    
    Args:
        predicted_ranking: List of document IDs in predicted order (best first).
        relevant_ids: Set of actually relevant document IDs.
        k: Cutoff position.
    
    Returns:
        NDCG score between 0.0 and 1.0.
    """
    relevant_set = set(relevant_ids)
    
    # Build relevance vector for predicted ranking
    pred_relevance = [1.0 if doc_id in relevant_set else 0.0 for doc_id in predicted_ranking]
    
    # Build ideal relevance vector (all relevant docs first)
    ideal_relevance = sorted(pred_relevance, reverse=True)
    
    dcg = dcg_at_k(pred_relevance, k)
    idcg = dcg_at_k(ideal_relevance, k)
    
    if idcg == 0.0:
        return 0.0
    
    return dcg / idcg


def evaluate(predicted_ranking: List[int], relevant_ids: List[int], k: int = 5) -> float:
    """Main evaluation entry point."""
    return ndcg_at_k(predicted_ranking, relevant_ids, k)


def evaluate_batch(results: List[tuple], k: int = 5) -> float:
    """Average NDCG@K over batch of (predicted_ranking, relevant_ids) tuples."""
    if not results:
        return 0.0
    scores = [ndcg_at_k(pred, rel, k) for pred, rel in results]
    return float(np.mean(scores))
