/**
 * Building blocks of the import files (designs, brand kit), for other
 * local file formats of the app (social editor designs): hostile JSON,
 * sizes, splitting into files, the import worker protocol and the checks of
 * uploaded pictures. No behaviour of its own.
 */
export {
  FORBIDDEN_KEYS,
  ForbiddenKeyError,
  fileFormatOf,
  packIntoFiles,
  parseUntrustedJson,
  partFileName,
  stringifyEach,
  utf8Length,
} from "./json";
export {
  readFileInWorker,
  serveFileWorker,
  type FileImporter,
  type FileWorkerRequest,
  type FileWorkerResponse,
  type ReadFileFailure,
  type ReadFileOptions,
} from "./read-file";
export { isSafeRasterHref, resanitizeUploads } from "../designs/transfer";
export { DESIGNS_FILE_FORMAT } from "../designs/transfer-format";
export { BRAND_KIT_FILE_FORMAT } from "../brand-kit/transfer-format";
