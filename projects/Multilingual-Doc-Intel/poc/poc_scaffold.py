#!/usr/bin/env python3
"""
Vigyān — Multilingual Document Intelligence
Sarvam Vision OCR client for Indic document extraction.
"""

import os
import sys
import json
import argparse
from pathlib import Path
import requests
from dotenv import load_dotenv

load_dotenv("/home/node/.openclaw/workspace/.env")

SARVAM_API_KEY = os.getenv("SARVAM_API_KEY")
SARVAM_OCR_URL = "https://api.sarvam.ai/v1/vision/ocr"

def extract_text_from_file(file_path: str) -> dict:
    """Extract text from image or PDF using Sarvam Vision OCR."""
    if not SARVAM_API_KEY:
        raise ValueError("SARVAM_API_KEY not found in .env")
    
    file_path = Path(file_path)
    if not file_path.exists():
        raise FileNotFoundError(f"File not found: {file_path}")
    
    headers = {
        "api-subscription-key": SARVAM_API_KEY,
    }
    
    # Determine MIME type
    suffix = file_path.suffix.lower()
    mime_map = {".pdf": "application/pdf", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg"}
    mime_type = mime_map.get(suffix, "application/octet-stream")
    
    print(f"[*] Sending {file_path.name} to Sarvam Vision OCR...")
    
    with open(file_path, "rb") as f:
        files = {"file": (file_path.name, f, mime_type)}
        data = {"model": "sarvam-vision"}
        
        response = requests.post(
            SARVAM_OCR_URL,
            headers=headers,
            files=files,
            data=data,
            timeout=60
        )
    
    if response.status_code == 200:
        result = response.json()
        print(f"[+] OCR complete.")
        return result
    elif response.status_code == 404:
        # Try alternate endpoint
        print(f"[*] Trying alternate endpoint...")
        return try_alternate_endpoint(file_path, mime_type)
    else:
        print(f"[ERROR] API returned {response.status_code}: {response.text[:500]}")
        return {"error": response.text, "status_code": response.status_code}

def try_alternate_endpoint(file_path: Path, mime_type: str) -> dict:
    """Try the Sarvam document extraction endpoint."""
    alt_url = "https://api.sarvam.ai/v1/parse/document"
    headers = {"api-subscription-key": SARVAM_API_KEY}
    
    with open(file_path, "rb") as f:
        files = {"file": (file_path.name, f, mime_type)}
        response = requests.post(alt_url, headers=headers, files=files, timeout=60)
    
    if response.status_code == 200:
        return response.json()
    return {"error": f"Both endpoints failed. Last: {response.status_code} {response.text[:200]}"}

def run_poc():
    """Run a POC test with a sample file if provided, else print status."""
    print("=" * 50)
    print("  Vigyān — Sarvam Vision OCR Client")
    print("=" * 50)
    
    if not SARVAM_API_KEY:
        print("[ERROR] SARVAM_API_KEY missing from .env")
        print("  Add: SARVAM_API_KEY=your-key-here")
        return
    
    print(f"[+] API Key Detected: {SARVAM_API_KEY[:8]}...")
    print(f"[+] Endpoint: {SARVAM_OCR_URL}")
    print("[*] Ready for extraction. Use --file to process a document.")

if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Vigyān — Sarvam Vision OCR")
    parser.add_argument("--file", help="Path to image or PDF to extract text from")
    parser.add_argument("--output", help="Output JSON file path (optional)")
    args = parser.parse_args()
    
    if args.file:
        result = extract_text_from_file(args.file)
        print("\n[RESULT]")
        print(json.dumps(result, indent=2, ensure_ascii=False))
        
        if args.output:
            Path(args.output).write_text(json.dumps(result, indent=2, ensure_ascii=False))
            print(f"\n[+] Saved to {args.output}")
    else:
        run_poc()
