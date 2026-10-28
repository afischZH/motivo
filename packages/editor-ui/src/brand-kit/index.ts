/**
 * The brand kit outside the editor (Brand Kit page): storage and file
 * transfer, without pulling in the editor shell or the tools. Preparing
 * uploads (`./upload`) and the import validation load lazily.
 */
export {
  StorageError,
  createBrandKitStore,
  normalizeBrandHex,
  BRAND_LOGOS_MAX,
  BRAND_NAME_MAX,
  BRAND_PALETTE_MAX,
  BRAND_PALETTE_MIN,
  BRAND_PALETTES_MAX,
  BRAND_SHAPES_MAX,
  type BrandAsset,
  type BrandAssetKind,
  type BrandImage,
  type BrandImportOutcome,
  type BrandKitStore,
  type BrandPalette,
  type StorageErrorCode,
} from "@musterli/storage";
export {
  BRAND_KIT_FILE_FORMAT,
  BRAND_KIT_FILE_MAX_BYTES,
  BRAND_KIT_FILE_VERSION,
  brandKitFileName,
  brandKitFileTexts,
  buildBrandKitFile,
  type BrandKitFile,
  type BrandKitFileError,
  type BrandKitFileParseResult,
  type BrandSkipReason,
  type SkippedBrandEntry,
} from "./transfer-format";
export { readBrandKitFile, type ReadBrandKitFileResult } from "./import-client";
export type { BrandImageError, BrandImageResult } from "./prepare";
export { svgDataUrl } from "../shell/svg-data-url";
