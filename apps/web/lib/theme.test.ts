import { describe, expect, it } from "vitest";

import { isThemeShortcut, resolveTheme, type ShortcutEvent } from "./theme";

const key = (overrides: Partial<ShortcutEvent>): ShortcutEvent => ({
  key: "K",
  code: "KeyK",
  metaKey: false,
  ctrlKey: false,
  shiftKey: true,
  altKey: false,
  ...overrides,
});

describe("resolveTheme", () => {
  it("prefers an explicit stored choice", () => {
    expect(resolveTheme("light", true)).toBe("light");
    expect(resolveTheme("dark", false)).toBe("dark");
  });

  it("falls back to the system preference", () => {
    expect(resolveTheme(null, true)).toBe("dark");
    expect(resolveTheme(null, false)).toBe("light");
    expect(resolveTheme("garbage", true)).toBe("dark");
  });
});

describe("isThemeShortcut", () => {
  it("matches Cmd+Shift+K and Ctrl+Shift+K", () => {
    expect(isThemeShortcut(key({ metaKey: true }))).toBe(true);
    expect(isThemeShortcut(key({ ctrlKey: true }))).toBe(true);
    expect(isThemeShortcut(key({ ctrlKey: true, code: "", key: "k" }))).toBe(true);
  });

  it("ignores other combinations", () => {
    expect(isThemeShortcut(key({}))).toBe(false);
    expect(isThemeShortcut(key({ ctrlKey: true, shiftKey: false }))).toBe(false);
    expect(isThemeShortcut(key({ ctrlKey: true, altKey: true }))).toBe(false);
    expect(isThemeShortcut(key({ ctrlKey: true, code: "KeyJ", key: "J" }))).toBe(false);
  });
});
