import { describe, expect, it } from "vitest";

import { DEVICES, devicesInGroup, getDevice } from "./catalog";
import { DEVICE_GROUPS } from "./types";

describe("device catalog", () => {
  it("has at least 30 devices with unique, URL-safe ids", () => {
    expect(DEVICES.length).toBeGreaterThanOrEqual(30);
    const ids = DEVICES.map((device) => device.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const id of ids) expect(id).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it("covers every group", () => {
    for (const group of DEVICE_GROUPS) expect(devicesInGroup(group).length).toBeGreaterThan(0);
  });

  it("has no two devices with the same size", () => {
    const sizes = DEVICES.map((d) => `${d.width}x${d.height}`);
    expect(new Set(sizes).size).toBe(sizes.length);
  });

  it("uses portrait for phones and tablets, landscape for the rest", () => {
    for (const device of DEVICES) {
      expect(Number.isInteger(device.width) && Number.isInteger(device.height)).toBe(true);
      const portrait = ["iphone", "android", "tablet"].includes(device.group);
      expect(device.height > device.width, device.id).toBe(portrait);
      expect(device.pixelRatio).toBeGreaterThan(0);
    }
  });

  it("keeps every safe zone inside the canvas", () => {
    for (const device of DEVICES) {
      expect(device.safeZones.length, device.id).toBeGreaterThan(0);
      for (const { rect } of device.safeZones) {
        expect(rect.x).toBeGreaterThanOrEqual(0);
        expect(rect.y).toBeGreaterThanOrEqual(0);
        expect(rect.width).toBeGreaterThan(0);
        expect(rect.height).toBeGreaterThan(0);
        expect(rect.x + rect.width).toBeLessThanOrEqual(1);
        expect(rect.y + rect.height).toBeLessThanOrEqual(1);
      }
    }
  });

  it("looks devices up by id", () => {
    expect(getDevice("iphone-6-3")?.width).toBe(1206);
    expect(getDevice("nope")).toBeUndefined();
  });
});
