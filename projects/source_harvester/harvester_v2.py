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

    Return the result ONLY as a JSON list of objects. Do not include markdown code blocks or any other text.
    
    TEXT:
    {content[:30000]}  # Truncate if necessary
    """
    
    try:
        response = model.generate_content(prompt)
        # Clean response text (remove markdown blocks)
        text = response.text.strip()
        if text.startswith("```json"):
            text = text[7:-3].strip()
        elif text.startswith("```"):
            text = text[3:-3].strip()
            
        citations = json.loads(text)
        print(f"[+] LLM found {len(citations)} citations.")
        return citations
    except Exception as e:
        print(f"[ERROR] LLM citation discovery failed: {e}")
        return []

def resolve_citation_exa(title, authors):
    print(f"[*] Resolving link for: {title} via Exa...")
    query = f"{title} {authors} pdf paper"
    cmd = f"mcporter call exa.web_search_exa query='{query}' numResults=1"
    output = run_command(cmd)
    
    if output:
        # Basic parsing of mcporter output (assuming it prints URLs)
        match = re.search(r'URL: (https?://[^\s\n]+)', output)
        if match:
            url = match.group(1)
            # Favor PDF links
            if url.endswith('.pdf') or 'arxiv.org/pdf' in url:
                return url
            return url
    return None

def download_and_harvest(input_source, topic, depth=1, seen=None):
    if seen is None:
        seen = set()
    
    if depth < 0 or input_source in seen:
        return
    
    seen.add(input_source)
    
    base_dir = Path(f"/home/node/.openclaw/workspace/Assitant/Research/Harvester/{topic}")
    base_dir.mkdir(parents=True, exist_ok=True)
    
    is_url = input_source.startswith('http')
    
    if is_url:
        print(f"[*] Fetching URL: {input_source}")
        # Use web_fetch to bypass blocks and get clean markdown for discovery
        # But we still want markitdown for the local file if it's a PDF
        if input_source.lower().endswith('.pdf') or 'arxiv.org/pdf' in input_source:
            filename = Path(input_source).name
            if '.' not in filename:
                filename = input_source.split('/')[-1] + ".pdf"
            local_path = base_dir / filename
            subprocess.run(f"curl -L -A 'Mozilla/5.0' '{input_source}' -o '{local_path}'", shell=True)
            md_content = convert_to_md(local_path)
        else:
            # It's a blog post, get clean content via web_fetch bridge
            # Note: We simulate web_fetch logic here since we are in a script
            # For simplicity, we'll try curl with a better header first
            local_path = base_dir / "root_source.html"
            subprocess.run(f"curl -L -A 'Mozilla/5.0' '{input_source}' -o '{local_path}'", shell=True)
            md_content = convert_to_md(local_path)
    else:
        local_path = Path(input_source)
        md_content = convert_to_md(local_path)
    if not md_content:
        return

    md_path = local_path.with_suffix('.md')
    with open(md_path, 'w') as f:
        f.write(md_content)
    print(f"[+] Saved Markdown to {md_path}")

    # LLM Discovery
    citations = discover_citations_llm(md_content)
    for cite in citations:
        url = cite.get('url')
        if not url or not (url.endswith('.pdf') or 'arxiv.org' in url):
            # Try to resolve via Exa
            resolved_url = resolve_citation_exa(cite.get('title', ''), cite.get('authors', ''))
            if resolved_url:
                url = resolved_url
        
        if url and url not in seen:
            download_and_harvest(url, topic, depth - 1, seen)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Gyan-Sanchay v2 (Recursive Harvester)")
    parser.add_argument("source", help="URL or path to PDF/Blog")
    parser.add_argument("--topic", required=True, help="Topic name")
    parser.add_argument("--depth", type=int, default=1, help="Recursion depth")
    
    args = parser.parse_args()
    download_and_harvest(args.source, args.topic, args.depth)
    
    subprocess.run(f"npx openclaw system event --text 'Gyan-Sanchay v2 (LLM-Augmented) finished on {args.topic}' --mode now", shell=True)
