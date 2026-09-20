import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Integration tests start an isolated API on their own port and point the preview
// server at it. Production/dev behaviour is unchanged when API_PROXY_TARGET is unset.
const apiProxyTarget = process.env.API_PROXY_TARGET || 'http://127.0.0.1:3001';

const apiProxy = {
  '/api': {
    target: apiProxyTarget,
    changeOrigin: true,
  },
};

export default defineConfig({
  plugins: [react()],
  server: {
    host: '0.0.0.0',
    port: 5173,
    proxy: apiProxy,
  },
  preview: {
    proxy: apiProxy,
  },
});
