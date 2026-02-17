#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = ["supermemory"]
# ///

import os
import sys
from pathlib import Path
from supermemory import Supermemory

API_KEY = os.getenv("SUPERMEMORY_API_KEY")
MEMORY_FILE = Path("/home/node/.openclaw/workspace/MEMORY.md")

def backup_memory():
    if not API_KEY:
        print("[ERROR] SUPERMEMORY_API_KEY not found in environment")
        sys.exit(1)
    client = Supermemory(api_key=API_KEY)
    
    if not MEMORY_FILE.exists():
        print("[ERROR] MEMORY.md not found")
        sys.exit(1)
    
    content = MEMORY_FILE.read_text()
    
    response = client.add(
        content=content,
        container_tag="jadoo-memory-backup",
        metadata={
            "source": "openclaw-jadoo",
            "type": "memory-backup",
            "date": "2026-02-07",
            "user": "jay"
        }
    )
    
    print(f"[COMPLETED] Memory backed up: {response.id}")
    return response.id

if __name__ == "__main__":
    backup_memory()
