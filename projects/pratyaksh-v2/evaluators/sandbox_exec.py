"""Sandbox execution evaluator: runs generated Python in subprocess with timeout."""

import subprocess
import tempfile
import os
from typing import Tuple


def execute_code(code: str, test_assertions: str, timeout: int = 10) -> Tuple[bool, str]:
    """Execute generated code + test assertions in a sandboxed subprocess.
    
    Args:
        code: The generated Python code (should define functions).
        test_assertions: Assert statements to validate the code.
        timeout: Maximum execution time in seconds.
    
    Returns:
        (passed: bool, output: str) — whether all assertions passed and stdout/stderr.
    """
    full_code = f"{code}\n\n# --- Test Assertions ---\n{test_assertions}\nprint('ALL_TESTS_PASSED')"
    
    with tempfile.NamedTemporaryFile(mode='w', suffix='.py', delete=False) as f:
        f.write(full_code)
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
        passed = result.returncode == 0 and 'ALL_TESTS_PASSED' in result.stdout
        
        return passed, output.strip()
    
    except subprocess.TimeoutExpired:
        return False, f"TIMEOUT: Execution exceeded {timeout}s"
    
    except Exception as e:
        return False, f"EXECUTION_ERROR: {str(e)}"
    
    finally:
        os.unlink(tmp_path)


def evaluate(code: str, test_assertions: str, timeout: int = 10) -> float:
    """Return 1.0 if code passes all assertions, 0.0 otherwise."""
    passed, _ = execute_code(code, test_assertions, timeout)
    return 1.0 if passed else 0.0


def evaluate_with_detail(code: str, test_assertions: str, timeout: int = 10) -> dict:
    """Return detailed result including pass/fail, output, and score."""
    passed, output = execute_code(code, test_assertions, timeout)
    return {
        "score": 1.0 if passed else 0.0,
        "passed": passed,
        "output": output[:500]  # Truncate output
    }


def evaluate_batch(results: list, timeout: int = 10) -> float:
    """Average pass rate over batch of (code, test_assertions) tuples."""
    if not results:
        return 0.0
    scores = [evaluate(code, tests, timeout) for code, tests in results]
    return sum(scores) / len(scores)
