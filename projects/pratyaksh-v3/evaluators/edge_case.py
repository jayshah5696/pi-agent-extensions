"""D5: Edge Case Survival evaluator — adversarial input runner.

After the happy-path sandbox_exec passes, run 3 adversarial inputs
(None, empty string/list, negative int) and check for crashes.

Score: fraction of adversarial cases that don't raise exceptions.
"""

import subprocess
import tempfile
import os
from typing import Tuple


ADVERSARIAL_INPUTS = [
    ("None", "None"),
    ("empty_string", '""'),
    ("empty_list", "[]"),
    ("negative_int", "-1"),
]


def run_adversarial(code: str, func_name: str, adversarial_value: str,
                    timeout: int = 5) -> Tuple[bool, str]:
    """Run the generated code with an adversarial input.
    
    Returns (survived: bool, output: str).
    Survived = didn't raise an unhandled exception.
    """
    test_code = f"""{code}

# Adversarial test
try:
    result = {func_name}({adversarial_value})
    print(f"SURVIVED: {{result}}")
except (TypeError, ValueError, IndexError, KeyError, ZeroDivisionError, AttributeError) as e:
    # Expected graceful handling — counts as survival if it's a handled error
    print(f"HANDLED_ERROR: {{type(e).__name__}}: {{e}}")
except Exception as e:
    print(f"CRASH: {{type(e).__name__}}: {{e}}")
"""
    
    with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
        f.write(test_code)
        tmp_path = f.name
    
    try:
        result = subprocess.run(
            ['python3', tmp_path],
            capture_output=True,
            text=True,
            timeout=timeout,
            env={**os.environ, 'PYTHONDONTWRITEBYTECODE': '1'}
        )
        
        output = result.stdout + result.stderr
        
        # Survived if no crash and process didn't segfault
        if result.returncode == 0:
            if 'CRASH' in result.stdout:
                return False, output.strip()
            return True, output.strip()
        else:
            return False, output.strip()
    
    except subprocess.TimeoutExpired:
        return False, f"TIMEOUT: Exceeded {timeout}s"
    except Exception as e:
        return False, f"EXECUTION_ERROR: {str(e)}"
    finally:
        os.unlink(tmp_path)


def extract_func_name(code: str) -> str | None:
    """Try to extract the main function/class name from generated code."""
    import re
    
    # Look for function definitions
    funcs = re.findall(r'^def\s+(\w+)\s*\(', code, re.MULTILINE)
    if funcs:
        return funcs[0]
    
    # Look for class definitions
    classes = re.findall(r'^class\s+(\w+)\s*[\(:]', code, re.MULTILINE)
    if classes:
        return classes[0]
    
    return None


def evaluate(code: str, func_name: str | None = None) -> float:
    """Run adversarial inputs against generated code.
    
    Returns fraction of adversarial cases that survived (0.0 to 1.0).
    """
    if func_name is None:
        func_name = extract_func_name(code)
    
    if func_name is None:
        return 0.0  # Can't test without a function name
    
    survived = 0
    total = len(ADVERSARIAL_INPUTS)
    
    for name, value in ADVERSARIAL_INPUTS:
        ok, output = run_adversarial(code, func_name, value)
        if ok:
            survived += 1
    
    return survived / total if total > 0 else 0.0


def evaluate_with_detail(code: str, func_name: str | None = None) -> dict:
    """Run adversarial inputs and return detailed results."""
    if func_name is None:
        func_name = extract_func_name(code)
    
    if func_name is None:
        return {
            "score": 0.0,
            "func_name": None,
            "results": {},
            "error": "Could not extract function name",
        }
    
    results = {}
    survived = 0
    
    for name, value in ADVERSARIAL_INPUTS:
        ok, output = run_adversarial(code, func_name, value)
        results[name] = {"survived": ok, "output": output[:200]}
        if ok:
            survived += 1
    
    return {
        "score": survived / len(ADVERSARIAL_INPUTS),
        "func_name": func_name,
        "results": results,
    }
