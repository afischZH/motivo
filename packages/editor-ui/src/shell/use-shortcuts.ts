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
    // Space handled on keydown must not also activate a focused tile on keyup
    // (some browsers click buttons on keyup even when keydown was prevented).
    let swallowSpaceUp = false;
    const onKeyDown = (event: KeyboardEvent) => {
      const action = resolveShortcut(event);
      if (action === null) return;
      const handler = ref.current[action];
      if (!handler) return;
      event.preventDefault();
      if (action === "newVariant") swallowSpaceUp = true;
      if (event.repeat && NON_REPEATING_ACTIONS.has(action)) return;
      handler();
    };
    const onKeyUp = (event: KeyboardEvent) => {
      if (!swallowSpaceUp || (event.key !== " " && event.key !== "Spacebar")) return;
      swallowSpaceUp = false;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    return () => {
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
    };
  }, []);
}
