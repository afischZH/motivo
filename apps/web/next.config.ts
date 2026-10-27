import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source and must be compiled by Next.
  transpilePackages: ["@motivo/engine", "@motivo/tool-registry", "@motivo/editor-ui"],
};

export default withNextIntl(nextConfig);
