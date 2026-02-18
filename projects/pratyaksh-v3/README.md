# Pratyaksh v3 — Evolved Personal LLM Eval Harness

Jay's personal LLM eval harness with use-case-specific eval dimensions and a self-evolving benchmark loop.

## What's New in v3

### 7 Use-Case-Specific Eval Dimensions (D1-D7)

| Dim | Name | UC | Method |
|-----|------|----|--------|
| D1 | Signal Attribution | UC-03 | Opus judge: did model cite ≥2 input features? |
| D2 | Set Invariance | UC-03 | Deterministic: shuffle inputs 3x, measure variance |
| D3 | Citation Fidelity | UC-08 | Deterministic: HTTP check if ArXiv ID resolves |
| D4 | Hop Completeness | UC-01, UC-07 | Opus judge: fraction of required hops covered |
| D5 | Edge Case Survival | UC-04 | Deterministic: adversarial inputs (None, "", [], -1) |
| D6 | Script Convergence | UC-07 | Opus judge: definitive answer vs hedging |
| D7 | Transliteration Guard | UC-05 | Deterministic: Unicode range check for Indic chars |

### 3 New Use Cases

- **UC-07: Trace Audit** — Identify hallucinations and reasoning gaps in DSPy-style agent traces
- **UC-08: Harvest Quality** — Extract paper title + ArXiv ID from abstracts, verify resolution
- **UC-09: Agent Planning** — Generate atomic, dependency-aware multi-step plans

### Self-Evolving Benchmark Loop

After each run, for UC×model pairs scoring < 0.7:
1. Opus generates 3 harder variants targeting the specific failure mode
2. New samples appended to `bench_data/UC-XX/evolved_YYYY-MM-DD.jsonl`
3. Next run automatically includes evolved samples

### Composite Score Formula

```
composite = (quality × 0.6 + dim_avg × 0.4) × (1 / normalized_latency)
```

## Model Roster

| Model | Provider | Notes |
|-------|----------|-------|
| minimaxai/minimax-m2.1 | NVIDIA | 84 TPS, fastest |
| mistralai/devstral-2-123b-instruct-2512 | NVIDIA | 60 TPS, reliable |
| anthropic/claude-sonnet-4.6 | OpenRouter | Best reasoning |
| anthropic/claude-opus-4.6 | OpenRouter | Judge model |

## Usage

```bash
cd pratyaksh-v3
uv run python pratyaksh_v3.py
```

Results written to `results/YYYY-MM-DD.md` and `results/YYYY-MM-DD_raw.json`.

## Architecture

```
pratyaksh-v3/
├── bench_data/
│   ├── UC-01/ through UC-09/
│   └── UC-XX/evolved_*.jsonl (auto-generated)
├── evaluators/
│   ├── exact_match.py, ndcg.py, sandbox_exec.py, llm_judge.py, bleu.py (from v2)
│   ├── set_invariance.py (D2)
│   ├── citation_fidelity.py (D3)
│   ├── edge_case.py (D5)
│   └── transliteration_guard.py (D7)
├── evolution/
│   └── evolve.py
├── pratyaksh_v3.py (main harness)
└── results/
```
