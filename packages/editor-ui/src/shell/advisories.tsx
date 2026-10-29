"use client";

import { createRenderContext, type Params, type ParamsSchema } from "@musterli/tool-registry";
import { useDeferredValue, useId, useMemo } from "react";
import { useT } from "../i18n";
import { useEditorStore } from "../store/react";

/**
 * Hints of the tool about the current params (`ToolDefinition.advisories`),
 * e.g. text that misses WCAG contrast. A polite live region, so a hint that
 * appears while a slider moves is announced once it settles; nothing is
 * shown (and nothing announced) while there are no hints.
 */
export function ToolAdvisories() {
  const t = useT();
  const id = useId();
  const tool = useEditorStore((s) => s.tool);
  const params = useDeferredValue(useEditorStore((s) => s.params));
  const seed = useDeferredValue(useEditorStore((s) => s.seed));
  const size = useDeferredValue(useEditorStore((s) => s.size));

  const advisories = useMemo(() => {
    if (!tool.advisories) return [];
    // The store only holds params that passed the tool's schema.
    return tool.advisories(params as Params<ParamsSchema>, createRenderContext(seed, size));
  }, [tool, params, seed, size]);

  if (!tool.advisories) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      aria-labelledby={`${id}-title`}
      className={advisories.length > 0 ? "my-3" : undefined}
    >
      <span id={`${id}-title`} className="sr-only">
        {t("Editor.controls.advisories")}
      </span>
      {advisories.map((a) => (
        <p
          key={a.id}
          className="rounded-md border border-border bg-muted px-3 py-2 text-sm text-foreground"
          data-testid={`advisory-${a.id}`}
        >
          {t(a.messageKey, a.values ? { ...a.values } : undefined)}
        </p>
      ))}
    </div>
  );
}
