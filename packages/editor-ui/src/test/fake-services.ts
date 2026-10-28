/** Test-only stand-ins for the browser side effects of export, copy and share. */
import { vi, type Mock } from "vitest";
import type { ExportServices } from "../export/export-dialog";

export type FakeServices = { [K in keyof ExportServices]: Mock<ExportServices[K]> };

/** Every service succeeds; pass overrides for the paths under test. */
export function fakeServices(overrides: Partial<ExportServices> = {}): FakeServices {
  return {
    exportRaster: vi.fn<ExportServices["exportRaster"]>(
      overrides.exportRaster ??
        (async (tool, _params, ctx, options) => ({
          blob: new Blob(["x"], { type: "image/png" }),
          width: options.size?.width ?? ctx.width,
          height: options.size?.height ?? ctx.height,
          clamped: false,
          filename: `musterli-${tool.id}.${options.format}`,
        })),
    ),
    exportRasterTile: vi.fn<ExportServices["exportRasterTile"]>(
      overrides.exportRasterTile ??
        (async (tool, _params, ctx, options) => ({
          blob: new Blob(["x"], { type: "image/png" }),
          width: ctx.width * (options.size?.scale ?? 1),
          height: ctx.height * (options.size?.scale ?? 1),
          clamped: false,
          filename: `musterli-${tool.id}-tile.${options.format}`,
        })),
    ),
    downloadBlob: vi.fn<ExportServices["downloadBlob"]>(
      overrides.downloadBlob ?? (() => undefined),
    ),
    copyText: vi.fn<ExportServices["copyText"]>(overrides.copyText ?? (async () => ({ ok: true }))),
    copyPng: vi.fn<ExportServices["copyPng"]>(
      overrides.copyPng ??
        (async (png) => {
          await png;
          return { ok: true };
        }),
    ),
    canCopyText: vi.fn<ExportServices["canCopyText"]>(overrides.canCopyText ?? (() => true)),
    canCopyImage: vi.fn<ExportServices["canCopyImage"]>(overrides.canCopyImage ?? (() => true)),
  };
}
