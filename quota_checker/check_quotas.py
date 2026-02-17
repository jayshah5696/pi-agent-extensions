import json
import os
import time
from datetime import datetime

AUTH_FILE = "/home/node/.openclaw/agents/main/agent/auth-profiles.json"

def get_session_status():
    """
    Mock of session_status since we can't call it from a script directly.
    In a real scenario, the agent would pass this info or we'd read a state file.
    """
    # For now, we'll focus on the data we HAVE in auth-profiles.json
    pass

def check_quotas():
    if not os.path.exists(AUTH_FILE):
        print(f"Error: {AUTH_FILE} not found.")
        return

    with open(AUTH_FILE, 'r') as f:
        data = json.load(f)

    profiles = data.get("profiles", {})
    stats = data.get("usageStats", {})
    
    print(f"--- Quota & Usage Audit: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')} ---")
    
    # Target specific providers: Gemini CLI, Antigravity, and general Google
    targets = [
        "google-gemini",
        "google-gemini-cli:jayshah5696@gmail.com",
        "google-antigravity:jayshah5696@gmail.com"
    ]
    
    for target in targets:
        profile = profiles.get(target, {})
        stat = stats.get(target, {})
        
        provider_name = profile.get("provider", target)
        email = profile.get("email", "API Key")
        
        last_used = stat.get("lastUsed")
        last_used_str = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(last_used/1000)) if last_used else "Never"
        
        print(f"\n[ {target} ]")
        print(f"  Provider: {provider_name}")
        print(f"  Account:  {email}")
        print(f"  Last Use: {last_used_str}")
        
        # Check OAuth Expiry
        expires = profile.get("expires")
        if expires:
            remaining_ms = expires - (time.time() * 1000)
            remaining_min = int(remaining_ms / 60000)
            if remaining_min > 0:
                print(f"  Auth:     Expires in {remaining_min}m")
            else:
                print(f"  Auth:     EXPIRED ({abs(remaining_min)}m ago)")
        
        # Check for recent failures
        last_fail = stat.get("lastFailureAt")
        if last_fail:
            fail_str = time.strftime('%Y-%m-%d %H:%M:%S', time.localtime(last_fail/1000))
            print(f"  ⚠️ Last Fail: {fail_str}")
            if "failureCounts" in stat:
                print(f"  ⚠️ Error counts: {stat['failureCounts']}")

if __name__ == "__main__":
    check_quotas()
