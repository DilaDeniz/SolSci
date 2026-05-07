import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  define: {
    "process.env": {},
    global: "globalThis",
  },
  resolve: {
    alias: {
      buffer: "buffer",
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes("node_modules/react") || id.includes("node_modules/react-dom")) {
            return "react-vendor";
          }
          if (id.includes("@solana/web3.js") || id.includes("@coral-xyz/anchor")) {
            return "solana-core";
          }
          if (id.includes("wallet-adapter")) {
            return "solana-wallet";
          }
        },
      },
    },
  },
});
