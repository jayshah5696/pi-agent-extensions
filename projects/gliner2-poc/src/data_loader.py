"""
data_loader.py - Dataset loading and preprocessing for GLiNER2 POC.

Loads three HuggingFace datasets:
- DFKI-SLT/cross_ner (config: ai, split: test) -- NER evaluation
- PolyAI/banking77 (split: test)                -- Intent classification
- ag_news (split: test, sampled 500)            -- Topic classification

All datasets are returned in a unified format suitable for both
GLiNER2 and baseline models.
"""

from __future__ import annotations

import random
from pathlib import Path
from typing import Any

from datasets import load_dataset

# -------------------------------------------------------------------------
# CrossNER AI label definitions
# -------------------------------------------------------------------------

# BIO tag integer -> label string mapping for DFKI-SLT/cross_ner (ai config)
# Label order follows the dataset schema (0=O, then B-/I- pairs)
CROSSNER_AI_ID2LABEL: dict[int, str] = {
    0: "O",
    1: "B-researcher",
    2: "I-researcher",
    3: "B-university",
    4: "I-university",
    5: "B-algorithm",
    6: "I-algorithm",
    7: "B-conference",
    8: "I-conference",
    9: "B-task",
    10: "I-task",
    11: "B-country",
    12: "I-country",
    13: "B-person",
    14: "I-person",
    15: "B-organisation",
    16: "I-organisation",
    17: "B-field",
    18: "I-field",
    19: "B-location",
    20: "I-location",
    21: "B-metrics",
    22: "I-metrics",
    23: "B-programlang",
    24: "I-programlang",
    25: "B-product",
    26: "I-product",
    27: "B-miscellaneous",
    28: "I-miscellaneous",
}

# Entity types used for GLiNER2 label prompts (without BIO prefix)
CROSSNER_AI_ENTITY_TYPES: list[str] = [
    "researcher",
    "university",
    "algorithm",
    "conference",
    "task",
    "country",
    "person",
    "organisation",
    "field",
    "location",
    "metrics",
    "programlang",
    "product",
    "miscellaneous",
]

# Banking77 label list (77 banking intents)
BANKING77_LABELS: list[str] = [
    "activate_my_card",
    "age_limit",
    "apple_pay_or_google_pay",
    "atm_support",
    "automatic_top_up",
    "balance_not_updated_after_bank_transfer",
    "balance_not_updated_after_cheque_or_cash_deposit",
    "beneficiary_not_allowed",
    "cancel_transfer",
    "card_about_to_expire",
    "card_acceptance",
    "card_arrival",
    "card_delivery_estimate",
    "card_linking",
    "card_not_working",
    "card_payment_fee_charged",
    "card_payment_not_recognised",
    "card_payment_wrong_exchange_rate",
    "card_swallowed",
    "cash_withdrawal_charge",
    "cash_withdrawal_not_recognised",
    "change_pin",
    "compromised_card",
    "contactless_not_working",
    "country_support",
    "declined_card_payment",
    "declined_cash_withdrawal",
    "declined_transfer",
    "direct_debit_payment_not_recognised",
    "disposable_card_limits",
    "edit_personal_details",
    "exchange_charge",
    "exchange_rate",
    "exchange_via_app",
    "extra_charge_on_statement",
    "failed_transfer",
    "fiat_currency_support",
    "get_disposable_virtual_card",
    "get_physical_card",
    "getting_spare_card",
    "getting_virtual_card",
    "lost_or_stolen_card",
    "lost_or_stolen_phone",
    "order_physical_card",
    "passcode_forgotten",
    "pending_card_payment",
    "pending_cash_withdrawal",
    "pending_top_up",
    "pending_transfer",
    "pin_blocked",
    "receiving_money",
    "refund_not_showing_up",
    "request_refund",
    "reverted_card_payment",
    "supported_cards_and_currencies",
    "terminate_account",
    "top_up_by_bank_transfer_charge",
    "top_up_by_card_charge",
    "top_up_by_cash_or_cheque",
    "top_up_failed",
    "top_up_limits",
    "top_up_reverted",
    "topping_up_by_card",
    "transaction_charged_twice",
    "transfer_fee_charged",
    "transfer_into_account",
    "transfer_not_received_by_recipient",
    "transfer_timing",
    "unable_to_verify_identity",
    "verify_my_identity",
    "verify_source_of_funds",
    "verify_top_up",
    "virtual_card_not_working",
    "visa_or_mastercard",
    "why_verify_identity",
    "wrong_amount_of_cash_received",
    "wrong_exchange_rate_for_cash_withdrawal",
]

# AG News label mapping (dataset uses integer labels 0-3)
AG_NEWS_ID2LABEL: dict[int, str] = {
    0: "World",
    1: "Sports",
    2: "Business",
    3: "Sci/Tech",
}
AG_NEWS_LABELS: list[str] = ["World", "Sports", "Business", "Sci/Tech"]


# -------------------------------------------------------------------------
# BIO span conversion utilities
# -------------------------------------------------------------------------


def bio_tags_to_spans(
    tokens: list[str],
    tag_ids: list[int],
    id2label: dict[int, str],
) -> list[dict[str, Any]]:
    """Convert BIO tag sequence to a list of entity spans.

    Args:
        tokens: List of word tokens.
        tag_ids: List of integer tag IDs (same length as tokens).
        id2label: Mapping from tag ID to BIO label string.

    Returns:
        List of dicts with keys: text, label, start_token, end_token.
    """
    spans: list[dict[str, Any]] = []
    current_entity: dict[str, Any] | None = None

    for i, (token, tag_id) in enumerate(zip(tokens, tag_ids)):
        label_str = id2label.get(tag_id, "O")

        if label_str.startswith("B-"):
            # Close any open entity
            if current_entity is not None:
                spans.append(current_entity)
            entity_type = label_str[2:]
            current_entity = {
                "text": token,
                "label": entity_type,
                "start_token": i,
                "end_token": i,
            }

        elif label_str.startswith("I-") and current_entity is not None:
            entity_type = label_str[2:]
            # Only continue if same type (handle malformed BIO gracefully)
            if entity_type == current_entity["label"]:
                current_entity["text"] += " " + token
                current_entity["end_token"] = i

        else:
            # O tag or malformed I without B: close any open entity
            if current_entity is not None:
                spans.append(current_entity)
                current_entity = None

    # Close trailing entity
    if current_entity is not None:
        spans.append(current_entity)

    return spans


def tokens_to_text(tokens: list[str]) -> str:
    """Join tokens into a text string (simple whitespace join)."""
    return " ".join(tokens)


# -------------------------------------------------------------------------
# Dataset loaders
# -------------------------------------------------------------------------


def load_crossner_ai(max_examples: int | None = None) -> list[dict[str, Any]]:
    """Load CrossNER AI test split from HuggingFace.

    Returns a list of examples, each with:
        - text: str (whitespace-joined tokens)
        - tokens: list[str]
        - ner_tags: list[int] (BIO tag IDs)
        - spans: list[dict] (text, label, start_token, end_token)

    Args:
        max_examples: If set, truncate to this many examples.
    """
    print("Loading CrossNER AI dataset...")
    dataset = load_dataset("DFKI-SLT/cross_ner", "ai", split="test", trust_remote_code=True)

    # Resolve actual id2label from dataset features if available
    features = dataset.features
    if "ner_tags" in features and hasattr(features["ner_tags"].feature, "names"):
        label_names = features["ner_tags"].feature.names
        id2label = {i: name for i, name in enumerate(label_names)}
    else:
        id2label = CROSSNER_AI_ID2LABEL

    examples: list[dict[str, Any]] = []
    for item in dataset:
        tokens = item["tokens"]
        tag_ids = item["ner_tags"]
        text = tokens_to_text(tokens)
        # Truncate to 1800 tokens to stay within GLiNER2 context window
        if len(tokens) > 1800:
            tokens = tokens[:1800]
            tag_ids = tag_ids[:1800]
        spans = bio_tags_to_spans(tokens, tag_ids, id2label)
        examples.append(
            {
                "text": text,
                "tokens": tokens,
                "ner_tags": tag_ids,
                "spans": spans,
            }
        )
        if max_examples and len(examples) >= max_examples:
            break

    print(f"  Loaded {len(examples)} CrossNER AI test examples.")
    return examples


def load_banking77(max_examples: int | None = None) -> list[dict[str, Any]]:
    """Load Banking77 test split from HuggingFace.

    Returns a list of examples, each with:
        - text: str
        - label: str (intent label)
        - label_id: int
    """
    print("Loading Banking77 dataset...")
    dataset = load_dataset("PolyAI/banking77", split="test", trust_remote_code=True)

    # Resolve label names from dataset features
    features = dataset.features
    if "label" in features and hasattr(features["label"], "names"):
        label_names = features["label"].names
    else:
        label_names = BANKING77_LABELS

    examples: list[dict[str, Any]] = []
    for item in dataset:
        examples.append(
            {
                "text": item["text"],
                "label": label_names[item["label"]],
                "label_id": item["label"],
            }
        )
        if max_examples and len(examples) >= max_examples:
            break

    print(f"  Loaded {len(examples)} Banking77 test examples.")
    return examples


def load_ag_news(max_examples: int = 500, seed: int = 42) -> list[dict[str, Any]]:
    """Load AG News test split from HuggingFace and sample for speed.

    Args:
        max_examples: Number of examples to sample (default 500).
        seed: Random seed for reproducible sampling.

    Returns:
        List of examples with keys: text, label, label_id.
    """
    print(f"Loading AG News dataset (sampling {max_examples} examples)...")
    dataset = load_dataset("ag_news", split="test", trust_remote_code=True)

    # Shuffle with fixed seed and take max_examples
    random.seed(seed)
    indices = list(range(len(dataset)))
    random.shuffle(indices)
    indices = indices[:max_examples]

    examples: list[dict[str, Any]] = []
    for idx in indices:
        item = dataset[idx]
        label_id = item["label"]
        label_str = AG_NEWS_ID2LABEL.get(label_id, str(label_id))
        examples.append(
            {
                "text": item["text"],
                "label": label_str,
                "label_id": label_id,
            }
        )

    print(f"  Loaded {len(examples)} AG News test examples.")
    return examples


def load_all_datasets(
    ag_news_sample: int = 500,
    crossner_max: int | None = None,
    banking77_max: int | None = None,
    seed: int = 42,
) -> dict[str, list[dict[str, Any]]]:
    """Load all three evaluation datasets.

    Returns:
        Dict with keys: crossner_ai, banking77, ag_news.
    """
    return {
        "crossner_ai": load_crossner_ai(max_examples=crossner_max),
        "banking77": load_banking77(max_examples=banking77_max),
        "ag_news": load_ag_news(max_examples=ag_news_sample, seed=seed),
    }
