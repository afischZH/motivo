import type { MetadataRoute } from "next";

export const dynamic = "force-static";

// Not public yet: the X-Robots-Tag header (lib/security-headers.ts) keeps
// pages out of the index; robots.txt stays open so crawlers can see it.
export default function robots(): MetadataRoute.Robots {
  return { rules: { userAgent: "*", allow: "/" } };
}
