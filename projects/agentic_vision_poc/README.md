# Agentic Vision PoC

A minimal proof-of-concept for recursive image inspection using Gemini code execution.

## What this builds

`agentic_vision.py` exposes an `AgenticVision` class with two methods:

- `inspect_recursive(image_path, query, max_depth=3)`
  - Starts from the full image.
  - Uses Gemini + code execution to analyze the crop.
  - Returns a suggested next bounding box to zoom into.
  - Repeats until `max_depth` or model signals stop.
- `visual_diff(img1, img2, kpi_selector)`
  - Compares two images with code execution.
  - Returns numerical metrics (`mse`, `mae`, `pixel_change_ratio`, `psnr`) and changed regions.
  - Highlights a selected KPI using `kpi_selector`.

## Setup (uv)

```bash
uv sync
```

Dependencies are managed in `pyproject.toml`:

- `google-genai`
- `pillow`

## Required environment variable

```bash
export GEMINI_API_KEY="your-api-key"
```

The class initialization fails fast if the key is missing.

## Quick usage

```python
from agentic_vision import AgenticVision

vision = AgenticVision()

recursive_result = vision.inspect_recursive(
    image_path="sample.png",
    query="Find the damaged connector and zoom in",
    max_depth=3,
)

print(recursive_result["final_observation"])

compare_result = vision.visual_diff(
    img1="before.png",
    img2="after.png",
    kpi_selector="pixel_change_ratio",
)

print(compare_result["selected_kpi"])
```

## Notes

- This is a PoC for agentic visual workflows, not a production evaluation system.
- Bounding boxes are normalized `[left, top, right, bottom]` in `[0, 1]` space.
- The response includes code execution trace blocks when the model emits executable code and execution results.
