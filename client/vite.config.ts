import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/WorkLoadAnalysis/',
  plugins: [react()],
  server: {
    port: 4013,
    host: true,
    proxy: {
      '/api': 'http://127.0.0.1:4012',
    },
  },
  preview: {
    port: 4013,
    host: true,
    allowedHosts: ['sp.neweast.cloud', 'localhost', '127.0.0.1'],
    proxy: {
      '/api': 'http://127.0.0.1:4012',
    },
  },
});
