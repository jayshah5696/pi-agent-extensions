# DATA_DICTIONARY.md - LLM Evaluation

## Data Sources
| Source | Type | Description |
| :--- | :--- | :--- |
| **Traces** | `jsonl` | Raw LLM input/output logs from sessions. |
| **Benchmarks** | `csv` | Standardized test sets (MMLU, GSM8K). |
| **Eval Results** | `json` | Scores and judge rationales. |

## Key Metrics
| Metric | Definition |
| :--- | :--- |
| **Faithfulness** | How well the answer is grounded in the retrieved context. |
| **Relevancy** | How well the answer addresses the user prompt. |
| **Latency** | Time to first token / total generation time. |
