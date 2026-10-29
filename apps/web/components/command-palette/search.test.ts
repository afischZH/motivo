import { describe, expect, it } from "vitest";

import { isPaletteShortcut, normalizeSearch, rankEntries } from "./search";

const key = (
  k: string,
  mods: Partial<Record<"metaKey" | "ctrlKey" | "shiftKey" | "altKey", boolean>> = {},
) => ({
  key: k,
  metaKey: false,
  ctrlKey: false,
  shiftKey: false,
  altKey: false,
  ...mods,
});

describe("isPaletteShortcut", () => {
  it("opens with Cmd+K and Ctrl+K only", () => {
    expect(isPaletteShortcut(key("k", { metaKey: true }))).toBe(true);
    expect(isPaletteShortcut(key("K", { ctrlKey: true }))).toBe(true);
    expect(isPaletteShortcut(key("k"))).toBe(false);
    // Cmd/Ctrl+Shift+K switches the theme.
    expect(isPaletteShortcut(key("K", { ctrlKey: true, shiftKey: true }))).toBe(false);
    expect(isPaletteShortcut(key("k", { ctrlKey: true, altKey: true }))).toBe(false);
  });
});

describe("rankEntries", () => {
  const entries = [
    { label: "Mesh-Verlauf", terms: "mesh gradient Verläufe" },
    { label: "CSS-Verlauf", terms: "css gradient" },
    { label: "Verlauf animiert", terms: "animated gradient" },
    { label: "Punktmuster", terms: "polka dots Muster" },
  ];
  const rank = (q: string) =>
    rankEntries(entries, (e) => e, normalizeSearch(q)).map((e) => e.label);

  it("puts labels starting with the word first, then labels containing it", () => {
    expect(rank("verlauf")).toEqual(["Verlauf animiert", "Mesh-Verlauf", "CSS-Verlauf"]);
  });

  it("matches the terms, ignores accents and needs every word", () => {
    expect(rank("verlaufe")).toEqual(["Mesh-Verlauf"]);
    expect(rank("dots")).toEqual(["Punktmuster"]);
    expect(rank("css gradient")).toEqual(["CSS-Verlauf"]);
    expect(rank("nichts")).toEqual([]);
  });
});
