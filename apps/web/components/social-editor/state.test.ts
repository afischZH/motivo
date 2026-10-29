import { describe, expect, it } from "vitest";

import { draftWins, shouldWriteDraft } from "./state";

describe("autosave draft rules", () => {
  it("writes the draft for new scenes and changed designs, not for a clean saved design", () => {
    expect(shouldWriteDraft({ designId: null, dirty: false })).toBe(true);
    expect(shouldWriteDraft({ designId: null, dirty: true })).toBe(true);
    expect(shouldWriteDraft({ designId: "d1", dirty: true })).toBe(true);
    expect(shouldWriteDraft({ designId: "d1", dirty: false })).toBe(false);
  });

  it("opens the draft of a design only when it is newer than the saved version", () => {
    const record = { id: "d1", updatedAt: 1000 };
    expect(draftWins({ designId: "d1", updatedAt: 1500 }, record)).toBe(true);
    // Written at save time with the design's own time: the saved version opens.
    expect(draftWins({ designId: "d1", updatedAt: 1000 }, record)).toBe(false);
    expect(draftWins({ designId: "d1", updatedAt: 900 }, record)).toBe(false);
    expect(draftWins({ designId: "d2", updatedAt: 1500 }, record)).toBe(false);
    expect(draftWins({ designId: null, updatedAt: 1500 }, record)).toBe(false);
    expect(draftWins(null, record)).toBe(false);
  });
});
