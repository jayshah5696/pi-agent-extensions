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
        file_path = line[3:]
        if not file_path.startswith(ALLOWED_DIR):
            violations.append(file_path)
            
    if violations:
        print(f"[SAFETY VIOLATION] Unauthorized writes detected: {', '.join(violations)}")
        sys.exit(1)
    else:
        print("[OK] All writes within Assitant/")

if __name__ == "__main__":
    audit()
