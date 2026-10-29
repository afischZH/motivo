"use client";

import { useLayoutEffect, useSyncExternalStore } from "react";

import { DARK_MEDIA_QUERY, THEME_STORAGE_KEY, resolveTheme, type Theme } from "@/lib/theme";

function readStored(): string | null {
  try {
    return window.localStorage.getItem(THEME_STORAGE_KEY);
  } catch {
    return null;
  }
}

function applyTheme(theme: Theme): void {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

function subscribe(onChange: () => void): () => void {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

function getSnapshot(): Theme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light";
}

/** Unknown on the server; the inline script sets the real theme before paint. */
function getServerSnapshot(): Theme | null {
  return null;
}

/** Switches light and dark and persists the explicit choice (also used by the command palette). */
export function toggleTheme(): void {
  const next: Theme = getSnapshot() === "dark" ? "light" : "dark";
  applyTheme(next);
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // Storage can be blocked (private mode); the switch still works for this page.
  }
}

/**
 * Current theme plus a toggle that persists the explicit choice. Without a
 * stored choice the theme follows system changes and other tabs live.
 */
export function useTheme(): { theme: Theme | null; toggleTheme: () => void } {
  const theme = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  // Layout effect: re-applies the theme before paint if React re-created the
  // <html> element, and keeps following system and other-tab changes.
  useLayoutEffect(() => {
    const media = window.matchMedia(DARK_MEDIA_QUERY);
    const sync = () => applyTheme(resolveTheme(readStored(), media.matches));
    sync();
    const onStorage = (event: StorageEvent) => {
      if (event.key === THEME_STORAGE_KEY) sync();
    };
    media.addEventListener("change", sync);
    window.addEventListener("storage", onStorage);
    return () => {
      media.removeEventListener("change", sync);
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  return { theme, toggleTheme };
}
