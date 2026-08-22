import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

/**
 * The API is proxied rather than called across origins, so there is no CORS
 * configuration to get wrong in development and the dashboard talks to a
 * same-origin path exactly as it would in production behind one host.
 */
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: process.env.AERA_API_URL ?? 'http://127.0.0.1:8000',
        changeOrigin: true,
      },
    },
  },
});
