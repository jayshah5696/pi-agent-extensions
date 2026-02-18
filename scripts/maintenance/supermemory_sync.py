import os
import sys
import glob
import requests
import json
from pathlib import Path

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
SUPERMEMORY_API_KEY = os.getenv("SUPERMEMORY_API_KEY")

if not SUPERMEMORY_API_KEY:
    print("[ERROR] SUPERMEMORY_API_KEY not found in .env")
    sys.exit(1)

def sync_file(file_path):
    print(f"[*] Syncing: {file_path}")
    
    with open(file_path, "r", errors="ignore") as f:
        content = f.read()
    
    # Use the v3 API for document ingestion
    # Endpoint: https://api.supermemory.ai/v3/documents
    
    parent_folder = Path(file_path).parent.name
    container_tag = f"obsidian-{parent_folder}"
    custom_id = f"obsidian-{parent_folder}-{Path(file_path).name}".replace('.', '-')
    
    url = "https://api.supermemory.ai/v3/documents"
    
    payload = {
        "content": f"Source: {file_path}\n\n{content}",
        "containerTag": container_tag,
        "customId": custom_id,
        "metadata": {
            "source": "obsidian-vault",
            "folder": parent_folder,
            "filename": Path(file_path).name
        }
    }
    
    try:
        resp = requests.post(url, 
                         headers={"Authorization": f"Bearer {SUPERMEMORY_API_KEY}", "Content-Type": "application/json"},
                         json=payload)
        if resp.status_code in [200, 201, 202]:
            print(f"[+] Queued for extraction: {file_path} (ID: {resp.json().get('id')})")
        else:
            print(f"[ERROR] Failed to sync {file_path}: {resp.status_code} - {resp.text}")
    except Exception as e:
        print(f"[ERROR] Failed to sync {file_path}: {e}")

def main():
    # Comprehensive sync of all durable memories
    vault_path = "/home/node/.openclaw/workspace/Assitant"
    workspace_root = "/home/node/.openclaw/workspace"
    
    patterns = [
        f"{vault_path}/**/*.md",
        f"{workspace_root}/MEMORY.md",
        f"{workspace_root}/AGENTS.md",
        f"{workspace_root}/USER.md"
    ]
    
    files_to_sync = []
    for pattern in patterns:
        files_to_sync.extend(glob.glob(pattern, recursive=True))
    
    # Filter out any non-files or temporary files
    files_to_sync = [f for f in files_to_sync if os.path.isfile(f) and not Path(f).name.startswith('.')]
    
    print(f"[*] Found {len(files_to_sync)} files for comprehensive sync to Supermemory.")
    
    for f in files_to_sync:
        sync_file(f)

if __name__ == "__main__":
    main()
