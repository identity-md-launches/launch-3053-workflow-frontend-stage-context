import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Relative base so the export loads from an IPFS gateway subpath or an ENS name without rewrites.
export default defineConfig({
  base: "./",
  plugins: [react()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    sourcemap: false,
    chunkSizeWarningLimit: 1200,
  },
});
