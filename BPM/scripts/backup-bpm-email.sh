#!/usr/bin/env bash
# Run database backup then email the .sql.gz file (see send-backup-email.py).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

export BACKUP_ROOT="${BACKUP_ROOT:-${REPO_ROOT}/backups}"
LOG_FILE="${BACKUP_ROOT}/backup-history.jsonl"
mkdir -p "${BACKUP_ROOT}"

log_event() {
  local status="$1"
  local message="$2"
  local backup_file="${3:-}"
  python3 - "$LOG_FILE" "$status" "$message" "$backup_file" <<'PY'
import datetime, json, os, sys
log_file, status, message, backup_file = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4]
record = {
    "timestamp": datetime.datetime.now(datetime.UTC).isoformat(timespec="seconds").replace("+00:00", "Z"),
    "status": status,
    "message": message,
    "backupFile": backup_file,
    "backupSizeBytes": os.path.getsize(backup_file) if backup_file and os.path.exists(backup_file) else None,
}
with open(log_file, "a", encoding="utf-8") as f:
    f.write(json.dumps(record, ensure_ascii=False) + "\n")
PY
}

log_event "started" "Backup job started."
if ! "${SCRIPT_DIR}/backup-bpm-database.sh"; then
  log_event "failed" "Database backup command failed."
  exit 1
fi

# Do NOT use `ls | head` under `set -o pipefail`: with many backups, `ls` gets
# SIGPIPE and the whole job exits before the email step (silent fail since Sep 17).
LATEST=""
newest_mtime=0
shopt -s nullglob
for candidate in "${BACKUP_ROOT}"/bpm_backup_*.sql.gz; do
  [[ -f "${candidate}" ]] || continue
  mtime="$(stat -c '%Y' "${candidate}")"
  if (( mtime >= newest_mtime )); then
    newest_mtime="${mtime}"
    LATEST="${candidate}"
  fi
done
shopt -u nullglob

if [[ -z "${LATEST}" || ! -f "${LATEST}" ]]; then
  log_event "failed" "No backup file found after backup command."
  echo "No backup file found under ${BACKUP_ROOT}" >&2
  exit 1
fi

log_event "backup_created" "Backup file created." "${LATEST}"
if OUTPUT="$(python3 "${SCRIPT_DIR}/send-backup-email.py" "${LATEST}" 2>&1)"; then
  echo "${OUTPUT}"
  log_event "email_sent" "${OUTPUT}" "${LATEST}"
else
  echo "${OUTPUT}" >&2
  log_event "failed" "Email send failed: ${OUTPUT}" "${LATEST}"
  exit 1
fi
