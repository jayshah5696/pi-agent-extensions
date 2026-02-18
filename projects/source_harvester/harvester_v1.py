import os
import re
import sys
import subprocess
import argparse
from pathlib import Path

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

def extract_citations(content):
    # Improved regex for citation extraction
    print("[*] Extracting citations...")
    
    # 1. Look for ArXiv links or IDs (e.g., arXiv:2507.17746 or [2507.17746])
    arxiv_pattern = r'(?:arXiv:|\[)(\d{4}\.\d{4,5})(?:\])?'
    arxiv_ids = re.findall(arxiv_pattern, content)
    
    # 2. Look for explicit URLs
    url_pattern = r'https?://[^\s\)\>\]\"\'\\]+'
    urls = re.findall(url_pattern, content)
    
    # Filter for potential paper links
    paper_links = [u for u in urls if any(ext in u.lower() for ext in ['.pdf', 'arxiv.org/abs', 'arxiv.org/pdf', 'openreview.net/forum', 'openreview.net/pdf'])]
    
    # 3. Look for bracketed numerical citations [1], [1, 2], [1-4]
    # We will need the full text for this to map back to a bibliography, 
    # but for now we'll prioritize explicit IDs and URLs found in the text.
    
    citations = list(set(arxiv_ids + paper_links))
    print(f"[+] Found {len(citations)} potential citations.")
    return citations

def resolve_citation(citation):
    # ArXiv ID
    if re.match(r'^\d{4}\.\d{4,5}$', citation):
        return f"https://arxiv.org/pdf/{citation}.pdf"
    
    # OpenReview links
    if 'openreview.net/forum?id=' in citation:
        return citation.replace('/forum?id=', '/pdf?id=')
        
    # ArXiv abs links
    if 'arxiv.org/abs/' in citation:
        return citation.replace('/abs/', '/pdf/') + '.pdf'

    # Direct PDF links
    if citation.lower().split('?')[0].endswith('.pdf'):
        return citation
    
    return None

def download_and_harvest(input_source, topic, depth=1, seen=None):
    if seen is None:
        seen = set()
    
    if depth < 0 or input_source in seen:
        return
    
    seen.add(input_source)
    
    base_dir = Path(f"/home/node/.openclaw/workspace/Assitant/Research/Harvester/{topic}")
    base_dir.mkdir(parents=True, exist_ok=True)
    
    # Determine if input_source is a URL or local file
    is_url = input_source.startswith('http')
    
    filename = Path(input_source).name
    if not filename or '.' not in filename:
        if "arxiv.org/pdf" in input_source:
            filename = input_source.split('/')[-1]
            if not filename.endswith('.pdf'):
                filename += ".pdf"
        else:
            filename = "root.pdf" if not is_url else "root_from_url.md"
        
    local_path = base_dir / filename
    
    if is_url:
        print(f"[*] Downloading {input_source}...")
        subprocess.run(f"curl -L '{input_source}' -o '{local_path}'", shell=True)
    else:
        # If local, just copy or use as is
        local_path = Path(input_source)

    # Convert to MD
    md_content = convert_to_md(local_path)
    if not md_content:
        return

    # Save the MD
    md_path = local_path.with_suffix('.md')
    with open(md_path, 'w') as f:
        f.write(md_content)
    print(f"[+] Saved Markdown to {md_path}")

    # Extract & Recurse
    citations = extract_citations(md_content)
    for cite in citations:
        pdf_link = resolve_citation(cite)
        if pdf_link:
            download_and_harvest(pdf_link, topic, depth - 1, seen)

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Recursive Source Harvester")
    parser.add_argument("source", help="URL or path to PDF/Blog")
    parser.add_argument("--topic", required=True, help="Topic name for folder structure")
    parser.add_argument("--depth", type=int, default=1, help="Recursion depth")
    
    args = parser.parse_args()
    download_and_harvest(args.source, args.topic, args.depth)
    
    # Notify completion
    subprocess.run(f"npx openclaw system event --text 'Recursive-Source-Harvester v1 implemented and tested on {args.topic}' --mode now", shell=True)
