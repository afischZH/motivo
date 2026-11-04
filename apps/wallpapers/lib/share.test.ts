import { describe, expect, it } from "vitest";

import { NO_FINISH } from "./finish";
import { wallpaperTool } from "./generators";
import { stateFromHash, stateToHash, type WallpaperState } from "./share";

const tool = wallpaperTool("mesh-gradient");
const state: WallpaperState = {
  toolId: "mesh-gradient",
  params: tool.defaults as Record<string, unknown>,
  seed: 42,
  target: { kind: "device", id: "iphone-6-3" },
  finish: NO_FINISH,
};

describe("wallpaper links", () => {
  it("round-trips a device wallpaper", () => {
    const hash = stateToHash(state);
    expect(hash).toMatch(/^#d=[\w-]+&t=iphone-6-3$/);
    expect(stateFromHash(hash ?? "")).toEqual(state);
  });

  it("round-trips a custom size", () => {
    const custom = { ...state, target: { kind: "custom", width: 3440, height: 1440 } } as const;
    expect(stateFromHash(stateToHash(custom) ?? "")).toEqual(custom);
  });

  it("round-trips a finish and ignores a broken one", () => {
    const finished = { ...state, finish: { grain: 30, dim: 20, calmClock: true } };
    const hash = stateToHash(finished) ?? "";
    expect(hash).toMatch(/&f=30\.20\.1$/);
    expect(stateFromHash(hash)).toEqual(finished);
    expect(stateFromHash(hash.replace("f=30.20.1", "f=999.999.1"))?.finish).toEqual({
      grain: 100,
      dim: 80,
      calmClock: true,
    });
    expect(stateFromHash(hash.replace("f=30.20.1", "f=x"))?.finish).toEqual(NO_FINISH);
  });

  it("rejects unknown devices, other tools and garbage", () => {
    const hash = stateToHash(state) ?? "";
    expect(stateFromHash(hash.replace("iphone-6-3", "toaster"))).toBeUndefined();
    expect(stateFromHash("#d=abc&t=iphone-6-3")).toBeUndefined();
    expect(stateFromHash("")).toBeUndefined();
  });
});
