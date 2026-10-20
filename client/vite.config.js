import { defineConfig } from 'vite';

const SERVER = process.env.VITE_SERVER_URL || 'http://localhost:3001';

export default defineConfig({
  server: {
    port: 5173,
    host: true,
    strictPort: false,
    proxy: {
      '/api': { target: SERVER, changeOrigin: true },
      '/socket.io': { target: SERVER, changeOrigin: true, ws: true }
    }
  },
  preview: {
    port: 4173,
    proxy: {
      '/api': { target: SERVER, changeOrigin: true },
      '/socket.io': { target: SERVER, changeOrigin: true, ws: true }
    }
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 1600
  }
});
