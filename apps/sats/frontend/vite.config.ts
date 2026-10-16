import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Dev: /api/* is proxied to the deployed Worker, so `npm run dev` shows real data.
// Alamat worker tidak ditulis di sini (beda per akun): set VITE_API_TARGET, mis.
//   $env:VITE_API_TARGET="https://sats-radar.<subdomain>.workers.dev"; npm run dev
// Tanpa VITE_API_TARGET, proxy /api tidak dipasang (jalankan `npx wrangler dev` di ../worker lalu arahkan ke http://localhost:8787).
// Behind an office SSL proxy start dev with: $env:NODE_OPTIONS="--use-system-ca"; npm run dev
const API = process.env.VITE_API_TARGET;

export default defineConfig({
  plugins: [react()],
  server: {
    proxy: API ? { "/api": { target: API, changeOrigin: true } } : undefined,
  },
});
