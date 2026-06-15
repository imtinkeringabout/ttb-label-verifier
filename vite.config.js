import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The frontend builds to dist/. Cloudflare Pages serves dist/ statically and runs
// everything in /functions as serverless endpoints on the SAME origin. So the browser
// only ever calls /api/* — it never talks to the model provider directly and never
// sees an API key.
//
// `server.proxy` lets `npm run dev` (Vite on :5173) forward /api/* to a local
// `wrangler pages dev` instance on :8788 so you can develop the full stack locally.
export default defineConfig({
  plugins: [react()],
  build: { outDir: 'dist', sourcemap: false },
  server: {
    port: 5173,
    proxy: {
      '/api': { target: 'http://127.0.0.1:8788', changeOrigin: true }
    }
  }
});
