import { describe, expect, it } from "vitest";
import { keepLocked } from "./randomize";

describe("keepLocked", () => {
  const current = { a: 1, b: "x", c: [1, 2] };
  const next = { a: 2, b: "y", c: [3] };

  it("returns next unchanged without locks", () => {
    expect(keepLocked(next, current, new Set())).toBe(next);
  });

  it("copies locked keys from current without mutating inputs", () => {
    const out = keepLocked(next, current, new Set(["a", "c"] as const));
    expect(out).toEqual({ a: 1, b: "y", c: [1, 2] });
    expect(next).toEqual({ a: 2, b: "y", c: [3] });
  });
});
