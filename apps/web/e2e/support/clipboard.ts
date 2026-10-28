import type { BrowserContext } from "@playwright/test";

/**
 * Clipboard permissions exist only in Chromium. Firefox and WebKit get an
 * in-memory stand-in for navigator.clipboard text so the flows stay testable.
 */
export async function enableClipboard(context: BrowserContext, browserName: string) {
  if (browserName === "chromium") {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    return;
  }
  await context.addInitScript(() => {
    let text = "";
    const clipboard = navigator.clipboard ?? ({} as Clipboard);
    Object.defineProperty(clipboard, "writeText", {
      configurable: true,
      value: async (value: string) => {
        text = value;
      },
    });
    Object.defineProperty(clipboard, "readText", {
      configurable: true,
      value: async () => text,
    });
    if (!navigator.clipboard) {
      Object.defineProperty(navigator, "clipboard", { configurable: true, value: clipboard });
    }
  });
}
