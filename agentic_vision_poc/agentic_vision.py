from __future__ import annotations

import json
import os
import re
from pathlib import Path
from typing import Any

from google import genai
from google.genai import types
from PIL import Image


class AgenticVision:
    """Gemini-powered image inspection with recursive zoom and visual diff support."""

    def __init__(
        self,
        model: str = "gemini-2.5-flash",
        api_key: str | None = None,
    ) -> None:
        resolved_api_key = api_key or os.getenv("GEMINI_API_KEY")
        if not resolved_api_key:
            raise EnvironmentError(
                "GEMINI_API_KEY is not set. Export it before using AgenticVision."
            )

        self.model = model
        self.client = genai.Client(api_key=resolved_api_key)
        self._code_execution_tool = types.Tool(
            code_execution=types.ToolCodeExecution()
        )

    def inspect_recursive(
        self,
        image_path: str | Path,
        query: str,
        max_depth: int = 3,
    ) -> dict[str, Any]:
        """Recursively inspect an image by asking Gemini where to zoom next.

        The method starts from the full image, asks Gemini to analyze the region,
        and optionally returns a tighter bounding box for another round.
        """
        if max_depth < 1:
            raise ValueError("max_depth must be >= 1")
        if not query.strip():
            raise ValueError("query must be non-empty")

        path = Path(image_path)
        base_image = self._load_image(path)
        width, height = base_image.size

        current_box = (0, 0, width, height)
        steps: list[dict[str, Any]] = []

        for depth in range(max_depth):
            crop = base_image.crop(current_box)
            response = self._run_code_exec(
                contents=[
                    crop,
                    self._build_recursive_prompt(query=query, depth=depth),
                ]
            )

            response_text = self._response_text(response)
            payload = self._parse_json_payload(response_text)

            should_zoom = bool(payload.get("should_zoom", False))
            bbox = payload.get("bbox")
            normalized_bbox: list[float] | None = None
            next_box: tuple[int, int, int, int] | None = None

            if should_zoom and isinstance(bbox, list) and len(bbox) == 4:
                normalized_bbox = [float(v) for v in bbox]
                next_box = self._normalized_to_absolute(
                    normalized_bbox=normalized_bbox,
                    parent_box=current_box,
                )
                if next_box == current_box:
                    should_zoom = False
                    next_box = None

            step = {
                "depth": depth,
                "crop_box": list(current_box),
                "observation": payload.get("observation", ""),
                "confidence": payload.get("confidence"),
                "should_zoom": should_zoom,
                "normalized_bbox": normalized_bbox,
                "next_crop_box": list(next_box) if next_box else None,
                "evidence": payload.get("evidence", []),
                "code_execution_trace": self._extract_code_execution_trace(response),
                "raw_model_text": response_text,
            }
            steps.append(step)

            if not should_zoom or not next_box:
                break

            current_box = next_box

        return {
            "image_path": str(path),
            "query": query,
            "model": self.model,
            "max_depth": max_depth,
            "steps": steps,
            "final_observation": steps[-1]["observation"] if steps else "",
            "iterations": len(steps),
        }

    def visual_diff(
        self,
        img1: str | Path,
        img2: str | Path,
        kpi_selector: str,
    ) -> dict[str, Any]:
        """Compare two images and compute a KPI-driven visual diff via code execution."""
        if not kpi_selector.strip():
            raise ValueError("kpi_selector must be non-empty")

        image_1 = self._load_image(Path(img1))
        image_2 = self._load_image(Path(img2))

        response = self._run_code_exec(
            contents=[
                "Image A (baseline):",
                image_1,
                "Image B (candidate):",
                image_2,
                self._build_visual_diff_prompt(kpi_selector=kpi_selector),
            ]
        )

        response_text = self._response_text(response)
        payload = self._parse_json_payload(response_text)

        return {
            "kpi_selector": kpi_selector,
            "model": self.model,
            "metrics": payload.get("metrics", {}),
            "selected_kpi": payload.get("selected_kpi", {}),
            "changed_regions": payload.get("changed_regions", []),
            "summary": payload.get("summary", ""),
            "code_execution_trace": self._extract_code_execution_trace(response),
            "raw_model_text": response_text,
        }

    def _run_code_exec(self, contents: list[Any]) -> Any:
        config = types.GenerateContentConfig(
            tools=[self._code_execution_tool],
            temperature=0.1,
            response_mime_type="application/json",
        )
        return self.client.models.generate_content(
            model=self.model,
            contents=contents,
            config=config,
        )

    @staticmethod
    def _load_image(image_path: Path) -> Image.Image:
        if not image_path.exists():
            raise FileNotFoundError(f"Image not found: {image_path}")
        if not image_path.is_file():
            raise ValueError(f"Expected a file path, got: {image_path}")

        with Image.open(image_path) as img:
            return img.convert("RGB")

    @staticmethod
    def _build_recursive_prompt(query: str, depth: int) -> str:
        return (
            "You are running recursive visual inspection on an image crop. "
            "Use Python code execution for quantitative checks (pixel stats, edge density, "
            "color clustering, contour cues, etc.) before deciding where to zoom.\n\n"
            f"User query: {query}\n"
            f"Current depth: {depth}\n\n"
            "Return ONLY valid JSON using this schema:\n"
            "{\n"
            '  "observation": "short answer grounded in this crop",\n'
            '  "confidence": 0.0,\n'
            '  "should_zoom": true,\n'
            '  "bbox": [left, top, right, bottom],\n'
            '  "evidence": ["list", "of", "signals"]\n'
            "}\n\n"
            "bbox requirements:\n"
            "- Normalized coordinates in range [0,1] relative to CURRENT crop.\n"
            "- Use null for bbox if no further zoom is needed.\n"
            "- Keep bbox tight around the most relevant region for the query."
        )

    @staticmethod
    def _build_visual_diff_prompt(kpi_selector: str) -> str:
        return (
            "Compare Image A vs Image B using Python code execution. "
            "Compute robust numeric metrics and identify localized change regions.\n\n"
            f"KPI selector: {kpi_selector}\n\n"
            "Return ONLY valid JSON with this schema:\n"
            "{\n"
            '  "metrics": {\n'
            '    "mse": 0.0,\n'
            '    "mae": 0.0,\n'
            '    "pixel_change_ratio": 0.0,\n'
            '    "psnr": 0.0\n'
            "  },\n"
            '  "selected_kpi": {"name": "...", "value": 0.0, "interpretation": "..."},\n'
            '  "changed_regions": [\n'
            '    {"bbox": [left, top, right, bottom], "magnitude": 0.0, "note": "..."}\n'
            "  ],\n"
            '  "summary": "concise explanation"\n'
            "}\n\n"
            "changed_regions bbox coordinates must be normalized [0,1] in Image A/B frame."
        )

    @staticmethod
    def _response_text(response: Any) -> str:
        if getattr(response, "text", None):
            return str(response.text)

        text_parts: list[str] = []
        candidates = getattr(response, "candidates", [])
        if not candidates:
            return ""

        first_candidate = candidates[0]
        content = getattr(first_candidate, "content", None)
        parts = getattr(content, "parts", []) if content else []

        for part in parts:
            part_text = getattr(part, "text", None)
            if part_text:
                text_parts.append(str(part_text))

        return "\n".join(text_parts)

    @staticmethod
    def _parse_json_payload(text: str) -> dict[str, Any]:
        candidates = [text.strip()]

        fenced = re.findall(r"```(?:json)?\s*(.*?)```", text, flags=re.DOTALL)
        candidates.extend(item.strip() for item in fenced if item.strip())

        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            candidates.append(text[start : end + 1].strip())

        for candidate in candidates:
            if not candidate:
                continue
            try:
                loaded = json.loads(candidate)
                if isinstance(loaded, dict):
                    return loaded
            except json.JSONDecodeError:
                continue

        raise ValueError(f"Model output is not valid JSON: {text}")

    @staticmethod
    def _normalized_to_absolute(
        normalized_bbox: list[float],
        parent_box: tuple[int, int, int, int],
    ) -> tuple[int, int, int, int]:
        if len(normalized_bbox) != 4:
            raise ValueError("normalized_bbox must have four values")

        left_n, top_n, right_n, bottom_n = normalized_bbox
        left_n = max(0.0, min(1.0, left_n))
        top_n = max(0.0, min(1.0, top_n))
        right_n = max(0.0, min(1.0, right_n))
        bottom_n = max(0.0, min(1.0, bottom_n))

        parent_left, parent_top, parent_right, parent_bottom = parent_box
        parent_width = max(1, parent_right - parent_left)
        parent_height = max(1, parent_bottom - parent_top)

        left = parent_left + int(left_n * parent_width)
        top = parent_top + int(top_n * parent_height)
        right = parent_left + int(right_n * parent_width)
        bottom = parent_top + int(bottom_n * parent_height)

        left = max(parent_left, min(left, parent_right - 1))
        top = max(parent_top, min(top, parent_bottom - 1))
        right = max(left + 1, min(right, parent_right))
        bottom = max(top + 1, min(bottom, parent_bottom))

        return (left, top, right, bottom)

    @staticmethod
    def _extract_code_execution_trace(response: Any) -> list[dict[str, Any]]:
        trace: list[dict[str, Any]] = []

        candidates = getattr(response, "candidates", [])
        if not candidates:
            return trace

        first_candidate = candidates[0]
        content = getattr(first_candidate, "content", None)
        parts = getattr(content, "parts", []) if content else []

        for part in parts:
            executable_code = getattr(part, "executable_code", None)
            if executable_code:
                trace.append(
                    {
                        "type": "code",
                        "language": getattr(executable_code, "language", None),
                        "code": getattr(executable_code, "code", ""),
                    }
                )

            execution_result = getattr(part, "code_execution_result", None)
            if execution_result:
                trace.append(
                    {
                        "type": "result",
                        "outcome": getattr(execution_result, "outcome", None),
                        "output": getattr(execution_result, "output", ""),
                    }
                )

        return trace
