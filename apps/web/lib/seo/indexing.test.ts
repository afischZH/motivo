import { describe, expect, it } from "vitest";

import { indexableHostPattern, isIndexableHost, noindexHeaderRule } from "./indexing";
import { FALLBACK_SITE_URL } from "./site-url";

const fallback = new URL(FALLBACK_SITE_URL);
const custom = new URL("https://musterli.example");

describe("indexing policy", () => {
  it("indexes only the production host", () => {
    expect(isIndexableHost(fallback.host, fallback)).toBe(true);
    expect(isIndexableHost(`${fallback.hostname.toUpperCase()}:443`, fallback)).toBe(true);
    expect(isIndexableHost("musterli.example", custom)).toBe(true);
  });

  it("keeps previews, other hosts and local servers out of the index", () => {
    // Worker preview URLs prefix the production host with an alias or version.
    expect(isIndexableHost(`m2-beta-${fallback.hostname}`, fallback)).toBe(false);
    expect(isIndexableHost(`1a2b3c4d-${fallback.hostname}`, fallback)).toBe(false);
    // The workers.dev URL once a custom domain is canonical.
    expect(isIndexableHost(fallback.hostname, custom)).toBe(false);
    expect(isIndexableHost("localhost:3100", fallback)).toBe(false);
    expect(isIndexableHost(undefined, fallback)).toBe(false);
  });

  it("escapes the dots of the host pattern", () => {
    expect(indexableHostPattern(custom)).toBe("musterli\\.example");
    expect(isIndexableHost("musterliXexample", custom)).toBe(false);
  });

  it("builds a next.config header rule for every other host", () => {
    expect(noindexHeaderRule(custom)).toEqual({
      source: "/:path*",
      missing: [{ type: "host", value: "musterli\\.example" }],
      headers: [{ key: "X-Robots-Tag", value: "noindex, nofollow" }],
    });
  });
});
