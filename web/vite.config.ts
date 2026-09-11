import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

// The API and generated media are proxied in dev, so the browser only ever
// talks to one origin and no provider key is ever exposed to the client.
const API = process.env.VITE_API_TARGET || 'http://localhost:8787';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': { target: API, changeOrigin: true },
      '/files': { target: API, changeOrigin: true },
    },
  },
});
