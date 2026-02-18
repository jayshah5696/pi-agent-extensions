#!/usr/bin/env -S uv run --script
import os
import sys
from pathlib import Path

VAULT_PATH = Path("/home/node/.openclaw/workspace/github/Obsidian-Vault")
ALLOWED_DIR = "Assitant"

def audit():
    if not VAULT_PATH.exists():
        return
        
    # Check for modified files in git status
    os.chdir(VAULT_PATH)
    status = os.popen("git status --porcelain").read().strip()
    
    if not status:
        return

    violations = []
    for line in status.split("\n"):
        if not line: continue
        
        # Git porcelain v1 format: XY path
        # Split by whitespace, but path might have spaces if not quoted.
        # Actually, split(None, 1) will give us [XY, path]
        parts = line.split(None, 1)
        if len(parts) < 2: continue
        
        file_path = parts[1].strip().strip('"')
        
        # ALLOWED: Anything in Assitant/ or the PROJECT_BOARD.md file
        if file_path.startswith(ALLOWED_DIR + "/") or file_path == "PROJECT_BOARD.md":
            continue
        violations.append(file_path)
            
    if violations:
        print(f"[SAFETY VIOLATION] Unauthorized writes detected: {', '.join(violations)}")
        sys.exit(1)
    else:
        print("[OK] All writes within Assitant/")

if __name__ == "__main__":
    audit()
