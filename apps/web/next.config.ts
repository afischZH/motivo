import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

import { noindexHeaderRule } from "./lib/seo/indexing";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source and must be compiled by Next.
  transpilePackages: [
    "@motivo/engine",
    "@motivo/tool-registry",
    "@motivo/exporters",
    "@motivo/editor-ui",
  ],
  // Only the production host is indexable; previews and other hosts get
  // `X-Robots-Tag: noindex` (lib/seo/indexing.ts).
  headers() {
    return Promise.resolve([noindexHeaderRule()]);
  },
};

export default withNextIntl(nextConfig);
