/**
 * Import worker of social designs files: JSON parsing, the scene schema,
 * tool schemas and the SVG sanitizer run off the main thread.
 */
import { serveFileWorker } from "@musterli/editor-ui/transfer";
import { registry } from "@musterli/tool-registry";

import { parseSocialFile } from "./transfer";
import { SOCIAL_FILE_MAX_BYTES, type SocialFileParseResult } from "./transfer-format";

serveFileWorker<SocialFileParseResult>(self, {
  maxBytes: SOCIAL_FILE_MAX_BYTES,
  tooLarge: { ok: false, error: "too-large" },
  unreadable: { ok: false, error: "malformed" },
  parse: (text) => parseSocialFile(text, registry),
});
