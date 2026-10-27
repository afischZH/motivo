import { defineCloudflareConfig } from "@opennextjs/cloudflare";
import staticAssetsIncrementalCache from "@opennextjs/cloudflare/overrides/incremental-cache/static-assets-incremental-cache";

// Prerendered pages (landing pages, catalogue, converters), sitemap, robots,
// motif SVGs and OG images are served from Workers Static Assets: read-only,
// no revalidation, no per-request rendering. Switch to the R2 incremental
// cache once ISR pages exist (https://opennext.js.org/cloudflare/caching).
export default defineCloudflareConfig({
  incrementalCache: staticAssetsIncrementalCache,
  enableCacheInterception: true,
});
