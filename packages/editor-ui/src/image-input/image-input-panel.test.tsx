import {
  deriveFromImage,
  paletteFromImageTool,
  type PaletteFromImageParams,
  type PixelBuffer,
} from "@musterli/tool-registry";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
// Test-only cross-package import: tool texts live in the web app.
import webDe from "../../../../apps/web/messages/de.json";
import { EditorShell } from "../shell/editor-shell";
import { createEditorStore } from "../store/editor-store";
import { EditorStoreProvider } from "../store/react";
import { fakeServices } from "../test/fake-services";
import { fixtureMessages, renderWithIntl } from "../test/render";
import type { ImageDecodeResult, ImageInputServices } from "./services";

const tool = paletteFromImageTool;
const messages = { ...fixtureMessages, tools: webDe.tools };

function solid(rgb: readonly [number, number, number]): PixelBuffer {
  const data = new Uint8ClampedArray(2 * 2 * 4);
  for (let i = 0; i < data.length; i += 4) data.set([...rgb, 255], i);
  return { width: 2, height: 2, data };
}

function setup(decoded: ImageDecodeResult[]) {
  const store = createEditorStore({ toolId: tool.id });
  const services: ImageInputServices = {
    decode: vi.fn(
      async (): Promise<ImageDecodeResult> =>
        decoded.shift() ?? { ok: false, error: "decode-failed" },
    ),
    crop: vi.fn(async () => ({ ok: false as const, error: "decode-failed" as const })),
    derive: vi.fn(async (t, pixels, params, seed) => {
      const patch = deriveFromImage(t, pixels, params, seed);
      return patch
        ? { ok: true as const, patch }
        : { ok: false as const, error: "no-result" as const };
    }),
    dispose: vi.fn(),
  };
  renderWithIntl(
    <EditorStoreProvider store={store}>
      <EditorShell exportServices={fakeServices()} imageInputServices={services} />
    </EditorStoreProvider>,
    messages,
  );
  const colors = () => (store.getState().params as PaletteFromImageParams).colors;
  return { store, services, colors };
}

const file = (name: string) => new File([new Uint8Array([1, 2, 3])], name, { type: "image/png" });

describe("ImageInputPanel in the editor", () => {
  it("offers a labelled, described file input that starts on the sample", () => {
    setup([]);
    const region = screen.getByRole("region", { name: "Bild" });
    const input = screen.getByLabelText<HTMLInputElement>("Bild wählen");
    expect(input.type).toBe("file");
    expect(input.accept).toContain("image/png");
    expect(region.contains(input)).toBe(true);
    const hint = document.getElementById(input.getAttribute("aria-describedby") ?? "");
    expect(hint?.textContent).toContain("bleibt auf deinem Gerät");
    expect(screen.getByRole("group", { name: "Bild" })).toBeTruthy();
    expect(screen.getByTestId("image-input-source").textContent).toBe("Beispielbild");
    expect(screen.getByRole("img", { name: /Beispielbild/ })).toBeTruthy();
  });

  it("loads a picked file, announces it and updates the colours", async () => {
    const { colors } = setup([{ ok: true, pixels: solid([230, 57, 70]) }]);
    const input = screen.getByLabelText<HTMLInputElement>("Bild wählen");
    await act(async () => {
      fireEvent.change(input, { target: { files: [file("rot.png")] } });
    });
    await waitFor(() => expect(colors()).toEqual([{ color: "#e63946", share: 1 }]));
    await waitFor(() =>
      expect(screen.getByTestId("image-input-status").textContent).toBe(
        "rot.png ist ausgewertet. Die Vorschau zeigt das Ergebnis.",
      ),
    );
    expect(screen.getByTestId("image-input-source").textContent).toBe("rot.png");
    fireEvent.click(screen.getByRole("button", { name: "Beispielbild verwenden" }));
    await waitFor(() => expect(colors()).toEqual(tool.defaults.colors));
    // The button is gone; focus stays in the panel instead of falling to the page.
    expect(document.activeElement).toBe(screen.getByLabelText("Bild wählen"));
  });

  it("accepts a dropped file and highlights the drop zone while dragging", async () => {
    const { colors } = setup([{ ok: true, pixels: solid([29, 53, 87]) }]);
    const zone = screen.getByTestId("image-input-dropzone");
    const dataTransfer = { types: ["Files"], files: [file("blau.png")], dropEffect: "none" };
    fireEvent.dragOver(zone, { dataTransfer });
    expect(zone.dataset.dragging).toBe("true");
    expect(screen.getByTestId("image-input-source").textContent).toBe(
      "Loslassen, um das Bild zu laden",
    );
    await act(async () => {
      fireEvent.drop(zone, { dataTransfer });
    });
    await waitFor(() => expect(colors()).toEqual([{ color: "#1d3557", share: 1 }]));
    expect(zone.dataset.dragging).toBeUndefined();
  });

  it("shows errors as an alert that can be dismissed", async () => {
    setup([{ ok: false, error: "too-large" }]);
    await act(async () => {
      fireEvent.change(screen.getByLabelText("Bild wählen"), {
        target: { files: [file("x.png")] },
      });
    });
    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("grösser als 5 MB");
    fireEvent.click(screen.getByRole("button", { name: "Meldung schliessen" }));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(document.activeElement).toBe(screen.getByLabelText("Bild wählen"));
  });

  it("is not shown for tools without image input", () => {
    const store = createEditorStore({ toolId: "palette-generator" });
    renderWithIntl(
      <EditorStoreProvider store={store}>
        <EditorShell exportServices={fakeServices()} />
      </EditorStoreProvider>,
      { ...fixtureMessages, tools: webDe.tools },
    );
    expect(screen.queryByTestId("image-input")).toBeNull();
  });
});
