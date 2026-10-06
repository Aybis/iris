import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    rollupOptions: {
      output: { manualChunks: { charts: ["recharts"], validation: ["zod"] } },
    },
  },
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": { target: "http://127.0.0.1:3001", changeOrigin: false },
      "/ws": { target: "ws://127.0.0.1:3001", ws: true, changeOrigin: false },
    },
  },
});
