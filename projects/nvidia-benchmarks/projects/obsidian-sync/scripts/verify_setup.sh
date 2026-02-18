#!/usr/bin/env bash
set -euo pipefail

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENV_FILE="${PROJECT_ROOT}/.env"

required_keys=(
  COUCHDB_USER
  COUCHDB_PASSWORD
  COUCHDB_DOMAIN
  COUCHDB_PROTOCOL
  COUCHDB_PORT
  COUCHDB_DB_NAME
)

if [[ ! -f "${ENV_FILE}" ]]; then
  echo "[ERROR] Missing .env file: ${ENV_FILE}" >&2
  exit 1
fi

missing_keys=()
empty_keys=()

for key in "${required_keys[@]}"; do
  line="$(grep -E "^${key}=" "${ENV_FILE}" | tail -n 1 || true)"

  if [[ -z "${line}" ]]; then
    missing_keys+=("${key}")
    continue
  fi

  value="${line#*=}"
  if [[ -z "${value//[[:space:]]/}" ]]; then
    empty_keys+=("${key}")
  fi
done

if (( ${#missing_keys[@]} > 0 )); then
  echo "[ERROR] Missing required .env keys: ${missing_keys[*]}" >&2
  exit 1
fi

if (( ${#empty_keys[@]} > 0 )); then
  echo "[ERROR] Empty required .env values: ${empty_keys[*]}" >&2
  exit 1
fi

if grep -qE '^COUCHDB_PASSWORD=REPLACE_' "${ENV_FILE}"; then
  echo "[WARN] COUCHDB_PASSWORD still uses placeholder value."
fi

echo "[OK] .env validation passed"
echo "[INFO] Running docker compose config..."
(
  cd "${PROJECT_ROOT}"
  docker compose config >/dev/null
)
echo "[OK] docker compose config passed"
