"""
flair_baseline.py - Flair NER baseline for CrossNER AI evaluation.

Uses flair/ner-english-fast, an approx. 80MB sequence labeling model based on
the Flair NLP framework. Flair uses contextual string embeddings (Flair embeddings)
combined with a BiLSTM-CRF tagger for named entity recognition.

The model is trained on CoNLL-2003 (English newswire) and recognizes four entity
types: PER (person), ORG (organization), LOC (location), MISC (miscellaneous).
These are mapped to CrossNER AI entity types using the same best-effort fuzzy
mapping as the spaCy baseline.

Architecture: BiLSTM-CRF sequence labeler with Flair character-level contextual
embeddings. Unlike transformer-based models, Flair embeddings are computed by
a character-level language model that reads the text left-to-right and
right-to-left, capturing local character context without attention mechanisms.

Model: flair/ner-english-fast (approx. 80MB, CoNLL-2003 trained)
Package: flair (pip install flair>=0.14.0)
Task support: NER only, 4 classes (PER, ORG, LOC, MISC)
Latency profile: Fast on CPU. BiLSTM is lightweight compared to transformer encoders.
HuggingFace: https://huggingface.co/flair/ner-english-fast

Usage:
    from src.baselines.flair_baseline import FlairNERBaseline
    model = FlairNERBaseline()
    result = model.predict("Yann LeCun works at Meta AI.", ["researcher", "organisation"])
"""

from __future__ import annotations

import time
from typing import Any

from flair.data import Sentence
from flair.models import SequenceTagger

DEFAULT_MODEL = "flair/ner-english-fast"

# Flair CoNLL-2003 entity types -> CrossNER AI types
# PER -> researcher (persons in AI domain are typically researchers)
# ORG -> organisation (direct mapping)
# LOC -> location (direct mapping)
# MISC -> miscellaneous (direct mapping)
FLAIR_TO_CROSSNER: dict[str, str] = {
    "PER": "researcher",
    "ORG": "organisation",
    "LOC": "location",
    "MISC": "miscellaneous",
}


class FlairNERBaseline:
    """Flair NER baseline wrapper.

    Loads flair/ner-english-fast and provides span-format predictions
    compatible with GLiNER2 output format. Flair uses Sentence objects
    and a SequenceTagger predict() call.

    Note: Flair recognizes only 4 entity types (PER, ORG, LOC, MISC).
    Many CrossNER AI entity types (algorithm, task, university, field,
    metrics, programlang, product, country, conference) have no Flair
    equivalent and will be entirely missed by this baseline. This is
    expected and documented as a domain/schema mismatch.
    """

    def __init__(self, model_name: str = DEFAULT_MODEL) -> None:
        """Load Flair NER tagger from HuggingFace hub.

        Args:
            model_name: Flair model identifier. Default: flair/ner-english-fast.
                        Downloads approx. 80MB on first run.
        """
        self.model_name = model_name
        print(f"Loading Flair NER model: {model_name}")
        print("  Note: First load downloads approx. 80MB to HuggingFace cache.")
        t0 = time.perf_counter()
        self.tagger: SequenceTagger = SequenceTagger.load(model_name)
        self.load_time_seconds = time.perf_counter() - t0
        print(f"  Flair model loaded in {self.load_time_seconds:.1f}s")

    def predict(
        self,
        text: str,
        target_labels: list[str] | None = None,
    ) -> dict[str, Any]:
        """Run NER on a single text and map to CrossNER AI format.

        Flair uses Sentence objects. The tagger.predict() call modifies the
        Sentence in place, annotating it with entity spans.

        Args:
            text: Input text string.
            target_labels: If provided, only return entities of these CrossNER types.

        Returns:
            Dict with keys:
                entities: dict mapping CrossNER label -> list of entity dicts.
                latency_ms: Inference time in milliseconds.
        """
        sentence = Sentence(text)

        t0 = time.perf_counter()
        self.tagger.predict(sentence)
        latency_ms = (time.perf_counter() - t0) * 1000.0

        entities: dict[str, list[dict[str, Any]]] = {}

        for span in sentence.get_spans("ner"):
            flair_label = span.get_label("ner").value
            crossner_type = FLAIR_TO_CROSSNER.get(flair_label)
            if crossner_type is None:
                continue
            if target_labels and crossner_type not in target_labels:
                continue

            if crossner_type not in entities:
                entities[crossner_type] = []

            entities[crossner_type].append(
                {
                    "text": span.text,
                    "start": span.start_position,
                    "end": span.end_position,
                    "flair_label": flair_label,
                    "score": span.get_label("ner").score,
                }
            )

        return {
            "entities": entities,
            "latency_ms": latency_ms,
        }

    def predict_batch(
        self,
        texts: list[str],
        target_labels: list[str] | None = None,
        batch_size: int = 32,
    ) -> list[dict[str, Any]]:
        """Run NER on a list of texts using Flair's batch prediction.

        Args:
            texts: List of input text strings.
            target_labels: CrossNER entity types to include.
            batch_size: Flair tagger batch size.

        Returns:
            List of prediction dicts.
        """
        sentences = [Sentence(text) for text in texts]

        t0 = time.perf_counter()
        self.tagger.predict(sentences, mini_batch_size=batch_size)
        total_time_ms = (time.perf_counter() - t0) * 1000.0
        per_example_ms = total_time_ms / max(len(sentences), 1)

        results = []
        for sentence in sentences:
            entities: dict[str, list[dict[str, Any]]] = {}

            for span in sentence.get_spans("ner"):
                flair_label = span.get_label("ner").value
                crossner_type = FLAIR_TO_CROSSNER.get(flair_label)
                if crossner_type is None:
                    continue
                if target_labels and crossner_type not in target_labels:
                    continue

                if crossner_type not in entities:
                    entities[crossner_type] = []

                entities[crossner_type].append(
                    {
                        "text": span.text,
                        "start": span.start_position,
                        "end": span.end_position,
                        "flair_label": flair_label,
                        "score": span.get_label("ner").score,
                    }
                )

            results.append(
                {
                    "entities": entities,
                    "latency_ms": per_example_ms,
                }
            )

        return results
