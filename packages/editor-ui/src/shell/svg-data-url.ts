/** `data:` URL for an SVG string, safe to use as `<img src>`. */
export function svgDataUrl(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}
