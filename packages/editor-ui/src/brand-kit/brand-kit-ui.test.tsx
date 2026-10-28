import { createBrandKitStore, type BrandKitStore } from "@musterli/storage";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EditorShell } from "../shell/editor-shell";
import { createEditorStore, type EditorStoreApi } from "../store/editor-store";
import { EditorStoreProvider } from "../store/react";
import { fakeServices } from "../test/fake-services";
import { createFixtureRegistry, fixtureDefaults } from "../test/fixture-tool";
import { fixtureMessages, renderWithIntl } from "../test/render";

const messages = {
  ...fixtureMessages,
  tools: {
    ...fixtureMessages.tools,
    "test-fixture": {
      ...fixtureMessages.tools["test-fixture"],
      name: "Testwerkzeug",
      presets: Object.fromEntries(
        ["classic", "dense", "square", "outlined", "faint", "dark"].map((id) => [id, id]),
      ),
    },
  },
};

const BRAND = ["#0b3d91", "#fc3d21", "#f5c518"];

let kit: BrandKitStore;

beforeEach(() => {
  kit = createBrandKitStore({ indexedDB: new IDBFactory() });
});
afterEach(() => kit.close());

function newStore(): EditorStoreApi {
  return createEditorStore({ toolId: "test-fixture", registry: createFixtureRegistry() });
}

function setup(store = newStore(), brandKit: BrandKitStore | null = kit) {
  renderWithIntl(
    <EditorStoreProvider store={store}>
      <EditorShell
        exportServices={fakeServices()}
        {...(brandKit ? { brandKit, brandKitHref: "/de/brand-kit" } : {})}
      />
    </EditorStoreProvider>,
    messages,
  );
  return store;
}

describe("applyBrandPalette (store)", () => {
  it("recolours as one undo step and locks the brand colours", () => {
    const store = newStore();
    expect(store.getState().applyBrandPalette(BRAND)).toBe(true);
    const s = store.getState();
    expect(s.params.palette).toEqual(BRAND);
    expect(s.params.outlineColor).toBe(BRAND[0]);
    expect(s.params.background).toBe(fixtureDefaults.background);
    expect([...s.locks].sort()).toEqual(["outlineColor", "palette"]);
    expect(s.past).toHaveLength(1);
    // Space keeps the brand colours.
    s.newVariant();
    expect(store.getState().params.palette).toEqual(BRAND);
    store.getState().undo();
    store.getState().undo();
    expect(store.getState().params.palette).toEqual(fixtureDefaults.palette);
  });

  it("respects existing locks and can skip locking", () => {
    const store = newStore();
    store.getState().setLocked("outlineColor", true);
    store.getState().applyBrandPalette(BRAND, { lock: false });
    const s = store.getState();
    expect(s.params.outlineColor).toBe(fixtureDefaults.outlineColor);
    expect(s.params.palette).toEqual(BRAND);
    expect([...s.locks]).toEqual(["outlineColor"]);
  });

  it("refuses palettes that do not fit", () => {
    const store = newStore();
    expect(store.getState().applyBrandPalette(["#000000"])).toBe(false);
    expect(store.getState().past).toHaveLength(0);
  });
});

describe("brand kit in the editor", () => {
  it("offers a link to the Brand Kit while there is no palette", async () => {
    setup();
    const section = await screen.findByTestId("brand-palette");
    expect(within(section).getByTestId("brand-palette-empty").textContent).toContain(
      "Noch keine Brand-Palette.",
    );
    expect(within(section).getByRole("link").getAttribute("href")).toBe("/de/brand-kit");
  });

  it("preselects the default palette and applies the chosen one", async () => {
    await kit.createPalette({ name: "Haus", colors: BRAND });
    const second = await kit.createPalette({ name: "Event", colors: ["#111111", "#222222"] });
    await kit.setDefaultPalette(second.id);
    const store = setup();
    const select = (await screen.findByTestId("brand-palette-select")) as HTMLSelectElement;
    expect(select.value).toBe(second.id);
    expect(screen.getByRole("option", { name: "Event (Standard)" })).toBeTruthy();
    fireEvent.change(select, { target: { value: select.options[1]?.value } });
    fireEvent.click(screen.getByTestId("brand-palette-apply"));
    expect(store.getState().params.palette).toEqual(BRAND);
    expect(screen.getByTestId("shell-flash").textContent).toBe("Brand-Palette „Haus“ angewendet.");
  });

  it("shows brand colours as quick swatches in colour pickers", async () => {
    await kit.createPalette({ name: "Haus", colors: BRAND });
    const store = setup();
    await screen.findByTestId("brand-palette-select");
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Hintergrund #ffffff" }));
    const swatch = await screen.findByRole("button", { name: "Brand-Farbe #fc3d21 übernehmen" });
    expect(swatch.getAttribute("aria-pressed")).toBe("false");
    await user.click(swatch);
    await waitFor(() => expect(store.getState().params.background).toBe("#fc3d21"));
  });

  it("stays out of the way without a brand kit", () => {
    setup(newStore(), null);
    expect(screen.queryByTestId("brand-palette")).toBeNull();
  });
});
