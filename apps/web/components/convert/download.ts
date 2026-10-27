/**
 * Saves data as a file. The Blob is always `application/octet-stream`, so the
 * browser downloads it instead of rendering it: an SVG opened from a blob URL
 * would run with this site's origin. The URL exists only for the click and is
 * revoked right after, so it never sits in the DOM where it could be opened.
 */
export function downloadFile(data: BlobPart, filename: string) {
  const url = URL.createObjectURL(new Blob([data], { type: "application/octet-stream" }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.rel = "noopener";
  link.style.display = "none";
  document.body.append(link);
  link.click();
  link.remove();
  // Revoking synchronously can cancel the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
