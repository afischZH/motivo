import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

import { securityHeaders } from "./lib/security-headers";
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
  // CSP and friends on every response, including proxy redirects. Static
  // assets on Cloudflare get the same set from public/_headers. Only the
  // production host is indexable; previews and other hosts get
  // `X-Robots-Tag: noindex` (lib/seo/indexing.ts).
  async headers() {
    return [
      {
        source: "/:path*",
        headers: securityHeaders({ dev: process.env.NODE_ENV === "development" }),
      },
      noindexHeaderRule(),
    ];
  },
};

export default withNextIntl(nextConfig);
