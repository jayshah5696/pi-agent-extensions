# AGENTS.md - Obsidian Sync

## Context
- Goal: Run CouchDB as the LiveSync hub for Obsidian devices over Tailscale.
- Runtime: Docker Compose on homeserver (Debian 12).

## Rules
- Keep `couchdb:3.3.3` unless explicitly upgraded.
- Never expose CouchDB publicly; keep ingress Tailscale-only.
- Never commit real credentials; placeholders only.
- Mirror deployment changes in `README.md` and `STATUS.md`.
