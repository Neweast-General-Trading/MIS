/**
 * PM2: keep the web UI running with auto-restart.
 * The API is managed by systemd (`bpm-api.service`) — see deploy/bpm-api.service.example — use `npm run api:restart`.
 *
 * From repo root:
 *   npm run pm2:start
 *   npm run pm2:save
 *   npm run pm2:startup   # follow the printed sudo command once (auto-start on boot)
 *
 * Logs: npm run pm2:logs
 * Stop: npm run pm2:stop
 */
const path = require('path');

const root = __dirname;

module.exports = {
  apps: [
    {
      name: 'bpm-web',
      cwd: path.join(root, 'material-kit-react'),
      script: 'npm',
      args: 'run dev -- --host 0.0.0.0 --port 5173',
      interpreter: 'none',
      autorestart: true,
      max_restarts: 80,
      min_uptime: '10s',
      exp_backoff_restart_delay: 2000,
      env: { NODE_ENV: 'development' },
    },
  ],
};
