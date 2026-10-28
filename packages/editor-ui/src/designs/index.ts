/**
 * Saved designs outside the editor ("Meine Designs" page): file transfer,
 * thumbnails and the storage layer, without pulling in the editor shell.
 */
export * from "@motivo/storage";
export {
  DESIGNS_FILE_FORMAT,
  DESIGNS_FILE_MAX_BYTES,
  DESIGNS_FILE_MAX_DESIGNS,
  DESIGNS_FILE_VERSION,
  buildDesignsFile,
  designsFileName,
  type DesignsFile,
  type DesignsFileEntry,
  type DesignsFileError,
  type DesignsFileParseResult,
  type SkipReason,
  type SkippedDesign,
} from "./transfer-format";
export { readDesignsFile, type ReadDesignsFileResult } from "./import-client";
export { DESIGN_HASH_PARAM, designHash, designIdFromHash } from "./hash";
