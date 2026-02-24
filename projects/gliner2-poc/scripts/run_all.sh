#!/bin/bash
# run_all.sh - Run all GLiNER2 POC experiments in sequence
#
# Usage: bash scripts/run_all.sh
#
# Prerequisites:
#   uv sync
#   uv run python -m spacy download en_core_web_sm
#
# Runtime estimate: 4-6 hours on Apple Silicon Mac (CPU-only)

set -e  # Exit on first error

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"

echo "========================================"
echo "GLiNER2 POC Experiment Runner"
echo "========================================"
echo "Project: $PROJECT_DIR"
echo "Start time: $(date)"
echo ""

# Ensure results directory exists
mkdir -p "$PROJECT_DIR/results"

# Download FastText model (cc.en.300.bin, approx. 4.2GB)
# This is required by the FastText zero-shot classification baseline.
# Skip this step if cc.en.300.bin is already present in the project root.
echo "--- Downloading FastText model (cc.en.300.bin, approx. 4.2GB) ---"
echo "Note: If cc.en.300.bin already exists in the project root, this is a no-op."
uv run python -c "import fasttext.util; fasttext.util.download_model('en', if_exists='ignore')"
echo ""

# Experiment 1: NER evaluation on CrossNER AI
echo "--- Experiment 1: NER Evaluation (CrossNER AI) ---"
echo "Models: GLiNER2 vs spaCy vs GLiNER v1 vs ModernBERT GLiNER vs Flair"
uv run python "$PROJECT_DIR/src/experiments/exp01_ner.py"
echo ""

# Experiment 2: Classification on Banking77 + AG News
echo "--- Experiment 2: Classification Evaluation ---"
echo "Models: GLiNER2 vs DeBERTa NLI vs SetFit vs FastText vs Modern NLI"
echo "Note: NLI models skipped by default on Banking77 (77 labels, too slow on CPU)."
uv run python "$PROJECT_DIR/src/experiments/exp02_classification.py"
echo ""

# Experiment 3: Latency scaling
echo "--- Experiment 3: Latency Scaling (5/10/20/50 labels) ---"
echo "Models: GLiNER2 vs GLiNER v1 vs ModernBERT GLiNER vs spaCy vs DeBERTa NLI"
uv run python "$PROJECT_DIR/src/experiments/exp03_latency.py"
echo ""

# Experiment 4: Task composition
echo "--- Experiment 4: Task Composition (single-pass vs two-pass) ---"
uv run python "$PROJECT_DIR/src/experiments/exp04_composition.py"
echo ""

# Generate all visualizations
echo "--- Generating Visualizations ---"
uv run python "$PROJECT_DIR/src/analysis/visualize.py"
echo ""

echo "========================================"
echo "All experiments complete!"
echo "End time: $(date)"
echo ""
echo "Results saved to: $PROJECT_DIR/results/"
echo "  ner_results.json"
echo "  classification_results.json"
echo "  latency_results.json"
echo "  composition_results.json"
echo "  latency_scaling.png"
echo "  f1_comparison.png"
echo "  classification_comparison.png"
echo ""
echo "Open the analysis notebook for interactive exploration:"
echo "  uv run jupyter notebook notebooks/gliner2_poc_analysis.ipynb"
echo "========================================"
