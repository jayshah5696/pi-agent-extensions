import asyncio
import time
import os
import json
import logging
from datetime import datetime
from openai import AsyncOpenAI
from transformers import AutoTokenizer
import tiktoken

# Configure logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# --- Configuration ---
NVIDIA_API_KEY = os.environ.get("NVIDIA_API_KEY")
OPENROUTER_API_KEY = os.environ.get("OPENROUTER_API_KEY")

PROVIDERS = {
    "nvidia": {
        "base_url": "https://integrate.api.nvidia.com/v1",
        "api_key": NVIDIA_API_KEY,
        "models": [
            "minimaxai/minimax-m2.1",
            "stepfun-ai/step-3.5-flash",
            "z-ai/glm4.7",
            "mistralai/devstral-2-123b-instruct-2512",
            "moonshotai/kimi-k2.5",
            "deepseek-ai/deepseek-v3.2"
        ]
    },
    "openrouter": {
        "base_url": "https://openrouter.ai/api/v1",
        "api_key": OPENROUTER_API_KEY,
        "models": [
            "anthropic/claude-sonnet-4.6"
        ]
    }
}

PROMPTS = [
    {"role": "user", "content": "Write a concise paragraph explaining quantum entanglement."},
    {"role": "user", "content": "Write a python function to compute the Fibonacci sequence recursively with memoization."},
    {"role": "user", "content": "Analyze the following sentiment: 'The product was okay, but the delivery was late and the packaging was damaged.'"}
]

# --- Tokenizer Setup ---
# Use GPT-4 tokenizer (cl100k_base) as a standard proxy for all models to ensure comparable metrics
# This avoids downloading huge model-specific tokenizers for every single model.
enc = tiktoken.get_encoding("cl100k_base")

def count_tokens(text: str) -> int:
    return len(enc.encode(text))

async def benchmark_model(client: AsyncOpenAI, model_name: str, prompt_data: list):
    """
    Benchmarks a single model against a specific prompt.
    Returns metrics: TTFT, Total Latency, Output Tokens, TPS.
    """
    start_time = time.perf_counter()
    ttft = None
    full_response_text = ""
    
    try:
        response = await client.chat.completions.create(
            model=model_name,
            messages=prompt_data,
            stream=True,
            max_tokens=512,
            temperature=0.7 
        )
        
        async for chunk in response:
            if ttft is None:
                ttft = time.perf_counter() - start_time
            
            if not chunk.choices:
                continue
                
            content = chunk.choices[0].delta.content
            if content:
                full_response_text += content

        end_time = time.perf_counter()
        total_latency = end_time - start_time
        
        # Accurate token counting
        output_tokens = count_tokens(full_response_text)
        
        # Avoid division by zero
        if total_latency == 0:
            tps = 0
        else:
            # TPS calculation: Generation TPS (Tokens / (Total - TTFT))
            gen_time = total_latency - (ttft if ttft else 0)
            tps = output_tokens / gen_time if gen_time > 0 else 0

        logger.info(f"[{model_name}] Success: {output_tokens} tokens in {total_latency:.2f}s (TPS: {tps:.2f})")
        
        return {
            "model": model_name,
            "ttft": ttft,
            "total_latency": total_latency,
            "output_tokens": output_tokens,
            "tps": tps,
            "status": "success",
            "prompt_preview": prompt_data[0]['content'][:30]
        }

    except Exception as e:
        logger.error(f"[{model_name}] Failed: {e}")
        return {
            "model": model_name,
            "error": str(e),
            "status": "failed"
        }

async def main():
    all_results = []
    
    # Iterate over providers and their specific models
    tasks = []
    
    for provider_name, config in PROVIDERS.items():
        if not config["api_key"]:
            logger.warning(f"Skipping provider {provider_name}: API Key missing.")
            continue
            
        logger.info(f"Preparing benchmarks for {provider_name}...")
        client = AsyncOpenAI(api_key=config["api_key"], base_url=config["base_url"])
        
        for model in config["models"]:
            for prompt in PROMPTS:
                tasks.append(benchmark_model(client, model, [prompt]))
    
    logger.info(f"Starting {len(tasks)} benchmark tasks...")
    results = await asyncio.gather(*tasks)
    
    # Aggregation
    model_stats = {}
    
    for r in results:
        m = r.get("model")
        if m not in model_stats:
            model_stats[m] = {"tps": [], "ttft": [], "latency": [], "errors": 0, "success": 0}
        
        if r["status"] == "success":
            model_stats[m]["tps"].append(r["tps"])
            model_stats[m]["ttft"].append(r["ttft"])
            model_stats[m]["latency"].append(r["total_latency"])
            model_stats[m]["success"] += 1
        else:
            model_stats[m]["errors"] += 1

    # Generate Markdown Report
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    report = f"# NVIDIA Inference Benchmark Report\n\n**Date:** {timestamp}\n\n"
    
    report += "## Summary Metrics (Average)\n"
    report += "| Model | Avg TTFT (s) | Avg TPS (Gen) | Avg Latency (s) | Success Rate |\n"
    report += "| :--- | :--- | :--- | :--- | :--- |\n"
    
    for model, stats in model_stats.items():
        if stats["success"] > 0:
            avg_tps = sum(stats["tps"]) / len(stats["tps"])
            avg_ttft = sum(stats["ttft"]) / len(stats["ttft"])
            avg_lat = sum(stats["latency"]) / len(stats["latency"])
            success_rate = (stats["success"] / (stats["success"] + stats["errors"])) * 100
            
            report += f"| **{model}** | {avg_ttft:.3f} | **{avg_tps:.2f}** | {avg_lat:.2f} | {success_rate:.0f}% |\n"
        else:
            report += f"| {model} | - | - | - | 0% |\n"

    report += "\n## Detailed Run Logs\n"
    report += "| Model | Prompt | TTFT | TPS | Tokens | Status |\n"
    report += "| :--- | :--- | :--- | :--- | :--- | :--- |\n"
    
    for r in results:
        if r["status"] == "success":
            report += f"| {r['model']} | {r['prompt_preview']}... | {r['ttft']:.3f}s | {r['tps']:.2f} | {r['output_tokens']} | ✅ |\n"
        else:
            report += f"| {r['model']} | - | - | - | - | ❌ {r.get('error', '')} |\n"

    with open("results.md", "w") as f:
        f.write(report)
        
    logger.info("Benchmarks completed. Saved to results.md")

if __name__ == "__main__":
    asyncio.run(main())
