"use client";

/**
 * "Brand-Palette anwenden" at the top of the settings (M3-AP06): pick one of
 * the brand palettes and put it onto the tool's colour params in one undo
 * step. Generic: shown for every tool whose schema has colour params
 * (`acceptsBrandPalette`), nothing here knows a tool.
 */
import { acceptsBrandPalette } from "@musterli/tool-registry";
import { useId, useState } from "react";
import { INPUT_CLASS, cx } from "../controls/primitives";
import { useT } from "../i18n";
import { BUTTON_CLASS } from "../shell/styles";
import { useEditorStore } from "../store/react";
import { orderedPalettes, useBrandKit } from "./context";
import { SECTION_TITLE_CLASS } from "../shell/panel-section";

export interface BrandPaletteSectionProps {
  /** Confirms the change (visible and announced by the shell). */
  onApplied?(message: string): void;
}

export function BrandPaletteSection(props: BrandPaletteSectionProps) {
  const t = useT();
  const ids = useId();
  const kit = useBrandKit();
  const tool = useEditorStore((s) => s.tool);
  const applyBrandPalette = useEditorStore((s) => s.applyBrandPalette);
  const [chosen, setChosen] = useState<string | null>(null);
  const [error, setError] = useState(false);

  if (!kit || !acceptsBrandPalette(tool)) return null;
  const palettes = orderedPalettes(kit);
  const selected =
    palettes.find((p) => p.id === chosen) ??
    palettes.find((p) => p.id === kit.defaultId) ??
    palettes[0];

  return (
    <section
      aria-labelledby={`${ids}-title`}
      className="-mx-4 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 border-b border-border px-4 py-4"
      data-testid="brand-palette"
    >
      <h3 id={`${ids}-title`} className={SECTION_TITLE_CLASS}>
        {t("Editor.brand.title")}
      </h3>
      {!selected ? (
        <p className="text-xs text-muted-foreground" data-testid="brand-palette-empty">
          {t("Editor.brand.empty")}{" "}
          {kit.href && (
            <a
              href={kit.href}
              className="rounded-sm text-link underline underline-offset-4"
              data-testid="brand-kit-link"
            >
              {t("Editor.brand.create")}
            </a>
          )}
        </p>
      ) : (
        <>
          <div className="flex min-w-0 items-center gap-2">
            <label htmlFor={`${ids}-select`} className="sr-only">
              {t("Editor.brand.choose")}
            </label>
            <select
              id={`${ids}-select`}
              className={cx(INPUT_CLASS, "h-8 w-0 min-w-0 flex-1 truncate")}
              value={selected.id}
              onChange={(event) => {
                setChosen(event.currentTarget.value);
                setError(false);
              }}
              data-testid="brand-palette-select"
            >
              {palettes.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.id === kit.defaultId
                    ? t("Editor.brand.defaultName", { name: p.name || t("Editor.brand.unnamed") })
                    : p.name || t("Editor.brand.unnamed")}
                </option>
              ))}
            </select>
            <button
              type="button"
              className={BUTTON_CLASS}
              aria-describedby={`${ids}-hint`}
              onClick={() => {
                const ok = applyBrandPalette(selected.colors);
                setError(!ok);
                if (ok) {
                  props.onApplied?.(
                    t("Editor.brand.applied", { name: selected.name || t("Editor.brand.unnamed") }),
                  );
                }
              }}
              data-testid="brand-palette-apply"
            >
              {t("Editor.brand.apply")}
            </button>
          </div>
          <ul className="flex flex-wrap gap-1" aria-label={t("Editor.brand.preview")}>
            {selected.colors.map((color, i) => (
              <li
                key={i}
                className="size-5 rounded-sm border border-border"
                // The swatch shows user content, not a UI token.
                style={{ backgroundColor: color }}
                title={color}
              >
                <span className="sr-only">{color}</span>
              </li>
            ))}
          </ul>
          <p id={`${ids}-hint`} className="text-xs text-muted-foreground">
            {t("Editor.brand.hint")}
          </p>
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {t("Editor.brand.failed")}
            </p>
          )}
        </>
      )}
    </section>
  );
}
