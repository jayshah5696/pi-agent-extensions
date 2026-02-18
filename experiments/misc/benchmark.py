import asyncio
import time
import os
import json
from openai import AsyncOpenAI

# Models to benchmark
MODELS = [
    "minimaxai/minimax-m2.1",
    "stepfun-ai/step-3.5-flash",
    "z-ai/glm4.7",
    "mistralai/devstral-2-123b-instruct-2512",
    "moonshotai/kimi-k2.5",
    "deepseek-ai/deepseek-v3.2"
]

API_KEY = os.environ.get("NVIDIA_API_KEY")
BASE_URL = "https://integrate.api.nvidia.com/v1"

async def benchmark_model(client, model_name):
    prompt = "Write a short story about a robot learning to paint."
    
    start_time = time.perf_counter()
    ttft = None
    total_tokens = 0
    
    try:
        response = await client.chat.completions.create(
            model=model_name,
            messages=[{"role": "user", "content": prompt}],
            stream=True,
            max_tokens=256
        )
        
        async for chunk in response:
            if ttft is None:
                ttft = time.perf_counter() - start_time
            
            if chunk.choices and chunk.choices[0].delta.content:
                # This is a rough estimation of tokens by counting chunks if usage is not provided
                total_tokens += 1 

        end_time = time.perf_counter()
        total_latency = end_time - start_time
        tps = total_tokens / total_latency if total_latency > 0 else 0
        
        return {
            "model": model_name,
            "ttft": ttft,
            "total_latency": total_latency,
            "tps": tps,
            "status": "success"
        }
    except Exception as e:
        print(f"Error benchmarking {model_name}: {e}")
        return {
            "model": model_name,
            "error": str(e),
            "status": "failed"
        }

async def main():
    if not API_KEY:
        print("Error: NVIDIA_API_KEY not found in environment.")
        return

    client = AsyncOpenAI(api_key=API_KEY, base_url=BASE_URL)
    
    print(f"Starting benchmarks for {len(MODELS)} models...")
    tasks = [benchmark_model(client, model) for model in MODELS]
    results = await asyncio.gather(*tasks)
    
    # Generate results.md
    with open("results.md", "w") as f:
        f.write("# NVIDIA Inference Benchmarks\n\n")
        f.write(f"Date: {time.strftime('%Y-%m-%d %H:%M:%S')}\n\n")
        f.write("| Model | TTFT (s) | Total Latency (s) | TPS (Tokens/sec) | Status |\n")
        f.write("| :--- | :--- | :--- | :--- | :--- |\n")
        
        for r in results:
            if r["status"] == "success":
                f.write(f"| {r['model']} | {r['ttft']:.3f} | {r['total_latency']:.3f} | {r['tps']:.2f} | ✅ |\n")
            else:
                f.write(f"| {r['model']} | - | - | - | ❌ ({r['error']}) |\n")
    
    print("Benchmarks completed. Results saved to results.md")

if __name__ == "__main__":
    asyncio.run(main())
