import { createHash } from "node:crypto";

import { matchHas } from "next/dist/shared/lib/router/utils/prepare-destination";
import { describe, expect, it } from "vitest";

import { THEME_SCRIPT_HASH } from "./csp-hash";
import {
  EDGE_REQUEST_HEADER,
  cloudflareHeadersFile,
  contentSecurityPolicy,
  isLocalHost,
  isLocalRequest,
  localHostHeaderRule,
  securityHeaders,
} from "./security-headers";
import { themeInitScript } from "./theme";

function directives(csp: string): Map<string, string[]> {
  return new Map(
    csp.split(";").map((part) => {
      const [name = "", ...values] = part.trim().split(/\s+/);
      return [name, values];
    }),
  );
}

describe("theme script hash", () => {
  it("is the sha256 of the exact script the layout renders", () => {
    const digest = createHash("sha256").update(themeInitScript, "utf8").digest("base64");
    expect(THEME_SCRIPT_HASH).toBe(`'sha256-${digest}'`);
  });

  it("is not listed next to 'unsafe-inline', which browsers would then ignore", () => {
    for (const dev of [false, true]) {
      expect(contentSecurityPolicy({ dev })).not.toContain("'sha256-");
    }
  });
});

describe("contentSecurityPolicy", () => {
  const prod = directives(contentSecurityPolicy({ dev: false }));
  const dev = directives(contentSecurityPolicy({ dev: true }));

  it("is strict in production", () => {
    expect(prod.get("default-src")).toEqual(["'self'"]);
    expect(prod.get("script-src")).toEqual(["'self'", "'unsafe-inline'"]);
    expect(prod.get("style-src")).toEqual(["'self'", "'unsafe-inline'"]);
    expect(prod.get("img-src")).toEqual(["'self'", "data:", "blob:"]);
    expect(prod.get("worker-src")).toEqual(["'self'", "blob:"]);
    expect(prod.get("connect-src")).toEqual(["'self'"]);
    expect(prod.get("font-src")).toEqual(["'self'"]);
    expect(prod.get("object-src")).toEqual(["'none'"]);
    expect(prod.get("base-uri")).toEqual(["'self'"]);
    expect(prod.get("form-action")).toEqual(["'self'"]);
    expect(prod.get("frame-ancestors")).toEqual(["'none'"]);
    expect(prod.has("upgrade-insecure-requests")).toBe(true);
  });

  it("never ships dev allowances in production", () => {
    const csp = contentSecurityPolicy({ dev: false });
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toMatch(/\bws:/);
  });

  it("adds only the documented dev allowances", () => {
    expect(dev.get("script-src")).toEqual(["'self'", "'unsafe-inline'", "'unsafe-eval'"]);
    expect(dev.get("connect-src")).toEqual(["'self'", "ws:"]);
    expect(dev.has("upgrade-insecure-requests")).toBe(false);
  });

  it("is a single header line within Cloudflare's 2000 character _headers limit", () => {
    const csp = contentSecurityPolicy({ dev: false });
    expect(csp).not.toMatch(/[\r\n]/);
    expect(`  Content-Security-Policy: ${csp}`.length).toBeLessThan(2000);
  });
});

describe("securityHeaders", () => {
  const byKey = new Map(securityHeaders({ dev: false }).map((h) => [h.key, h.value]));

  it("sets the full set of security headers", () => {
    expect(byKey.get("Strict-Transport-Security")).toBe("max-age=63072000; includeSubDomains");
    expect(byKey.get("X-Content-Type-Options")).toBe("nosniff");
    expect(byKey.get("X-Frame-Options")).toBe("DENY");
    expect(byKey.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(byKey.get("Cross-Origin-Opener-Policy")).toBe("same-origin");
    const permissions = byKey.get("Permissions-Policy") ?? "";
    for (const feature of ["camera", "microphone", "geolocation", "payment", "usb"]) {
      expect(permissions).toContain(`${feature}=()`);
    }
    // Copy buttons need the clipboard.
    expect(permissions).not.toContain("clipboard");
  });
});

describe("external services", () => {
  const both = { analytics: true, sentry: true, turnstile: true };
  const none = { analytics: false, sentry: false, turnstile: false };

  it("adds no third-party origin unless a service is enabled", () => {
    const csp = contentSecurityPolicy({ dev: false });
    expect(csp).not.toMatch(/cloudflareinsights|sentry/);
    expect(contentSecurityPolicy({ dev: false, services: none })).toBe(csp);
  });

  it("allows the Cloudflare beacon script and endpoint only with analytics", () => {
    const csp = directives(
      contentSecurityPolicy({ dev: false, services: { ...none, analytics: true } }),
    );
    expect(csp.get("script-src")).toEqual([
      "'self'",
      "'unsafe-inline'",
      "https://static.cloudflareinsights.com",
    ]);
    expect(csp.get("connect-src")).toEqual(["'self'", "https://cloudflareinsights.com"]);
  });

  it("allows only the Sentry EU ingest with Sentry", () => {
    const csp = directives(
      contentSecurityPolicy({ dev: false, services: { ...none, sentry: true } }),
    );
    expect(csp.get("script-src")).toEqual(["'self'", "'unsafe-inline'"]);
    expect(csp.get("connect-src")).toEqual(["'self'", "https://*.ingest.de.sentry.io"]);
  });

  it("allows the Turnstile script and frame only with Turnstile", () => {
    expect(contentSecurityPolicy({ dev: false })).not.toMatch(/challenges\.cloudflare|frame-src/);
    const csp = directives(
      contentSecurityPolicy({ dev: false, services: { ...none, turnstile: true } }),
    );
    expect(csp.get("script-src")).toEqual([
      "'self'",
      "'unsafe-inline'",
      "https://challenges.cloudflare.com",
    ]);
    expect(csp.get("frame-src")).toEqual(["'self'", "https://challenges.cloudflare.com"]);
    expect(csp.get("connect-src")).toEqual(["'self'"]);
    expect(csp.get("frame-ancestors")).toEqual(["'none'"]);
  });

  it("never enables services in dev", () => {
    expect(contentSecurityPolicy({ dev: true, services: both })).toBe(
      contentSecurityPolicy({ dev: true }),
    );
  });

  it("stays within the _headers line limit with every service", () => {
    const csp = contentSecurityPolicy({ dev: false, services: both });
    expect(`  Content-Security-Policy: ${csp}`.length).toBeLessThan(2000);
  });
});

describe("public/_headers", () => {
  // Static assets on Cloudflare skip the Worker, so they need this file.
  // scripts/headers.mjs writes it before every build from the same env.
  it("carries exactly the Worker's production headers", () => {
    for (const services of [undefined, { analytics: true, sentry: true, turnstile: true }]) {
      const file = cloudflareHeadersFile(services);
      const expected = securityHeaders({ dev: false, ...(services ? { services } : {}) });
      expect(file.split("\n").slice(0, 3)).toEqual([
        expect.stringMatching(/^# Generated/),
        expect.stringMatching(/^# Applies/),
        "/*",
      ]);
      for (const { key, value } of expected) expect(file).toContain(`  ${key}: ${value}\n`);
    }
  });

  it("allows external services only when the build enables them", () => {
    expect(cloudflareHeadersFile()).not.toMatch(/cloudflareinsights|sentry|challenges/);
    expect(cloudflareHeadersFile({ analytics: true, sentry: false, turnstile: false })).toContain(
      "https://static.cloudflareinsights.com",
    );
    expect(cloudflareHeadersFile({ analytics: false, sentry: true, turnstile: false })).toContain(
      "https://*.ingest.de.sentry.io",
    );
  });
});

describe("local hosts", () => {
  // WebKit applies upgrade-insecure-requests on http://localhost, so E2E
  // against `next start` would never load scripts with the production policy.
  it("drops only the https upgrade from the policy", () => {
    const prod = contentSecurityPolicy({ dev: false });
    const local = contentSecurityPolicy({ dev: false, local: true });
    expect(prod).toContain("upgrade-insecure-requests");
    expect(local).not.toContain("upgrade-insecure-requests");
    expect(`${local}; upgrade-insecure-requests`).toBe(prod);
  });

  it("overrides only CSP, HSTS and COOP, for local hosts only", () => {
    const rule = localHostHeaderRule({ dev: false });
    expect(rule.headers.map(({ key }) => key).sort()).toEqual([
      "Content-Security-Policy",
      "Cross-Origin-Opener-Policy",
      "Strict-Transport-Security",
    ]);
    expect(rule.headers).toContainEqual({ key: "Strict-Transport-Security", value: "max-age=0" });
    expect(rule.headers).toContainEqual({
      key: "Cross-Origin-Opener-Policy",
      value: "unsafe-none",
    });
    // Next anchors the value as ^value$ and matches the host name without port.
    const matcher = new RegExp(`^${rule.has[0]?.value}$`);
    for (const host of ["localhost", "127.0.0.1"]) expect(matcher.test(host)).toBe(true);
    for (const host of ["motivo-web.andreas-65d.workers.dev", "localhost.evil.com", "x127.0.0.1"])
      expect(matcher.test(host)).toBe(false);
  });

  it("recognises local Host headers with ports", () => {
    expect(isLocalHost("localhost:3100")).toBe(true);
    expect(isLocalHost("127.0.0.1")).toBe(true);
    expect(isLocalHost("example.com")).toBe(false);
    expect(isLocalHost("localhost.example.com")).toBe(false);
    expect(isLocalHost(null)).toBe(false);
  });

  it("never applies to requests through Cloudflare, even with a spoofed host", () => {
    const rule = localHostHeaderRule({ dev: false });
    // Next's own matcher, as next.config `headers()` uses it.
    const matches = (headers: Record<string, string>) =>
      matchHas({ headers } as Parameters<typeof matchHas>[0], {}, rule.has, rule.missing) !== false;
    expect(matches({ host: "localhost:3100" })).toBe(true);
    expect(matches({ host: "127.0.0.1" })).toBe(true);
    // OpenNext copies a client-sent X-Forwarded-Host into Host; Cloudflare
    // always adds CF-Connecting-IP, so such a request still gets production headers.
    expect(matches({ host: "localhost", [EDGE_REQUEST_HEADER]: "203.0.113.7" })).toBe(false);
    expect(matches({ host: "motivo-web.andreas-65d.workers.dev" })).toBe(false);

    expect(isLocalRequest(new Headers({ host: "localhost:3100" }))).toBe(true);
    expect(
      isLocalRequest(new Headers({ host: "localhost", "CF-Connecting-IP": "203.0.113.7" })),
    ).toBe(false);
    expect(isLocalRequest(new Headers({ host: "example.com" }))).toBe(false);
  });

  it("never reaches public/_headers", () => {
    expect(cloudflareHeadersFile()).toContain("upgrade-insecure-requests");
    expect(cloudflareHeadersFile()).toContain("max-age=63072000");
    expect(cloudflareHeadersFile()).toContain("Cross-Origin-Opener-Policy: same-origin");
  });
});
