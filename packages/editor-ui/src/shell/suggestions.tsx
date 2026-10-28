"use client";

/**
 * One-click suggestions above the controls (`ToolDefinition.suggestions`),
 * e.g. the nearest text colour that passes WCAG AA in the contrast checker.
 * Generic: the tool computes the list from its params, the shell only shows
 * buttons and merges the chosen patch as one undo step.
 */
import { useId, useMemo } from "react";
import { cx } from "../controls/primitives";
import { useT } from "../i18n";
import { useEditorStore } from "../store/react";
import { BUTTON_CLASS } from "./styles";

export interface SuggestionsSectionProps {
  /** Confirms the change (visible and announced by the shell). */
  onApplied?(message: string): void;
}

export function SuggestionsSection(props: SuggestionsSectionProps) {
  const t = useT();
  const ids = useId();
  const tool = useEditorStore((s) => s.tool);
  const params = useEditorStore((s) => s.params);
  const setParams = useEditorStore((s) => s.setParams);
  const suggestions = useMemo(
    // The store only holds params that passed the tool's schema.
    () => tool.suggestions?.(params as Parameters<typeof tool.randomize>[1]) ?? [],
    [tool, params],
  );
  if (suggestions.length === 0) return null;

  return (
    <section
      aria-labelledby={`${ids}-title`}
      aria-describedby={`${ids}-hint`}
      className="mb-4 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2 border-b border-border pb-4"
      data-testid="suggestions"
    >
      <h3 id={`${ids}-title`} className="text-sm font-semibold">
        {t("Editor.suggestions.title")}
      </h3>
      <ul className="grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
        {suggestions.map((s) => {
          const label = t(s.labelKey, s.values ? { ...s.values } : undefined);
          return (
            <li key={s.id} className="min-w-0">
              <button
                type="button"
                className={cx(BUTTON_CLASS, "h-auto min-h-8 w-full justify-start py-1 text-left")}
                onClick={() => {
                  setParams(s.patch as Record<string, unknown>);
                  props.onApplied?.(t("Editor.suggestions.applied", { label }));
                }}
                data-suggestion={s.id}
              >
                {s.swatch !== undefined && (
                  <span
                    aria-hidden="true"
                    className="size-4 shrink-0 rounded-sm border border-border"
                    // The swatch shows a design colour, not a UI token.
                    style={{ backgroundColor: s.swatch }}
                  />
                )}
                <span className="min-w-0 break-words">{label}</span>
              </button>
            </li>
          );
        })}
      </ul>
      <p id={`${ids}-hint`} className="text-xs text-muted-foreground">
        {t("Editor.suggestions.hint")}
      </p>
    </section>
  );
}
