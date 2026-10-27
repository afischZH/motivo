/**
 * Sentry as `ErrorReporter`. Only imported dynamically by the telemetry
 * loader on the first error, so its code is a separate chunk that healthy
 * sessions never download.
 *
 * Errors only: a manually created client with the smallest useful set of
 * integrations (no tracing, no session replay, no breadcrumbs, no session
 * tracking, no request headers). `dataCollection` turns off user info (so
 * Sentry's relay never infers the IP address: `infer_ip: "never"`), cookies,
 * headers, query parameters and bodies; it replaced `sendDefaultPii` in SDK
 * v11. `beforeSend` removes query strings and fragments (`#d=` share links)
 * from every URL that is left.
 */
import {
  BrowserClient,
  captureException,
  dedupeIntegration,
  defaultStackParser,
  getCurrentScope,
  linkedErrorsIntegration,
  makeFetchTransport,
} from "@sentry/browser";

import type { ErrorReporter } from "./reporter";
import { scrubEvent, type ScrubbableEvent } from "./scrub";

export interface SentryReporterOptions {
  dsn: string;
  /** "production" or "preview" (host based). */
  environment: string;
  /** Page URL without query or fragment, sent as the event's request URL. */
  pageUrl: () => string;
}

export function createSentryReporter({
  dsn,
  environment,
  pageUrl,
}: SentryReporterOptions): ErrorReporter {
  const client = new BrowserClient({
    dsn,
    environment,
    transport: makeFetchTransport,
    stackParser: defaultStackParser,
    // Final list: no globalHandlers (the loader forwards errors), no
    // breadcrumbs, no browser session, no HTTP context.
    integrations: [linkedErrorsIntegration(), dedupeIntegration()],
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      urlQueryParams: false,
      httpBodies: [],
      stackFrameVariables: false,
      frameContextLines: 0,
    },
    sendClientReports: false,
    beforeSend(event) {
      return scrubEvent(event as unknown as ScrubbableEvent, pageUrl()) as unknown as typeof event;
    },
  });
  getCurrentScope().setClient(client);
  client.init();

  return {
    capture(error) {
      captureException(error);
    },
  };
}
