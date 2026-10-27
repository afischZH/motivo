import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source and must be compiled by Next.
  transpilePackages: ["@motivo/engine"],
  webpack(config: { resolve: { extensionAlias?: Record<string, string[]> } }) {
    // Workspace packages use ESM-style `./file.js` specifiers that point at `.ts` sources.
    // Turbopack cannot map these yet, so dev and build run on webpack (see package.json).
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
    };
    return config;
  },
};

export default nextConfig;
