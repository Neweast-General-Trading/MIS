module.exports = {
  apps: [
    {
      name: 'mis-dashboard-api',
      cwd: '/home/negt/MIS/server',
      script: 'dist/index.js',
      instances: 1,
      autorestart: true,
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
