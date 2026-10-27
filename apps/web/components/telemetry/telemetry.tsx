"use client";

import { useEffect } from "react";

import { telemetryEnv } from "@/lib/telemetry/config";
import { beaconConfig, telemetryPlan } from "@/lib/telemetry/plan";
import { createLazyReporter, installGlobalHandlers, stripUrl } from "@/lib/telemetry/reporter";

/**
 * The Sentry chunk, referenced only when the build sets a DSN. Next inlines
 * the variable, so builds without it drop the import and ship no Sentry code.
 */
const loadSentry = process.env.NEXT_PUBLIC_SENTRY_DSN
  ? () => import("@/lib/telemetry/sentry")
  : null;

/** Runs `task` when the browser is idle (or soon after, where unsupported). */
function whenIdle(task: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(task, { timeout: 4000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(task, 1500);
  return () => window.clearTimeout(id);
}

/**
 * Cookie-free analytics and error reporting, both off unless the build sets
 * their variables (`lib/telemetry/config.ts`). Renders nothing:
 * - Analytics: the Cloudflare beacon script is added once the page is idle,
 *   and only on the production host.
 * - Errors: tiny global handlers; Sentry itself is imported on the first error.
 */
export function Telemetry() {
  useEffect(() => {
    const plan = telemetryPlan(telemetryEnv(), window.location.host);
    const cleanups: (() => void)[] = [];

    if (plan.errors && loadSentry) {
      const { dsn, environment } = plan.errors;
      const reporter = createLazyReporter(() =>
        loadSentry().then(({ createSentryReporter }) =>
          createSentryReporter({ dsn, environment, pageUrl: () => stripUrl(window.location.href) }),
        ),
      );
      cleanups.push(installGlobalHandlers(reporter, window));
    }

    const analytics = plan.analytics;
    if (analytics && !document.querySelector(`script[src="${analytics.script}"]`)) {
      cleanups.push(
        whenIdle(() => {
          const script = document.createElement("script");
          script.defer = true;
          script.src = analytics.script;
          script.dataset.cfBeacon = beaconConfig(analytics.token);
          document.body.append(script);
        }),
      );
    }

    return () => {
      for (const cleanup of cleanups) cleanup();
    };
  }, []);

  return null;
}
