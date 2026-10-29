// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

import {
  FAVORITE_TOOLS_KEY,
  RECENT_TOOLS_KEY,
  RECENT_TOOLS_MAX,
  parseToolIds,
  readFavoriteTools,
  readRecentTools,
  recordToolVisit,
  subscribeToolHistory,
  toggleFavoriteTool,
  toggledFavorite,
  withRecent,
} from "./tool-history";

describe("parseToolIds", () => {
  it("keeps unique, well-formed ids up to the limit", () => {
    expect(parseToolIds('["a","b","a","B!",3,"c"]', 2)).toEqual(["a", "b"]);
    expect(parseToolIds('["flow-field"]', 5)).toEqual(["flow-field"]);
  });

  it("treats anything else as empty", () => {
    for (const raw of [null, "", "{", '{"a":1}', '"a"', "null"]) {
      expect(parseToolIds(raw, 5)).toEqual([]);
    }
  });
});

describe("list updates", () => {
  it("moves a visited tool to the front and caps the list", () => {
    expect(withRecent(["a", "b", "c"], "b")).toEqual(["b", "a", "c"]);
    const many = Array.from({ length: RECENT_TOOLS_MAX }, (_, i) => `t${i}`);
    expect(withRecent(many, "new")).toHaveLength(RECENT_TOOLS_MAX);
  });

  it("toggles favourites", () => {
    expect(toggledFavorite(["a"], "b")).toEqual(["a", "b"]);
    expect(toggledFavorite(["a", "b"], "a")).toEqual(["b"]);
  });
});

describe("storage", () => {
  beforeEach(() => window.localStorage.clear());

  it("records visits and favourites in this browser and notifies", () => {
    const onChange = vi.fn();
    const stop = subscribeToolHistory(onChange);
    recordToolVisit("mesh-gradient");
    recordToolVisit("flow-field");
    toggleFavoriteTool("flow-field");
    expect(readRecentTools()).toEqual(["flow-field", "mesh-gradient"]);
    expect(readFavoriteTools()).toEqual(["flow-field"]);
    expect(onChange).toHaveBeenCalledTimes(3);
    stop();
    toggleFavoriteTool("flow-field");
    expect(onChange).toHaveBeenCalledTimes(3);
    expect(window.localStorage.getItem(FAVORITE_TOOLS_KEY)).toBe("[]");
  });

  it("ignores ids that are not tool ids", () => {
    recordToolVisit("../evil");
    expect(window.localStorage.getItem(RECENT_TOOLS_KEY)).toBeNull();
  });

  it("works when storage throws", () => {
    const get = vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    const set = vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    try {
      expect(() => recordToolVisit("a")).not.toThrow();
      expect(readRecentTools()).toEqual([]);
    } finally {
      get.mockRestore();
      set.mockRestore();
    }
  });
});
