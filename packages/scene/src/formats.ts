/**
 * Formats of the social media editor: the social media group of the size
 * catalogue (`SIZE_PRESETS` in `@musterli/tool-registry`, same ids and
 * sizes, checked by formats.test.ts), with one exception. The YouTube
 * thumbnail works at 1280 x 720 (YouTube's minimum for a thumbnail) instead
 * of the catalogue's 3840 x 2160: same aspect ratio, a canvas the editor
 * keeps fluid, and the 2x export gives 2560 x 1440.
 */
import type { SceneFormat } from "./schema";

export interface SocialFormat {
  /** Id in the size catalogue (labels: `sizes.<id>`). */
  id: string;
  width: number;
  height: number;
}

export const SOCIAL_FORMATS: readonly SocialFormat[] = [
  { id: "square", width: 1080, height: 1080 },
  { id: "portrait", width: 1080, height: 1350 },
  { id: "instagram-3-4", width: 1080, height: 1440 },
  { id: "story", width: 1080, height: 1920 },
  { id: "landscape", width: 1200, height: 630 },
  { id: "linkedin-post", width: 1200, height: 627 },
  { id: "x-post", width: 1600, height: 900 },
  { id: "youtube-thumbnail", width: 1280, height: 720 },
  { id: "pinterest-pin", width: 1000, height: 1500 },
  { id: "facebook-cover", width: 1702, height: 630 },
  { id: "banner", width: 1500, height: 500 },
  { id: "linkedin-banner", width: 1584, height: 396 },
  { id: "youtube-banner", width: 2560, height: 1440 },
];

/** Formats whose size differs from the catalogue on purpose (see above). */
export const SOCIAL_FORMAT_OVERRIDES: ReadonlySet<string> = new Set(["youtube-thumbnail"]);

/** The six formats every template must survive (M6 definition of done). */
export const MAGIC_RESIZE_TEST_FORMATS = [
  "square",
  "portrait",
  "story",
  "linkedin-post",
  "youtube-thumbnail",
  "pinterest-pin",
] as const;

export const DEFAULT_FORMAT_ID = "square";

export function socialFormat(id: string): SocialFormat | undefined {
  return SOCIAL_FORMATS.find((f) => f.id === id);
}

/** A format as stored in a scene. */
export function sceneFormat(id: string): SceneFormat {
  const format = socialFormat(id) ?? socialFormat(DEFAULT_FORMAT_ID);
  if (!format) throw new Error("No default format");
  return { id: format.id, width: format.width, height: format.height };
}
