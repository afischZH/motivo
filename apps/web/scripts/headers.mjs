/**
 * Writes `public/_headers` (security headers for files that Cloudflare
 * Workers Static Assets serves without the Worker) from
 * `lib/security-headers.ts`. Runs before `next build` and `next dev`.
 *
 * The CSP allows Cloudflare Web Analytics, Sentry or the Ko-fi widget only
 * when `NEXT_PUBLIC_CF_ANALYTICS_TOKEN`, `NEXT_PUBLIC_SENTRY_DSN` or a Ko-fi
 * `NEXT_PUBLIC_DONATION_URL` is set for this build, exactly like `next.config.ts`, so the file and the Worker's
 * headers come from the same environment and never disagree.
 */
import { mkdir, writeFile } from "node:fs/promises";
import { register } from "node:module";

register("./ts-resolve-hook.mjs", import.meta.url);

const [{ cloudflareHeadersFile }, { externalServices, telemetryEnv }] = await Promise.all([
  import("../lib/security-headers.ts"),
  import("../lib/telemetry/config.ts"),
]);

// `next build` runs with NODE_ENV=production; this script runs before it.
const env = { ...telemetryEnv(), NODE_ENV: "production" };
const services = externalServices(env);
// `public/` holds only generated files, so a fresh checkout has none.
await mkdir(new URL("../public/", import.meta.url), { recursive: true });
await writeFile(new URL("../public/_headers", import.meta.url), cloudflareHeadersFile(services));

const enabled = Object.entries(services)
  .filter(([, on]) => on)
  .map(([name]) => name);
console.log(
  `headers: public/_headers written (external services: ${enabled.join(", ") || "none"})`,
);
