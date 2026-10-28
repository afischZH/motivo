import { registry } from "@musterli/tool-registry";
import { describe, expect, it } from "vitest";

import de from "@/messages/de.json";
import en from "@/messages/en.json";

import { FEATURED_TOOL_IDS, HERO_START_TOOL_ID, HERO_TOOL_ID, HOME_FAQ_COUNT } from "./home";
import { hasStaticMotif } from "./seo/motifs";

describe("home page content", () => {
  it.each([HERO_TOOL_ID, ...FEATURED_TOOL_IDS, HERO_START_TOOL_ID])(
    "%s is a registered tool with a static motif",
    (id) => {
      const tool = registry.get(id);
      expect(tool, id).toBeDefined();
      if (tool) expect(hasStaticMotif(tool)).toBe(true);
    },
  );

  it("has no duplicate featured tools", () => {
    expect(new Set(FEATURED_TOOL_IDS).size).toBe(FEATURED_TOOL_IDS.length);
  });

  it.each([
    ["de", de],
    ["en", en],
  ] as const)("has every FAQ entry in %s", (_locale, messages) => {
    const faq = messages.Home.faq as Record<string, unknown>;
    for (let i = 1; i <= HOME_FAQ_COUNT; i++) {
      expect(faq[`q${i}`]).toEqual({ question: expect.any(String), answer: expect.any(String) });
    }
    expect(faq[`q${HOME_FAQ_COUNT + 1}`]).toBeUndefined();
  });
});
