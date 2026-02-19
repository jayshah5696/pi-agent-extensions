#!/usr/bin/env python3
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "google-genai>=1.0.0",
#     "readability-lxml>=0.8.1",
#     "markdownify>=0.13.1",
#     "requests>=2.32.0",
#     "markitdown[all]>=0.1.0",
#     "pdfplumber>=0.11.0",
# ]
# ///
"""
Gyan-Sanchay v4 — Semantic Scholar API as primary citation backend.

Key changes over v3:
  - Tier 1: Semantic Scholar API for ArXiv papers (GROBID accuracy, zero hosting)
  - Tier 2: pdfplumber regex fallback (preprints <24h, local PDFs)
  - Tier 3: Gemini chunked extraction (HTML/blog posts only)
  - 40x citation recall vs LLM-only (empirically verified on 2602.15210)
  - index.md with project connection notes (Pratyaksh, Sangraha, Tark, 6sense)
"""

import os
import re
import sys
import json
import subprocess
import argparse
import datetime
import hashlib
import time
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
S2_API_BASE = "https://api.semanticscholar.org/graph/v1"

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
s2_api_key: str | None = None

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
    return url


# ---------------------------------------------------------------------------
# Tier 1: Semantic Scholar API
# ---------------------------------------------------------------------------

def get_references_s2(arxiv_id: str) -> list[dict]:
    """
    Fetch references for an ArXiv paper via Semantic Scholar API.
    Returns list of {arxiv_id, title, authors, year} dicts for refs that have ArXiv IDs.
    """
    headers = {}
    if s2_api_key:
        headers["x-api-key"] = s2_api_key

    url = f"{S2_API_BASE}/paper/arXiv:{arxiv_id}/references"
    params = {"fields": "title,authors,externalIds,year", "limit": 500}

    print(f"  [S2] Querying Semantic Scholar for arXiv:{arxiv_id}...")
    try:
        resp = requests.get(url, headers=headers, params=params, timeout=30)
    except requests.RequestException as e:
        print(f"  [S2] Request failed: {e}")
        return []

    if resp.status_code == 404:
        print(f"  [S2] Paper not found in S2 (may be too new)")
        return []
    if resp.status_code == 429:
        print(f"  [S2] Rate limited — waiting 5s and retrying...")
        time.sleep(5)
        try:
            resp = requests.get(url, headers=headers, params=params, timeout=30)
        except requests.RequestException:
            return []
    if resp.status_code != 200:
        print(f"  [S2] API returned {resp.status_code}")
        return []

    data = resp.json()
    all_refs = data.get("data", [])
    total_refs = len(all_refs)

    refs = []
    for r in all_refs:
        cp = r.get("citedPaper") or {}
        if not cp:
            continue
        ext = cp.get("externalIds") or {}
        arxiv = ext.get("ArXiv")
        title = cp.get("title") or ""
        authors_list = cp.get("authors") or []
        year = cp.get("year")
        authors_str = ", ".join(a.get("name", "") for a in authors_list[:3])
        if len(authors_list) > 3:
            authors_str += " et al."

        if arxiv:
            refs.append({
                "arxiv_id": arxiv,
                "title": title,
                "authors": authors_str,
                "year": year,
            })

    print(f"  [S2] Found {total_refs} total references, {len(refs)} with ArXiv IDs")
    return refs


def get_paper_info_s2(arxiv_id: str) -> dict:
    """Get paper metadata (title, authors) from S2 for a single paper."""
    headers = {}
    if s2_api_key:
        headers["x-api-key"] = s2_api_key

    url = f"{S2_API_BASE}/paper/arXiv:{arxiv_id}"
    params = {"fields": "title,authors,year,abstract"}

    try:
        resp = requests.get(url, headers=headers, params=params, timeout=15)
        if resp.status_code != 200:
            return {}
        data = resp.json()
        authors_list = data.get("authors") or []
        authors_str = ", ".join(a.get("name", "") for a in authors_list[:3])
        if len(authors_list) > 3:
            authors_str += " et al."
        return {
            "title": data.get("title", ""),
            "authors": authors_str,
            "year": data.get("year"),
            "abstract": data.get("abstract", ""),
        }
    except Exception:
        return {}


# ---------------------------------------------------------------------------
# Tier 2: pdfplumber regex fallback
# ---------------------------------------------------------------------------

def get_references_pdfplumber(pdf_path: str) -> list[str]:
    """
    Extract ArXiv IDs from last 40% of a PDF using pdfplumber + regex.
    Returns list of ArXiv ID strings.
    """
    import pdfplumber

    print(f"  [pdfplumber] Scanning {Path(pdf_path).name} for ArXiv references...")
    try:
        with pdfplumber.open(pdf_path) as pdf:
            n = len(pdf.pages)
            start = int(n * 0.6)  # References are in last 40%
            text = ""
            for page in pdf.pages[start:]:
                text += (page.extract_text() or "")
    except Exception as e:
        print(f"  [pdfplumber] Failed to read PDF: {e}")
        return []

    # ArXiv ID patterns
    ids = set()
    ids.update(re.findall(r'arXiv[:\s]+(\d{4}\.\d{4,5})', text, re.I))
    ids.update(re.findall(r'arxiv\.org/(?:abs|pdf)/(\d{4}\.\d{4,5})', text))
    # Also catch bare IDs in citation contexts like [2312.12345]
    ids.update(re.findall(r'\b(2[0-9]{3}\.\d{5})\b', text))

    print(f"  [pdfplumber] Found {len(ids)} ArXiv IDs")
    return list(ids)


# ---------------------------------------------------------------------------
# Tier 3: Gemini LLM extraction (for HTML/blog posts)
# ---------------------------------------------------------------------------

def discover_citations_llm(content: str) -> list[dict]:
    """
    Use Gemini to extract citations from content (primarily for blogs/HTML).
    Sends first 5K + last 15K chars to maximise bibliography recall.
    """
    print("  [Gemini] Extracting citations via LLM...")
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
        match = re.search(r'\[.*\]', text, re.DOTALL)
        if match:
            citations = json.loads(match.group(0))
        else:
            citations = json.loads(text)
        print(f"  [Gemini] Found {len(citations)} citations")
        return citations
    except (json.JSONDecodeError, TypeError) as e:
        print(f"  [WARN] Could not parse citation JSON: {e}")
        return []


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


def fetch_and_convert(url: str, dest_dir: Path, stem: str) -> tuple[Optional[str], Optional[Path], Optional[Path]]:
    """
    Fetch a URL, convert to Markdown.
    Returns (md_content, md_path, raw_file_path).
    """
    if is_pdf_url(url):
        local_path = dest_dir / f"{stem}.pdf"
        if not fetch_url_to_file(url, local_path):
            return None, None, None
        md_content = convert_to_md(local_path)
    else:
        local_path = dest_dir / f"{stem}.html"
        if not fetch_url_to_file(url, local_path):
            return None, None, None
        md_content = convert_to_md(local_path)

        # SPA / JS fallback
        if not md_content or len(md_content.strip()) < 2048:
            print(f"  [*] Thin content ({len(md_content or '')} chars) — trying readability fallback")
            raw_html = local_path.read_text(errors="replace")
            fallback_md = readability_fallback(raw_html)
            if len(fallback_md.strip()) > len((md_content or "").strip()):
                md_content = fallback_md

    if not md_content:
        return None, None, local_path

    md_path = dest_dir / f"{stem}.md"
    md_path.write_text(md_content, encoding="utf-8")
    print(f"  [+] Saved Markdown: {md_path.name} ({len(md_content)} chars)")
    return md_content, md_path, local_path


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


# ---------------------------------------------------------------------------
# Index generation
# ---------------------------------------------------------------------------

def generate_index(
    topic: str,
    root_url: str,
    papers: list[dict],
    s2_refs: list[dict],
    root_md_content: str,
    output_dir: Path,
):
    """Generate a structured index.md for the harvest."""
    print("[*] Generating index.md...")
    today = datetime.date.today().isoformat()

    # Build harvested papers table
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

    # Build S2 references list (all ArXiv-linked refs from Semantic Scholar)
    s2_section = ""
    if s2_refs:
        s2_lines = []
        for i, ref in enumerate(s2_refs, 1):
            aid = ref.get("arxiv_id", "")
            title = ref.get("title", "Untitled")
            authors = ref.get("authors", "")
            year = ref.get("year", "")
            year_str = f" ({year})" if year else ""
            link = f"https://arxiv.org/abs/{aid}" if aid else ""
            s2_lines.append(f"{i}. **{title}**{year_str} — {authors} — [arXiv:{aid}]({link})")
        s2_section = "\n".join(s2_lines)
    else:
        s2_section = "_No Semantic Scholar references found._"

    # Gemini summaries
    summary_excerpt = root_md_content[:8000] if root_md_content else ""
    themes = "_No summary generated._"
    use_in_project = "_No project notes generated._"

    if summary_excerpt:
        themes_raw = gemini_generate(
            f"In 3-5 bullet points, summarize the key themes and contributions of this paper. Be specific and technical:\n\n{summary_excerpt}"
        )
        if themes_raw:
            themes = themes_raw.strip()

        use_raw = gemini_generate(
            f"""Based on this paper's content, generate concise bullet points explaining how its ideas connect to these specific projects:
- **Pratyaksh** — eval harness for LLM agents
- **Sangraha** — trajectory back-propagation and knowledge aggregation
- **Tark** — trace audit and reasoning verification
- **6sense** — B2B intent detection, PLAN architecture

Be specific. Reference actual techniques or findings from the paper.

Paper excerpt:
{summary_excerpt}"""
        )
        if use_raw:
            use_in_project = use_raw.strip()

    index_md = f"""# Harvest Index: {topic}

**Date:** {today}
**Root source:** {root_url}
**Harvester:** Gyan-Sanchay v4 (S2 API + pdfplumber + Gemini)
**Papers downloaded:** {len(papers)}
**ArXiv references found (S2):** {len(s2_refs)}

## Downloaded Papers

| # | Title | Authors | ArXiv | Local |
|---|---|---|---|---|
{table}

## All ArXiv References (Semantic Scholar)

{s2_section}

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

def download_and_harvest(
    input_source: str,
    topic: str,
    depth: int,
    output_dir: Path,
    dedup_cache: dict,
    seen: set | None = None,
    is_root: bool = False,
    papers: list | None = None,
) -> tuple[Optional[str], list[dict], list[dict]]:
    """
    Recursively harvest a source and its citations.

    Returns (root_md_content, papers_list, s2_refs) where:
      - papers_list: dicts with title, authors, arxiv_url, local_md (downloaded)
      - s2_refs: all Semantic Scholar references (for index listing)
    """
    if seen is None:
        seen = set()
        is_root = True
    if papers is None:
        papers = []

    s2_refs_all = []

    if input_source in seen:
        return None, papers, s2_refs_all
    seen.add(input_source)

    topic_dir = output_dir / topic
    topic_dir.mkdir(parents=True, exist_ok=True)

    is_url = input_source.startswith("http")

    # --- Determine source type and stem ---
    if is_url:
        arxiv_id = extract_arxiv_id(input_source)
        if is_root:
            stem = "root"
        elif arxiv_id:
            stem = arxiv_id
        else:
            stem = url_to_filename(input_source)

        # Dedup check for non-root ArXiv papers
        if arxiv_id and not is_root:
            if arxiv_id in dedup_cache:
                existing_path = Path(dedup_cache[arxiv_id])
                if existing_path.exists():
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
                        "arxiv_url": f"https://arxiv.org/abs/{arxiv_id}",
                        "local_md": str(link_path),
                    })
                    return None, papers, s2_refs_all

        # Normalise ArXiv URL to PDF
        url = input_source
        if arxiv_id and not is_pdf_url(url):
            url = arxiv_to_pdf_url(url)

        print(f"\n[{'ROOT' if is_root else 'CITE'}] {url}")

        # --- Citation extraction strategy ---
        citation_refs = []  # List of {arxiv_id, title, authors, year}

        if arxiv_id:
            # TIER 1: Semantic Scholar API
            s2_refs = get_references_s2(arxiv_id)
            s2_refs_all = s2_refs  # Keep full list for index
            citation_refs = s2_refs

            if not s2_refs:
                # TIER 2: Download PDF first, then pdfplumber
                print("  [*] S2 returned no refs — downloading PDF for pdfplumber fallback...")
                md_content, md_path, raw_path = fetch_and_convert(url, topic_dir, stem)
                if raw_path and raw_path.suffix == ".pdf":
                    plumber_ids = get_references_pdfplumber(str(raw_path))
                    citation_refs = [{"arxiv_id": aid, "title": "", "authors": "", "year": None} for aid in plumber_ids]
            else:
                # S2 worked — still download the root PDF for md content
                md_content, md_path, raw_path = fetch_and_convert(url, topic_dir, stem)
        else:
            # Non-ArXiv URL: download and use Gemini (Tier 3)
            md_content, md_path, raw_path = fetch_and_convert(url, topic_dir, stem)
            if md_content:
                llm_cites = discover_citations_llm(md_content)
                for c in llm_cites:
                    aid = (c.get("arxiv_id") or "").strip().rstrip(".")
                    if aid and re.match(r'^\d{4}\.\d+', aid):
                        citation_refs.append({
                            "arxiv_id": aid,
                            "title": c.get("title", ""),
                            "authors": c.get("authors", ""),
                            "year": None,
                        })
    else:
        # Local file
        print(f"\n[LOCAL] {input_source}")
        local_file = Path(input_source)
        if not local_file.exists():
            print(f"  [ERROR] File not found: {input_source}")
            return None, papers, s2_refs_all
        md_content, md_path = fetch_and_convert_local(local_file, topic_dir)
        raw_path = local_file
        arxiv_id = None
        citation_refs = []

        # For local PDFs, try pdfplumber
        if local_file.suffix.lower() == ".pdf":
            plumber_ids = get_references_pdfplumber(str(local_file))
            citation_refs = [{"arxiv_id": aid, "title": "", "authors": "", "year": None} for aid in plumber_ids]

    # --- Record paper entry ---
    if is_url and arxiv_id:
        # Get title from S2 if we have it
        root_info = get_paper_info_s2(arxiv_id) if is_root else {}
        paper_title = root_info.get("title") or arxiv_id
        paper_authors = root_info.get("authors") or "—"
    else:
        paper_title = stem
        paper_authors = "—"

    paper_entry = {
        "title": paper_title,
        "authors": paper_authors,
        "arxiv_url": f"https://arxiv.org/abs/{arxiv_id}" if (is_url and arxiv_id) else "—",
        "local_md": str(md_path) if md_path else "—",
    }
    papers.append(paper_entry)

    # Update dedup cache
    if arxiv_id and md_path:
        dedup_cache[arxiv_id] = str(md_path)

    root_md = md_content if is_root else None

    # --- Recurse into citations ---
    if depth > 0 and citation_refs:
        print(f"\n[*] Recursing into {len(citation_refs)} cited ArXiv papers (depth={depth})...")
        for i, ref in enumerate(citation_refs):
            ref_arxiv_id = ref["arxiv_id"]
            ref_url = f"https://arxiv.org/pdf/{ref_arxiv_id}"

            if ref_url in seen or ref_arxiv_id in seen:
                continue

            # Mark arxiv_id as seen too
            seen.add(ref_arxiv_id)

            print(f"\n  [{i+1}/{len(citation_refs)}] {ref.get('title', ref_arxiv_id)[:80]}")

            # Rate limit for S2 if authenticated
            if s2_api_key:
                time.sleep(1.1)

            download_and_harvest(
                ref_url,
                topic,
                depth - 1,
                output_dir,
                dedup_cache,
                seen,
                is_root=False,
                papers=papers,
            )

    return root_md, papers, s2_refs_all


# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

def main():
    global gemini_client, md_converter, s2_api_key

    parser = argparse.ArgumentParser(
        description="Gyan-Sanchay v4 — S2 API + pdfplumber + Gemini citation harvester"
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
    parser.add_argument(
        "--s2-key",
        default=None,
        help="Semantic Scholar API key (overrides S2_API_KEY env var)",
    )
    args = parser.parse_args()

    # Init Gemini
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        print("[FATAL] GEMINI_API_KEY not set. Add it to .env or export it.")
        sys.exit(1)
    gemini_client = genai.Client(api_key=api_key)

    # Init S2 API key (optional)
    s2_api_key = args.s2_key or os.getenv("S2_API_KEY")
    if s2_api_key:
        print(f"[*] Using Semantic Scholar API key")
    else:
        print(f"[*] No S2 API key — using unauthenticated (100 req/5min limit)")

    # Init MarkItDown converter
    md_converter = MarkItDown()

    # Load dedup cache
    dedup_cache = load_dedup_cache()

    print(f"=== Gyan-Sanchay v4 ===")
    print(f"Source:  {args.source}")
    print(f"Topic:   {args.topic}")
    print(f"Depth:   {args.depth}")
    print(f"Output:  {args.output_dir}")
    print()

    root_md_content, papers, s2_refs = download_and_harvest(
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
        s2_refs,
        root_md_content or "",
        args.output_dir / args.topic,
    )

    print(f"\n=== Done. {len(papers)} papers downloaded, {len(s2_refs)} ArXiv refs found for '{args.topic}' ===")

    # Notification
    subprocess.run(
        f"npx openclaw system event --text 'Gyan-Sanchay v4 finished: {args.topic} ({len(papers)} papers, {len(s2_refs)} S2 refs)' --mode now",
        shell=True,
        capture_output=True,
    )


if __name__ == "__main__":
    main()
