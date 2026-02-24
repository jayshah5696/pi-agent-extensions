"""
gliner2_model.py - GLiNER2 model wrapper with timing support.

Wraps the GLiNER2 API (pip install gliner2) for:
- Named entity recognition via extract_entities()
- Text classification via classify_text()
- Composed multi-task extraction via create_schema()

All inference runs CPU-only for fair benchmarking on Apple Silicon Macs.

Usage:
    from src.gliner2_model import GLiNER2Wrapper
    model = GLiNER2Wrapper()
    ner_result = model.predict_ner("Apple CEO Tim Cook...", ["person", "company"])
"""

from __future__ import annotations

import time
from typing import Any

# GLiNER2 package: pip install gliner2
from gliner2 import GLiNER2

# Default model checkpoint (205M parameters, CPU-optimized)
DEFAULT_MODEL = "fastino/gliner2-base-v1"

# Maximum input length (tokens) to stay within GLiNER2 context window
MAX_TOKEN_LENGTH = 1800


class GLiNER2Wrapper:
    """Wrapper around GLiNER2 with timing and batch processing support.

    Attributes:
        model_name: HuggingFace model ID.
        model: Loaded GLiNER2 instance.
        load_time_seconds: Time taken to load the model (seconds).
    """

    def __init__(self, model_name: str = DEFAULT_MODEL) -> None:
        """Load GLiNER2 model from HuggingFace hub.

        Args:
            model_name: HuggingFace model ID. Defaults to fastino/gliner2-base-v1.
        """
        self.model_name = model_name
        print(f"Loading GLiNER2 model: {model_name}")
        print("  Note: First load downloads ~800MB to HuggingFace cache.")
        t0 = time.perf_counter()
        self.model: GLiNER2 = GLiNER2.from_pretrained(model_name)
        self.load_time_seconds = time.perf_counter() - t0
        print(f"  Model loaded in {self.load_time_seconds:.1f}s")

    # -------------------------------------------------------------------------
    # NER prediction
    # -------------------------------------------------------------------------

    def predict_ner(
        self,
        text: str,
        labels: list[str],
        include_spans: bool = True,
        threshold: float = 0.5,
    ) -> dict[str, Any]:
        """Run named entity recognition on a single text.

        Args:
            text: Input text string.
            labels: List of entity type labels (e.g. ["person", "company"]).
            include_spans: Whether to include character span positions.
            threshold: Confidence threshold for entity inclusion.

        Returns:
            Dict with keys:
                entities: dict mapping label -> list of entity dicts.
                latency_ms: Inference time in milliseconds.
        """
        t0 = time.perf_counter()
        result = self.model.extract_entities(
            text,
            labels,
            include_spans=include_spans,
            threshold=threshold,
        )
        latency_ms = (time.perf_counter() - t0) * 1000.0

        return {
            "entities": result.get("entities", {}),
            "latency_ms": latency_ms,
        }

    def predict_ner_batch(
        self,
        texts: list[str],
        labels: list[str],
        threshold: float = 0.5,
    ) -> list[dict[str, Any]]:
        """Run NER on a list of texts sequentially.

        Args:
            texts: List of input text strings.
            labels: Entity type labels.
            threshold: Confidence threshold.

        Returns:
            List of result dicts, each with entities and latency_ms.
        """
        results = []
        for text in texts:
            results.append(self.predict_ner(text, labels, threshold=threshold))
        return results

    # -------------------------------------------------------------------------
    # Classification prediction
    # -------------------------------------------------------------------------

    def predict_classification(
        self,
        text: str,
        field_name: str,
        labels: list[str],
        multi_label: bool = False,
        threshold: float = 0.5,
        include_confidence: bool = False,
    ) -> dict[str, Any]:
        """Run text classification on a single text.

        Args:
            text: Input text string.
            field_name: Schema field name for the classification output.
            labels: List of candidate class labels.
            multi_label: If True, allows multiple labels per example.
            threshold: Confidence threshold for label selection.
            include_confidence: If True, include confidence scores in output.

        Returns:
            Dict with keys:
                prediction: Predicted label (str) or list of labels.
                latency_ms: Inference time in milliseconds.
        """
        schema: dict[str, Any] = {
            field_name: {
                "labels": labels,
                "multi_label": multi_label,
                "cls_threshold": threshold,
            }
        }

        t0 = time.perf_counter()
        result = self.model.classify_text(text, schema, include_confidence=include_confidence)
        latency_ms = (time.perf_counter() - t0) * 1000.0

        return {
            "prediction": result.get(field_name),
            "latency_ms": latency_ms,
            "raw": result,
        }

    def predict_classification_batch(
        self,
        texts: list[str],
        field_name: str,
        labels: list[str],
        multi_label: bool = False,
        threshold: float = 0.5,
    ) -> list[dict[str, Any]]:
        """Run classification on a list of texts sequentially.

        Args:
            texts: List of input text strings.
            field_name: Schema field name.
            labels: Candidate class labels.
            multi_label: Allow multiple labels per example.
            threshold: Confidence threshold.

        Returns:
            List of prediction dicts.
        """
        results = []
        for text in texts:
            results.append(
                self.predict_classification(
                    text, field_name, labels, multi_label=multi_label, threshold=threshold
                )
            )
        return results

    # -------------------------------------------------------------------------
    # Composed multi-task prediction (single forward pass)
    # -------------------------------------------------------------------------

    def predict_composed(
        self,
        text: str,
        ner_labels: list[str],
        cls_field: str,
        cls_labels: list[str],
        ner_threshold: float = 0.5,
        cls_threshold: float = 0.5,
    ) -> dict[str, Any]:
        """Run NER + classification in a single forward pass via combined schema.

        This is the core GLiNER2 multi-task capability: both NER and
        classification are resolved in one inference call.

        Args:
            text: Input text string.
            ner_labels: Entity types to extract.
            cls_field: Field name for classification output.
            cls_labels: Classification label candidates.
            ner_threshold: Confidence threshold for entities.
            cls_threshold: Confidence threshold for classification.

        Returns:
            Dict with keys:
                entities: dict mapping label -> list of entity texts.
                classification: predicted class label.
                latency_ms: Total inference time in milliseconds.
        """
        # Build a combined schema: entities + classification in one pass
        schema = self.model.create_schema()
        for label in ner_labels:
            schema.entity(label, threshold=ner_threshold)
        schema.classification(cls_field, cls_labels, cls_threshold=cls_threshold)

        t0 = time.perf_counter()
        result = self.model.extract(text, schema)
        latency_ms = (time.perf_counter() - t0) * 1000.0

        # Separate entity results from classification
        entities: dict[str, list[str]] = {}
        for label in ner_labels:
            raw_entities = result.get(label, [])
            # Normalize to list of strings
            if raw_entities and isinstance(raw_entities[0], dict):
                entities[label] = [e.get("text", str(e)) for e in raw_entities]
            else:
                entities[label] = [str(e) for e in raw_entities]

        classification = result.get(cls_field)

        return {
            "entities": entities,
            "classification": classification,
            "latency_ms": latency_ms,
            "raw": result,
        }

    def predict_composed_batch(
        self,
        texts: list[str],
        ner_labels: list[str],
        cls_field: str,
        cls_labels: list[str],
        ner_threshold: float = 0.5,
        cls_threshold: float = 0.5,
    ) -> list[dict[str, Any]]:
        """Run composed NER + classification on a list of texts.

        Args:
            texts: Input texts.
            ner_labels: Entity types.
            cls_field: Classification schema field name.
            cls_labels: Classification candidates.
            ner_threshold: Entity confidence threshold.
            cls_threshold: Classification confidence threshold.

        Returns:
            List of composed result dicts.
        """
        results = []
        for text in texts:
            results.append(
                self.predict_composed(
                    text,
                    ner_labels,
                    cls_field,
                    cls_labels,
                    ner_threshold=ner_threshold,
                    cls_threshold=cls_threshold,
                )
            )
        return results

    # -------------------------------------------------------------------------
    # Two-pass separate prediction (for comparison with single-pass)
    # -------------------------------------------------------------------------

    def predict_ner_then_classification(
        self,
        text: str,
        ner_labels: list[str],
        cls_field: str,
        cls_labels: list[str],
        ner_threshold: float = 0.5,
        cls_threshold: float = 0.5,
    ) -> dict[str, Any]:
        """Run NER and classification as two separate forward passes.

        Used for Experiment 4 comparison: single-pass vs two-pass.

        Returns:
            Dict with entities, classification, latency_ms (combined).
        """
        ner_result = self.predict_ner(text, ner_labels, threshold=ner_threshold)
        cls_result = self.predict_classification(
            text, cls_field, cls_labels, threshold=cls_threshold
        )

        # Normalize entities to list of strings
        entities: dict[str, list[str]] = {}
        for label, entity_list in ner_result["entities"].items():
            if entity_list and isinstance(entity_list[0], dict):
                entities[label] = [e.get("text", str(e)) for e in entity_list]
            else:
                entities[label] = [str(e) for e in entity_list]

        return {
            "entities": entities,
            "classification": cls_result["prediction"],
            "latency_ms": ner_result["latency_ms"] + cls_result["latency_ms"],
        }
