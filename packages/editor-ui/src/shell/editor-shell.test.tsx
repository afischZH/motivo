import { createRegistry, type ToolRegistry } from "@musterli/tool-registry";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ExportServices } from "../export/export-dialog";
import { designToHash } from "../share/share-codec";
import { createEditorStore, type EditorStoreApi } from "../store/editor-store";
import { EditorStoreProvider } from "../store/react";
import { createFixtureRegistry, fixtureDefaults, fixtureTool } from "../test/fixture-tool";
import { fakeServices } from "../test/fake-services";
import { fixtureMessages, renderWithIntl } from "../test/render";
import { EditorShell } from "./editor-shell";
import { matchSizePreset, orientationOf, parseEdge, sizeOfOption } from "./size-picker";

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

function setup(
  options: { registry?: ToolRegistry; services?: ExportServices; onSwitchTool?: () => void } = {},
): EditorStoreApi {
  let seed = 100;
  const store = createEditorStore({
    toolId: "test-fixture",
    registry: options.registry ?? createFixtureRegistry(),
    randomSeed: () => ++seed,
  });
  renderWithIntl(
    <EditorStoreProvider store={store}>
      <EditorShell
        exportServices={options.services ?? fakeServices()}
        {...(options.onSwitchTool ? { onSwitchTool: options.onSwitchTool } : {})}
      />
    </EditorStoreProvider>,
    messages,
  );
  return store;
}

afterEach(() => {
  window.history.replaceState(null, "", "/");
  window.localStorage.clear();
});

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

  it("opens the tool switcher from the name pill", () => {
    const onSwitchTool = vi.fn();
    setup({ onSwitchTool });
    fireEvent.click(screen.getByRole("button", { name: "Tool wechseln" }));
    expect(onSwitchTool).toHaveBeenCalledOnce();
  });

  it("shows the name without a switcher when the app offers none", () => {
    setup();
    expect(screen.queryByRole("button", { name: "Tool wechseln" })).toBeNull();
  });

  it("hides and shows the side panels and remembers the choice", () => {
    setup();
    const toggle = screen.getByRole("button", { name: "Linke Leiste ausblenden" });
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    fireEvent.click(toggle);
    const show = screen.getByRole("button", { name: "Linke Leiste einblenden" });
    expect(show.getAttribute("aria-expanded")).toBe("false");
    expect(screen.getByTestId("left-panel").className).toContain("lg:hidden");
    expect(JSON.parse(window.localStorage.getItem("musterli.editor.panels") ?? "{}")).toEqual({
      left: false,
      right: true,
    });
    fireEvent.click(screen.getByRole("button", { name: "Einstellungen ausblenden" }));
    fireEvent.click(show);
    expect(screen.getByTestId("left-panel").className).not.toContain("lg:hidden");
    expect(screen.getByRole("button", { name: "Einstellungen einblenden" })).toBeTruthy();
  });

  it("steps the zoom with the floating zoom bar", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: /^100\s%$/ }));
    fireEvent.click(screen.getByRole("button", { name: "Vergrössern" }));
    expect(screen.getByLabelText("Aktueller Zoom").textContent).toMatch(/^150\s%$/);
    fireEvent.click(screen.getByRole("button", { name: "Verkleinern" }));
    fireEvent.click(screen.getByRole("button", { name: "Verkleinern" }));
    expect(screen.getByLabelText("Aktueller Zoom").textContent).toMatch(/^75\s%$/);
    expect(screen.getByRole("button", { name: "Einpassen" }).getAttribute("aria-pressed")).toBe(
      "false",
    );
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

  it("creates a new variant with Space after a tile was clicked, Enter still activates it", () => {
    const store = setup();
    const preset = screen.getByRole("button", { name: "Preset dense" });
    act(() => {
      preset.focus();
      preset.click();
    });
    expect(store.getState().variants).toHaveLength(2);
    const seedAfterPreset = store.getState().seed;

    press(" ", {}, preset);
    expect(store.getState().variants).toHaveLength(3);
    expect(store.getState().seed).not.toBe(seedAfterPreset);

    const tile = within(screen.getByTestId("filmstrip")).getByRole("button", {
      name: "Variante 1",
    });
    act(() => tile.focus());
    press(" ", {}, tile);
    expect(store.getState().variants).toHaveLength(4);
    // The keyup that follows is swallowed, so the focused tile is not clicked too.
    const up = new KeyboardEvent("keyup", { key: " ", bubbles: true, cancelable: true });
    tile.dispatchEvent(up);
    expect(up.defaultPrevented).toBe(true);
    expect(store.getState().activeVariantId).toBe(3);
  });

  it("announces the variant position only when it changes, not on every edit", () => {
    const store = setup();
    press(" ");
    const announcer = screen.getByTestId("editor-announcer");
    expect(announcer.textContent).toBe("Variante 2 von 2");
    act(() => announcer.replaceChildren());
    act(() => store.getState().setParam("count", 33));
    expect(announcer.textContent).toBe("");
    press("ArrowLeft");
    expect(announcer.textContent).toBe("Variante 1 von 2");
  });

  it("keeps the arrow buttons usable without an active variant", () => {
    const store = setup();
    press(" ");
    // E.g. after undoing to a design whose variant left the filmstrip.
    act(() => store.setState({ activeVariantId: null }));
    const previous = screen.getByRole("button", { name: "Vorherige Variante" });
    const next = screen.getByRole("button", { name: "Nächste Variante" });
    expect(previous.hasAttribute("disabled")).toBe(false);
    expect(next.hasAttribute("disabled")).toBe(false);
    // Like the arrow keys: both jump to the newest variant first.
    act(() => previous.click());
    expect(store.getState().activeVariantId).toBe(1);
    expect(next.hasAttribute("disabled")).toBe(true);
    act(() => previous.click());
    expect(store.getState().activeVariantId).toBe(0);
    expect(previous.hasAttribute("disabled")).toBe(true);
  });

  it("lets the active filmstrip tile reuse the preview render", () => {
    setup();
    act(() => {
      press(" ");
    });
    const preview = screen.getByRole("img", { name: /^Vorschau/ });
    const previewSrc =
      preview.querySelector("img")?.getAttribute("src") ?? preview.getAttribute("src");
    const active = within(screen.getByTestId("filmstrip")).getByRole("button", {
      name: "Variante 2",
    });
    expect(previewSrc).toBeTruthy();
    expect(active.querySelector("img")?.getAttribute("src")).toBe(previewSrc);
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

  it("groups the size presets with orientation and swaps the orientation", () => {
    const store = setup();
    const select = screen.getByLabelText("Grösse");
    const groups = within(select)
      .getAllByRole("group")
      .map((g) => g.getAttribute("label"));
    expect(groups).toEqual([
      "Social Media",
      "Bildschirme und Hintergründe",
      "Smartphones",
      "Tablets",
      "Druck (300 dpi)",
      "Seitenverhältnisse",
    ]);
    expect(
      within(select).getByRole("option", { name: "iPhone Air (1260 × 2736, hoch)" }),
    ).toBeTruthy();

    // Two presets share 3840 × 2160: the one picked stays selected.
    fireEvent.change(select, { target: { value: "youtube-thumbnail" } });
    expect(store.getState().size).toEqual({ width: 3840, height: 2160 });
    expect((select as HTMLSelectElement).value).toBe("youtube-thumbnail");

    const swap = screen.getByRole("button", { name: "Ausrichtung tauschen" });
    fireEvent.click(swap);
    expect(store.getState().size).toEqual({ width: 2160, height: 3840 });
    expect((select as HTMLSelectElement).value).toBe("custom");

    fireEvent.change(select, { target: { value: "square" } });
    expect((swap as HTMLButtonElement).disabled).toBe(true);
  });

  it("opens the shortcut help with ?", () => {
    setup();
    press("?", { shiftKey: true });
    expect(screen.getByRole("dialog", { name: "Tastaturkürzel" })).toBeTruthy();
  });

  it("opens the export dialog from the button and with Ctrl+E", () => {
    setup();
    expect(screen.queryByRole("dialog", { name: "Exportieren" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Exportieren" }));
    const dialog = screen.getByRole("dialog", { name: "Exportieren" });
    expect(within(dialog).getByRole("radio", { name: "SVG" })).toBeTruthy();
    fireEvent.click(within(dialog).getByRole("button", { name: "Schliessen" }));
    expect(screen.queryByRole("dialog", { name: "Exportieren" })).toBeNull();

    press("e", { ctrlKey: true });
    expect(screen.getByRole("dialog", { name: "Exportieren" })).toBeTruthy();
  });

  it("copies the current design as PNG with Ctrl+Shift+C when the tool exports PNG", async () => {
    const registry = createRegistry();
    registry.register({ ...fixtureTool, exports: ["svg", "png"] });
    const services = fakeServices();
    setup({ registry, services });
    press("C", { ctrlKey: true, shiftKey: true });
    await waitFor(() =>
      expect(screen.getByTestId("shell-flash").textContent).toBe(
        "Als PNG kopiert! Ab ins Projekt damit.",
      ),
    );
    expect(services.copyPng).toHaveBeenCalledTimes(1);
    expect(services.exportRaster.mock.calls[0]?.[3]).toEqual({ format: "png" });
  });

  it("leaves Ctrl+Shift+C alone for tools without PNG export", () => {
    const services = fakeServices();
    setup({ services });
    press("C", { ctrlKey: true, shiftKey: true });
    expect(services.copyPng).not.toHaveBeenCalled();
  });
});

describe("EditorShell share", () => {
  const shared = {
    toolId: "test-fixture",
    params: { ...fixtureDefaults, count: 7 },
    seed: 4242,
    size: { width: 640, height: 480 },
  };
  const hash = (design = shared) => {
    const r = designToHash(design, createFixtureRegistry());
    if (!r.ok) throw new Error(r.error);
    return r.value;
  };

  it("copies a link with the design in the hash and confirms it", async () => {
    const services = fakeServices();
    const store = setup({ services });
    act(() => store.getState().setParam("count", 33));
    fireEvent.click(screen.getByRole("button", { name: "Teilen" }));
    await waitFor(() =>
      expect(screen.getByTestId("shell-flash").textContent).toBe(
        "Link kopiert! Wer ihn öffnet, sieht genau dieses Motiv.",
      ),
    );
    const url = services.copyText.mock.calls[0]?.[0] ?? "";
    expect(url).toMatch(/^http:\/\/localhost(:\d+)?\/#d=[\w-]+$/);
    // The page URL is not touched.
    expect(window.location.hash).toBe("");
  });

  it("shows the link to copy by hand when the clipboard fails", async () => {
    setup({ services: fakeServices({ copyText: async () => ({ ok: false, reason: "denied" }) }) });
    fireEvent.click(screen.getByRole("button", { name: "Teilen" }));
    const notice = await screen.findByTestId("shell-notice");
    expect(notice.getAttribute("role")).toBe("alert");
    const input = within(notice).getByLabelText("Link zu diesem Motiv") as HTMLInputElement;
    expect(input.value).toMatch(/#d=/);
    fireEvent.click(within(notice).getByRole("button", { name: "Hinweis schliessen" }));
    expect(screen.queryByTestId("shell-notice")).toBeNull();
  });

  it("loads a design from the hash on page load", () => {
    window.history.replaceState(null, "", `/de/tools/test-fixture${hash()}`);
    const store = setup();
    const state = store.getState();
    expect(state.params).toEqual(shared.params);
    expect(state.seed).toBe(4242);
    expect(state.size).toEqual({ width: 640, height: 480 });
    expect(screen.queryByTestId("shell-notice")).toBeNull();
  });

  it("keeps the defaults and shows a dismissible notice for a broken hash", () => {
    window.history.replaceState(null, "", "/de/tools/test-fixture#d=@@@");
    const store = setup();
    expect(store.getState().params).toEqual(fixtureDefaults);
    const notice = screen.getByTestId("shell-notice");
    expect(notice.getAttribute("role")).toBe("alert");
    expect(notice.textContent).toContain(
      "Der geteilte Link ist beschädigt. Du siehst die Standardeinstellungen.",
    );
    fireEvent.click(within(notice).getByRole("button", { name: "Hinweis schliessen" }));
    expect(screen.queryByTestId("shell-notice")).toBeNull();
  });

  it("follows hash changes", async () => {
    const store = setup();
    expect(store.getState().params).toEqual(fixtureDefaults);
    act(() => {
      window.location.hash = hash();
    });
    await waitFor(() => expect(store.getState().params).toEqual(shared.params));
  });
});

describe("size helpers", () => {
  it("matches size presets", () => {
    expect(matchSizePreset({ width: 1080, height: 1350 })).toBe("portrait");
    expect(matchSizePreset({ width: 1081, height: 1350 })).toBe("custom");
  });

  it("prefers the tool's own sizes and maps option values back to sizes", () => {
    const own = [
      { id: "product-hunt", width: 1270, height: 760, nameKey: "x" },
      { id: "same-as-square", width: 1080, height: 1080, nameKey: "y" },
    ];
    expect(matchSizePreset({ width: 1270, height: 760 }, own)).toBe("tool:product-hunt");
    expect(matchSizePreset({ width: 1080, height: 1080 }, own)).toBe("tool:same-as-square");
    expect(matchSizePreset({ width: 1080, height: 1350 }, own)).toBe("portrait");
    expect(sizeOfOption("tool:product-hunt", own)).toEqual({ width: 1270, height: 760 });
    expect(sizeOfOption("portrait", own)).toEqual({ width: 1080, height: 1350 });
    expect(sizeOfOption("tool:missing", own)).toBeUndefined();
    expect(sizeOfOption("custom")).toBeUndefined();
  });

  it("keeps the preferred option while its size matches", () => {
    const uhd = { width: 3840, height: 2160 };
    expect(matchSizePreset(uhd)).toBe("uhd-4k");
    expect(matchSizePreset(uhd, [], "youtube-thumbnail")).toBe("youtube-thumbnail");
    expect(matchSizePreset(uhd, [], "full-hd")).toBe("uhd-4k");
    expect(matchSizePreset(uhd, [], "custom")).toBe("uhd-4k");
    expect(matchSizePreset({ width: 1000, height: 1500 })).toBe("pinterest-pin");
  });

  it("tells the orientation", () => {
    expect(orientationOf({ width: 1080, height: 1920 })).toBe("portrait");
    expect(orientationOf({ width: 1920, height: 1080 })).toBe("landscape");
    expect(orientationOf({ width: 500, height: 500 })).toBe("square");
  });

  it("parses edges within the canvas limits only", () => {
    expect(parseEdge(" 640 ")).toBe(640);
    expect(parseEdge("15")).toBeNull();
    expect(parseEdge("8193")).toBeNull();
    expect(parseEdge("12.5")).toBeNull();
    expect(parseEdge("")).toBeNull();
  });
});
