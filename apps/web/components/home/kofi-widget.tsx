"use client";

import { useEffect } from "react";

import { KOFI_WIDGET_SCRIPT } from "@/lib/telemetry/config";

/** The global that Ko-fi's overlay script defines. */
interface KofiWidgetOverlay {
  draw(pageId: string, config: Record<string, string>): void;
}

declare global {
  interface Window {
    kofiWidgetOverlay?: KofiWidgetOverlay;
  }
}

/** Wrapper divs that `draw()` appends to `<body>`. */
const WRAPPER_SELECTOR = '[id^="kofi-widget-overlay-"]';

/** Ko-fi's brand orange with white text (Andreas's snippet). */
const BUTTON_COLORS = {
  "floating-chat.donateButton.background-color": "#f45d22",
  "floating-chat.donateButton.text-color": "#fff",
};

let scriptLoad: Promise<KofiWidgetOverlay> | null = null;
let drawn = false;

function loadScript(): Promise<KofiWidgetOverlay> {
  scriptLoad ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = KOFI_WIDGET_SCRIPT;
    script.async = true;
    script.onload = () =>
      window.kofiWidgetOverlay
        ? resolve(window.kofiWidgetOverlay)
        : reject(new Error("Ko-fi widget missing"));
    script.onerror = () => {
      scriptLoad = null;
      reject(new Error("Ko-fi widget failed to load"));
    };
    document.body.append(script);
  });
  return scriptLoad;
}

function setWrappersHidden(hidden: boolean) {
  for (const wrapper of document.querySelectorAll<HTMLElement>(WRAPPER_SELECTOR)) {
    wrapper.hidden = hidden;
  }
}

/** Runs `task` when the browser is idle (or soon after, where unsupported). */
function whenIdle(task: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const id = window.requestIdleCallback(task, { timeout: 4000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(task, 1500);
  return () => window.clearTimeout(id);
}

/**
 * Ko-fi's floating donate button on the home page (decision log 2026-10-28).
 * Rendered only when the build's donation URL is a Ko-fi page, which also
 * opens the CSP for Ko-fi (`security-headers.ts`). The script loads once the
 * page is idle. Google Fonts stay off (empty stylesheet list), so no request
 * goes to Google.
 *
 * `draw()` is not safe to call twice, so the widget is drawn once per page
 * load and only hidden while the visitor is on other pages.
 */
export function KofiWidget({ pageId, label }: Readonly<{ pageId: string; label: string }>) {
  useEffect(() => {
    let active = true;
    setWrappersHidden(false);
    const cancel = whenIdle(() => {
      loadScript()
        .then((overlay) => {
          if (!active || drawn) return;
          drawn = true;
          overlay.draw(pageId, {
            type: "floating-chat",
            "floating-chat.donateButton.text": label,
            "floating-chat.stylesheets": "[]",
            ...BUTTON_COLORS,
          });
        })
        .catch(() => {
          // Blocked or offline: the support page still links to Ko-fi.
        });
    });
    return () => {
      active = false;
      cancel();
      setWrappersHidden(true);
    };
  }, [pageId, label]);

  return null;
}
