#!/usr/bin/env bash
# Creates a compressed SQL backup of the BPM PostgreSQL database.
# Uses pg_dump (read-only snapshot style reads); does not block normal app usage.
#
# Usage:
#   ./scripts/backup-bpm-database.sh
#   BACKUP_ROOT=/var/backups/bpm ./scripts/backup-bpm-database.sh
#
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
ENV_FILE="${REPO_ROOT}/bpm-api/.env"

BACKUP_ROOT="${BACKUP_ROOT:-${REPO_ROOT}/backups}"
mkdir -p "${BACKUP_ROOT}"

TS="$(date +%Y%m%d_%H%M%S)"
OUT="${BACKUP_ROOT}/bpm_backup_${TS}.sql.gz"

load_env_password() {
  if [[ -f "${ENV_FILE}" ]]; then
    # shellcheck disable=SC1090
    set -a
    # shellcheck source=/dev/null
    source "${ENV_FILE}" 2>/dev/null || true
    set +a
  fi
}

dump_via_docker() {
  docker exec -u postgres bpm-postgres \
    pg_dump -U postgres -d bpm --no-owner --no-acl \
    | gzip -9 > "${OUT}"
}

dump_via_network() {
  load_env_password
  export PGPASSWORD="${DB_PASSWORD:-postgres}"
  local host="${DB_HOST:-localhost}"
  local port="${DB_PORT:-55432}"
  local user="${DB_USER:-postgres}"
  local db="${DB_NAME:-bpm}"
  pg_dump -h "${host}" -p "${port}" -U "${user}" -d "${db}" \
    --no-owner --no-acl \
    | gzip -9 > "${OUT}"
}

if docker ps --format '{{.Names}}' 2>/dev/null | grep -qx 'bpm-postgres'; then
  dump_via_docker
else
  if ! command -v pg_dump >/dev/null 2>&1; then
    echo "Neither Docker container 'bpm-postgres' nor pg_dump on PATH is available." >&2
    exit 1
  fi
  dump_via_network
fi

SIZE="$(du -h "${OUT}" | cut -f1)"
echo "Backup written: ${OUT} (${SIZE})"
