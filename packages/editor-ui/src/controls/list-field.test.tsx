import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { createEditorStore, type EditorStoreApi } from "../store/editor-store";
import { EditorStoreProvider } from "../store/react";
import { createFixtureRegistry, type ListFixtureParams } from "../test/fixture-tool";
import { renderWithIntl } from "../test/render";
import { EditorControls } from "./control-panel";
import { thumbnailKeyTarget } from "./thumbnail-field";

let store: EditorStoreApi;

function renderList() {
  store = createEditorStore({
    toolId: "test-list",
    registry: createFixtureRegistry(),
    randomSeed: () => 7,
  });
  const user = userEvent.setup();
  const result = renderWithIntl(
    <EditorStoreProvider store={store}>
      <EditorControls />
    </EditorStoreProvider>,
  );
  return { user, ...result };
}

const items = () => (store.getState().params as ListFixtureParams).items;
const kinds = () => items().map((i) => i.kind);
const list = () => screen.getByRole("list", { name: "Ebenen" });
/** The select button of each row (the eye button follows it). */
const rows = () => [...list().querySelectorAll<HTMLButtonElement>("li > button:first-child")];
const status = () => screen.getByRole("status");

describe("list control", () => {
  it("shows one row per item, the first selected, and a sub-form for it", () => {
    renderList();
    expect(rows().map((r) => r.textContent)).toEqual(["Ebene 1a", "Ebene 2b"]);
    // Browsers put a space between the two text lines; jsdom has no layout.
    expect(screen.getByRole("button", { name: /^Ebene 2 ?b$/ })).toBe(rows()[1]);
    expect(rows().map((r) => r.tabIndex)).toEqual([0, -1]);
    // The keyboard hint describes the focusable rows (a description on the list is not read).
    const hintId = rows()[0]?.getAttribute("aria-describedby") ?? "";
    expect(document.getElementById(hintId)?.textContent).toMatch(/Pfeiltasten/);
    expect(list().hasAttribute("aria-describedby")).toBe(false);
    const form = screen.getByRole("group", { name: "Ebene 1 bearbeiten" });
    expect(within(form).getByRole("slider", { name: "Grösse" }).getAttribute("aria-valuenow")).toBe(
      "1",
    );
    expect(within(form).getByRole("radiogroup", { name: "Art" })).toBeTruthy();
    // Hidden fields get no control.
    expect(within(form).queryByText("on")).toBeNull();
  });

  it("selects with the arrow keys and edits the selected item", async () => {
    const { user } = renderList();
    rows()[0]?.focus();
    await user.keyboard("{ArrowDown}");
    expect(document.activeElement).toBe(rows()[1]);
    const form = screen.getByRole("group", { name: "Ebene 2 bearbeiten" });
    within(form).getByRole("slider", { name: "Grösse" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(items().map((i) => i.size)).toEqual([1, 3]);
  });

  it("adds at the top, moves focus to the new row and announces it once", async () => {
    const { user } = renderList();
    await user.click(screen.getByRole("button", { name: "Neu hinzufügen" }));
    expect(kinds()).toEqual(["c", "a", "b"]);
    expect(document.activeElement).toBe(rows()[0]);
    expect(status().textContent).toBe("Ebene 1 hinzugefügt.");
    // Field edits are not announced.
    const before = status().textContent;
    screen.getByRole("slider", { name: "Grösse" }).focus();
    await user.keyboard("{ArrowRight}");
    expect(status().textContent).toBe(before);
  });

  it("moves with Alt+arrows, keeps focus on the moved row and announces the position", async () => {
    const { user } = renderList();
    rows()[0]?.focus();
    await user.keyboard("{Alt>}{ArrowDown}{/Alt}");
    expect(kinds()).toEqual(["b", "a"]);
    expect(document.activeElement).toBe(rows()[1]);
    expect(rows()[1]?.getAttribute("aria-current")).toBe("true");
    expect(status().textContent).toBe("a verschoben, jetzt Position 2 von 2.");
    // Already at the bottom: nothing happens.
    await user.keyboard("{Alt>}{ArrowDown}{/Alt}");
    expect(kinds()).toEqual(["b", "a"]);
  });

  it("moves with the buttons and keeps focus on the button", async () => {
    const { user } = renderList();
    await user.click(rows()[1] as HTMLElement);
    const up = screen.getByRole("button", { name: "Ebene 2 nach oben" });
    await user.click(up);
    expect(kinds()).toEqual(["b", "a"]);
    // Now at the top: "up" is disabled, focus falls back to the row.
    expect(screen.getByRole("button", { name: "Ebene 1 nach oben" })).toHaveProperty(
      "disabled",
      true,
    );
    expect(document.activeElement).toBe(rows()[0]);
  });

  it("duplicates, removes with Delete and stops at the limits", async () => {
    const { user } = renderList();
    await user.click(screen.getByRole("button", { name: "Ebene 1 duplizieren" }));
    expect(kinds()).toEqual(["a", "a", "b"]);
    expect(document.activeElement).toBe(rows()[1]);
    expect(status().textContent).toBe("Ebene 1 dupliziert als Ebene 2.");
    await user.click(screen.getByRole("button", { name: "Neu hinzufügen" }));
    expect(items()).toHaveLength(4);
    expect(screen.getByRole("button", { name: "Neu hinzufügen" })).toHaveProperty("disabled", true);
    expect(screen.getByText("4 von 4")).toBeTruthy();

    rows()[0]?.focus();
    await user.keyboard("{Delete}{Delete}{Delete}");
    expect(items()).toHaveLength(1);
    expect(document.activeElement).toBe(rows()[0]);
    // The schema minimum is one item.
    await user.keyboard("{Delete}");
    expect(items()).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Ebene 1 entfernen" })).toHaveProperty(
      "disabled",
      true,
    );
  });

  it("shows and hides an item with a toggle button", async () => {
    const { user } = renderList();
    const eye = screen.getByRole("button", { name: "Ebene 2 sichtbar" });
    expect(eye.getAttribute("aria-pressed")).toBe("true");
    await user.click(eye);
    expect(items()[1]?.on).toBe(false);
    expect(eye.getAttribute("aria-pressed")).toBe("false");
    expect(screen.getByRole("button", { name: /^Ebene 2 ?b, ausgeblendet$/ })).toBe(rows()[1]);
    expect(status().textContent).toBe("Ebene 2 ausgeblendet.");
  });

  it("locks fields of one item and undoes list operations", async () => {
    const { user } = renderList();
    await user.click(rows()[1] as HTMLElement);
    const form = screen.getByRole("group", { name: "Ebene 2 bearbeiten" });
    const lock = within(form).getAllByRole("button", { name: /Grösse/ })[0] as HTMLElement;
    await user.click(lock);
    expect([...store.getState().locks]).toEqual(["items.1.size"]);
    store.getState().newVariant();
    expect(items()[1]?.size).toBe(2);

    await user.click(screen.getByRole("button", { name: "Ebene 2 entfernen" }));
    expect(kinds()).toEqual(["a"]);
    expect(store.getState().locks.size).toBe(0);
    store.getState().undo();
    expect(kinds()).toEqual(["a", "b"]);
  });
});

describe("thumbnail picker", () => {
  it("is a radio group with one tab stop, named tiles and arrow keys", async () => {
    const { user } = renderList();
    const group = screen.getByRole("radiogroup", { name: "Art" });
    const radios = within(group).getAllByRole("radio");
    expect(radios.map((r) => r.getAttribute("aria-label"))).toEqual([
      "a",
      "b",
      "c",
      "d",
      "e",
      "f",
      "g",
    ]);
    expect(radios.filter((r) => r.tabIndex === 0)).toEqual([radios[0]]);
    expect(radios[0]?.getAttribute("aria-checked")).toBe("true");
    radios[0]?.focus();
    await user.keyboard("{ArrowRight}");
    expect(items()[0]?.kind).toBe("b");
    expect(document.activeElement).toBe(radios[1]);
    await user.keyboard("{End}");
    expect(items()[0]?.kind).toBe("g");
    await user.click(radios[2] as HTMLElement);
    expect(items()[0]?.kind).toBe("c");
  });

  it("draws previews from the registry hint as inline styles", () => {
    renderList();
    const radio = screen.getByRole("radio", { name: "d" });
    const art = radio.querySelector("span") as HTMLElement | null;
    expect(art?.style.backgroundColor).toBe("rgb(255, 255, 255)");
    expect(art?.style.borderWidth).toBe("1px");
  });

  it("maps keys to tiles in a five-column grid", () => {
    expect(thumbnailKeyTarget("ArrowRight", 6, 7)).toBe(0);
    expect(thumbnailKeyTarget("ArrowLeft", 0, 7)).toBe(6);
    expect(thumbnailKeyTarget("ArrowDown", 1, 7)).toBe(6);
    expect(thumbnailKeyTarget("ArrowDown", 4, 7)).toBe(6);
    expect(thumbnailKeyTarget("ArrowUp", 6, 7)).toBe(1);
    expect(thumbnailKeyTarget("ArrowUp", 2, 7)).toBe(0);
    expect(thumbnailKeyTarget("Home", 3, 7)).toBe(0);
    expect(thumbnailKeyTarget("End", 3, 7)).toBe(6);
    expect(thumbnailKeyTarget("a", 3, 7)).toBeNull();
  });
});
