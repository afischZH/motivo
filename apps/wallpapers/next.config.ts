import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

import { SECURITY_HEADERS } from "./lib/security-headers";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source and must be compiled by Next.
  transpilePackages: [
    "@musterli/devices",
    "@musterli/editor-ui",
    "@musterli/effects",
    "@musterli/engine",
    "@musterli/exporters",
    "@musterli/shaders",
    "@musterli/svg-sanitizer",
    "@musterli/tool-registry",
  ],
  async headers() {
    return [{ source: "/:path*", headers: [...SECURITY_HEADERS] }];
  },
};

export default withNextIntl(nextConfig);
