import type { NextConfig } from "next";
import createNextIntlPlugin from "next-intl/plugin";

import { localHostHeaderRule, securityHeaders } from "./lib/security-headers";
import { noindexHeaderRule } from "./lib/seo/indexing";
import { externalServices, telemetryEnv } from "./lib/telemetry/config";

const withNextIntl = createNextIntlPlugin("./i18n/request.ts");

const nextConfig: NextConfig = {
  // Workspace packages ship TypeScript source and must be compiled by Next.
  transpilePackages: [
    "@motivo/engine",
    "@motivo/tool-registry",
    "@motivo/exporters",
    "@motivo/editor-ui",
    "@motivo/svg-sanitizer",
  ],
  // Always defined (empty when unset), so Next inlines them into the client
  // bundle and drops the analytics and Sentry code paths from builds without
  // them (lib/telemetry/config.ts).
  env: {
    NEXT_PUBLIC_CF_ANALYTICS_TOKEN: process.env.NEXT_PUBLIC_CF_ANALYTICS_TOKEN ?? "",
    NEXT_PUBLIC_SENTRY_DSN: process.env.NEXT_PUBLIC_SENTRY_DSN ?? "",
    // External donation page (lib/donation.ts); a plain link, no script.
    NEXT_PUBLIC_DONATION_URL: process.env.NEXT_PUBLIC_DONATION_URL ?? "",
  },
  // CSP and friends on every response, including proxy redirects. Static
  // assets on Cloudflare get the same set from public/_headers. Only the
  // production host is indexable; previews and other hosts get
  // `X-Robots-Tag: noindex` (lib/seo/indexing.ts).
  async headers() {
    const options = {
      dev: process.env.NODE_ENV === "development",
      // Analytics and Sentry origins only when their variables are set.
      services: externalServices(telemetryEnv()),
    };
    return [
      { source: "/:path*", headers: securityHeaders(options) },
      // `next start` on http://localhost (E2E): no https upgrade, no HSTS.
      localHostHeaderRule(options),
      noindexHeaderRule(),
    ];
  },
};

export default withNextIntl(nextConfig);
