# GLiNER2 POC Evaluation

A rigorous proof-of-concept experiment evaluating **GLiNER2**, a 205M-parameter unified information extraction model from Fastino AI. This POC benchmarks GLiNER2's core claims against specialized baselines on three public datasets.

## What is GLiNER2?

GLiNER2 is a unified multi-task model that performs Named Entity Recognition (NER), text classification, and structured data extraction in a **single forward pass** using a schema-driven interface. Unlike traditional pipelines that require separate specialized models, GLiNER2 uses one 205M-parameter encoder to handle all tasks simultaneously.

**Paper:** [GLiNER2: An Efficient Multi-Task Information Extraction System](https://arxiv.org/abs/2507.18546) (EMNLP 2025)
**GitHub:** [fastino-ai/GLiNER2](https://github.com/fastino-ai/GLiNER2)
**Models:** `fastino/gliner2-base-v1` (205M), `fastino/gliner2-large-v1` (340M)

## What This POC Tests

| Claim | Experiment | Dataset |
|-------|-----------|---------|
| Competitive NER accuracy | Exp 01: Zero-shot NER | CrossNER AI (431 examples) |
| Competitive classification | Exp 02: Zero-shot classification | Banking77 + AG News |
| Latency scaling advantage | Exp 03: Latency vs label count | 100 examples, 5/10/20/50 labels |
| Multi-task composition | Exp 04: Single pass vs two passes | 100 CrossNER examples |

## Setup

### Requirements

- macOS with Apple Silicon (M-series) or Intel Mac
- Python 3.10+
- `uv` package manager

### Install uv

```bash
curl -LsSf https://astral.sh/uv/install.sh | sh
source $HOME/.local/bin/env  # or restart shell
```

### Install Project Dependencies

```bash
cd projects/gliner2-poc
uv sync
```

### Download spaCy Model

```bash
uv run python -m spacy download en_core_web_sm
```

### Apple Silicon Notes

- All inference runs **CPU-only** for fair comparison. GLiNER2 is designed for CPU.
- `torch` will detect Apple MPS but experiments explicitly use CPU device.
- First run downloads models to `~/.cache/huggingface/` (~2-3 GB total).
- DeBERTa baseline uses `cross-encoder/nli-deberta-v3-small` (lighter, faster on CPU).
- spaCy uses `en_core_web_sm` (tok2vec-based, no transformer dependency needed).

## Running Experiments

### All Experiments (Recommended)

```bash
bash scripts/run_all.sh
```

Estimated total runtime: 4-6 hours on CPU.

### Individual Experiments

```bash
# Experiment 1: NER evaluation on CrossNER AI
uv run python src/experiments/exp01_ner.py

# Experiment 2: Classification on Banking77 + AG News
uv run python src/experiments/exp02_classification.py

# Experiment 3: Latency scaling (5/10/20/50 labels)
uv run python src/experiments/exp03_latency.py

# Experiment 4: Task composition (single vs two passes)
uv run python src/experiments/exp04_composition.py
```

### Full Analysis Notebook

```bash
uv run jupyter notebook notebooks/gliner2_poc_analysis.ipynb
```

The notebook provides interactive visualizations and error analysis after experiments complete.

## Expected Outputs

After all experiments complete, `results/` will contain:

```
results/
├── ner_results.json            # Entity F1: GLiNER2 vs spaCy (CrossNER AI)
├── classification_results.json # Accuracy/F1: GLiNER2 vs DeBERTa NLI
├── latency_results.json        # Latency curves at 5/10/20/50 labels
├── composition_results.json    # Single-pass vs two-pass comparison
├── latency_scaling.png         # Latency curve visualization
└── f1_comparison.png           # F1 bar chart comparison
```

### Performance Baselines (from GLiNER2 paper)

| Task | GLiNER2 | Baseline |
|------|---------|----------|
| Banking77 accuracy | ~70% | DeBERTa NLI ~42% |
| AG News accuracy | ~74% | DeBERTa NLI ~68% |
| CrossNER F1 | ~54% | spaCy en_core_web_sm varies |

## Interpreting Results

### NER: Entity F1 (ner_results.json)
- F1 = harmonic mean of precision and recall at entity level (exact span match required)
- CrossNER AI domain: expect GLiNER2 ~50-60%, spaCy ~10-20% (domain mismatch), GLiNER v1 ~45-55%, ModernBERT GLiNER ~55-65%
- spaCy's low score is EXPECTED: it is trained on OntoNotes (newswire), not AI research text
- A score >50% F1 zero-shot on domain-specific NER is strong
- seqeval strict mode: partial matches count as wrong

### Classification: Accuracy + Macro F1 (classification_results.json)
- AG News (4 labels): Easy. Expect GLiNER2 ~74%, DeBERTa NLI ~68%, FastText ~50-60%
- Banking77 (77 labels): Hard. Expect GLiNER2 ~70%, DeBERTa NLI skipped by default (too slow)
- Macro F1 penalizes class imbalance. For Banking77 (balanced), Macro F1 is approximately equal to Accuracy

### Latency (latency_results.json)
- Measured as wall-clock ms per example (CPU, single-threaded)
- GLiNER2 key claim: latency is O(1) w.r.t. label count. Should be nearly flat across 5/10/20/50 labels
- GLiNER v1 (uni-encoder): latency grows with label count (labels co-encoded with text)
- ModernBERT GLiNER (bi-encoder): near O(1) like GLiNER2, entity embeddings cached
- FastText: sub-1ms regardless of label count (bag-of-words)
- DeBERTa NLI: O(n_labels) -- runs one forward pass per label

### Composition (composition_results.json)
- Compares single forward pass (NER + classification together) vs two sequential passes
- Expected: single-pass latency < sum of two separate passes
- If single-pass is NOT faster, it suggests the composition overhead outweighs the benefit for small schemas

## Datasets

| Dataset | HuggingFace ID | Task | Size Used |
|---------|---------------|------|-----------|
| CrossNER AI | `DFKI-SLT/cross_ner` (config: `ai`) | Zero-shot NER | 431 test examples |
| Banking77 | `PolyAI/banking77` | Intent classification | 3,080 test examples |
| AG News | `ag_news` | Topic classification | 500 test examples (sampled) |

## Baselines

**NER Baseline:** spaCy `en_core_web_sm` with entity type mapping to CrossNER schema. Note: spaCy is trained on OntoNotes (general NER), not AI domain NER, so direct comparison is not perfectly fair; it tests domain adaptation.

**Classification Baseline:** `cross-encoder/nli-deberta-v3-small` via HuggingFace zero-shot pipeline. This represents the standard zero-shot classification approach before GLiNER2.

## Project Structure

```
gliner2-poc/
├── AGENTS.md                   # Agent/developer instructions
├── README.md                   # This file
├── requirements.txt            # Pinned dependencies
├── pyproject.toml              # uv project config
├── data/                       # Placeholder (data loaded at runtime)
├── results/                    # Experiment outputs
├── src/
│   ├── data_loader.py          # Dataset loading and preprocessing
│   ├── gliner2_model.py        # GLiNER2 wrapper with timing
│   ├── baselines/
│   │   ├── spacy_baseline.py   # spaCy NER baseline
│   │   └── deberta_nli.py      # DeBERTa NLI baseline
│   ├── experiments/
│   │   ├── exp01_ner.py        # NER evaluation
│   │   ├── exp02_classification.py
│   │   ├── exp03_latency.py
│   │   └── exp04_composition.py
│   └── analysis/
│       ├── metrics.py          # Metric utilities
│       └── visualize.py        # Visualization functions
├── notebooks/
│   └── gliner2_poc_analysis.ipynb
└── scripts/
    └── run_all.sh
```

## Known Limitations

1. **Context window:** GLiNER2 has a 2048 token limit. Inputs are truncated to 1800 tokens.
2. **Label sensitivity:** Performance depends on exact label phrasing. Labels match paper terminology.
3. **Domain mismatch:** spaCy `en_core_web_sm` is general-domain NER vs CrossNER's AI domain.
4. **Banking77 scale:** 77 labels with DeBERTa NLI scales poorly (NLI runs per-label).
5. **No GPU benchmark:** This POC is CPU-only by design.

## Citation

```bibtex
@inproceedings{zaratiana2025gliner2,
  title={GLiNER2: An Efficient Multi-Task Information Extraction System with Schema-Driven Interface},
  author={Zaratiana, Urchade and Pasternak, Gil and Boyd, Oliver and Hurn-Maloney, George and Lewis, Ash},
  booktitle={Proceedings of the 2025 Conference on Empirical Methods in Natural Language Processing: System Demonstrations},
  pages={130--140},
  year={2025}
}
```
