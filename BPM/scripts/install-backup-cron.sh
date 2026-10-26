#!/usr/bin/env bash
# Install twice-daily BPM backup email cron (04:00 and 12:00 Asia/Dubai).
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CRON_SRC="${SCRIPT_DIR}/bpm-backup-email.cron"
CRON_DST="/etc/cron.d/bpm-backup-email"
LOG_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)/.run/logs"

if [[ "$(id -u)" -ne 0 ]]; then
  echo "Run as root: sudo bash ${SCRIPT_DIR}/install-backup-cron.sh" >&2
  exit 1
fi

mkdir -p "${LOG_DIR}"
install -m 644 "${CRON_SRC}" "${CRON_DST}"
echo "Installed ${CRON_DST}"
echo "Schedule: daily at 04:00 and 12:00 (server TZ: $(timedatectl show -p Timezone --value 2>/dev/null || date +%Z))"
grep -v '^#' "${CRON_DST}" | grep -v '^$' || true
