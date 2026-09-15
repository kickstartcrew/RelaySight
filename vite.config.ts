import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    target: 'esnext',
    sourcemap: true,
  },
  server: {
    host: true,
    port: 5173,
    strictPort: true,
  },
});
