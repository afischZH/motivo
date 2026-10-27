/**
 * Converter catalogue. Plain data only, safe to import from server components
 * (routes, metadata, sitemap) without pulling in the conversion code.
 */
export const CONVERTER_IDS = [
  "svg-to-css",
  "css-to-svg",
  "svg-to-base64",
  "base64-to-svg",
  "image-to-base64",
  "base64-to-image",
] as const;

export type ConverterId = (typeof CONVERTER_IDS)[number];

export function isConverterId(value: string): value is ConverterId {
  return (CONVERTER_IDS as readonly string[]).includes(value);
}

/** Each converter's counterpart, linked as "related" on the page. */
export const INVERSE_CONVERTER: Record<ConverterId, ConverterId> = {
  "svg-to-css": "css-to-svg",
  "css-to-svg": "svg-to-css",
  "svg-to-base64": "base64-to-svg",
  "base64-to-svg": "svg-to-base64",
  "image-to-base64": "base64-to-image",
  "base64-to-image": "image-to-base64",
};

/** Number of FAQ entries per converter page (keys faq.q1/a1 ... in messages). */
export const FAQ_COUNT = 3;
