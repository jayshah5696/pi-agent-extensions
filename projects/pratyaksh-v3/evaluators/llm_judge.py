"""LLM Judge evaluator: uses Claude Opus 4.6 via OpenRouter to score responses."""

import os
import json
import re
from openai import OpenAI
from dotenv import load_dotenv

load_dotenv("/home/node/.openclaw/workspace/.env")

JUDGE_MODEL = "anthropic/claude-opus-4.6"
OPENROUTER_BASE = "https://openrouter.ai/api/v1"

RUBRIC_PROMPT = """You are an expert evaluator. Score the following response on a scale of 0-10.

## Rubric
- **0-2**: Completely wrong, irrelevant, or harmful
- **3-4**: Partially relevant but major errors or missing key information
- **5-6**: Acceptable but lacks depth, precision, or clarity
- **7-8**: Good response with minor issues
- **9-10**: Excellent, comprehensive, accurate, and well-structured

## Task
{task_description}

## Prompt Given to Model
{prompt}

## Model Response
{response}

## Instructions
Evaluate the response against the rubric. Consider accuracy, completeness, clarity, and relevance.
Respond with ONLY a JSON object: {{"score": <0-10>, "reasoning": "<brief explanation>"}}"""


def get_client() -> OpenAI:
    """Create OpenRouter client."""
    api_key = os.getenv("OPENROUTER_API_KEY")
    if not api_key:
        raise ValueError("OPENROUTER_API_KEY not found in environment")
    return OpenAI(base_url=OPENROUTER_BASE, api_key=api_key)


def judge_response(prompt: str, response: str, task_description: str = "General quality assessment") -> dict:
    """Use Claude Opus as judge to score a response 0-10.
    
    Args:
        prompt: The original prompt given to the model.
        response: The model's response to evaluate.
        task_description: Context about what the task is.
    
    Returns:
        {"score": float, "reasoning": str}
    """
    client = get_client()
    
    eval_prompt = RUBRIC_PROMPT.format(
        task_description=task_description,
        prompt=prompt,
        response=response
    )
    
    try:
        completion = client.chat.completions.create(
            model=JUDGE_MODEL,
            messages=[{"role": "user", "content": eval_prompt}],
            temperature=0.0,
            max_tokens=256,
        )
        
        raw = completion.choices[0].message.content.strip()
        
        # Try to parse JSON from response
        json_match = re.search(r'\{[^}]+\}', raw)
        if json_match:
            result = json.loads(json_match.group())
            return {
                "score": float(result.get("score", 0)),
                "reasoning": result.get("reasoning", "")
            }
        
        # Fallback: try to extract just a number
        num_match = re.search(r'\b(\d+(?:\.\d+)?)\b', raw)
        if num_match:
            return {"score": float(num_match.group(1)), "reasoning": raw}
        
        return {"score": 0.0, "reasoning": f"Could not parse judge response: {raw[:200]}"}
    
    except Exception as e:
        return {"score": 0.0, "reasoning": f"Judge error: {str(e)}"}


def evaluate(prompt: str, response: str, task_description: str = "General quality assessment") -> float:
    """Return normalized score (0-1) from LLM judge."""
    result = judge_response(prompt, response, task_description)
    return result["score"] / 10.0


def evaluate_preference(prompt: str, response_a: str, response_b: str) -> str:
    """Judge which response is preferred. Returns 'a' or 'b'."""
    client = get_client()
    
    pref_prompt = f"""You are an expert evaluator. Given two responses to the same prompt, determine which is better.

## Prompt
{prompt}

## Response A
{response_a}

## Response B
{response_b}

## Instructions
Which response is better overall? Consider accuracy, helpfulness, clarity, and depth.
Respond with ONLY a JSON object: {{"preferred": "a" or "b", "reasoning": "<brief explanation>"}}"""
    
    try:
        completion = client.chat.completions.create(
            model=JUDGE_MODEL,
            messages=[{"role": "user", "content": pref_prompt}],
            temperature=0.0,
            max_tokens=256,
        )
        
        raw = completion.choices[0].message.content.strip()
        json_match = re.search(r'\{[^}]+\}', raw)
        if json_match:
            result = json.loads(json_match.group())
            return result.get("preferred", "a")
        
        # Fallback
        if '"b"' in raw.lower() or "'b'" in raw.lower():
            return "b"
        return "a"
    
    except Exception as e:
        return "a"  # Default on error
