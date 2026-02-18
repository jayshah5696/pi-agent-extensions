"""D3: Citation Fidelity evaluator — deterministic HTTP check.

Given a model's extracted ArXiv ID, verify it actually resolves.
Score: 1.0 if HTTP 200, 0.0 if 404/error.
"""

import re
import requests


def extract_arxiv_id(response: str) -> str | None:
    """Extract ArXiv ID from model response.
    
    Handles formats like:
    - 2409.19256
    - arXiv:2409.19256
    - arxiv.org/abs/2409.19256
    - 2409.19256v2
    """
    patterns = [
        r'(?:arXiv[:\s]*)?(\d{4}\.\d{4,5}(?:v\d+)?)',
        r'arxiv\.org/abs/(\d{4}\.\d{4,5}(?:v\d+)?)',
    ]
    
    for pattern in patterns:
        match = re.search(pattern, response, re.IGNORECASE)
        if match:
            arxiv_id = match.group(1)
            # Strip version suffix for resolution check
            base_id = re.sub(r'v\d+$', '', arxiv_id)
            return base_id
    
    return None


def check_arxiv_resolves(arxiv_id: str, timeout: int = 5) -> bool:
    """Check if an ArXiv ID resolves to a real paper."""
    url = f"https://arxiv.org/abs/{arxiv_id}"
    try:
        resp = requests.head(url, timeout=timeout, allow_redirects=True)
        return resp.status_code == 200
    except (requests.RequestException, Exception):
        return False


def evaluate(response: str, expected_arxiv_id: str | None = None) -> float:
    """Evaluate citation fidelity.
    
    If expected_arxiv_id is provided, check exact match first.
    Then verify the extracted ID resolves on ArXiv.
    
    Returns:
        1.0 if the extracted ID resolves
        0.0 if it doesn't or can't be extracted
    """
    extracted = extract_arxiv_id(response)
    
    if not extracted:
        return 0.0
    
    # Check if it resolves
    if check_arxiv_resolves(extracted):
        return 1.0
    
    return 0.0


def evaluate_exact(response: str, expected_arxiv_id: str) -> dict:
    """Evaluate both extraction accuracy and resolution.
    
    Returns dict with:
        - id_match: whether extracted ID matches expected
        - resolves: whether extracted ID resolves on ArXiv
        - score: 1.0 if resolves, 0.0 otherwise
        - extracted_id: what was extracted
    """
    extracted = extract_arxiv_id(response)
    
    if not extracted:
        return {
            "id_match": False,
            "resolves": False,
            "score": 0.0,
            "extracted_id": None,
        }
    
    expected_base = re.sub(r'v\d+$', '', expected_arxiv_id)
    id_match = extracted == expected_base
    resolves = check_arxiv_resolves(extracted)
    
    return {
        "id_match": id_match,
        "resolves": resolves,
        "score": 1.0 if resolves else 0.0,
        "extracted_id": extracted,
    }
