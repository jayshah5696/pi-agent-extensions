import concurrent.futures
import requests
import time
import os

# Configuration for homelab services
# In a real environment, these would be pulled from .env or a config file
SERVICES = {
    "Homepage": "https://home.jay-hirajoshi.ts.net",
    "AdGuard Home": "https://hpmini.jay-hirajoshi.ts.net/adguard/login.html",
    "Glances": "https://hpmini.jay-hirajoshi.ts.net/glances/index.html",
    "Immich": "https://immich.jay-hirajoshi.ts.net",
    "Kopia": "https://kopia.jay-hirajoshi.ts.net",
    "Speedtest Tracker": "https://myspeed.jay-hirajoshi.ts.net",
    "FileBrowser": "https://filebrowser.jay-hirajoshi.ts.net",
    "OpenCode": "https://opencode.jay-hirajoshi.ts.net",
    "OpenClaw": "https://openclaw.jay-hirajoshi.ts.net"
}

TIMEOUT = 5

def check_service(name, url):
    """Performs a status check on a single service."""
    start_time = time.time()
    try:
        # Use HEAD for speed where possible, but some APIs require GET
        response = requests.get(url, timeout=TIMEOUT, verify=False)
        latency = (time.time() - start_time) * 1000
        
        # 2xx is OK, 3xx (Redirect) is OK, 401 (Unauthorized) is OK (service is up)
        # 404 is allowed specifically for Glances/Subpaths if we can't find a better endpoint
        # but we prioritize real health checks.
        if response.status_code < 400 or response.status_code in [401, 404]:
            status_icon = "✅"
            if response.status_code == 404:
                status_icon = "⚠️" # Up but subpath missing
            return f"{status_icon} {name:20} | OK ({response.status_code}) | {latency:.2f}ms"
        else:
            return f"❌ {name:20} | ERROR ({response.status_code}) | {latency:.2f}ms"
    except requests.exceptions.RequestException as e:
        return f"🚨 {name:20} | DOWN (Timeout/Connection Error)"

def main():
    print(f"--- Homelab Status Check: {time.strftime('%Y-%m-%d %H:%M:%S')} ---")
    
    # Use ThreadPoolExecutor for multi-threaded checks
    with concurrent.futures.ThreadPoolExecutor(max_workers=len(SERVICES)) as executor:
        future_to_service = {executor.submit(check_service, name, url): name for name, url in SERVICES.items()}
        
        for future in concurrent.futures.as_completed(future_to_service):
            print(future.result())

if __name__ == "__main__":
    main()
