#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "google-genai>=1.0.0",
#     "readability-lxml>=0.8.1",
#     "markdownify>=0.13.1",
#     "requests>=2.32.0",
#     "markitdown[all]>=0.1.0",
# ]
# ///
"""
Gyan-Sanchay v3 — Production-quality recursive source harvester.

Improvements over v2:
  - google-genai SDK (replaces deprecated google-generativeai)
  - Chunked citation extraction (first 5K + last 15K chars)
  - SPA/JS fallback via readability-lxml + markdownify
  - In-process MarkItDown (no cold-start per paper)
  - Non-ArXiv URL fallback (depth-capped)
  - Structured index.md generation with Gemini summaries
  - Global dedup cache (.harvested_ids.json)
  - --output-dir flag
"""

import os
import re
import sys
import json
import subprocess
import argparse
import datetime
import hashlib
import tempfile
from pathlib import Path
from typing import Optional

import requests
from google import genai
from markitdown import MarkItDown
from readability import Document as ReadabilityDocument
from markdownify import markdownify as html_to_md

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
DEFAULT_OUTPUT_DIR = Path("/home/node/.openclaw/workspace/Assitant/Research/Harvester")
DEDUP_CACHE_PATH = DEFAULT_OUTPUT_DIR / ".harvested_ids.json"
GEMINI_MODEL = "gemini-2.0-flash"
USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36"

# ---------------------------------------------------------------------------
# Environment
# ---------------------------------------------------------------------------

def load_env():
    """Load .env file into os.environ (simple key=value, no export)."""
    env_path = Path("/home/node/.openclaw/workspace/.env")
    if env_path.exists():
        with open(env_path) as f:
            for line in f:
                line = line.strip()
                if "=" in line and not line.startswith("#"):
                    key, value = line.split("=", 1)
                    os.environ.setdefault(key.strip(), value.strip())

load_env()

# ---------------------------------------------------------------------------
# Globals (initialized in main)
# ---------------------------------------------------------------------------
gemini_client: genai.Client | None = None
md_converter: MarkItDown | None = None

# ---------------------------------------------------------------------------
# Dedup Cache
# ---------------------------------------------------------------------------

def load_dedup_cache() -> dict:
    """Load the global harvested-IDs cache. Returns {arxiv_id: topic_dir_path}."""
    if DEDUP_CACHE_PATH.exists():
        try:
            with open(DEDUP_CACHE_PATH) as f:
                return json.load(f)
        except (json.JSONDecodeError, IOError):
            return {}
    return {}


def save_dedup_cache(cache: dict):
    DEDUP_CACHE_PATH.parent.mkdir(parents=True, exist_ok=True)
    with open(DEDUP_CACHE_PATH, "w") as f:
        json.dump(cache, f, indent=2)


# ---------------------------------------------------------------------------
# Utility helpers
# ---------------------------------------------------------------------------

def extract_arxiv_id(url: str) -> Optional[str]:
    """Pull an ArXiv paper ID from a URL, if present."""
    m = re.search(r'arxiv\.org/(?:abs|pdf|html)/([\d]+\.[\d]+)', url)
    return m.group(1) if m else None


def url_to_filename(url: str) -> str:
    """Generate a safe filename stem from a URL."""
    aid = extract_arxiv_id(url)
    if aid:
        return aid
    name = url.rstrip("/").split("/")[-1].split("?")[0]
    name = re.sub(r'[^\w\-.]', '_', name)
    return name or hashlib.md5(url.encode()).hexdigest()[:12]


def is_pdf_url(url: str) -> bool:
    return url.lower().endswith('.pdf') or 'arxiv.org/pdf' in url


def arxiv_to_pdf_url(url: str) -> str:
    """Normalise an ArXiv URL to its PDF endpoint."""
    url = re.sub(r'/abs/', '/pdf/', url)
    if 'arxiv.org/pdf/' in url and not url.endswith('.pdf'):
        # Some URLs lack the .pdf extension — that's fine, curl follows redirects
        pass
    return url

# ---------------------------------------------------------------------------
# Content fetching
# ---------------------------------------------------------------------------

def fetch_url_to_file(url: str, dest: Path) -> bool:
    """Download a URL to a local file. Returns True on success."""
    try:
        resp = requests.get(url, headers={"User-Agent": USER_AGENT}, timeout=60, stream=True)
        resp.raise_for_status()
        with open(dest, "wb") as f:
            for chunk in resp.iter_content(chunk_size=65536):
                f.write(chunk)
        return True
    except Exception as e:
        print(f"  [ERROR] Download failed for {url}: {e}")
        return False


def convert_to_md(local_path: Path) -> Optional[str]:
    """Convert a local file (PDF, HTML, etc.) to Markdown via MarkItDown."""
    try:
        result = md_converter.convert(str(local_path))
        return result.text_content
    except Exception as e:
        print(f"  [WARN] MarkItDown failed on {local_path}: {e}")
        return None


def readability_fallback(html_content: str) -> str:
    """Extract article text from raw HTML via readability-lxml + markdownify."""
    try:
        doc = ReadabilityDocument(html_content)
        article_html = doc.summary()
        return html_to_md(article_html, heading_style="ATX", strip=["img", "script", "style"])
    except Exception as e:
        print(f"  [WARN] Readability fallback failed: {e}")
        return ""


def fetch_and_convert(url: str, dest_dir: Path, stem: str) -> tuple[Optional[str], Optional[Path]]:
    """
    Fetch a URL, convert to Markdown. Returns (md_content, md_path).
    For HTML pages with thin content, falls back to readability-lxml.
    """
    if is_pdf_url(url):
        local_path = dest_dir / f"{stem}.pdf"
        if not fetch_url_to_file(url, local_path):
            return None, None
        md_content = convert_to_md(local_path)
    else:
        local_path = dest_dir / f"{stem}.html"
        if not fetch_url_to_file(url, local_path):
            return None, None
        md_content = convert_to_md(local_path)

        # SPA / JS fallback: if MarkItDown got <2KB of text, try readability
        if not md_content or len(md_content.strip()) < 2048:
            print(f"  [*] Thin content ({len(md_content or '')} chars) — trying readability fallback")
            raw_html = local_path.read_text(errors="replace")
            fallback_md = readability_fallback(raw_html)
            if len(fallback_md.strip()) > len((md_content or "").strip()):
                md_content = fallback_md

    if not md_content:
        return None, None

    md_path = dest_dir / f"{stem}.md"
    md_path.write_text(md_content, encoding="utf-8")
    print(f"  [+] Saved Markdown: {md_path.name} ({len(md_content)} chars)")
    return md_content, md_path


def fetch_and_convert_local(local_file: Path, dest_dir: Path) -> tuple[Optional[str], Optional[Path]]:
    """Convert a local file to Markdown."""
    md_content = convert_to_md(local_file)
    if not md_content:
        return None, None
    md_path = dest_dir / f"{local_file.stem}.md"
    md_path.write_text(md_content, encoding="utf-8")
    return md_content, md_path

# ---------------------------------------------------------------------------
# Gemini helpers
# ---------------------------------------------------------------------------

def gemini_generate(prompt: str) -> Optional[str]:
    """Call Gemini and return text, or None on failure."""
    if not gemini_client:
        print("  [ERROR] Gemini client not initialized (missing GEMINI_API_KEY)")
        return None
    try:
        response = gemini_client.models.generate_content(model=GEMINI_MODEL, contents=prompt)
        return response.text
    except Exception as e:
        print(f"  [ERROR] Gemini call failed: {e}")
        return None


def discover_citations_llm(content: str) -> list[dict]:
    """
    Use Gemini to extract citations from paper content.
    Sends first 5K + last 15K chars to maximise bibliography recall.
    """
    print("  [*] Extracting citations via Gemini...")
    if len(content) > 20000:
        excerpt = content[:5000] + "\n\n...[middle truncated]...\n\n" + content[-15000:]
    else:
        excerpt = content

    prompt = f"""Extract ALL academic research papers and technical resources cited in this text.
For each citation provide:
- title: Full title
- authors: Key authors (if available)
- arxiv_id: ArXiv ID like "2401.12345" (if applicable, else null)
- url: Direct URL to the paper/resource (if mentioned, else null)

Return ONLY a JSON array of objects. No markdown fences, no explanation.

TEXT:
{excerpt}"""

    text = gemini_generate(prompt)
    if not text:
        return []

    try:
        # Find JSON array in response
        match = re.search(r'\[.*\]', text, re.DOTALL)
        if match:
            citations = json.loads(match.group(0))
        else:
            citations = json.loads(text)
        print(f"  [+] Found {len(citations)} citations")
        return citations
    except (json.JSONDecodeError, TypeError) as e:
        print(f"  [WARN] Could not parse citation JSON: {e}")
        return []

# ---------------------------------------------------------------------------
# Exa resolution (unchanged from v2)
# ---------------------------------------------------------------------------

def resolve_citation_exa(title: str, authors: str) -> Optional[str]:
    """Try to resolve a citation to an ArXiv URL via Exa search."""
    print(f"  [*] Resolving via Exa: {title[:60]}...")
    query = f"{title} {authors} arxiv pdf"
    cmd = f'mcporter call exa.web_search_exa --arg query="{query}" --arg numResults=3 --arg type="auto"'
    result = subprocess.run(cmd, shell=True, capture_output=True, text=True, timeout=30)
    if result.returncode != 0:
        return None
    output = result.stdout
    # Prefer ArXiv
    m = re.search(r'(https?://arxiv\.org/(?:abs|pdf)/[\d\.]+)', output)
    if m:
        return m.group(1)
    # Any PDF
    m = re.search(r'(https?://[^\s\n"]+\.pdf)', output)
    if m:
        return m.group(1)
    return None

# ---------------------------------------------------------------------------
# Index generation
# ---------------------------------------------------------------------------

def generate_index(topic: str, root_url: str, papers: list[dict], root_md_content: str, output_dir: Path):
    """Generate a structured index.md for the harvest."""
    print("[*] Generating index.md...")
    today = datetime.date.today().isoformat()

    # Build papers table
    rows = []
    for i, p in enumerate(papers, 1):
        title = p.get("title", "Unknown")
        authors = p.get("authors", "—")
        arxiv_link = p.get("arxiv_url", "—")
        local_link = p.get("local_md", "—")
        if arxiv_link and arxiv_link != "—":
            arxiv_link = f"[link]({arxiv_link})"
        if local_link and local_link != "—":
            local_link = f"[{Path(local_link).name}]({Path(local_link).name})"
        rows.append(f"| {i} | {title} | {authors} | {arxiv_link} | {local_link} |")

    table = "\n".join(rows) if rows else "| — | No papers harvested | — | — | — |"

    # Gemini summaries
    summary_excerpt = root_md_content[:8000] if root_md_content else ""
    themes = ""
    use_in_project = ""
    if summary_excerpt:
        themes_raw = gemini_generate(
            f"In 2-3 sentences, summarize the key themes and contributions of this paper:\n\n{summary_excerpt}"
        )
        themes = themes_raw.strip() if themes_raw else "_No summary generated._"

        use_raw = gemini_generate(
            f"""Based on this paper's content, generate exactly 3 bullet points explaining how its ideas could be used in these specific projects:
- Pratyaksh (perception/vision system)
- Sangraha (knowledge aggregation pipeline)
- Tark (reasoning engine)
- 6sense (multimodal sensing)

Paper excerpt:
{summary_excerpt}"""
        )
        use_in_project = use_raw.strip() if use_raw else "_No project notes generated._"

    index_md = f"""# Harvest Index: {topic}

**Date:** {today}
**Root source:** {root_url}
**Papers harvested:** {len(papers)}

## Papers

| ID | Title | Authors | ArXiv | Local |
|---|---|---|---|---|
{table}

## Key Themes

{themes}

## Use in Project

{use_in_project}
"""

    index_path = output_dir / "index.md"
    index_path.write_text(index_md, encoding="utf-8")
    print(f"[+] Index written to {index_path}")

# ---------------------------------------------------------------------------
# Core harvester
# ---------------------------------------------------------------------------

def harvest(
    input_source: str,
    topic: str,
    depth: int,
    output_dir: Path,
    dedup_cache: dict,
    seen: set | None = None,
    is_root: bool = False,
    papers: list | None = None,
    root_allows_non_arxiv: bool = True,
) -> tuple[Optional[str], list[dict]]:
    """
    Recursively harvest a source and its citations.

    Returns (root_md_content, papers_list) where papers_list has dicts with
    title, authors, arxiv_url, local_md.
    """
    if seen is None:
        seen = set()
        is_root = True
    if papers is None:
        papers = []

    if input_source in seen:
        return None, papers
    seen.add(input_source)

    topic_dir = output_dir / topic
    topic_dir.mkdir(parents=True, exist_ok=True)

    is_url = input_source.startswith("http")

    # Determine stem
    if is_url:
        arxiv_id = extract_arxiv_id(input_source)
        if is_root:
            stem = "root"
        elif arxiv_id:
            stem = arxiv_id
        else:
            stem = url_to_filename(input_source)

        # Dedup check for ArXiv papers
        if arxiv_id and not is_root:
            if arxiv_id in dedup_cache:
                existing_path = Path(dedup_cache[arxiv_id])
                if existing_path.exists():
                    # Symlink instead of re-downloading
                    link_path = topic_dir / existing_path.name
                    if not link_path.exists():
                        try:
                            link_path.symlink_to(existing_path)
                            print(f"  [+] Dedup: symlinked {arxiv_id} from cache")
                        except OSError:
                            pass
                    papers.append({
                        "title": arxiv_id,
                        "authors": "—",
                        "arxiv_url": input_source,
                        "local_md": str(link_path),
                    })
                    return None, papers

        # Normalise ArXiv URL to PDF
        url = input_source
        if arxiv_id and not is_pdf_url(url):
            url = arxiv_to_pdf_url(url)

        print(f"\n[{'ROOT' if is_root else 'CITE'}] {url}")
        md_content, md_path = fetch_and_convert(url, topic_dir, stem)
    else:
        print(f"\n[LOCAL] {input_source}")
        local_file = Path(input_source)
        if not local_file.exists():
            print(f"  [ERROR] File not found: {input_source}")
            return None, papers
        md_content, md_path = fetch_and_convert_local(local_file, topic_dir)
        arxiv_id = None

    if not md_content:
        return None, papers

    # Record paper
    paper_entry = {
        "title": stem if is_root else (arxiv_id or stem),
        "authors": "—",
        "arxiv_url": input_source if (is_url and arxiv_id) else "—",
        "local_md": str(md_path) if md_path else "—",
    }
    papers.append(paper_entry)

    # Update dedup cache for ArXiv papers
    if arxiv_id and md_path:
        dedup_cache[arxiv_id] = str(md_path)

    root_md = md_content if is_root else None

    # Recurse into citations
    if depth > 0:
        citations = discover_citations_llm(md_content)
        for cite in citations:
            cite_url = cite.get("url") or ""
            cite_arxiv_id = (cite.get("arxiv_id") or "").strip().rstrip(".")
            cite_title = cite.get("title", "")
            cite_authors = cite.get("authors", "")

            # Update paper entry with title/authors if we got them from LLM
            # (only for root's own entry)
            # ... skip for now, we update discovered entries below

            target_url = None

            if cite_url and "arxiv.org" in cite_url:
                target_url = arxiv_to_pdf_url(cite_url)
            elif cite_arxiv_id and re.match(r'^\d{4}\.\d+', cite_arxiv_id):
                target_url = f"https://arxiv.org/pdf/{cite_arxiv_id}"
            elif cite_url and is_root and root_allows_non_arxiv:
                # Non-ArXiv URL — only follow from root level
                target_url = cite_url
            elif not cite_url and not cite_arxiv_id:
                # Try Exa resolution
                resolved = resolve_citation_exa(cite_title, cite_authors)
                if resolved and "arxiv.org" in resolved:
                    target_url = arxiv_to_pdf_url(resolved)

            if target_url and target_url not in seen:
                # For non-arxiv URLs from root, don't recurse further (depth 0)
                next_depth = depth - 1
                is_non_arxiv = target_url and "arxiv.org" not in target_url
                if is_non_arxiv:
                    next_depth = 0  # Don't recurse into non-arxiv citations

                harvest(
                    target_url,
                    topic,
                    next_depth,
                    output_dir,
                    dedup_cache,
                    seen,
                    is_root=False,
                    papers=papers,
                    root_allows_non_arxiv=False,  # Only root follows non-arxiv
                )

    return root_md, papers


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    global gemini_client, md_converter

    parser = argparse.ArgumentParser(
        description="Gyan-Sanchay v3 — Production recursive source harvester"
    )
    parser.add_argument("source", help="URL or local path to PDF/HTML")
    parser.add_argument("--topic", required=True, help="Topic name (used as folder name)")
    parser.add_argument("--depth", type=int, default=1, help="Citation recursion depth (0=root only)")
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=DEFAULT_OUTPUT_DIR,
        help=f"Override output directory (default: {DEFAULT_OUTPUT_DIR})",
    )
    args = parser.parse_args()

    # Init Gemini
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("[FATAL] GEMINI_API_KEY not set. Add it to .env or export it.")
        sys.exit(1)
    gemini_client = genai.Client(api_key=api_key)

    # Init MarkItDown converter (once — avoids cold start per paper)
    md_converter = MarkItDown()

    # Load dedup cache
    dedup_cache = load_dedup_cache()

    print(f"=== Gyan-Sanchay v3 ===")
    print(f"Source:  {args.source}")
    print(f"Topic:   {args.topic}")
    print(f"Depth:   {args.depth}")
    print(f"Output:  {args.output_dir}")
    print()

    root_md_content, papers = harvest(
        args.source,
        args.topic,
        args.depth,
        args.output_dir,
        dedup_cache,
    )

    # Save dedup cache
    save_dedup_cache(dedup_cache)

    # Generate index
    generate_index(
        args.topic,
        args.source,
        papers,
        root_md_content or "",
        args.output_dir / args.topic,
    )

    print(f"\n=== Done. {len(papers)} papers harvested for '{args.topic}' ===")

    # Notification
    subprocess.run(
        f"npx openclaw system event --text 'Gyan-Sanchay v3 finished: {args.topic} ({len(papers)} papers)' --mode now",
        shell=True,
        capture_output=True,
    )


if __name__ == "__main__":
    main()
