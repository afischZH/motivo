/**
 * Example inputs for the "Insert example" button. The sample SVG is our own
 * simple drawing (a sun over two hills), not taken from any other product.
 */
import { formatDataUri, svgToBase64, svgToCss } from "./converters";
import type { ConverterId } from "./ids";

export const SAMPLE_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 80" width="120" height="80">
  <rect width="120" height="80" fill="#e8ecff"/>
  <circle cx="84" cy="28" r="14" fill="#f5a524"/>
  <path d="M0 64 Q30 40 60 60 T120 56 V80 H0 Z" fill="#5b5bd6"/>
</svg>`;

function dataUriOf(result: ReturnType<typeof svgToCss>): string {
  return result.ok ? result.value.dataUri : "";
}

/** The example for a text converter, or `null` for file-based ones. */
export function sampleInput(id: ConverterId): string | null {
  switch (id) {
    case "svg-to-css":
    case "svg-to-base64":
      return SAMPLE_SVG;
    case "css-to-svg":
      return `.hero {\n  ${formatDataUri(dataUriOf(svgToCss(SAMPLE_SVG)), "css")}\n  background-size: cover;\n}`;
    case "base64-to-svg":
    case "base64-to-image":
      return dataUriOf(svgToBase64(SAMPLE_SVG));
    case "image-to-base64":
    case "image-converter":
      return null;
  }
}
