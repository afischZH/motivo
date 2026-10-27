/**
 * Theme handling shared by the no-flash inline script and the client toggle.
 * The `dark` class on <html> is the single source of truth for styling.
 */

export const THEME_STORAGE_KEY = "motivo-theme";

export type Theme = "light" | "dark";

export const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

/** An explicit stored choice wins; otherwise follow the system preference. */
export function resolveTheme(stored: string | null, systemPrefersDark: boolean): Theme {
  if (stored === "light" || stored === "dark") return stored;
  return systemPrefersDark ? "dark" : "light";
}

export type ShortcutEvent = Pick<
  KeyboardEvent,
  "key" | "code" | "metaKey" | "ctrlKey" | "shiftKey" | "altKey"
>;

/** ⌘⇧K on macOS, Ctrl+Shift+K elsewhere (docs/DESIGN.md section 4). */
export function isThemeShortcut(event: ShortcutEvent): boolean {
  return (
    (event.metaKey || event.ctrlKey) &&
    event.shiftKey &&
    !event.altKey &&
    (event.code === "KeyK" || event.key.toLowerCase() === "k")
  );
}

/**
 * Runs in <head> before first paint, so the page never flashes the wrong
 * theme. Keep it tiny and dependency free; it mirrors `resolveTheme`.
 */
export const themeInitScript = `(function(){var s=null;try{s=localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)})}catch(e){}var d=s==="dark"||(s!=="light"&&window.matchMedia(${JSON.stringify(
  DARK_MEDIA_QUERY,
)}).matches);document.documentElement.classList.toggle("dark",d)})();`;
