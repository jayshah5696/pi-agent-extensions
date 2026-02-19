# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "google-generativeai>=0.8.6",
# ]
# ///
import os
import re
import sys
import subprocess
import argparse
import json
from pathlib import Path
import google.generativeai as genai

# Load environment variables
def load_env():
    env_path = Path("/home/node/.openclaw/workspace/.env")
    if env_path.exists():
        with open(env_path) as f:
            for line in f:
                if "=" in line and not line.startswith("#"):
                    key, value = line.strip().split("=", 1)
                    os.environ[key] = value

load_env()
GEMINI_API_KEY = os.getenv("GEMINI_API_KEY")

if GEMINI_API_KEY:
    genai.configure(api_key=GEMINI_API_KEY)

def run_command(cmd, shell=True):
    result = subprocess.run(cmd, shell=shell, capture_output=True, text=True)
    if result.returncode != 0:
        print(f"Error running command: {cmd}")
        print(result.stderr)
        return None
    return result.stdout

def convert_to_md(input_path):
    print(f"[*] Converting {input_path} to Markdown...")
    cmd = f"uv run --with 'markitdown[all]' markitdown '{input_path}'"
    return run_command(cmd)

def discover_citations_llm(content):
    print("[*] Using Gemini to discover citations...")
    model = genai.GenerativeModel('gemini-2.0-flash')
    
    prompt = f"""
    Extract a comprehensive list of all academic research papers and technical blog posts cited in the following text.
    For each citation, provide:
    - title: The full title of the paper or post.
    - authors: Key authors if available.
    - arxiv_id: The ArXiv ID (e.g., 2507.17746) if applicable.
    - url: The direct URL to the PDF or the blog post if mentioned.

    Return the result ONLY as a JSON list of objects. No markdown, no explanation, just the JSON list.
    
    TEXT:
    {content[:30000]}
    """
    
    try:
        response = model.generate_content(prompt)
        text = response.text.strip()
        
        # Robust extraction: find first JSON array in response
        import re
        match = re.search(r'\[.*?\]', text, re.DOTALL)
        if match:
            citations = json.loads(match.group(0))
        else:
            # Last resort: try to parse the whole thing
            citations = json.loads(text)
            
        print(f"[+] LLM found {len(citations)} citations.")
        return citations
    except Exception as e:
        print(f"[ERROR] LLM citation discovery failed: {e}")
        return []

def resolve_citation_exa(title, authors):
    print(f"[*] Resolving link for: {title} via Exa...")
    query = f"{title} {authors} arxiv pdf"
    cmd = f'mcporter call exa.web_search_exa --arg query="{query}" --arg numResults=3 --arg type="auto"'
    output = run_command(cmd)
    
    if output:
        # Look for arxiv URLs specifically
        arxiv_match = re.search(r'(https?://arxiv\.org/(?:abs|pdf)/[\d\.]+)', output)
        if arxiv_match:
            return arxiv_match.group(1)
        # Fall back to any URL
        url_match = re.search(r'(https?://[^\s\n"]+\.pdf)', output)
        if url_match:
            return url_match.group(1)
        # Any URL
        any_url = re.search(r'https?://[^\s\n"]+', output)
        if any_url:
            return any_url.group(0)
    return None

def url_to_filename(url: str) -> str:
    """Generate a safe filename from a URL."""
    # Extract ArXiv ID if present
    arxiv_match = re.search(r'arxiv\.org/(?:abs|pdf)/([\d\.]+)', url)
    if arxiv_match:
        return arxiv_match.group(1)
    # Use last path segment, strip query params
    name = url.rstrip('/').split('/')[-1].split('?')[0]
    # Sanitize
    name = re.sub(r'[^\w\-.]', '_', name)
    return name or 'source'


def download_and_harvest(input_source, topic, depth=1, seen=None, is_root=False):
    if seen is None:
        seen = set()
        is_root = True

    if depth < 0 or input_source in seen:
        return

    seen.add(input_source)

    base_dir = Path(f"/home/node/.openclaw/workspace/Assitant/Research/Harvester/{topic}")
    base_dir.mkdir(parents=True, exist_ok=True)

    is_url = input_source.startswith('http')

    if is_url:
        print(f"[*] Fetching URL: {input_source}")
        is_pdf = input_source.lower().endswith('.pdf') or 'arxiv.org/pdf' in input_source

        if is_pdf:
            arxiv_match = re.search(r'([\d]{4}\.\d+)', input_source)
            stem = arxiv_match.group(1) if arxiv_match else url_to_filename(input_source)
            local_path = base_dir / f"{stem}.pdf"
            subprocess.run(f"curl -L -A 'Mozilla/5.0' '{input_source}' -o '{local_path}'", shell=True)
            md_content = convert_to_md(local_path)
        else:
            # Blog / ArXiv abs page
            stem = "root" if is_root else url_to_filename(input_source)
            local_path = base_dir / f"{stem}.html"
            subprocess.run(f"curl -L -A 'Mozilla/5.0' '{input_source}' -o '{local_path}'", shell=True)
            md_content = convert_to_md(local_path)
    else:
        local_path = Path(input_source)
        stem = local_path.stem
        md_content = convert_to_md(local_path)

    if not md_content:
        return

    md_path = local_path.with_suffix('.md')
    with open(md_path, 'w') as f:
        f.write(md_content)
    print(f"[+] Saved Markdown to {md_path}")

    # Only extract + recurse citations from root source
    if depth <= 0:
        return

    citations = discover_citations_llm(md_content)
    for cite in citations:
        url = cite.get('url')
        # Only follow ArXiv PDFs (not blog posts / general URLs) to avoid infinite loops
        if url and 'arxiv.org' in url:
            # Prefer PDF link
            if '/abs/' in url:
                url = url.replace('/abs/', '/pdf/')
            if url not in seen:
                download_and_harvest(url, topic, depth - 1, seen, is_root=False)
        elif not url:
            # Try Exa only for papers without a direct URL
            arxiv_id = cite.get('arxiv_id', '').strip()
            if arxiv_id:
                url = f"https://arxiv.org/pdf/{arxiv_id}"
                if url not in seen:
                    download_and_harvest(url, topic, depth - 1, seen, is_root=False)
            else:
                resolved_url = resolve_citation_exa(cite.get('title', ''), cite.get('authors', ''))
                if resolved_url and 'arxiv.org' in resolved_url and resolved_url not in seen:
                    download_and_harvest(resolved_url, topic, depth - 1, seen, is_root=False)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Gyan-Sanchay v2 (Recursive Harvester)")
    parser.add_argument("source", help="URL or path to PDF/Blog")
    parser.add_argument("--topic", required=True, help="Topic name")
    parser.add_argument("--depth", type=int, default=1, help="Recursion depth")
    
    args = parser.parse_args()
    download_and_harvest(args.source, args.topic, args.depth)
    
    subprocess.run(f"npx openclaw system event --text 'Gyan-Sanchay v2 (LLM-Augmented) finished on {args.topic}' --mode now", shell=True)
