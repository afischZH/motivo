/**
 * Brand kit import worker: parses a brand kit file and sanitises every SVG
 * in it off the main thread (a file with many large SVGs keeps the
 * sanitizer busy far longer than 50 ms). Started by `createBrandKitWorker`.
 */
import { serveFileWorker } from "../transfer/read-file";
import {
  BRAND_KIT_FILE_MAX_BYTES,
  parseBrandKitFile,
  type BrandKitFileParseResult,
} from "./transfer";

serveFileWorker<BrandKitFileParseResult>(self, {
  maxBytes: BRAND_KIT_FILE_MAX_BYTES,
  tooLarge: { ok: false, error: "too-large" },
  unreadable: { ok: false, error: "malformed" },
  parse: parseBrandKitFile,
});
