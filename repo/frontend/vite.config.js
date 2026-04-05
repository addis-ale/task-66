import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const backendUrl = process.env.VITE_BACKEND_URL || '';

export default defineConfig({
  plugins: [react()],
  server: backendUrl
    ? {
        proxy: {
          '/api/v1': {
            target: backendUrl,
            changeOrigin: true
          }
        }
      }
    : {}
});
