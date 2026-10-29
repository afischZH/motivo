/**
 * The social designs file (`motivo-social` version 1), kept apart from the
 * designs file (`motivo-designs`) and the brand kit file (`motivo-brandkit`)
 * so each can change on its own. Only the format and the export here, so
 * the page can export without loading the tool registry; the import checks
 * live in transfer.ts (run in the import worker).
 *
 *   { format: "motivo-social", version: 1, exportedAt, designs: [
 *       { id, name, createdAt, updatedAt, scene } ] }
 *
 * Without thumbnails (they are rendered again). Uploads travel inside the
 * scene; the file never leaves the device unless the user moves it.
 */
import type { Scene } from "@musterli/scene";
import type { ImportedSocialDesign } from "@musterli/storage";
import { packIntoFiles, partFileName, stringifyEach } from "@musterli/editor-ui/transfer";

export const SOCIAL_FILE_FORMAT = "motivo-social";
export const SOCIAL_FILE_VERSION = 1;
/** Largest accepted file: 24 pictures of up to 12 MB data each do not fit, one scene of 30 MB does. */
export const SOCIAL_FILE_MAX_BYTES = 32 * 1024 * 1024;
/** Most designs one file may hold. */
export const SOCIAL_FILE_MAX_DESIGNS = 500;

export type SocialFileError =
  | "too-large"
  | "empty"
  | "malformed"
  | "forbidden-keys"
  | "wrong-format"
  | "unsupported-version"
  | "too-many"
  /** A tool designs file: it belongs to the tool designs import. */
  | "designs-file"
  /** A brand kit file: it belongs on the Brand Kit page. */
  | "brand-kit-file";

export type SocialSkipReason =
  "invalid" | "invalid-scene" | "unknown-tool" | "invalid-params" | "unsafe-upload";

export interface SkippedSocialDesign {
  index: number;
  name?: string;
  reason: SocialSkipReason;
}

export type SocialFileParseResult =
  | { ok: true; designs: ImportedSocialDesign[]; skipped: SkippedSocialDesign[] }
  | { ok: false; error: SocialFileError };

export interface SocialFileEntry {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  scene: Scene;
}

/** The export as file texts of at most `maxBytes` each (large uploads split the export). */
export async function socialFileTexts(
  designs: readonly SocialFileEntry[],
  exportedAt: number,
  maxBytes: number = SOCIAL_FILE_MAX_BYTES,
): Promise<string[]> {
  const envelope = { format: SOCIAL_FILE_FORMAT, version: SOCIAL_FILE_VERSION, exportedAt };
  const head = `${JSON.stringify(envelope).slice(0, -1)},"designs":[`;
  const entries = designs.map((d) => ({
    id: d.id,
    name: d.name,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    scene: d.scene,
  }));
  return packIntoFiles(await stringifyEach(entries), (_, body) => `${head}${body}]}`, maxBytes);
}

/** `musterli-social-v1-2026-10-29.json` (local date), numbered when split. */
export function socialFileName(date: Date, part = 0, parts = 1): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const day = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  return partFileName(`musterli-social-v${SOCIAL_FILE_VERSION}-${day}`, part, parts);
}
