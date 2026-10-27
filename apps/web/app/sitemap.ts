import type { MetadataRoute } from "next";

import { sitemapEntries } from "@/lib/seo/sitemap";

// Generated once at build time and served as a static file.
export const dynamic = "force-static";

export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapEntries();
}
