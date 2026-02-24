# AGENTS.md - GLiNER2 POC Project

## Project Purpose

This is a rigorous proof-of-concept evaluation of **GLiNER2**, a 205M-parameter unified information extraction model from Fastino AI. The POC tests four core claims:

1. Multi-task composition (NER + classification) in a single forward pass
2. Competitive accuracy vs specialized baselines at 200M parameter count
3. Superior latency scaling with increasing label counts
4. CPU-first inference viability on Apple Silicon (M-series Mac)

## How to Run

### Prerequisites

Install `uv` if not already installed:
```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
```

Install dependencies (Apple Silicon Mac):
```bash
cd projects/gliner2-poc
uv sync
# Install spaCy model separately (required):
uv run python -m spacy download en_core_web_sm
```

### Running Experiments

Run all experiments in sequence:
```bash
bash scripts/run_all.sh
```

Or run individually:
```bash
uv run python src/experiments/exp01_ner.py
uv run python src/experiments/exp02_classification.py
uv run python src/experiments/exp03_latency.py
uv run python src/experiments/exp04_composition.py
```

### Notebook Analysis
```bash
uv run jupyter notebook notebooks/gliner2_poc_analysis.ipynb
```

## Apple Silicon Notes

- All inference runs CPU-only (no MPS/CUDA). GLiNER2 is designed for CPU.
- DeBERTa NLI baseline uses `cross-encoder/nli-deberta-v3-small` (lighter weight).
- spaCy uses `en_core_web_sm` (tok2vec-based, not transformer, works well on CPU).
- Torch will auto-detect MPS but we explicitly set device to CPU for fair comparison.
- First run downloads models to HuggingFace cache (~2-3 GB total). Subsequent runs use cache.

## Running Individual Baselines

Copy-paste commands to test each baseline in isolation after `uv sync`:

```bash
# GLiNER v1 (original architecture, 209M, DeBERTa backbone)
uv run python -c "
from src.baselines.gliner_v1_baseline import GLiNERV1Baseline
m = GLiNERV1Baseline()
print(m.predict('Yann LeCun works at Meta AI.', ['researcher', 'organisation']))
"

# ModernBERT GLiNER bi-encoder (194M, ModernBERT, 8k context)
uv run python -c "
from src.baselines.modernbert_gliner_baseline import ModernBERTGLiNERBaseline
m = ModernBERTGLiNERBaseline()
print(m.predict('Geoffrey Hinton invented backpropagation.', ['researcher', 'algorithm']))
"

# Flair NER (80MB, BiLSTM-CRF, 4 types only)
uv run python -c "
from src.baselines.flair_baseline import FlairNERBaseline
m = FlairNERBaseline()
print(m.predict('OpenAI released GPT-4 at a conference in San Francisco.'))
"

# SetFit zero-shot classification (sentence-transformers cosine similarity)
uv run python -c "
from src.baselines.setfit_baseline import SetFitZeroShotBaseline
m = SetFitZeroShotBaseline()
print(m.predict('My credit card was declined at checkout.', labels=['card_not_working', 'refund_not_showing_up', 'exchange_rate']))
"

# FastText zero-shot classification (bag-of-words, requires cc.en.300.bin download)
uv run python -c "
from src.baselines.fasttext_baseline import FastTextZeroShotBaseline
m = FastTextZeroShotBaseline()
print(m.predict('The stock market rallied on strong earnings reports.', labels=['World', 'Sports', 'Business', 'Sci/Tech']))
"

# Modern NLI zero-shot (SOTA NLI 2025, DeBERTa-v3-large, 435M)
uv run python -c "
from src.baselines.modernbert_nli_baseline import ModernNLIBaseline
m = ModernNLIBaseline()
print(m.predict('SpaceX launched a new satellite constellation.', labels=['World', 'Sports', 'Business', 'Sci/Tech']))
"
```

## Model Selection Guide

Choose the right model for your use case:

**You need NER + classification in one pass:**
Use GLiNER2 (`fastino/gliner2-base-v1`). It is the only model in this POC that
does both tasks simultaneously. Single forward pass, label-agnostic latency.

**You need zero-shot NER only, with a large label set (>20 types):**
Use ModernBERT GLiNER bi-encoder (`knowledgator/modern-gliner-bi-base-v1.0`).
Bi-encoder caches entity embeddings, so adding labels does not increase latency.
Also the best choice for long documents (8192 token context window).

**You need zero-shot NER only, with a small label set (<20 types):**
Either GLiNER2 or GLiNER v1 (`urchade/gliner_medium-v2.1`) will work well.
GLiNER v1 has a larger accuracy surface for pure NER benchmarks; GLiNER2 is
faster at higher label counts. Test both for your domain.

**You need fast, general-domain NER with fixed entity types:**
Use spaCy `en_core_web_sm` (18 OntoNotes types) or Flair `ner-english-fast`
(4 CoNLL types). Both are sub-10ms on CPU. Not zero-shot: types are fixed.

**You need zero-shot classification with a small label set (<20 labels):**
Modern NLI (`MoritzLaurer/deberta-v3-large-zeroshot-v2.0`) gives the highest
accuracy among NLI baselines. For 4-15 labels on CPU, runtime is acceptable.

**You need zero-shot classification with a large label set (>20 labels):**
Use GLiNER2 or SetFit zero-shot. Both avoid the O(n_labels) NLI penalty.
GLiNER2 will generally be more accurate; SetFit will be slightly faster.

**You need a latency floor for benchmarking:**
Use FastText zero-shot (`cc.en.300.bin`). Sub-millisecond inference, no GPU needed.
Accuracy is low (bag-of-words, no context), but it sets the speed baseline.

## What NOT To Do

- Do NOT modify files under `results/` manually. They are written by experiment scripts.
- Do NOT commit large model files. Models are downloaded at runtime via HuggingFace hub.
- Do NOT push `.gitkeep` replacements or binary artifacts to the repo.
- Do NOT run experiments with GPU/MPS acceleration (defeats the CPU benchmark purpose).
- Do NOT change random seeds mid-experiment (reproducibility depends on fixed seeds).

## Data Sources

| Dataset | HuggingFace ID | Split | Size |
|---------|---------------|-------|------|
| CrossNER AI | `DFKI-SLT/cross_ner` (config: `ai`) | test | 431 examples |
| Banking77 | `PolyAI/banking77` | test | 3,080 examples |
| AG News | `ag_news` | test | 500 examples (sampled) |

Data is loaded at runtime via the `datasets` library. No local data files are committed.

## Expected Outputs

After running all experiments, `results/` will contain:

```
results/
├── ner_results.json          # Entity F1 for GLiNER2 vs spaCy (CrossNER AI)
├── classification_results.json # Accuracy/F1 for GLiNER2 vs DeBERTa NLI
├── latency_results.json      # Latency curves at 5/10/20/50 labels
├── composition_results.json  # Single-pass vs two-pass comparison
├── latency_scaling.png       # Latency curve plot
└── f1_comparison.png         # F1 bar chart comparison
```

## Project Structure

```
gliner2-poc/
├── AGENTS.md                  # This file
├── README.md                  # User-facing documentation
├── requirements.txt           # Pinned dependencies
├── pyproject.toml             # uv project config
├── data/                      # Empty (data loaded at runtime)
├── results/                   # Experiment outputs (written by scripts)
├── src/
│   ├── data_loader.py         # Dataset loading and preprocessing
│   ├── gliner2_model.py       # GLiNER2 wrapper with timing
│   ├── baselines/
│   │   ├── spacy_baseline.py  # spaCy NER baseline
│   │   └── deberta_nli.py     # DeBERTa NLI classification baseline
│   ├── experiments/
│   │   ├── exp01_ner.py       # NER evaluation
│   │   ├── exp02_classification.py # Classification evaluation
│   │   ├── exp03_latency.py   # Latency scaling
│   │   └── exp04_composition.py # Task composition test
│   └── analysis/
│       ├── metrics.py         # Shared metric utilities
│       └── visualize.py       # Visualization functions
├── notebooks/
│   └── gliner2_poc_analysis.ipynb # Full analysis notebook
└── scripts/
    └── run_all.sh             # Run all experiments
```
