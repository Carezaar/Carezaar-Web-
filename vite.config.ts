import { defineConfig } from "vite";
import { resolve } from "node:path";

// Two entries: the app itself, and a tiny cache warmer the landing page loads on the
// same origin. The warmer keeps a fixed name so the landing can reference it.
// Profile photos are read through the app's own origin (see README → Deployment).
const uploads = { "/uploads": { target: "https://new.carezaar.com", changeOrigin: true } };

export default defineConfig({
  server: { proxy: uploads },
  preview: { proxy: uploads },
  build: {
    rollupOptions: {
      // React Router ships "use client" directives for server components; they are
      // meaningless in this client-only bundle.
      onwarn(warning, warn) {
        if (warning.code === "MODULE_LEVEL_DIRECTIVE") return;
        warn(warning);
      },
      input: { index: resolve(__dirname, "index.html"), warm: resolve(__dirname, "src/warm.ts") },
      output: { entryFileNames: (chunk) => (chunk.name === "warm" ? "assets/warm.js" : "assets/[name]-[hash].js") },
    },
  },
});
