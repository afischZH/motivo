/**
 * Saves a Blob as a file via a temporary `<a download>`. Browser only.
 */
export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.append(a);
  a.click();
  a.remove();
  // Some browsers start the download asynchronously; keep the URL alive briefly.
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
