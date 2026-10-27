/**
 * What the telemetry loader starts on this page view, decided from the
 * build's environment and the current host. Pure, so the decision is
 * unit-tested; `components/telemetry/telemetry.tsx` only executes it.
 */
import { isIndexableHost } from "@/lib/seo/indexing";

import { CF_BEACON_SCRIPT, analyticsToken, sentryDsn, type TelemetryEnv } from "./config";

export interface TelemetryPlan {
  /** Cloudflare Web Analytics: production host only, never on previews. */
  analytics: { token: string; script: string } | null;
  /** Sentry error reporting, loaded on the first error. */
  errors: { dsn: string; environment: "production" | "preview" } | null;
}

export function telemetryPlan(env: TelemetryEnv, host: string, base?: URL): TelemetryPlan {
  const production = isIndexableHost(host, base);
  const token = analyticsToken(env);
  const dsn = sentryDsn(env);
  return {
    analytics: token && production ? { token, script: CF_BEACON_SCRIPT } : null,
    errors: dsn ? { dsn, environment: production ? "production" : "preview" } : null,
  };
}

/** The beacon's `data-cf-beacon` value; SPA navigation tracking stays on. */
export function beaconConfig(token: string): string {
  return JSON.stringify({ token, spa: true });
}
