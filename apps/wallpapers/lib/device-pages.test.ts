import { DEVICES } from "@musterli/devices";
import { describe, expect, it } from "vitest";

import sitemap from "../app/sitemap";
import { devicePath, deviceStaticParams } from "./device-pages";

describe("device pages", () => {
  it("exist for every device in every language", () => {
    expect(deviceStaticParams()).toHaveLength(DEVICES.length * 2);
    expect(devicePath("de", "iphone-air")).toBe("/de/devices/iphone-air");
  });

  it("are all in the sitemap with both languages", () => {
    const entries = sitemap();
    expect(entries).toHaveLength(2 + DEVICES.length * 2);
    const page = entries.find((entry) => entry.url.endsWith("/en/devices/iphone-air"));
    expect(Object.keys(page?.alternates?.languages ?? {})).toEqual(["en", "de"]);
  });
});
