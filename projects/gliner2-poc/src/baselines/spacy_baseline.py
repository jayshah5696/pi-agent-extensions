"""
spacy_baseline.py - spaCy NER baseline for CrossNER AI evaluation.

Uses spaCy en_core_web_sm (tok2vec-based, light, CPU-friendly on Apple Silicon).
Maps spaCy's OntoNotes entity types to CrossNER AI entity types via a
best-effort fuzzy mapping.

Note: spaCy en_core_web_sm is trained on general-domain OntoNotes NER,
NOT the AI domain. This mapping is intentionally approximate and represents
the realistic zero-shot transfer capability.

Install model: uv run python -m spacy download en_core_web_sm
"""

from __future__ import annotations

import time
from typing import Any

import spacy
from spacy.language import Language

# -------------------------------------------------------------------------
# Entity type mapping: spaCy OntoNotes -> CrossNER AI types
# -------------------------------------------------------------------------
# spaCy en_core_web_sm entity types (OntoNotes):
#   PERSON, NORP, FAC, ORG, GPE, LOC, PRODUCT, EVENT, WORK_OF_ART,
#   LAW, LANGUAGE, DATE, TIME, PERCENT, MONEY, QUANTITY, ORDINAL, CARDINAL

SPACY_TO_CROSSNER: dict[str, str] = {
    "PERSON": "researcher",    # Researchers are persons in AI domain
    "ORG": "organisation",     # Organizations map directly
    "GPE": "country",          # GPE (Geopolitical entity) includes countries
    "LOC": "location",         # Locations map directly
    "PRODUCT": "product",      # Products map directly
    "LANGUAGE": "programlang", # Programming languages / natural languages
    "WORK_OF_ART": "algorithm", # Papers, algorithms sometimes tagged as WORK_OF_ART
    "EVENT": "conference",     # Academic conferences sometimes tagged as EVENT
    "NORP": "field",           # Nationalities/groups sometimes proxy for fields
    # Unmapped spaCy types: FAC, LAW, DATE, TIME, PERCENT, MONEY, QUANTITY, ORDINAL, CARDINAL
}

# CrossNER AI entity types that have NO spaCy equivalent (will be missed by baseline)
UNMAPPED_CROSSNER_TYPES: list[str] = [
    "algorithm",   # Largely missed (some WORK_OF_ART)
    "task",        # No spaCy equivalent
    "university",  # Merged into ORG -> organisation
    "field",       # No direct spaCy equivalent
    "metrics",     # No spaCy equivalent
    "person",      # Mapped from PERSON (as researcher)
    "miscellaneous",
]


class SpaCyNERBaseline:
    """spaCy NER baseline wrapper.

    Loads en_core_web_sm and provides span-format predictions
    compatible with GLiNER2 output format.
    """

    def __init__(self, model_name: str = "en_core_web_sm") -> None:
        """Load the spaCy model.

        Args:
            model_name: spaCy model to load. Default: en_core_web_sm.
                        Run: uv run python -m spacy download en_core_web_sm
        """
        print(f"Loading spaCy model: {model_name}")
        t0 = time.perf_counter()
        try:
            self.nlp: Language = spacy.load(model_name)
        except OSError as e:
            raise RuntimeError(
                f"spaCy model '{model_name}' not found. "
                f"Install with: uv run python -m spacy download {model_name}"
            ) from e
        self.load_time_seconds = time.perf_counter() - t0
        self.model_name = model_name
        print(f"  spaCy model loaded in {self.load_time_seconds:.1f}s")

    def predict(
        self,
        text: str,
        target_labels: list[str] | None = None,
    ) -> dict[str, Any]:
        """Run NER on a single text and map to CrossNER AI format.

        Args:
            text: Input text string.
            target_labels: If provided, only return entities of these CrossNER types.

        Returns:
            Dict with keys:
                entities: dict mapping CrossNER label -> list of entity dicts.
                latency_ms: Inference time in milliseconds.
        """
        t0 = time.perf_counter()
        doc = self.nlp(text)
        latency_ms = (time.perf_counter() - t0) * 1000.0

        entities: dict[str, list[dict[str, Any]]] = {}

        for ent in doc.ents:
            spacy_type = ent.label_
            crossner_type = SPACY_TO_CROSSNER.get(spacy_type)
            if crossner_type is None:
                continue  # Skip unmapped types
            if target_labels and crossner_type not in target_labels:
                continue  # Skip types not in the target set

            if crossner_type not in entities:
                entities[crossner_type] = []

            entities[crossner_type].append(
                {
                    "text": ent.text,
                    "start": ent.start_char,
                    "end": ent.end_char,
                    "spacy_label": spacy_type,
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
        """Run NER on a list of texts using spaCy's pipe() for efficiency.

        Args:
            texts: List of input text strings.
            target_labels: CrossNER entity types to include.
            batch_size: spaCy pipe batch size.

        Returns:
            List of prediction dicts.
        """
        results = []
        start_times = []

        # Process in batches using spaCy's optimized pipe()
        docs = []
        t0 = time.perf_counter()
        for doc in self.nlp.pipe(texts, batch_size=batch_size):
            docs.append(doc)
        total_time_ms = (time.perf_counter() - t0) * 1000.0
        per_example_ms = total_time_ms / max(len(docs), 1)

        for doc in docs:
            entities: dict[str, list[dict[str, Any]]] = {}
            for ent in doc.ents:
                spacy_type = ent.label_
                crossner_type = SPACY_TO_CROSSNER.get(spacy_type)
                if crossner_type is None:
                    continue
                if target_labels and crossner_type not in target_labels:
                    continue
                if crossner_type not in entities:
                    entities[crossner_type] = []
                entities[crossner_type].append(
                    {
                        "text": ent.text,
                        "start": ent.start_char,
                        "end": ent.end_char,
                        "spacy_label": ent.label_,
                    }
                )

            results.append(
                {
                    "entities": entities,
                    "latency_ms": per_example_ms,
                }
            )

        return results
