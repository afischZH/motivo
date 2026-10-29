"use client";

/**
 * "Als Brand-Palette speichern" (M5b-AP04, docs/ARCHITECTURE.md 4.18): the
 * colours of a colour tool (`paletteOutput`, cut to the brand palette
 * limits by `brandPaletteOutput`) go into this browser's brand kit under a
 * name. A native modal `<dialog>` like the export dialog: the browser traps
 * focus and closes it with Escape. After saving it confirms with a link to
 * the Brand Kit; the brand palette section of every tool lists it at once.
 */
import { BRAND_NAME_MAX, StorageError } from "@musterli/storage";
import { useEffect, useId, useRef, useState } from "react";
import { INPUT_CLASS, cx } from "../controls/primitives";
import { useT } from "../i18n";
import { BUTTON_CLASS, PRIMARY_BUTTON_CLASS } from "../shell/styles";
import { useBackdropClose } from "../shell/use-backdrop-close";
import type { BrandKitView } from "./context";

export interface SavePaletteDialogProps {
  open: boolean;
  onClose(): void;
  kit: BrandKitView;
  colors: readonly string[];
  /** Name the field starts with. */
  defaultName: string;
}

type Status =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; name: string }
  | { kind: "error"; code: "limit" | "unavailable" | "quota" | "failed" };

const ERROR_CODES = new Set(["limit", "unavailable", "quota"]);

export function SavePaletteDialog(props: SavePaletteDialogProps) {
  const t = useT();
  const titleId = useId();
  const ref = useRef<HTMLDialogElement>(null);
  const backdropClose = useBackdropClose(props.onClose);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (props.open && !dialog.open) {
      if (typeof dialog.showModal === "function") dialog.showModal();
      else dialog.setAttribute("open", "");
    } else if (!props.open && dialog.open) {
      if (typeof dialog.close === "function") dialog.close();
      else dialog.removeAttribute("open");
    }
  }, [props.open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={props.onClose}
      {...backdropClose}
      className={cx(
        "m-auto max-h-[calc(100dvh-2rem)] w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-border bg-popover p-0 text-popover-foreground shadow-lg",
        "backdrop:bg-background/70 backdrop:backdrop-blur-sm",
      )}
      data-testid="save-palette-dialog"
    >
      <div className="flex items-center justify-between gap-4 border-b border-border px-5 py-3">
        <h2 id={titleId} className="text-base font-semibold">
          {t("Editor.handoff.palette.title")}
        </h2>
      </div>
      {props.open && <SavePaletteBody {...props} />}
    </dialog>
  );
}

function SavePaletteBody({ kit, colors, defaultName, onClose }: SavePaletteDialogProps) {
  const t = useT();
  const ids = useId();
  const [name, setName] = useState(defaultName);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const saving = status.kind === "saving";
  const saved = status.kind === "saved";

  const save = async () => {
    setStatus({ kind: "saving" });
    try {
      const palette = await kit.savePalette(name, colors);
      setStatus({ kind: "saved", name: palette.name || t("Editor.brand.unnamed") });
    } catch (error) {
      const code =
        error instanceof StorageError && ERROR_CODES.has(error.code) ? error.code : "failed";
      setStatus({ kind: "error", code: code as "limit" | "unavailable" | "quota" | "failed" });
    }
  };

  return (
    <form
      className="grid gap-4 px-5 py-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (!saving && !saved) void save();
      }}
    >
      <p className="text-sm text-muted-foreground">{t("Editor.handoff.palette.intro")}</p>
      <ul
        className="flex flex-wrap gap-1"
        aria-label={t("Editor.handoff.palette.colors", { colors: colors.join(", ") })}
        data-testid="save-palette-colors"
      >
        {colors.map((color, i) => (
          <li
            key={i}
            className="size-7 rounded-md border border-border"
            // The swatch shows user content, not a UI token.
            style={{ backgroundColor: color }}
            title={color}
          >
            <span className="sr-only">{color}</span>
          </li>
        ))}
      </ul>
      <div className="grid gap-1">
        <label htmlFor={`${ids}-name`} className="text-sm font-medium">
          {t("Editor.handoff.palette.name")}
        </label>
        <input
          id={`${ids}-name`}
          type="text"
          value={name}
          maxLength={BRAND_NAME_MAX}
          disabled={saving || saved}
          onChange={(event) => setName(event.currentTarget.value)}
          className={cx(INPUT_CLASS, "w-full")}
          data-testid="save-palette-name"
        />
      </div>
      <div role="status" aria-live="polite" className="text-sm" data-testid="save-palette-status">
        {saved && (
          <p>
            {t("Editor.handoff.palette.saved", { name: status.name })}{" "}
            {kit.href && (
              <a
                href={kit.href}
                className="rounded-sm text-link underline underline-offset-4"
                data-testid="save-palette-kit-link"
              >
                {t("Editor.handoff.palette.openKit")}
              </a>
            )}
          </p>
        )}
      </div>
      {status.kind === "error" && (
        <p role="alert" className="text-sm text-destructive" data-testid="save-palette-error">
          {t(`Editor.handoff.palette.errors.${status.code}`)}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <button type="button" className={BUTTON_CLASS} onClick={onClose}>
          {saved ? t("Editor.handoff.palette.close") : t("Editor.handoff.palette.cancel")}
        </button>
        {!saved && (
          <button
            type="submit"
            className={PRIMARY_BUTTON_CLASS}
            disabled={saving}
            data-testid="save-palette-submit"
          >
            {saving ? t("Editor.handoff.palette.saving") : t("Editor.handoff.palette.save")}
          </button>
        )}
      </div>
    </form>
  );
}
