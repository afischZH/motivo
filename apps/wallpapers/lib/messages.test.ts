import { describe, expect, it } from "vitest";

import { DEVICE_GROUPS } from "@musterli/devices";

import de from "../messages/de.json";
import en from "../messages/en.json";

function keys(value: unknown, prefix = ""): string[] {
  if (typeof value !== "object" || value === null) return [prefix];
  return Object.entries(value).flatMap(([key, child]) =>
    keys(child, prefix ? `${prefix}.${key}` : key),
  );
}

function strings(value: unknown): string[] {
  if (typeof value === "string") return [value];
  if (typeof value !== "object" || value === null) return [];
  return Object.values(value).flatMap(strings);
}

describe("messages", () => {
  it("DE and EN have the same keys", () => {
    expect(keys(de).sort()).toEqual(keys(en).sort());
  });

  it("name every device group", () => {
    for (const group of DEVICE_GROUPS) expect(en.Home.groups[group]).toBeTruthy();
  });

  it("German follows Swiss spelling (no sharp s) and has no em dashes", () => {
    for (const text of strings(de)) {
      expect(text).not.toContain("ß");
      expect(text).not.toContain("—");
    }
    for (const text of strings(en)) expect(text).not.toContain("—");
  });
});
