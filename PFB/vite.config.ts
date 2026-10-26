import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/PFB/',
  plugins: [react()],
  server: {
    port: 4016,
    host: true,
    proxy: {
      '/api': 'http://127.0.0.1:4012',
    },
  },
  preview: {
    port: 4016,
    host: true,
    proxy: {
      '/api': 'http://127.0.0.1:4012',
    },
  },
});
