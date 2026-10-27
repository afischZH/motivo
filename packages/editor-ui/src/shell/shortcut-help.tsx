"use client";

import { useEffect, useId, useRef } from "react";
import { cx } from "../controls/primitives";
import { useT } from "../i18n";
import { SHORTCUT_HELP } from "./shortcuts";
import { BUTTON_CLASS } from "./styles";

export interface ShortcutHelpProps {
  open: boolean;
  onClose(): void;
}

/**
 * Shortcut overview (`?`). A native modal `<dialog>`: focus is trapped and
 * Escape closes it without extra code.
 */
export function ShortcutHelp({ open, onClose }: ShortcutHelpProps) {
  const t = useT();
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    } else if (!open && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
  }, [open]);

  const keyLabel = (key: string) => {
    switch (key) {
      case "mod":
        return "⌘/Ctrl";
      case "shift":
        return "⇧";
      case "space":
        return t("Editor.shortcuts.keys.space");
      default:
        return key;
    }
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        // A click on the backdrop targets the dialog element itself.
        if (event.target === event.currentTarget) onClose();
      }}
      className={cx(
        "m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-border bg-popover p-0 text-popover-foreground shadow-lg",
        "backdrop:bg-background/70 backdrop:backdrop-blur-sm",
      )}
    >
      <div className="grid gap-4 p-5">
        <div className="flex items-center justify-between gap-4">
          <h2 id={titleId} className="text-base font-semibold">
            {t("Editor.shortcuts.title")}
          </h2>
          <button type="button" className={BUTTON_CLASS} onClick={onClose} autoFocus>
            {t("Editor.shortcuts.close")}
          </button>
        </div>
        <table className="w-full text-sm">
          <caption className="sr-only">{t("Editor.shortcuts.title")}</caption>
          <thead className="sr-only">
            <tr>
              <th scope="col">{t("Editor.shortcuts.keysColumn")}</th>
              <th scope="col">{t("Editor.shortcuts.actionColumn")}</th>
            </tr>
          </thead>
          <tbody>
            {SHORTCUT_HELP.map((entry) => (
              <tr key={entry.action} className="border-t border-border first:border-t-0">
                <td className="py-2 pr-4 align-top whitespace-nowrap">
                  {entry.keys.map((combo, i) => (
                    <span key={i}>
                      {i > 0 && (
                        <span className="px-1 text-muted-foreground">
                          {t("Editor.shortcuts.or")}
                        </span>
                      )}
                      {combo.map((key, j) => (
                        <kbd
                          key={j}
                          className="mr-1 inline-block min-w-6 rounded-md border border-border bg-muted px-1.5 py-0.5 text-center font-sans text-xs"
                        >
                          {keyLabel(key)}
                        </kbd>
                      ))}
                    </span>
                  ))}
                </td>
                <td className="py-2">{t(`Editor.shortcuts.actions.${entry.action}`)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="text-xs text-muted-foreground">{t("Editor.shortcuts.focusHint")}</p>
      </div>
    </dialog>
  );
}
