import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { THEME_SCRIPT_HASH } from "./csp-hash";
import { cloudflareHeadersFile, contentSecurityPolicy, securityHeaders } from "./security-headers";
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

describe("public/_headers", () => {
  // Static assets on Cloudflare skip the Worker, so they need this file.
  // Update after changing the headers: `pnpm --filter @motivo/web headers:write`.
  it("matches the generated production headers", async () => {
    await expect(cloudflareHeadersFile()).toMatchFileSnapshot("../public/_headers");
  });
});
