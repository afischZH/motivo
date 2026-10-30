/**
 * Seamless Patterns motif sources: emoji, text and logo walls (docs/TOOLS.md A2).
 */
import { createRng } from "@musterli/engine";
import { describe, expect, it } from "vitest";
import { parseToolParams } from "../randomize";
import { renderStatic } from "../testing";
import {
  SEAMLESS_MAX_EMOJI,
  seamlessEmojiList,
  seamlessPatternsTool,
  type SeamlessPatternsParams,
} from "./seamless-patterns";

const p = seamlessPatternsTool.defaults;
const svg = (params: Partial<SeamlessPatternsParams>) =>
  renderStatic(seamlessPatternsTool, { ...p, ...params }, 1, { width: 400, height: 300 });

describe("seamless-patterns motifs", () => {
  it("splits emoji into whole graphemes, without spaces, at most eight", () => {
    expect(seamlessEmojiList("👨‍👩‍👧 🍋 👍🏽")).toEqual(["👨‍👩‍👧", "🍋", "👍🏽"]);
    expect(seamlessEmojiList("🍎".repeat(12))).toHaveLength(SEAMLESS_MAX_EMOJI);
  });

  it("draws every emoji of the list in their own colours", () => {
    const out = svg({ motif: "emoji", emoji: "🍋🍓", cells: 4 });
    expect(out).toContain(">🍋</text>");
    expect(out).toContain(">🍓</text>");
    expect(out).not.toContain("<filter");
    expect(svg({ motif: "emoji", emoji: "🍋", emojiTint: true })).toContain("<feFlood");
  });

  it("draws an escaped word in the motif colour", () => {
    const out = svg({ motif: "text", text: "A&B", colorMode: "single", color: "#123456" });
    expect(out).toContain(">A&amp;B</text>");
    expect(out).toContain('<g fill="#123456">');
  });

  it("falls back to the shape without emoji or text", () => {
    const shape = svg({});
    expect(svg({ motif: "emoji", emoji: "  " })).toBe(shape);
    expect(svg({ motif: "text", text: " " })).toBe(shape);
  });

  it("ignores an upload outside the shape motif", () => {
    const upload = {
      kind: "raster",
      href: "data:image/png;base64,iVBORw0KGgo=",
      width: 10,
      height: 10,
      name: "a.png",
    };
    const parsed = seamlessPatternsTool.schema.parse({ ...p, upload, motif: "text" });
    expect(
      renderStatic(seamlessPatternsTool, parsed, 1, { width: 200, height: 200 }),
    ).not.toContain("<image");
  });

  it("upgrades params from before motif sources without changing the output", () => {
    const { motif, emoji, emojiTint, text, textFont, alternate, ...old } = p;
    void [motif, emoji, emojiTint, text, textFont, alternate];
    const parsed = parseToolParams(seamlessPatternsTool, old);
    expect(parsed.success).toBe(true);
    expect(parsed.data).toEqual(p);
  });

  it("keeps the motif source and the user's content on a new variant", () => {
    const current: SeamlessPatternsParams = {
      ...p,
      motif: "text",
      text: "Acme",
      alternate: "rows",
    };
    const next = seamlessPatternsTool.randomize(createRng(3), current, new Set());
    expect(next).toMatchObject({ motif: "text", text: "Acme", alternate: "rows" });
  });
});
