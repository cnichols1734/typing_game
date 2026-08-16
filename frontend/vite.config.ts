import { defineConfig } from "vite";

export default defineConfig({
  server: {
    port: 5173,
    host: "127.0.0.1",
    proxy: {
      "/api": "http://127.0.0.1:5002",
    },
  },
  build: {
    outDir: "dist",
    target: "es2022",
  },
  optimizeDeps: {
    include: ["three"],
  },
});
