import { describe, expect, it } from "vitest";

import { createScene, createTextLayer, type Scene } from "@musterli/scene";

import { StorageError } from "@musterli/storage";

import {
  draftWins,
  initialEditorState,
  shouldWriteDraft,
  socialEditorReducer,
  updateOrCreate,
} from "./state";

const FORMAT = { id: "square", width: 1080, height: 1080 };
const withText = (text: string): Scene =>
  createScene("square", [createTextLayer("t1", FORMAT, text)]);

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

describe("socialEditorReducer", () => {
  it("settles every history step, so undo never brings back a cut text", () => {
    const a = withText("A");
    const b = withText("B");
    let state = initialEditorState(a, "");
    state = socialEditorReducer(state, { type: "change", scene: b });
    const grow = (s: Scene): Scene => ({
      ...s,
      layers: s.layers.map((l) => ({ ...l, height: l.height + 10 })),
    });
    const settled = socialEditorReducer(state, { type: "settle", fix: grow });
    expect(settled.history.present.layers[0]?.height).toBe((b.layers[0]?.height ?? 0) + 10);
    const undone = socialEditorReducer(settled, { type: "undo" });
    expect(undone.history.present.layers[0]?.height).toBe((a.layers[0]?.height ?? 0) + 10);
    // Nothing to fix: the very same state.
    expect(socialEditorReducer(state, { type: "settle", fix: (s) => s })).toBe(state);
  });

  it("stays dirty when the scene changed while it was being saved", () => {
    const a = withText("A");
    let state = socialEditorReducer(initialEditorState(a, ""), {
      type: "change",
      scene: withText("B"),
    });
    const saving = state.history.present;
    expect(
      socialEditorReducer(state, { type: "saved", designId: "d1", name: "x", scene: saving }).dirty,
    ).toBe(false);
    state = socialEditorReducer(state, { type: "change", scene: withText("C") });
    expect(
      socialEditorReducer(state, { type: "saved", designId: "d1", name: "x", scene: saving }).dirty,
    ).toBe(true);
  });
});

describe("updateOrCreate", () => {
  it("saves as a new design when the old one is gone", async () => {
    const gone = () => Promise.reject(new StorageError("not-found", "gone"));
    await expect(updateOrCreate(gone, async () => "new")).resolves.toBe("new");
    await expect(
      updateOrCreate(
        async () => "same",
        async () => "new",
      ),
    ).resolves.toBe("same");
    const full = () => Promise.reject(new StorageError("quota", "full"));
    await expect(updateOrCreate(full, async () => "new")).rejects.toMatchObject({ code: "quota" });
  });
});
