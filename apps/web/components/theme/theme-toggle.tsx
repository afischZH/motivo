"use client";

import { useEffect } from "react";

import { Button } from "@/components/ui/button";
import { isThemeShortcut } from "@/lib/theme";

import { useTheme } from "./use-theme";

/**
 * Two-state toggle button: the label stays constant ("Dark theme") and
 * `aria-pressed` carries the state, as recommended for toggle buttons.
 * Texts come translated from the server component around it, so pages
 * without other translated client components ship no message formatter.
 */
export function ThemeToggle({ label, hint }: { label: string; hint: string }) {
  const { theme, toggleTheme } = useTheme();

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || !isThemeShortcut(event)) return;
      event.preventDefault();
      toggleTheme();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [toggleTheme]);

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      onClick={toggleTheme}
      aria-label={label}
      aria-pressed={theme === "dark"}
      aria-keyshortcuts="Meta+Shift+K Control+Shift+K"
      title={hint}
      data-testid="theme-toggle"
      // The theme is only known in the browser: set once hydrated, after the
      // shortcut listener above is bound (tests wait for it before pressing keys).
      data-hydrated={theme === null ? undefined : "true"}
    >
      {/* Icons switch by CSS so they are correct before hydration. */}
      <MoonIcon className="dark:hidden" />
      <SunIcon className="hidden dark:block" />
    </Button>
  );
}

function MoonIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 8.268c.344-.215.825-.004.803.401" />
    </svg>
  );
}

function SunIcon({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />
    </svg>
  );
}
