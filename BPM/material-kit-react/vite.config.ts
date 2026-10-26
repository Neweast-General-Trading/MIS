import path from 'path';
import { fileURLToPath } from 'url';
import checker from 'vite-plugin-checker';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';

// ----------------------------------------------------------------------

const PORT = 3039;
const API_PROXY_TARGET = process.env.VITE_API_PROXY_TARGET ?? 'http://127.0.0.1:3010';

// Resolve relative to this config file so the `src/` alias works regardless
// of which cwd Vite is launched from (avoids broken lazy chunks that bounce
// users to /sign-in when the cwd isn't material-kit-react/).
const projectRoot = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [
    react(),
    checker({
      typescript: true,
      eslint: {
        useFlatConfig: true,
        lintCommand: 'eslint "./src/**/*.{js,jsx,ts,tsx}"',
        // Keep ESLint running for terminal output, but never surface its
        // findings on the dev overlay. This prevents transient resolver
        // glitches (import/no-unresolved) from blocking the running app
        // and forcing logout via lazy-chunk failures.
        dev: { logLevel: [] },
      },
      overlay: false,
    }),
  ],
  resolve: {
    alias: [
      {
        find: /^src(.+)/,
        replacement: path.resolve(projectRoot, 'src/$1'),
      },
    ],
  },
  server: {
    port: PORT,
    host: true,
    proxy: {
      '/auth': { target: API_PROXY_TARGET, changeOrigin: true },
      '/access-control': { target: API_PROXY_TARGET, changeOrigin: true },
      '/companies': { target: API_PROXY_TARGET, changeOrigin: true },
      '/departments': { target: API_PROXY_TARGET, changeOrigin: true },
      '/maintenance': { target: API_PROXY_TARGET, changeOrigin: true },
      '/process-documentation': { target: API_PROXY_TARGET, changeOrigin: true },
      '/ai-bpm': { target: API_PROXY_TARGET, changeOrigin: true },
      '/bpm-assistant': { target: API_PROXY_TARGET, changeOrigin: true },
      '/activity-templates': { target: API_PROXY_TARGET, changeOrigin: true },
      '/health': { target: API_PROXY_TARGET, changeOrigin: true },
      '/system-health': { target: API_PROXY_TARGET, changeOrigin: true },
      '/docx': { target: API_PROXY_TARGET, changeOrigin: true },
    },
  },
  preview: {
    port: PORT,
    host: true,
    proxy: {
      '/auth': { target: API_PROXY_TARGET, changeOrigin: true },
      '/access-control': { target: API_PROXY_TARGET, changeOrigin: true },
      '/companies': { target: API_PROXY_TARGET, changeOrigin: true },
      '/departments': { target: API_PROXY_TARGET, changeOrigin: true },
      '/maintenance': { target: API_PROXY_TARGET, changeOrigin: true },
      '/process-documentation': { target: API_PROXY_TARGET, changeOrigin: true },
      '/ai-bpm': { target: API_PROXY_TARGET, changeOrigin: true },
      '/bpm-assistant': { target: API_PROXY_TARGET, changeOrigin: true },
      '/activity-templates': { target: API_PROXY_TARGET, changeOrigin: true },
      '/health': { target: API_PROXY_TARGET, changeOrigin: true },
      '/system-health': { target: API_PROXY_TARGET, changeOrigin: true },
      '/docx': { target: API_PROXY_TARGET, changeOrigin: true },
    },
  },
});
