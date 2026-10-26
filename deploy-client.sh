#!/bin/bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")" && pwd)"
DEPLOY="/var/www/mis-dashboard"

echo "Building Group Analysis hub…"
cd "$ROOT/hub"
npm run build
mkdir -p "$DEPLOY/assets"
rsync -a dist/index.html "$DEPLOY/"
rsync -a --delete dist/assets/ "$DEPLOY/assets/"
cp "$ROOT/hub/public/logo.png" "$DEPLOY/logo.png"

echo "Building Work Load Analysis client…"
cd "$ROOT/client"
npm run build
mkdir -p "$DEPLOY/WorkLoadAnalysis"
rsync -a --delete dist/ "$DEPLOY/WorkLoadAnalysis/"
rm -rf "$DEPLOY/WLD"

echo "Building Attendance Discrepancy client…"
cd "$ROOT/attendance"
npm run build
mkdir -p "$DEPLOY/AttendanceDiscrepancy"
rsync -a --delete dist/ "$DEPLOY/AttendanceDiscrepancy/"
cp "$ROOT/hub/public/logo.png" "$DEPLOY/AttendanceDiscrepancy/logo.png"

echo "Building eOrder Analysis (PFB)…"
cd "$ROOT/PFB"
npm run build
mkdir -p "$DEPLOY/PFB"
rsync -a --delete dist/ "$DEPLOY/PFB/"
cp "$ROOT/PFB/public/logo.png" "$DEPLOY/PFB/logo.png"

echo "Building KSA Intercompany Tracking…"
cd "$ROOT/ksa-intercompany"
npm run build
mkdir -p "$DEPLOY/ksa/intercompany"
rsync -a --delete dist/ "$DEPLOY/ksa/intercompany/"
cp "$ROOT/ksa-intercompany/public/logo.png" "$DEPLOY/ksa/intercompany/logo.png"

echo "Building KSA Vehicle Sales Track…"
cd "$ROOT/vehicle-sales"
npm run build
mkdir -p "$DEPLOY/ksa/vehicle-sales"
rsync -a --delete dist/ "$DEPLOY/ksa/vehicle-sales/"
cp "$ROOT/vehicle-sales/public/logo.png" "$DEPLOY/ksa/vehicle-sales/logo.png"

echo "Building NE02 Approval…"
cd "$ROOT/ne02-approval"
npm run build
mkdir -p "$DEPLOY/ne02-approval"
rsync -a --delete dist/ "$DEPLOY/ne02-approval/"
cp "$ROOT/hub/public/logo.png" "$DEPLOY/ne02-approval/logo.png" 2>/dev/null || true

echo "Building HQ Access & Attendance…"
cd "$ROOT/hq-attendance"
npm run build
mkdir -p "$DEPLOY/hq-attendance"
rsync -a --delete dist/ "$DEPLOY/hq-attendance/"
cp "$ROOT/hub/public/logo.png" "$DEPLOY/hq-attendance/logo.png" 2>/dev/null || true

echo "Building Audit Log UI…"
cd "$ROOT/audit-trail"
npm run build
mkdir -p "$DEPLOY/audit-log"
rsync -a --delete dist/ "$DEPLOY/audit-log/"
cp "$ROOT/hub/public/logo.png" "$DEPLOY/audit-log/logo.png" 2>/dev/null || true

echo "Deployed hub, Work Load Analysis, Attendance Discrepancy, eOrder, KSA Intercompany, Vehicle Sales, NE02, HQ Attendance, Audit Log UI."
