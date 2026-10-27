/**
 * Production wiring of the waitlist handlers for the route files. Server only.
 */
import type { Messages } from "next-intl";
import { after } from "next/server";

import type { EnabledLocale } from "@/i18n/locales";
import { siteUrl } from "@/lib/seo/site-url";

import { waitlistConfig } from "./config";
import type { WaitlistDeps } from "./handlers";

export function waitlistDeps(): WaitlistDeps {
  return {
    // Read per request: Worker secrets are runtime values, not build-time ones.
    config: waitlistConfig(),
    baseUrl: siteUrl(),
    // The e-mail reads app namespaces only; the editor package's are not needed.
    messages: async (locale: EnabledLocale) =>
      ((await import(`@/messages/${locale}.json`)) as { default: unknown }).default as Messages,
    // Sends the mail after the response (Cloudflare: ctx.waitUntil via OpenNext).
    defer: (task) => after(task),
  };
}
