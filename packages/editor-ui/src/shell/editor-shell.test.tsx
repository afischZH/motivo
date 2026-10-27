import { act, fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createEditorStore, type EditorStoreApi } from "../store/editor-store";
import { EditorStoreProvider } from "../store/react";
import { createFixtureRegistry } from "../test/fixture-tool";
import { fixtureMessages, renderWithIntl } from "../test/render";
import { EditorShell } from "./editor-shell";
import { matchSizePreset, parseEdge } from "./size-picker";

const presetNames = Object.fromEntries(
  ["classic", "dense", "square", "outlined", "faint", "dark"].map((id) => [id, `Preset ${id}`]),
);
const messages = {
  ...fixtureMessages,
  tools: {
    ...fixtureMessages.tools,
    "test-fixture": {
      ...fixtureMessages.tools["test-fixture"],
      name: "Testwerkzeug",
      presets: presetNames,
    },
  },
};

function setup(): EditorStoreApi {
  let seed = 100;
  const store = createEditorStore({
    toolId: "test-fixture",
    registry: createFixtureRegistry(),
    randomSeed: () => ++seed,
  });
  renderWithIntl(
    <EditorStoreProvider store={store}>
      <EditorShell />
    </EditorStoreProvider>,
    messages,
  );
  return store;
}

const press = (key: string, init: KeyboardEventInit = {}, target: Element = document.body) =>
  act(() => {
    fireEvent.keyDown(target, { key, bubbles: true, ...init });
  });

describe("EditorShell", () => {
  it("renders the tool name, sections and a labelled preview", () => {
    setup();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe("Testwerkzeug");
    expect(screen.getByRole("region", { name: "Vorlagen" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Einstellungen" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Varianten" })).toBeTruthy();
    expect(
      screen.getByRole("img", { name: "Vorschau: Testwerkzeug, 1080 × 1080 px" }),
    ).toBeTruthy();
  });

  it("Space adds a variant and announces it; undo and redo work by keyboard", () => {
    const store = setup();
    press(" ");
    expect(store.getState().variants).toHaveLength(2);
    expect(screen.getByTestId("editor-announcer").textContent).toBe("Variante 2 von 2");

    press("z", { ctrlKey: true });
    expect(store.getState().activeVariantId).toBe(0);
    expect(screen.getByTestId("editor-announcer").textContent).toBe("Rückgängig gemacht");

    press("Z", { metaKey: true, shiftKey: true });
    expect(store.getState().activeVariantId).toBe(1);

    press("ArrowLeft");
    expect(store.getState().activeVariantId).toBe(0);
    press("ArrowRight");
    expect(store.getState().activeVariantId).toBe(1);
  });

  it("ignores Space while typing in a field and on buttons", () => {
    const store = setup();
    press(" ", {}, screen.getByLabelText("Breite"));
    press(" ", {}, screen.getByRole("button", { name: "Neu würfeln" }));
    expect(store.getState().variants).toHaveLength(1);
  });

  it("does not repeat a new variant while Space is held", () => {
    const store = setup();
    press(" ");
    press(" ", { repeat: true });
    expect(store.getState().variants).toHaveLength(2);
  });

  it("applies presets as new variants and marks the active one", () => {
    const store = setup();
    const preset = screen.getByRole("button", { name: "Preset dense" });
    act(() => preset.click());
    expect(store.getState().params.count).toBe(40);
    expect(preset.getAttribute("aria-pressed")).toBe("true");
    const filmstrip = screen.getByTestId("filmstrip");
    expect(within(filmstrip).getAllByRole("button")).toHaveLength(2);
    expect(
      within(filmstrip).getByRole("button", { name: "Variante 2" }).getAttribute("aria-current"),
    ).toBe("true");
  });

  it("switches zoom with 0 and 1", () => {
    setup();
    press("1");
    expect(screen.getByRole("button", { name: /^100\s%$/ }).getAttribute("aria-pressed")).toBe(
      "true",
    );
    press("0");
    expect(screen.getByRole("button", { name: "Einpassen" }).getAttribute("aria-pressed")).toBe(
      "true",
    );
  });

  it("changes the canvas size from presets and validated custom input", () => {
    const store = setup();
    fireEvent.change(screen.getByLabelText("Grösse"), { target: { value: "full-hd" } });
    expect(store.getState().size).toEqual({ width: 1920, height: 1080 });

    const width = screen.getByLabelText("Breite");
    fireEvent.change(width, { target: { value: "8" } });
    fireEvent.blur(width);
    expect(store.getState().size.width).toBe(1920);
    expect(width.getAttribute("aria-invalid")).toBe("true");

    fireEvent.change(width, { target: { value: "640" } });
    fireEvent.keyDown(width, { key: "Enter" });
    expect(store.getState().size).toEqual({ width: 640, height: 1080 });
  });

  it("opens the shortcut help with ?", () => {
    setup();
    press("?", { shiftKey: true });
    expect(screen.getByRole("dialog", { name: "Tastaturkürzel" })).toBeTruthy();
  });

  it("shows Export disabled until the export dialog exists", () => {
    setup();
    const exportButton = screen.getByRole("button", { name: "Exportieren" }) as HTMLButtonElement;
    expect(exportButton.disabled).toBe(true);
  });
});

describe("size helpers", () => {
  it("matches size presets", () => {
    expect(matchSizePreset({ width: 1080, height: 1350 })).toBe("portrait");
    expect(matchSizePreset({ width: 1081, height: 1350 })).toBe("custom");
  });

  it("parses edges within the canvas limits only", () => {
    expect(parseEdge(" 640 ")).toBe(640);
    expect(parseEdge("15")).toBeNull();
    expect(parseEdge("8193")).toBeNull();
    expect(parseEdge("12.5")).toBeNull();
    expect(parseEdge("")).toBeNull();
  });
});
