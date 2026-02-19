# NVIDIA Inference Benchmark Report

**Date:** 2026-02-18 12:40:30

## Summary Metrics (Average)
| Model | Avg TTFT (s) | Avg TPS (Gen) | Avg Latency (s) | Success Rate |
| :--- | :--- | :--- | :--- | :--- |
| **minimaxai/minimax-m2.1** | 0.570 | **84.41** | 6.39 | 100% |
| **stepfun-ai/step-3.5-flash** | 0.479 | **47.04** | 3.07 | 100% |
| **z-ai/glm4.7** | 0.452 | **0.00** | 9.23 | 100% |
| **mistralai/devstral-2-123b-instruct-2512** | 0.487 | **59.98** | 4.69 | 100% |
| **moonshotai/kimi-k2.5** | 20.298 | **0.78** | 69.41 | 100% |
| **deepseek-ai/deepseek-v3.2** | 0.644 | **22.82** | 13.51 | 100% |
| **anthropic/claude-sonnet-4.6** | 1.136 | **58.87** | 6.51 | 100% |

## Detailed Run Logs
| Model | Prompt | TTFT | TPS | Tokens | Status |
| :--- | :--- | :--- | :--- | :--- | :--- |
| minimaxai/minimax-m2.1 | Write a concise paragraph expl... | 0.611s | 121.05 | 364 | ✅ |
| minimaxai/minimax-m2.1 | Write a python function to com... | 0.664s | 62.37 | 516 | ✅ |
| minimaxai/minimax-m2.1 | Analyze the following sentimen... | 0.433s | 69.80 | 431 | ✅ |
| stepfun-ai/step-3.5-flash | Write a concise paragraph expl... | 0.697s | 50.03 | 125 | ✅ |
| stepfun-ai/step-3.5-flash | Write a python function to com... | 0.371s | 0.00 | 0 | ✅ |
| stepfun-ai/step-3.5-flash | Analyze the following sentimen... | 0.369s | 91.08 | 232 | ✅ |
| z-ai/glm4.7 | Write a concise paragraph expl... | 0.455s | 0.00 | 0 | ✅ |
| z-ai/glm4.7 | Write a python function to com... | 0.455s | 0.00 | 0 | ✅ |
| z-ai/glm4.7 | Analyze the following sentimen... | 0.447s | 0.00 | 0 | ✅ |
| mistralai/devstral-2-123b-instruct-2512 | Write a concise paragraph expl... | 0.730s | 71.15 | 137 | ✅ |
| mistralai/devstral-2-123b-instruct-2512 | Write a python function to com... | 0.364s | 49.63 | 341 | ✅ |
| mistralai/devstral-2-123b-instruct-2512 | Analyze the following sentimen... | 0.368s | 59.16 | 226 | ✅ |
| moonshotai/kimi-k2.5 | Write a concise paragraph expl... | 36.557s | 0.00 | 0 | ✅ |
| moonshotai/kimi-k2.5 | Write a python function to com... | 18.892s | 0.51 | 32 | ✅ |
| moonshotai/kimi-k2.5 | Analyze the following sentimen... | 5.445s | 1.84 | 70 | ✅ |
| deepseek-ai/deepseek-v3.2 | Write a concise paragraph expl... | 0.490s | 16.25 | 125 | ✅ |
| deepseek-ai/deepseek-v3.2 | Write a python function to com... | 0.827s | 28.72 | 509 | ✅ |
| deepseek-ai/deepseek-v3.2 | Analyze the following sentimen... | 0.614s | 23.49 | 310 | ✅ |
| anthropic/claude-sonnet-4.6 | Write a concise paragraph expl... | 1.150s | 48.00 | 217 | ✅ |
| anthropic/claude-sonnet-4.6 | Write a python function to com... | 0.881s | 88.74 | 418 | ✅ |
| anthropic/claude-sonnet-4.6 | Analyze the following sentimen... | 1.378s | 39.86 | 274 | ✅ |
