/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// 백엔드 주소. 백엔드를 Tailscale IP에 바인딩했으면 BACKEND_URL=http://100.x.y.z:8080 으로 띄운다.
declare const process: { env: Record<string, string | undefined> };
const backend = process.env.BACKEND_URL ?? 'http://localhost:8080';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // tsconfig.json의 paths와 같은 별칭: "@/..." → "src/..."
    alias: { '@': decodeURIComponent(new URL('./src', import.meta.url).pathname) },
  },
  server: {
    port: 5173,
    allowedHosts: ['.ts.net'],
    // 브라우저는 같은 주소만 호출하므로 Tailscale로 접속해도 CORS 설정이 필요 없다.
    proxy: { '/api': backend, '/swagger': backend, '/openapi.yaml': backend },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test-setup.ts'],
  },
});
