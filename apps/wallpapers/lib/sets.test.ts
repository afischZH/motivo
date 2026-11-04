import { getDevice, devicesInGroup } from "@musterli/devices";
import { isSafeZipPath } from "@musterli/exporters";
import { describe, expect, it } from "vitest";

import { NO_FINISH } from "./finish";
import { groupItems, pairItems } from "./sets";

describe("light/dark pair", () => {
  it("holds a light and a dimmed dark version at the native size", () => {
    const items = pairItems({ kind: "device", id: "iphone-6-3" }, "mesh-gradient", 7, NO_FINISH);
    expect(items.map((item) => item.path)).toEqual([
      "wallpaper-iphone-6-3-mesh-gradient-7-light.png",
      "wallpaper-iphone-6-3-mesh-gradient-7-dark.png",
    ]);
    expect(items[1]?.finish.dim).toBeGreaterThan(0);
    expect(items[0]?.target.width).toBe(1206);
  });

  it("names custom sizes by their pixels", () => {
    const items = pairItems(
      { kind: "custom", width: 3440, height: 1440 },
      "svg-waves",
      1,
      NO_FINISH,
    );
    expect(items[0]?.path).toBe("wallpaper-3440x1440-svg-waves-1-light.png");
  });
});

describe("device group set", () => {
  const phone = getDevice("iphone-6-3");

  it("renders every device of the group at its own size, with safe paths", () => {
    if (!phone) throw new Error("catalog changed");
    const items = groupItems(phone, "low-poly", 3, NO_FINISH);
    expect(items).toHaveLength(devicesInGroup("iphone").length);
    expect(new Set(items.map((item) => item.target.width)).size).toBeGreaterThan(3);
    expect(items.every((item) => isSafeZipPath(item.path))).toBe(true);
  });

  it("adds dark versions in their own folder", () => {
    if (!phone) throw new Error("catalog changed");
    const items = groupItems(phone, "low-poly", 3, NO_FINISH, true);
    expect(items.filter((item) => item.path.startsWith("dark/"))).toHaveLength(
      devicesInGroup("iphone").length,
    );
  });
});
