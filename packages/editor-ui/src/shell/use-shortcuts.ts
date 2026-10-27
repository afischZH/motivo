"use client";

import { useEffect, useRef } from "react";
import { NON_REPEATING_ACTIONS, resolveShortcut, type ShortcutAction } from "./shortcuts";

export type ShortcutHandlers = Partial<Record<ShortcutAction, () => void>>;

/**
 * Binds editor shortcuts to `window`. Actions without a handler are left to
 * the browser (e.g. Ctrl+E while export is not available).
 */
export function useEditorShortcuts(handlers: ShortcutHandlers): void {
  const ref = useRef(handlers);
  useEffect(() => {
    ref.current = handlers;
  });

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const action = resolveShortcut(event);
      if (action === null) return;
      const handler = ref.current[action];
      if (!handler) return;
      event.preventDefault();
      if (event.repeat && NON_REPEATING_ACTIONS.has(action)) return;
      handler();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);
}
