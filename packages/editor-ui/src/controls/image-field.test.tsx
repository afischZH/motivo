import {
  seamlessPatternsTool,
  type ImageAsset,
  type SeamlessPatternsParams,
} from "@musterli/tool-registry";
import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { createBrandKitStore } from "@musterli/storage";
import { IDBFactory } from "fake-indexeddb";
import { afterEach, describe, expect, it, vi } from "vitest";
// Test-only cross-package import: tool texts live in the web app.
import webDe from "../../../../apps/web/messages/de.json";
import { ExportDialog } from "../export/export-dialog";
import { listExportChoices } from "../export/export-model";
import type { ImageInputServices } from "../image-input/services";
import { decodeDesign } from "../share/share-codec";
import { EditorShell } from "../shell/editor-shell";
import { createEditorStore, findMatchingPresetId } from "../store/editor-store";
import { EditorStoreProvider } from "../store/react";
import { fakeServices } from "../test/fake-services";
import { fixtureMessages, renderWithIntl } from "../test/render";

const tool = seamlessPatternsTool;
const messages = { ...fixtureMessages, tools: webDe.tools, Shapes: webDe.Shapes };

const SVG =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 20"><script>alert(1)</script>' +
  '<rect width="40" height="20" fill="#123456"/></svg>';

const u32be = (v: number) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
const PNG = new Uint8Array([
  0x89,
  0x50,
  0x4e,
  0x47,
  0x0d,
  0x0a,
  0x1a,
  0x0a,
  ...u32be(13),
  ...[..."IHDR"].map((c) => c.charCodeAt(0)),
  ...u32be(64),
  ...u32be(32),
  8,
  6,
  0,
  0,
  0,
]);

const RASTER_HREF = "data:image/png;base64,iVBORw0KGgo=";

function imageServices(): ImageInputServices {
  return {
    decode: vi.fn(async () => ({ ok: false as const, error: "decode-failed" as const })),
    crop: vi.fn(async () => ({ ok: true as const, href: RASTER_HREF, width: 32, height: 32 })),
    derive: vi.fn(async () => ({ ok: false as const, error: "no-result" as const })),
    dispose: vi.fn(),
  };
}

function setup(brandKit?: ReturnType<typeof createBrandKitStore>) {
  const store = createEditorStore({ toolId: tool.id });
  const services = fakeServices();
  const images = imageServices();
  renderWithIntl(
    <EditorStoreProvider store={store}>
      <EditorShell
        exportServices={services}
        imageInputServices={images}
        {...(brandKit ? { brandKit, brandKitHref: "/de/brand-kit" } : {})}
      />
    </EditorStoreProvider>,
    messages,
  );
  const params = () => store.getState().params as SeamlessPatternsParams;
  return { store, services, images, params };
}

const fileInput = () => screen.getByLabelText<HTMLInputElement>("Datei wählen");
const upload = (file: File) => fireEvent.change(fileInput(), { target: { files: [file] } });
const cropDialog = () => screen.findByRole("dialog", { name: "Zuschneiden" });

async function uploadSvg() {
  upload(new File([SVG], "logo.svg", { type: "image/svg+xml" }));
  const dialog = await cropDialog();
  fireEvent.click(within(dialog).getByRole("button", { name: "Übernehmen" }));
  await waitFor(() => expect(screen.queryByRole("dialog", { name: "Zuschneiden" })).toBeNull());
}

afterEach(() => {
  window.history.replaceState(null, "", "/");
});

describe("upload field (Seamless Patterns)", () => {
  it("uploads, sanitises and crops an SVG, then shows it via <img> only", async () => {
    const { params } = setup();
    expect(screen.getByRole("radiogroup", { name: "Form" })).toBeTruthy();
    upload(new File([SVG], "logo.svg", { type: "image/svg+xml" }));
    const dialog = await cropDialog();
    expect(screen.getByTestId("asset-status").textContent).toMatch(/Anzahl: 1/);
    // Square crop, then move it with the keyboard.
    fireEvent.click(within(dialog).getByLabelText("Quadratisch"));
    const frame = within(dialog).getByTestId("crop-frame");
    expect(frame.getAttribute("aria-label")).toBe(
      "Zuschnitt: links 25 %, oben 0 %, Breite 50 %, Höhe 100 %",
    );
    fireEvent.keyDown(frame, { key: "ArrowRight", shiftKey: true });
    expect(frame.getAttribute("aria-label")).toBe(
      "Zuschnitt: links 35 %, oben 0 %, Breite 50 %, Höhe 100 %",
    );
    fireEvent.click(within(dialog).getByRole("button", { name: "Übernehmen" }));
    await waitFor(() => expect(params().upload).not.toBeNull());

    const asset = params().upload as Extract<ImageAsset, { kind: "svg" }>;
    expect(asset).toMatchObject({ kind: "svg", width: 20, height: 20, name: "logo.svg" });
    expect(asset.svg).not.toContain("script");
    expect(asset.svg).toContain('viewBox="14 0 20 20"');
    const thumb = screen.getByTestId<HTMLImageElement>("asset-thumbnail");
    expect(thumb.tagName).toBe("IMG");
    expect(thumb.src).toMatch(/^data:image\/svg\+xml/);
    // The shape picker gives way to the colour switch of the upload.
    expect(screen.queryByRole("radiogroup", { name: "Form" })).toBeNull();
    expect(screen.getByRole("switch", { name: "Originalfarben behalten" })).toBeTruthy();
    // The preview never contains the user's markup inline.
    expect(document.querySelector("[data-testid=preview] script")).toBeNull();
  });

  it("crops raster pictures through the image services", async () => {
    const { params, images } = setup();
    upload(new File([PNG], "photo.png", { type: "image/png" }));
    const dialog = await cropDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: "Übernehmen" }));
    await waitFor(() => expect(params().upload).not.toBeNull());
    expect(images.crop).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      "image/png",
      { x: 0, y: 0, width: 64, height: 32 },
      1024,
    );
    expect(params().upload).toEqual({
      kind: "raster",
      href: RASTER_HREF,
      width: 32,
      height: 32,
      name: "photo.png",
    });
  });

  it("cancels the crop without changing the design", async () => {
    const { params } = setup();
    upload(new File([SVG], "logo.svg"));
    const dialog = await cropDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: "Abbrechen" }));
    expect(screen.queryByRole("dialog", { name: "Zuschneiden" })).toBeNull();
    expect(params().upload).toBeNull();
  });

  it("announces unsupported files", async () => {
    setup();
    upload(new File(["GIF89a\u0001\u0000\u0001\u0000\u0000"], "a.gif"));
    const alert = await screen.findByTestId("asset-error");
    expect(alert.getAttribute("role")).toBe("alert");
    expect(alert.textContent).toMatch(/SVG, PNG, JPG oder WebP/);
  });

  it("removes the upload and returns to the shape", async () => {
    const { params } = setup();
    await uploadSvg();
    fireEvent.click(screen.getByRole("button", { name: "Entfernen" }));
    expect(params().upload).toBeNull();
    expect(screen.getByRole("radiogroup", { name: "Form" })).toBeTruthy();
  });

  it("never puts the upload into a share link and says so", async () => {
    const { services } = setup();
    await uploadSvg();
    fireEvent.click(screen.getByRole("button", { name: "Teilen" }));
    const notice = await screen.findByTestId("shell-notice");
    expect(notice.textContent).toMatch(/nicht im Link/);
    const url = services.copyText.mock.calls[0]?.[0] ?? "";
    const code = new URL(url).hash.replace(/^#d=/, "");
    const decoded = decodeDesign(code);
    if (!decoded.ok) throw new Error(decoded.error);
    expect((decoded.design.params as SeamlessPatternsParams).upload).toBeNull();
    expect(url).not.toMatch(/svg/i);
  });

  it("keeps the upload when a preset is applied", async () => {
    const { store, params } = setup();
    await uploadSvg();
    act(() => store.getState().applyPreset("starlight"));
    expect(params().upload).not.toBeNull();
    expect(params().shape).toBe("sparkle");
    expect(findMatchingPresetId(tool, store.getState().params)).toBe("starlight");
  });
});

describe("shape picker with packs", () => {
  const packSelect = () => screen.getByLabelText<HTMLSelectElement>("Form: Sammlung");

  it("shows one pack at a time and follows the value", async () => {
    const { store, params } = setup();
    // Default shape "flower" lives in the nature pack.
    expect(packSelect().value).toBe("nature");
    const shapes = screen.getByRole("radiogroup", { name: "Form" });
    expect(within(shapes).getAllByRole("radio")).toHaveLength(15);
    expect(within(shapes).getByRole("radio", { name: "Blume" }).getAttribute("aria-checked")).toBe(
      "true",
    );
    fireEvent.change(packSelect(), { target: { value: "symbols" } });
    const heart = within(screen.getByRole("radiogroup", { name: "Form" })).getByRole("radio", {
      name: "Herz",
    });
    // Nothing checked in this pack: the first tile is the tab stop.
    expect(heart.tabIndex).toBe(0);
    fireEvent.click(heart);
    expect(params().shape).toBe("heart");
    // Arrow keys move within the pack.
    fireEvent.keyDown(heart, { key: "ArrowRight" });
    expect(params().shape).toBe("check");
    // A preset elsewhere switches to the pack of its shape.
    act(() => store.getState().applyPreset("bauhaus"));
    await waitFor(() => expect(packSelect().value).toBe("basics"));
    expect(
      within(screen.getByRole("radiogroup", { name: "Form" }))
        .getByRole("radio", { name: "Halbkreis" })
        .getAttribute("aria-checked"),
    ).toBe("true");
  });

  it("has no Brand Kit group without a brand kit", () => {
    setup();
    expect([...packSelect().options].map((o) => o.value)).not.toContain("__brand-kit");
    expect(packSelect().options).toHaveLength(12);
  });

  it("offers Brand Kit shapes, which go through the upload pipeline", async () => {
    const kit = createBrandKitStore({ indexedDB: new IDBFactory() });
    await kit.addAsset({
      kind: "shape",
      name: "Acme",
      image: { kind: "svg", svg: SVG, width: 40, height: 20, name: "acme.svg" },
    });
    await kit.addAsset({
      kind: "logo",
      name: "Logo",
      image: { kind: "svg", svg: SVG, width: 40, height: 20, name: "logo.svg" },
    });
    const { params } = setup(kit);
    fireEvent.change(packSelect(), { target: { value: "__brand-kit" } });
    const items = await screen.findAllByTestId("thumbnail-brand-item");
    // Shapes only, no logos.
    expect(items).toHaveLength(1);
    expect(items[0]?.getAttribute("aria-label")).toBe("Acme verwenden");
    fireEvent.click(items[0] as HTMLElement);
    const dialog = await cropDialog();
    fireEvent.click(within(dialog).getByRole("button", { name: "Übernehmen" }));
    await waitFor(() => expect(params().upload).not.toBeNull());
    const asset = params().upload as Extract<ImageAsset, { kind: "svg" }>;
    expect(asset.kind).toBe("svg");
    expect(asset.svg).not.toContain("script");
    // The picker gives way to the upload field, which shows the shape.
    expect(screen.queryByRole("radiogroup", { name: "Form" })).toBeNull();
    expect(screen.getByTestId("asset-thumbnail")).toBeTruthy();
    kit.close();
  });

  it("says so when the brand kit has no shapes", async () => {
    const kit = createBrandKitStore({ indexedDB: new IDBFactory() });
    setup(kit);
    fireEvent.change(packSelect(), { target: { value: "__brand-kit" } });
    expect(await screen.findByText(/Noch keine eigenen Shapes/)).toBeTruthy();
    expect(screen.getByRole("link", { name: "Zum Brand Kit" }).getAttribute("href")).toBe(
      "/de/brand-kit",
    );
    kit.close();
  });
});

describe("repeat tile export", () => {
  it("is offered as an image format for tools with a tile", () => {
    expect(listExportChoices(tool).map((c) => c.id)).toEqual([
      "png",
      "jpg",
      "webp",
      "png-tile",
      "svg",
      "css",
      "gif",
    ]);
  });

  it("exports the tile at its own size, scale only", async () => {
    const store = createEditorStore({ toolId: tool.id });
    const services = fakeServices();
    renderWithIntl(
      <EditorStoreProvider store={store}>
        <ExportDialog open onClose={() => undefined} services={services} />
      </EditorStoreProvider>,
      messages,
    );
    const dialog = screen.getByRole("dialog", { name: "Exportieren" });
    fireEvent.click(within(dialog).getByRole("radio", { name: "PNG-Kachel" }));
    expect(within(dialog).queryByRole("radio", { name: "Eigene Grösse" })).toBeNull();
    fireEvent.click(within(dialog).getByRole("radio", { name: /^2×/ }));
    fireEvent.click(within(dialog).getByTestId("export-download"));
    await waitFor(() => expect(services.exportRasterTile).toHaveBeenCalledTimes(1));
    const [, , , options] = services.exportRasterTile.mock.calls[0] ?? [];
    expect(options?.size).toEqual({ scale: 2 });
    expect(services.exportRaster).not.toHaveBeenCalled();
  });
});
