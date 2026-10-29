import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    host: "0.0.0.0",
    port: 4179,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:4183",
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 4179,
    strictPort: true,
    proxy: {
      "/api": "http://127.0.0.1:4183",
    },
  },
  build: {
    outDir: "../public",
    emptyOutDir: false,
  },
});
