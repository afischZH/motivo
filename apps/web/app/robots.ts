import type { MetadataRoute } from "next";

import { siteUrl } from "@/lib/seo/site-url";

// Generated once at build time. Previews are kept out of the index by the
// host-based X-Robots-Tag header (lib/seo/indexing.ts), not by this file:
// a robots.txt `Disallow` would stop crawlers from seeing that header.
export const dynamic = "force-static";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: "*", allow: "/" },
    sitemap: new URL("/sitemap.xml", siteUrl()).toString(),
  };
}
