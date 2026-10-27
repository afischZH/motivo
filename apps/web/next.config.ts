import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source and must be compiled by Next.
  transpilePackages: ["@motivo/engine"],
};

export default nextConfig;
