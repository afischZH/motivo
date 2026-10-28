/**
 * Import worker: reads and validates a designs file off the main thread
 * (JSON parsing, every tool schema and the SVG sanitizer can take far more
 * than 50 ms for a large file). Started by `createTransferWorker`.
 */
import { registry } from "@musterli/tool-registry";
import { serveFileWorker } from "../transfer/read-file";
import { DESIGNS_FILE_MAX_BYTES, parseDesignsFile, type DesignsFileParseResult } from "./transfer";

serveFileWorker<DesignsFileParseResult>(self, {
  maxBytes: DESIGNS_FILE_MAX_BYTES,
  tooLarge: { ok: false, error: "too-large" },
  unreadable: { ok: false, error: "malformed" },
  parse: (text) => parseDesignsFile(text, registry),
});
