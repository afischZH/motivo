import { describe, expect, it } from "vitest";
import { createRenderContext } from "./render";

describe("createRenderContext", () => {
  it("creates a fresh, seeded rng per call", () => {
    const a = createRenderContext(1, { width: 10, height: 20 });
    const b = createRenderContext(1, { width: 10, height: 20 });
    expect(a.rng.next()).toBe(b.rng.next());
    expect(a).toMatchObject({ seed: 1, width: 10, height: 20 });
    expect("t" in a).toBe(false);
  });

  it("normalises the seed to uint32 and passes t through", () => {
    const ctx = createRenderContext(-1, { width: 1, height: 1 }, 0.5);
    expect(ctx.seed).toBe(0xffffffff);
    expect(ctx.t).toBe(0.5);
  });
});
