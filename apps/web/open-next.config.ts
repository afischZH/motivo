import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// No incremental cache yet: all pages are static or dynamic without ISR.
// Add the R2 incremental cache once ISR pages exist (https://opennext.js.org/cloudflare/caching).
export default defineCloudflareConfig({});
