import { ExportError, type GifExportResult, type RasterExportResult } from "@musterli/exporters";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createEditorStore, type EditorStoreApi } from "../store/editor-store";
import { EditorStoreProvider } from "../store/react";
import { createFixtureRegistry } from "../test/fixture-tool";
import { fakeServices } from "../test/fake-services";
import { renderWithIntl } from "../test/render";
import { EXPORT_FORMAT_STORAGE_KEY, ExportDialog, type ExportServices } from "./export-dialog";

type RasterArgs = Parameters<ExportServices["exportRaster"]>;

function setup(toolId = "blob", services: ExportServices = fakeServices()): EditorStoreApi {
  const store =
    toolId === "blob" || toolId === "css-gradient"
      ? createEditorStore({ toolId, size: { width: 1080, height: 1350 } })
      : createEditorStore({ toolId, registry: createFixtureRegistry() });
  renderWithIntl(
    <EditorStoreProvider store={store}>
      <ExportDialog open onClose={() => undefined} services={services} />
    </EditorStoreProvider>,
  );
  return store;
}

const dialog = () => screen.getByRole("dialog", { name: "Exportieren" });
const formatRadio = (name: string | RegExp) => within(dialog()).getByRole("radio", { name });
const status = () => within(screen.getByTestId("export-status")).getByRole("status");
const alert = () => within(screen.getByTestId("export-status")).getByRole("alert");

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("ExportDialog backdrop", () => {
  function setupWithClose() {
    const onClose = vi.fn();
    const store = createEditorStore({ toolId: "test-fixture", registry: createFixtureRegistry() });
    renderWithIntl(
      <EditorStoreProvider store={store}>
        <ExportDialog open onClose={onClose} services={fakeServices()} />
      </EditorStoreProvider>,
    );
    return onClose;
  }

  it("closes on a click that starts and ends on the backdrop", () => {
    const onClose = setupWithClose();
    const el = screen.getByTestId("export-dialog");
    fireEvent.pointerDown(el);
    fireEvent.click(el);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("stays open when a drag starts inside and ends on the backdrop", () => {
    const onClose = setupWithClose();
    const el = screen.getByTestId("export-dialog");
    fireEvent.pointerDown(within(el).getByRole("heading", { name: "Exportieren" }));
    fireEvent.click(el);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("stays open on a click inside the dialog", () => {
    const onClose = setupWithClose();
    const heading = within(screen.getByTestId("export-dialog")).getByRole("heading", {
      name: "Exportieren",
    });
    fireEvent.pointerDown(heading);
    fireEvent.click(heading);
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe("ExportDialog formats", () => {
  it("offers the tool's formats grouped as image, vector and code", () => {
    setup("blob");
    const names = within(dialog())
      .getAllByRole("radio")
      .filter((r) => r.getAttribute("data-format") !== null)
      .map((r) => r.getAttribute("data-format"));
    expect(names).toEqual(["png", "jpg", "webp", "svg", "css", "extra:clip-path", "gif"]);
    const group = (name: string) =>
      within(within(dialog()).getByRole("group", { name }))
        .getAllByRole("radio")
        .map((r) => r.getAttribute("data-format"));
    expect(group("Bild")).toEqual(["png", "jpg", "webp"]);
    expect(group("Vektor")).toEqual(["svg"]);
    expect(group("Code")).toEqual(["css", "extra:clip-path"]);
    expect(group("Animation")).toEqual(["gif"]);
    expect(formatRadio("CSS clip-path")).toBeTruthy();
    expect((formatRadio("PNG") as HTMLInputElement).checked).toBe(true);
  });

  it("offers Tailwind for the CSS gradient", () => {
    setup("css-gradient");
    expect(formatRadio("Tailwind-Klassen")).toBeTruthy();
  });

  it("only lists what a tool declares", () => {
    setup("test-fixture");
    const radios = within(dialog())
      .getAllByRole("radio")
      .filter((r) => r.getAttribute("data-format") !== null);
    expect(radios.map((r) => r.getAttribute("data-format"))).toEqual(["svg"]);
    expect(screen.queryByRole("group", { name: "Grösse" })).toBeNull();
  });

  it("remembers the last chosen format", () => {
    window.localStorage.setItem(EXPORT_FORMAT_STORAGE_KEY, "svg");
    setup("blob");
    expect((formatRadio("SVG") as HTMLInputElement).checked).toBe(true);
    fireEvent.click(formatRadio("CSS"));
    expect(window.localStorage.getItem(EXPORT_FORMAT_STORAGE_KEY)).toBe("css");
  });

  it("shows code with its size for text formats and copies it", async () => {
    const services = fakeServices();
    setup("blob", services);
    fireEvent.click(formatRadio("CSS"));
    const code = screen.getByTestId("export-code").textContent ?? "";
    expect(code).toMatch(/^background-image: url\("data:image\/svg\+xml,/);
    expect(screen.getByTestId("export-file-size").textContent).toMatch(/^\d+(\.\d)? (B|KB)$/);

    fireEvent.click(screen.getByRole("button", { name: "Kopieren" }));
    await waitFor(() => expect(status().textContent).toBe("Kopiert! Ab ins Projekt damit."));
    expect(services.copyText).toHaveBeenCalledWith(code);
  });

  it("downloads SVG as a file named after tool and seed", () => {
    const services = fakeServices();
    const store = setup("blob", services);
    fireEvent.click(formatRadio("SVG"));
    fireEvent.click(screen.getByRole("button", { name: "Herunterladen" }));
    expect(services.downloadBlob).toHaveBeenCalledTimes(1);
    const [blob, name] = services.downloadBlob.mock.calls[0] ?? [];
    expect(blob?.type).toBe("image/svg+xml");
    expect(name).toBe(`musterli-blob-${store.getState().seed}.svg`);
    expect(status().textContent).toBe("Heruntergeladen.");
  });
});

describe("ExportDialog size", () => {
  it("offers 1x, 2x and 4x of the design size", () => {
    setup("blob");
    const group = screen.getByRole("group", { name: "Grösse" });
    expect(within(group).getByRole("radio", { name: "1× (1080 × 1350)" })).toBeTruthy();
    expect(within(group).getByRole("radio", { name: "4× (4320 × 5400)" })).toBeTruthy();
    fireEvent.click(within(group).getByRole("radio", { name: "2× (2160 × 2700)" }));
    expect(screen.getByTestId("export-output-size").textContent).toBe("Ergebnis: 2160 × 2700 px.");
  });

  it("scales the vector for 2x", async () => {
    const services = fakeServices();
    setup("blob", services);
    fireEvent.click(screen.getByRole("radio", { name: "2× (2160 × 2700)" }));
    fireEvent.click(screen.getByRole("button", { name: "Herunterladen" }));
    await waitFor(() => expect(services.downloadBlob).toHaveBeenCalled());
    const [, , ctx, options] = services.exportRaster.mock.calls[0] ?? [];
    expect({ width: ctx?.width, height: ctx?.height }).toEqual({ width: 1080, height: 1350 });
    expect(options?.size).toEqual({ width: 2160, height: 2700 });
    expect(options?.format).toBe("png");
  });

  it("re-renders at a custom size with another aspect ratio", async () => {
    const services = fakeServices();
    setup("blob", services);
    fireEvent.click(screen.getByRole("radio", { name: "Eigene Grösse" }));
    const width = within(dialog()).getByLabelText("Breite");
    const height = within(dialog()).getByLabelText("Höhe");
    expect((width as HTMLInputElement).value).toBe("1080");
    fireEvent.change(width, { target: { value: "1920" } });
    fireEvent.blur(width);
    fireEvent.change(within(dialog()).getByLabelText("Höhe"), { target: { value: "1080" } });
    fireEvent.keyDown(within(dialog()).getByLabelText("Höhe"), { key: "Enter" });
    expect(height).toBeTruthy();
    expect(screen.getByTestId("export-output-size").textContent).toBe(
      "Ergebnis: 1920 × 1080 px. Anderes Seitenverhältnis: Das Motiv wird für dieses Format neu berechnet.",
    );
    fireEvent.click(screen.getByRole("button", { name: "Herunterladen" }));
    await waitFor(() => expect(services.downloadBlob).toHaveBeenCalled());
    const [, , ctx, options] = services.exportRaster.mock.calls[0] ?? [];
    expect({ width: ctx?.width, height: ctx?.height }).toEqual({ width: 1920, height: 1080 });
    expect(options?.size).toEqual({ width: 1920, height: 1080 });
  });

  it("rejects custom edges outside the canvas limits", () => {
    setup("blob");
    fireEvent.click(screen.getByRole("radio", { name: "Eigene Grösse" }));
    const width = within(dialog()).getByLabelText("Breite");
    fireEvent.change(width, { target: { value: "9000" } });
    fireEvent.blur(width);
    expect(width.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByTestId("export-output-size").textContent).toBe("Ergebnis: 1080 × 1350 px.");
  });
});

describe("ExportDialog raster options", () => {
  it("has a quality slider for JPG and WebP and a background for JPG", async () => {
    const services = fakeServices();
    setup("blob", services);
    expect(screen.queryByLabelText("Qualität")).toBeNull();
    fireEvent.click(formatRadio("JPG"));
    const quality = screen.getByLabelText("Qualität") as HTMLInputElement;
    expect(quality.value).toBe("92");
    fireEvent.change(quality, { target: { value: "70" } });
    const background = screen.getByLabelText("Hintergrund") as HTMLInputElement;
    fireEvent.change(background, { target: { value: "#112233" } });
    fireEvent.click(screen.getByRole("button", { name: "Herunterladen" }));
    await waitFor(() => expect(services.downloadBlob).toHaveBeenCalled());
    const options = services.exportRaster.mock.calls[0]?.[3];
    expect(options?.quality).toBeCloseTo(0.7);
    expect(options?.background).toBe("#112233");

    fireEvent.click(formatRadio("WebP"));
    expect((screen.getByLabelText("Qualität") as HTMLInputElement).value).toBe("90");
    expect(screen.queryByLabelText("Hintergrund")).toBeNull();
  });

  it("copies PNG through ClipboardItem and explains why JPG cannot be copied", async () => {
    const services = fakeServices();
    setup("blob", services);
    fireEvent.click(screen.getByRole("button", { name: "Bild kopieren" }));
    await waitFor(() => expect(status().textContent).toBe("Kopiert! Ab ins Projekt damit."));
    expect(services.copyPng).toHaveBeenCalledTimes(1);

    fireEvent.click(formatRadio("JPG"));
    const copy = screen.getByRole("button", { name: "Bild kopieren" }) as HTMLButtonElement;
    expect(copy.disabled).toBe(true);
    expect(copy.getAttribute("aria-describedby")).toBeTruthy();
    expect(screen.getByText("Bilder lassen sich nur als PNG kopieren.")).toBeTruthy();
  });

  it("disables image copy with an explanation when ClipboardItem is missing", () => {
    setup("blob", fakeServices({ canCopyImage: () => false }));
    const copy = screen.getByRole("button", { name: "Bild kopieren" }) as HTMLButtonElement;
    expect(copy.disabled).toBe(true);
    expect(
      screen.getByText(
        "Dein Browser kann keine Bilder in die Zwischenablage legen. Lade das PNG herunter.",
      ),
    ).toBeTruthy();
  });

  it("shows progress and cancels a running export", async () => {
    const services = fakeServices({
      exportRaster: vi.fn(
        (...[, , , options]: RasterArgs) =>
          new Promise<RasterExportResult>((_, reject) => {
            options.onProgress?.(0.4);
            options.signal?.addEventListener("abort", () =>
              reject(new ExportError("aborted", "aborted")),
            );
          }),
      ),
    });
    setup("blob", services);
    fireEvent.click(screen.getByRole("button", { name: "Herunterladen" }));
    const progress = await screen.findByRole("progressbar", { name: "Exportfortschritt" });
    expect(progress.getAttribute("value")).toBe("0.4");
    expect(
      (screen.getByRole("button", { name: "Herunterladen" }) as HTMLButtonElement).disabled,
    ).toBe(true);
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    });
    await waitFor(() => expect(status().textContent).toBe("Export abgebrochen."));
    expect(screen.queryByRole("progressbar")).toBeNull();
    expect(services.downloadBlob).not.toHaveBeenCalled();
  });
});

type GifArgs = Parameters<ExportServices["exportGif"]>;

describe("ExportDialog GIF", () => {
  const gifPanel = () => screen.getByTestId("export-gif");

  it("offers frame source, frames, delay, loop and size, then exports", async () => {
    const services = fakeServices();
    setup("blob", services);
    fireEvent.click(formatRadio("GIF"));
    const panel = within(gifPanel());
    expect((panel.getByRole("radio", { name: "Neue Varianten" }) as HTMLInputElement).checked).toBe(
      true,
    );
    expect(panel.getByRole("radio", { name: "Farbwechsel" })).toBeTruthy();
    expect((panel.getByRole("slider", { name: "Anzahl Bilder" }) as HTMLInputElement).value).toBe(
      "12",
    );
    expect((panel.getByRole("slider", { name: "Dauer pro Bild" }) as HTMLInputElement).value).toBe(
      "100",
    );
    expect(
      (panel.getByRole("checkbox", { name: "Endlos wiederholen" }) as HTMLInputElement).checked,
    ).toBe(true);
    // 1080 × 1350 at a long edge of 640 px.
    expect((panel.getByRole("radio", { name: "512 × 640" }) as HTMLInputElement).checked).toBe(
      true,
    );
    expect(screen.getByTestId("export-gif-summary").textContent).toBe(
      "Ergebnis: 512 × 640 px, 12 Bilder, 1.2 s pro Durchgang.",
    );
    // Only PNG can be copied.
    expect(
      (screen.getByRole("button", { name: "Bild kopieren" }) as HTMLButtonElement).disabled,
    ).toBe(true);

    fireEvent.click(panel.getByRole("radio", { name: "Farbwechsel" }));
    fireEvent.change(panel.getByRole("slider", { name: "Anzahl Bilder" }), {
      target: { value: "24" },
    });
    fireEvent.change(panel.getByRole("slider", { name: "Dauer pro Bild" }), {
      target: { value: "50" },
    });
    fireEvent.click(panel.getByRole("checkbox", { name: "Endlos wiederholen" }));
    fireEvent.click(panel.getByRole("radio", { name: "256 × 320" }));
    fireEvent.click(screen.getByRole("button", { name: "Herunterladen" }));
    await waitFor(() => expect(status().textContent).toBe("Heruntergeladen."));
    const [tool, , ctx, options] = services.exportGif.mock.calls[0] as GifArgs;
    expect(tool.id).toBe("blob");
    expect([ctx.width, ctx.height]).toEqual([1080, 1350]);
    expect(options).toMatchObject({
      source: "colors",
      frames: 24,
      delay: 50,
      loop: false,
      edge: 320,
    });
    expect(services.downloadBlob).toHaveBeenCalledWith(expect.any(Blob), "musterli-blob.gif");
  });

  it("blocks exports over the pixel budget with an explanation", () => {
    const services = fakeServices();
    setup("blob", services);
    fireEvent.click(formatRadio("GIF"));
    const panel = within(gifPanel());
    fireEvent.change(panel.getByRole("slider", { name: "Anzahl Bilder" }), {
      target: { value: "60" },
    });
    fireEvent.click(panel.getByRole("radio", { name: "819 × 1024" }));
    expect(screen.getByTestId("export-gif-budget").textContent).toBe(
      "Das ist zu viel für ein GIF (höchstens 30 Mio. Pixel über alle Bilder). Wähle höchstens 35 Bilder oder eine kleinere Grösse.",
    );
    const download = screen.getByRole("button", { name: "Herunterladen" }) as HTMLButtonElement;
    expect(download.disabled).toBe(true);
    fireEvent.change(panel.getByRole("slider", { name: "Anzahl Bilder" }), {
      target: { value: "35" },
    });
    expect(screen.queryByTestId("export-gif-budget")).toBeNull();
    expect(download.disabled).toBe(false);
  });

  it("shows progress and cancels a running GIF export", async () => {
    const services = fakeServices({
      exportGif: vi.fn(
        (...[, , , options]: GifArgs) =>
          new Promise<GifExportResult>((_, reject) => {
            options.onProgress?.(0.25);
            options.signal?.addEventListener("abort", () =>
              reject(new ExportError("aborted", "aborted")),
            );
          }),
      ),
    });
    setup("blob", services);
    fireEvent.click(formatRadio("GIF"));
    fireEvent.click(screen.getByRole("button", { name: "Herunterladen" }));
    const progress = await screen.findByRole("progressbar", { name: "Exportfortschritt" });
    expect(progress.getAttribute("value")).toBe("0.25");
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Abbrechen" }));
    });
    await waitFor(() => expect(status().textContent).toBe("Export abgebrochen."));
    expect(services.downloadBlob).not.toHaveBeenCalled();
  });

  it("explains a refused budget from the exporter", async () => {
    setup(
      "blob",
      fakeServices({
        exportGif: vi.fn(async () => {
          throw new ExportError("budget-exceeded", "too many");
        }),
      }),
    );
    fireEvent.click(formatRadio("GIF"));
    fireEvent.click(screen.getByRole("button", { name: "Herunterladen" }));
    await waitFor(() =>
      expect(alert().textContent).toBe(
        "Das ist zu viel für ein GIF. Wähle weniger Bilder oder eine kleinere Grösse.",
      ),
    );
  });

  it("is not offered for tools without animation", () => {
    setup("test-fixture");
    expect(within(dialog()).queryByRole("radio", { name: "GIF" })).toBeNull();
  });
});

describe("ExportDialog errors", () => {
  const failing = (code: ConstructorParameters<typeof ExportError>[0]) =>
    fakeServices({
      exportRaster: vi.fn(async () => {
        throw new ExportError(code, code);
      }),
    });

  it("explains encode-failed with a hint to choose a smaller size", async () => {
    setup("blob", failing("encode-failed"));
    fireEvent.click(screen.getByRole("radio", { name: "4× (4320 × 5400)" }));
    fireEvent.click(screen.getByRole("button", { name: "Herunterladen" }));
    await waitFor(() =>
      expect(alert().textContent).toBe(
        "Das Bild ist zu gross für dieses Gerät.Wähle eine kleinere Grösse, zum Beispiel 1× oder 2×.",
      ),
    );
  });

  it("explains encode-unsupported (WebP in Safari)", async () => {
    setup("blob", failing("encode-unsupported"));
    fireEvent.click(formatRadio("WebP"));
    fireEvent.click(screen.getByRole("button", { name: "Herunterladen" }));
    await waitFor(() =>
      expect(alert().textContent).toBe(
        "Dein Browser kann dieses Format nicht speichern. Nimm PNG oder JPG.",
      ),
    );
  });

  it("explains too-large (large JPG or WebP the browser cannot draw)", async () => {
    setup("blob", failing("too-large"));
    fireEvent.click(formatRadio("JPG"));
    fireEvent.click(screen.getByRole("button", { name: "Herunterladen" }));
    await waitFor(() =>
      expect(alert().textContent).toBe(
        "Dein Browser kann ein Bild dieser Grösse nicht in diesem Format erzeugen. Wähle PNG oder eine kleinere Grösse.",
      ),
    );
  });

  it("explains decode-failed and unknown errors", async () => {
    setup("blob", failing("decode-failed"));
    fireEvent.click(screen.getByRole("button", { name: "Herunterladen" }));
    await waitFor(() => expect(alert().textContent).toMatch(/^Das Motiv liess sich nicht/));
  });

  it("explains clipboard denial", async () => {
    setup("blob", fakeServices({ copyText: async () => ({ ok: false, reason: "denied" }) }));
    fireEvent.click(formatRadio("SVG"));
    fireEvent.click(screen.getByRole("button", { name: "Kopieren" }));
    await waitFor(() =>
      expect(alert().textContent).toBe(
        "Der Browser hat den Zugriff auf die Zwischenablage blockiert. Lade die Datei stattdessen herunter.",
      ),
    );
  });
});

describe("ExportDialog afterExport", () => {
  function setupWithHint(services: ExportServices) {
    const store = createEditorStore({ toolId: "blob", size: { width: 1080, height: 1350 } });
    renderWithIntl(
      <EditorStoreProvider store={store}>
        <ExportDialog
          open
          onClose={() => undefined}
          services={services}
          afterExport={<a href="/de/unterstuetzen">Unterstützen</a>}
        />
      </EditorStoreProvider>,
    );
  }

  it("shows the hint only after a successful download", () => {
    setupWithHint(fakeServices());
    expect(screen.queryByTestId("export-after")).toBeNull();
    fireEvent.click(formatRadio("SVG"));
    fireEvent.click(screen.getByRole("button", { name: "Herunterladen" }));
    expect(screen.getByTestId("export-after").textContent).toBe("Unterstützen");
  });

  it("shows the hint after copying code", async () => {
    setupWithHint(fakeServices());
    fireEvent.click(formatRadio("CSS"));
    fireEvent.click(screen.getByRole("button", { name: "Kopieren" }));
    await waitFor(() => expect(screen.getByTestId("export-after")).toBeTruthy());
  });

  it("stays hidden when the export fails or the copy is denied", async () => {
    setupWithHint(
      fakeServices({
        exportRaster: vi.fn(async () => {
          throw new ExportError("encode-failed", "encode-failed");
        }),
        copyText: async () => ({ ok: false, reason: "denied" }),
      }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Herunterladen" }));
    await waitFor(() => expect(alert().textContent).not.toBe(""));
    fireEvent.click(formatRadio("SVG"));
    fireEvent.click(screen.getByRole("button", { name: "Kopieren" }));
    await waitFor(() => expect(alert().textContent).toContain("Zwischenablage"));
    expect(screen.queryByTestId("export-after")).toBeNull();
  });
});
