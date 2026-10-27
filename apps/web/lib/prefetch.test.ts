import { describe, expect, it } from "vitest";

import { prefetchMode } from "./prefetch";

describe("prefetchMode", () => {
  it("does not prefetch before intent", () => {
    expect(prefetchMode(undefined, false)).toBe(false);
  });

  it("falls back to the Next default after intent", () => {
    expect(prefetchMode(undefined, true)).toBeNull();
  });

  it("keeps an explicit value", () => {
    expect(prefetchMode(true, false)).toBe(true);
    expect(prefetchMode(false, true)).toBe(false);
    expect(prefetchMode("auto", false)).toBe("auto");
    expect(prefetchMode(null, false)).toBeNull();
  });
});
