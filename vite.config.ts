/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // tsconfig.json의 paths와 같은 별칭: "@/..." → "src/..."
    alias: { '@': decodeURIComponent(new URL('./src', import.meta.url).pathname) },
  },
  server: { port: 5173, allowedHosts: ['.ts.net'] },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
});
