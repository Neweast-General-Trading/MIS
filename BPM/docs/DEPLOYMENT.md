# Deployment runbook

Target: a Linux host (Ubuntu 22.04+) running nginx, Node.js ≥ 20 and Docker.

## 1. Server prerequisites

```bash
sudo apt-get update
sudo apt-get install -y nginx git curl ca-certificates logrotate
# Node.js 20+ (example via nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.1/install.sh | bash
nvm install 20
# Docker (for PostgreSQL)  → https://docs.docker.com/engine/install/
# Chrome/Chromium for PDF + Mermaid (optional but recommended)
sudo apt-get install -y chromium-browser || true
```

## 2. Get the code

```bash
sudo mkdir -p /opt/bpm && sudo chown "$USER" /opt/bpm
git clone https://github.com/Neweast-General-Trading/BPM.git /opt/bpm
cd /opt/bpm && npm run install:all
```

## 3. PostgreSQL

`docker compose` reads `DB_PASSWORD` from `bpm-api/.env`, so create the file first (step 4 explains
every value), then start the database:

```bash
cd /opt/bpm/bpm-api
cp .env.example .env && chmod 600 .env     # set DB_PASSWORD (and the values from step 4)
docker compose up -d                        # PostgreSQL 16 on 127.0.0.1:55432
```

## 4. API

```bash
cd /opt/bpm/bpm-api
nano .env                                   # edit the file created in step 3
```

Minimum production values:

```dotenv
NODE_ENV=production
REQUIRE_JWT_AUTH=true
ALLOW_X_USER_EMAIL=false
JWT_SECRET=<openssl rand -base64 48>
PORT=3010
HOST=127.0.0.1
DB_HOST=127.0.0.1
DB_PORT=55432
DB_PASSWORD=<same as above>
FRONTEND_ORIGIN=https://bpm.example.com
PUBLIC_APP_URL=https://bpm.example.com
ADMINISTRATOR_EMAIL=you@example.com
ADMIN_INITIAL_PASSWORD=<one-time password>
```

```bash
npm ci && npm run build
sudo cp ../deploy/bpm-api.service.example /etc/systemd/system/bpm-api.service
sudoedit /etc/systemd/system/bpm-api.service     # paths / user
sudo systemctl daemon-reload && sudo systemctl enable --now bpm-api
curl -s http://127.0.0.1:3010/health
```

Optional — Mermaid diagrams for Word exports:

```bash
npm install --prefix tools/mermaid
```

## 5. Web UI

```bash
cd /opt/bpm/material-kit-react
echo 'VITE_API_BASE_URL=https://bpm.example.com' > .env
npm ci && npm run build        # output: dist/
```

## 6. nginx + TLS

```bash
sudo cp /opt/bpm/deploy/nginx.conf.example /etc/nginx/sites-available/bpm
sudoedit /etc/nginx/sites-available/bpm          # server_name, root, certificates
sudo ln -s /etc/nginx/sites-available/bpm /etc/nginx/sites-enabled/bpm
sudo nginx -t && sudo systemctl reload nginx
sudo certbot --nginx -d bpm.example.com          # TLS certificates
```

## 7. Log rotation

```bash
sudo tee /etc/logrotate.d/bpm-api >/dev/null <<'EOF'
/var/log/bpm-api.log {
  daily
  rotate 7
  maxsize 50M
  missingok
  notifempty
  copytruncate
  compress
}
EOF
```

(Not needed when the unit logs to the journal.)

## 8. Backups

```bash
cd /opt/bpm
./scripts/backup-bpm-database.sh
cp scripts/backup-email.env.example scripts/backup-email.env && chmod 600 scripts/backup-email.env
./scripts/install-backup-cron.sh
```

## 9. Updating a running install

```bash
cd /opt/bpm && git pull
cd bpm-api && npm ci && npm run build && sudo systemctl restart bpm-api
cd ../material-kit-react && npm ci && npm run build        # nginx serves the new dist/
```

## Troubleshooting

| Symptom | Check |
|---------|-------|
| API does not start | `journalctl -u bpm-api -n 100`; verify `.env` and PostgreSQL |
| `403` after sign-in | `REQUIRE_JWT_AUTH`, `JWT_SECRET`, user enabled and role enabled |
| PDF / diagrams fail | Install Chrome/Chromium or set `MERMAID_CHROME_PATH` |
| Oracle lists empty | `ORACLE_HCM_*` values and outbound connectivity |
| Browser refresh shows JSON | nginx SPA rules (`$bpm_is_browser_document`) in the template |
