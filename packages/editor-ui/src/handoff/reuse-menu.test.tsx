import { StorageError, createBrandKitStore, type BrandPalette } from "@musterli/storage";
import { imageTargetsOf, registry } from "@musterli/tool-registry";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { IDBFactory } from "fake-indexeddb";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { BrandPaletteSection } from "../brand-kit/brand-palette-section";
import { BrandKitContext, useBrandKitView, type BrandKitView } from "../brand-kit/context";
import de from "../messages/de.json";
import { createEditorStore } from "../store/editor-store";
import { EditorStoreProvider } from "../store/react";
import { fakeServices } from "../test/fake-services";
import { renderWithIntl } from "../test/render";
import { ReuseMenu } from "./reuse-menu";
import { handoffStore, handoffTokenFromHash } from "./store";

const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

/** Names of every registered tool and its picture slots. */
const messages = {
  ...de,
  tools: Object.fromEntries(
    registry.list().map((tool) => [
      tool.id,
      {
        name: `Tool ${tool.id}`,
        params: Object.fromEntries(
          imageTargetsOf(tool).flatMap((slot) =>
            slot.kind === "param" ? [[slot.param, { label: `Feld ${slot.param}` }]] : [],
          ),
        ),
      },
    ]),
  ),
};

function fakeKit(save?: BrandKitView["savePalette"]): BrandKitView {
  return {
    palettes: [],
    defaultId: null,
    listAssets: async () => [],
    savePalette: vi.fn<BrandKitView["savePalette"]>(
      save ??
        (async (name, colors): Promise<BrandPalette> => ({
          id: "p1",
          name,
          colors: [...colors],
          createdAt: 1,
          updatedAt: 1,
        })),
    ),
    href: "/de/brand-kit",
  };
}

function setup(toolId: string, options: { kit?: BrandKitView | null; openTool?: boolean } = {}) {
  const store = createEditorStore({ toolId });
  const services = fakeServices({
    exportRaster: async (tool, _params, _ctx, opts) => ({
      blob: new Blob([PNG], { type: "image/png" }),
      width: opts.size?.width ?? 1,
      height: opts.size?.height ?? 1,
      clamped: false,
      filename: `musterli-${tool.id}.png`,
    }),
  });
  const onOpenTool = vi.fn<(toolId: string, hash: string) => void>();
  const onError = vi.fn<(message: string) => void>();
  const onStatus = vi.fn<(message: string) => void>();
  renderWithIntl(
    <EditorStoreProvider store={store}>
      <BrandKitContext.Provider value={options.kit ?? null}>
        <ReuseMenu
          exportServices={services}
          onOpenTool={options.openTool === false ? undefined : onOpenTool}
          onStatus={onStatus}
          onError={onError}
          enabled
        />
      </BrandKitContext.Provider>
    </EditorStoreProvider>,
    messages,
  );
  return { store, services, onOpenTool, onError, onStatus };
}

afterEach(() => handoffStore.clear());

describe("ReuseMenu", () => {
  it("lists every tool that takes a picture, except the source, by keyboard", async () => {
    const user = userEvent.setup();
    setup("halftone");
    const trigger = screen.getByRole("button", { name: /Weiterverwenden/ });
    trigger.focus();
    await user.keyboard("{Enter}");
    const menu = await screen.findByRole("menu");
    const items = within(menu).getAllByRole("menuitem");
    const tools = items.map((i) => i.getAttribute("data-tool"));
    expect(tools).not.toContain("halftone");
    expect(tools).toEqual(
      expect.arrayContaining(["screenshot-beautifier", "duotone", "dither", "palette-from-image"]),
    );
    // Accessible names say tool and field.
    expect(
      within(menu).getByRole("menuitem", { name: "Tool screenshot-beautifier, Feld screenshot" }),
    ).toBeTruthy();
    // No palette without a colour tool.
    expect(screen.queryByTestId("reuse-brand-palette")).toBeNull();
  });

  it("renders the design for the target, keeps it in memory and opens the target", async () => {
    const user = userEvent.setup();
    const { services, onOpenTool, store } = setup("mesh-gradient");
    store.getState().setSize({ width: 6000, height: 3000 });
    await user.click(screen.getByRole("button", { name: /Weiterverwenden/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Tool halftone, Feld photo" }));
    await waitFor(() => expect(onOpenTool).toHaveBeenCalledTimes(1));
    const [toolId, hash] = onOpenTool.mock.calls[0] ?? [];
    expect(toolId).toBe("halftone");
    // The photo field keeps 4096 px: the design is fitted, not enlarged.
    expect(services.exportRaster.mock.calls[0]?.[3]).toMatchObject({
      format: "png",
      size: { width: 4096, height: 2048 },
    });
    const token = handoffTokenFromHash(hash ?? "");
    expect(token).not.toBeNull();
    const entry = handoffStore.take(token ?? "", "halftone");
    expect(entry).toMatchObject({ sourceToolId: "mesh-gradient", param: "photo" });
    expect(entry?.name).toMatch(/^musterli-mesh-gradient-\d+\.png$/);
  });

  it("shows nothing without navigation and without a palette", () => {
    setup("mesh-gradient", { openTool: false });
    expect(screen.queryByTestId("reuse-menu")).toBeNull();
  });

  it("reports a failed render instead of navigating", async () => {
    const user = userEvent.setup();
    const { services, onOpenTool, onError } = setup("mesh-gradient");
    services.exportRaster.mockRejectedValueOnce(new Error("boom"));
    await user.click(screen.getByRole("button", { name: /Weiterverwenden/ }));
    await user.click(await screen.findByRole("menuitem", { name: "Tool duotone, Feld photo" }));
    await waitFor(() => expect(onError).toHaveBeenCalledWith(de.Editor.handoff.errors.failed));
    expect(onOpenTool).not.toHaveBeenCalled();
    expect(handoffStore.size()).toBe(0);
  });
});

describe("save as brand palette", () => {
  it("saves the shown colours under a name and links to the Brand Kit", async () => {
    const user = userEvent.setup();
    const kit = fakeKit();
    const { store } = setup("palette-generator", { kit });
    store.getState().setParam("count", 3);
    await user.click(screen.getByRole("button", { name: /Weiterverwenden/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Als Brand-Palette speichern/ }));
    const dialog = await screen.findByTestId("save-palette-dialog");
    const name = within(dialog).getByLabelText("Name");
    expect((name as HTMLInputElement).value).toBe("Palette aus Tool palette-generator");
    await user.clear(name);
    await user.type(name, "Acme{Enter}");
    const p = store.getState().params;
    await waitFor(() =>
      expect(kit.savePalette).toHaveBeenCalledWith("Acme", [p.color1, p.color2, p.color3]),
    );
    expect(
      await within(dialog).findByText(/Palette „Acme“ ist im Brand Kit gespeichert/),
    ).toBeTruthy();
    expect(
      within(dialog).getByRole("link", { name: "Brand Kit öffnen" }).getAttribute("href"),
    ).toBe("/de/brand-kit");
  });

  it("explains a full Brand Kit", async () => {
    const user = userEvent.setup();
    const kit = fakeKit(async () => {
      throw new StorageError("limit", "Too many palettes");
    });
    setup("tailwind-palette", { kit, openTool: false });
    await user.click(screen.getByRole("button", { name: /Weiterverwenden/ }));
    // Without navigation only the palette is offered.
    expect(screen.queryAllByTestId("reuse-target")).toHaveLength(0);
    await user.click(await screen.findByRole("menuitem", { name: /Als Brand-Palette speichern/ }));
    const dialog = await screen.findByTestId("save-palette-dialog");
    await user.click(within(dialog).getByRole("button", { name: "Speichern" }));
    expect((await within(dialog).findByRole("alert")).textContent).toBe(
      de.Editor.handoff.palette.errors.limit,
    );
    // Ten colours at most (the Tailwind scale has eleven).
    const colors = vi.mocked(kit.savePalette).mock.calls[0]?.[1] ?? [];
    expect(colors).toHaveLength(10);
  });
});

function LiveKit(props: { store: ReturnType<typeof createBrandKitStore>; children: ReactNode }) {
  const view = useBrandKitView(props.store, "/de/brand-kit");
  return <BrandKitContext.Provider value={view}>{props.children}</BrandKitContext.Provider>;
}

it("a saved palette lands in the local brand kit and in the brand palette section", async () => {
  const user = userEvent.setup();
  const kit = createBrandKitStore({ indexedDB: new IDBFactory() });
  try {
    const store = createEditorStore({ toolId: "palette-generator" });
    renderWithIntl(
      <EditorStoreProvider store={store}>
        <LiveKit store={kit}>
          <BrandPaletteSection />
          <ReuseMenu
            exportServices={fakeServices()}
            onStatus={() => undefined}
            onError={() => undefined}
            enabled
          />
        </LiveKit>
      </EditorStoreProvider>,
      messages,
    );
    expect(await screen.findByTestId("brand-palette-empty")).toBeTruthy();
    await user.click(screen.getByRole("button", { name: /Weiterverwenden/ }));
    await user.click(await screen.findByRole("menuitem", { name: /Als Brand-Palette speichern/ }));
    const dialog = await screen.findByTestId("save-palette-dialog");
    const name = within(dialog).getByLabelText("Name");
    await user.clear(name);
    await user.type(name, "Lagune{Enter}");
    await within(dialog).findByTestId("save-palette-kit-link");
    const saved = await kit.loadPalettes();
    expect(saved.palettes.map((p) => p.name)).toEqual(["Lagune"]);
    const p = store.getState().params;
    const shown = ["color1", "color2", "color3", "color4", "color5", "color6", "color7", "color8"]
      .slice(0, p.count as number)
      .map((key) => p[key]);
    expect(saved.palettes[0]?.colors).toEqual(shown);
    // The section of the open tool lists it without a reload.
    const select = await screen.findByTestId("brand-palette-select");
    expect(select.textContent).toContain("Lagune");
  } finally {
    kit.close();
  }
});
