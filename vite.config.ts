import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const backend = process.env.API_URL || "http://127.0.0.1:8000";

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    port: 5173,
    proxy: { "/api": backend, "/media": backend, "/sitemap.xml": backend, "/robots.txt": backend },
  },
  build: { chunkSizeWarningLimit: 1500 },
});
