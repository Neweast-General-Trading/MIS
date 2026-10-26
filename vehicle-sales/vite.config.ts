import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  base: '/ksa/vehicle-sales/',
  plugins: [react()],
  server: {
    port: 4018,
    host: true,
    proxy: { '/api': 'http://127.0.0.1:4012' },
  },
});
