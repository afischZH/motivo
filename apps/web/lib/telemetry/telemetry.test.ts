import { describe, expect, it, vi } from "vitest";

import {
  analyticsToken,
  externalServices,
  sentryDsn,
  turnstileSiteKey,
  type TelemetryEnv,
} from "./config";
import { beaconConfig, telemetryPlan } from "./plan";
import {
  createLazyReporter,
  installGlobalHandlers,
  scrubText,
  stripUrl,
  type ErrorEventTarget,
  type ErrorReporter,
} from "./reporter";
import { scrubEvent } from "./scrub";

const TOKEN = "0123456789abcdef0123456789abcdef";
const DSN = "https://public@o123.ingest.de.sentry.io/456";
const PROD = { NODE_ENV: "production" } as const;
const BASE = new URL("https://motivo.example");
const ALL: TelemetryEnv = {
  ...PROD,
  NEXT_PUBLIC_CF_ANALYTICS_TOKEN: TOKEN,
  NEXT_PUBLIC_SENTRY_DSN: DSN,
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: "1x00000000000000000000AA",
};

describe("telemetry config", () => {
  it("is off without environment variables", () => {
    expect(analyticsToken(PROD)).toBeNull();
    expect(sentryDsn(PROD)).toBeNull();
    expect(turnstileSiteKey(PROD)).toBeNull();
    expect(externalServices(PROD)).toEqual({ analytics: false, sentry: false, turnstile: false });
    expect(externalServices({ ...PROD, NEXT_PUBLIC_CF_ANALYTICS_TOKEN: " " })).toEqual({
      analytics: false,
      sentry: false,
      turnstile: false,
    });
  });

  it("is on with valid variables", () => {
    expect(analyticsToken(ALL)).toBe(TOKEN);
    expect(sentryDsn(ALL)).toBe(DSN);
    expect(turnstileSiteKey(ALL)).toBe("1x00000000000000000000AA");
    expect(externalServices(ALL)).toEqual({ analytics: true, sentry: true, turnstile: true });
  });

  it("is always off in next dev", () => {
    expect(externalServices({ ...ALL, NODE_ENV: "development" })).toEqual({
      analytics: false,
      sentry: false,
      turnstile: false,
    });
  });

  it("rejects malformed Turnstile site keys", () => {
    for (const key of ["", " ", "abc", '0x" onload="1', "9x00000000000000000000AA"]) {
      expect(turnstileSiteKey({ ...PROD, NEXT_PUBLIC_TURNSTILE_SITE_KEY: key }), key).toBeNull();
    }
    expect(
      turnstileSiteKey({ ...PROD, NEXT_PUBLIC_TURNSTILE_SITE_KEY: "0x4AAAAAAABkMYinukE8nzY" }),
    ).toBe("0x4AAAAAAABkMYinukE8nzY");
  });

  it("rejects malformed tokens and DSNs outside the EU region", () => {
    expect(analyticsToken({ ...PROD, NEXT_PUBLIC_CF_ANALYTICS_TOKEN: 'x" onload="1' })).toBeNull();
    for (const dsn of [
      "https://public@o1.ingest.sentry.io/2", // US region
      "https://public@o1.ingest.us.sentry.io/2",
      "http://public@o1.ingest.de.sentry.io/2",
      "https://o1.ingest.de.sentry.io/2", // no public key
      "https://public@evil.example/o1.ingest.de.sentry.io/2",
      "not a url",
    ]) {
      expect(sentryDsn({ ...PROD, NEXT_PUBLIC_SENTRY_DSN: dsn }), dsn).toBeNull();
    }
  });
});

describe("telemetryPlan", () => {
  it("loads nothing without variables, on any host", () => {
    expect(telemetryPlan(PROD, "motivo.example", BASE)).toEqual({ analytics: null, errors: null });
    expect(telemetryPlan(PROD, "localhost:3000", BASE)).toEqual({ analytics: null, errors: null });
  });

  it("runs analytics only on the production host", () => {
    expect(telemetryPlan(ALL, "motivo.example", BASE).analytics).toEqual({
      token: TOKEN,
      script: "https://static.cloudflareinsights.com/beacon.min.js",
    });
    expect(telemetryPlan(ALL, "pr-1-motivo-web.x.workers.dev", BASE).analytics).toBeNull();
    expect(telemetryPlan(ALL, "localhost:3000", BASE).analytics).toBeNull();
  });

  it("tags errors with the environment", () => {
    expect(telemetryPlan(ALL, "motivo.example", BASE).errors).toEqual({
      dsn: DSN,
      environment: "production",
    });
    expect(telemetryPlan(ALL, "pr-1.workers.dev", BASE).errors?.environment).toBe("preview");
  });

  it("builds the beacon config as JSON", () => {
    expect(JSON.parse(beaconConfig(TOKEN))).toEqual({ token: TOKEN, spa: true });
  });
});

describe("createLazyReporter", () => {
  it("does not load the reporter before the first error", () => {
    const load = vi.fn(() => Promise.resolve<ErrorReporter>({ capture: () => {} }));
    createLazyReporter(load);
    expect(load).not.toHaveBeenCalled();
  });

  it("loads once, then flushes the queue in order", async () => {
    const captured: unknown[] = [];
    const load = vi.fn(() =>
      Promise.resolve<ErrorReporter>({ capture: (error) => captured.push(error) }),
    );
    const reporter = createLazyReporter(load);
    reporter.capture("a");
    reporter.capture("b");
    expect(load).toHaveBeenCalledTimes(1);
    await vi.waitFor(() => expect(captured).toEqual(["a", "b"]));
    reporter.capture("c");
    expect(captured).toEqual(["a", "b", "c"]);
    expect(load).toHaveBeenCalledTimes(1);
  });

  it("caps queued and total events", async () => {
    const captured: unknown[] = [];
    const reporter = createLazyReporter(
      () => Promise.resolve<ErrorReporter>({ capture: (error) => captured.push(error) }),
      { maxQueue: 2, maxEvents: 3 },
    );
    for (const e of [1, 2, 3]) reporter.capture(e);
    await vi.waitFor(() => expect(captured).toEqual([1, 2]));
    for (const e of [4, 5]) reporter.capture(e);
    expect(captured).toEqual([1, 2, 4]);
  });

  it("swallows load failures and reporter errors", async () => {
    const failing = createLazyReporter(() => Promise.reject(new Error("offline")));
    expect(() => failing.capture("x")).not.toThrow();
    await Promise.resolve();
    expect(() => failing.capture("y")).not.toThrow();

    const throwing = createLazyReporter(() =>
      Promise.resolve<ErrorReporter>({
        capture: () => {
          throw new Error("boom");
        },
      }),
    );
    throwing.capture("x");
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(() => throwing.capture("y")).not.toThrow();
  });
});

describe("installGlobalHandlers", () => {
  function fakeTarget() {
    const listeners = new Map<string, (event: Event) => void>();
    const target: ErrorEventTarget = {
      addEventListener: (type, listener) => listeners.set(type, listener),
      removeEventListener: (type) => listeners.delete(type),
    };
    return { target, listeners };
  }

  it("forwards uncaught errors and rejections, and uninstalls", () => {
    const captured: unknown[] = [];
    const { target, listeners } = fakeTarget();
    const uninstall = installGlobalHandlers({ capture: (e) => captured.push(e) }, target);
    const error = new Error("x");
    listeners.get("error")?.(Object.assign(new Event("error"), { error }));
    listeners.get("unhandledrejection")?.(Object.assign(new Event("x"), { reason: "nope" }));
    listeners.get("error")?.(Object.assign(new Event("error"), { message: "Script error." }));
    expect(captured).toEqual([error, "nope"]);
    uninstall();
    expect(listeners.size).toBe(0);
  });
});

describe("scrubbing", () => {
  it("cuts query strings and fragments", () => {
    expect(stripUrl("https://m.example/en/tools/blob#d=abc")).toBe(
      "https://m.example/en/tools/blob",
    );
    expect(stripUrl("https://m.example/a?x=1#y")).toBe("https://m.example/a");
    expect(stripUrl("/plain")).toBe("/plain");
    expect(
      scrubText("failed at https://m.example/x?token=1 and blob:https://m.example/id#k (#d=Zm9v)"),
    ).toBe("failed at https://m.example/x and blob:https://m.example/id ()");
  });

  it("removes design data and personal fields from events", () => {
    const event = scrubEvent(
      {
        message: "see https://m.example/en/tools/blob#d=secret",
        request: { url: "https://m.example/en?q=1", headers: { Referer: "x" } },
        user: { ip_address: "{{auto}}" },
        breadcrumbs: [{ message: "click" }],
        extra: { a: 1 },
        exception: {
          values: [
            {
              type: "Error",
              value: "bad #d=secret",
              stacktrace: {
                frames: [{ filename: "https://m.example/_next/static/a.js?v=1", lineno: 1 }],
              },
            },
          ],
        },
      },
      "https://m.example/en/tools/blob#d=secret",
    );
    expect(event).toEqual({
      message: "see https://m.example/en/tools/blob",
      request: { url: "https://m.example/en/tools/blob" },
      exception: {
        values: [
          {
            type: "Error",
            value: "bad ",
            stacktrace: {
              frames: [{ filename: "https://m.example/_next/static/a.js", lineno: 1 }],
            },
          },
        ],
      },
    });
    expect(JSON.stringify(event)).not.toContain("secret");
  });
});
