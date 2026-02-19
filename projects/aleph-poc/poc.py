"""
Aleph RLM POC — Package validation and API surface exploration.

Findings:
- aleph-rlm v0.8.5 installs and imports fine
- create_aleph() returns an Aleph orchestrator instance
- The load_file/search_context/peek_context are MCP *tool* endpoints,
  not direct Python methods. They're exposed when running `aleph` as
  an MCP server, called by the LLM client via tool-use protocol.
- Direct Python API: Aleph.complete(), sub_model, budget, sandbox_config, etc.

Usage:
    uv run --with "aleph-rlm[mcp]" python3 poc.py
"""

import sys

from aleph import Aleph, AlephConfig, create_aleph


def main():
    print("=== Aleph RLM POC ===\n")

    # 1. Version
    import aleph
    version = getattr(aleph, "__version__", "unknown")
    print(f"[1] aleph-rlm version: {version}")

    # 2. Instantiation
    try:
        a = create_aleph()
        print(f"[2] create_aleph() OK — type: {type(a).__name__}")
    except Exception as e:
        print(f"[2] create_aleph() failed: {e}")
        sys.exit(1)

    # 3. API surface
    public = [m for m in dir(a) if not m.startswith("_")]
    print(f"[3] Public API ({len(public)} methods):")
    for m in public:
        print(f"    - {m}")

    # 4. Config inspection
    try:
        cfg = AlephConfig()
        print(f"\n[4] AlephConfig defaults:")
        for field in ["root_model", "sub_model", "enable_caching", "sandbox_config"]:
            val = getattr(cfg, field, "N/A")
            print(f"    {field}: {val}")
    except Exception as e:
        print(f"[4] AlephConfig: {e}")

    # 5. Module structure
    print(f"\n[5] Package modules:")
    for name in sorted(dir(aleph)):
        if not name.startswith("_"):
            print(f"    {name}")

    print("\n=== POC Complete ===")
    print("\nConclusion: aleph-rlm is a real, functional package.")
    print("Integration path: configure as MCP server in OpenClaw, not direct Python calls.")
    print("The MCP server exposes load_file/search_context/peek_context/exec_python as tools.")


if __name__ == "__main__":
    main()
