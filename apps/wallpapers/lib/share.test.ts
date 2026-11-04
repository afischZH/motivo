import { describe, expect, it } from "vitest";

import { wallpaperTool } from "./generators";
import { stateFromHash, stateToHash, type WallpaperState } from "./share";

const tool = wallpaperTool("mesh-gradient");
const state: WallpaperState = {
  toolId: "mesh-gradient",
  params: tool.defaults as Record<string, unknown>,
  seed: 42,
  target: { kind: "device", id: "iphone-6-3" },
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

  it("rejects unknown devices, other tools and garbage", () => {
    const hash = stateToHash(state) ?? "";
    expect(stateFromHash(hash.replace("iphone-6-3", "toaster"))).toBeUndefined();
    expect(stateFromHash("#d=abc&t=iphone-6-3")).toBeUndefined();
    expect(stateFromHash("")).toBeUndefined();
  });
});
