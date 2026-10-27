import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirrors the "@/*" path in tsconfig.json.
    alias: { "@": fileURLToPath(new URL(".", import.meta.url)) },
  },
  test: {
    exclude: ["e2e/**", "node_modules/**", ".next/**", ".open-next/**"],
    // next-intl imports "next/navigation" without an extension, which Node's
    // ESM resolver rejects; inlining lets Vite resolve it.
    server: { deps: { inline: ["next-intl"] } },
  },
});
