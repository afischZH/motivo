"use client";

import { useState } from "react";

import type { EnabledLocale } from "@/i18n/locales";
import { cn } from "@/lib/utils";

import { PatternCard, type PatternCardData } from "./pattern-card";

export interface PatternFilterOption {
  /** "all" or a pattern category. */
  id: string;
  label: string;
  /** Localized "n patterns" for the status line. */
  countLabel: string;
  count: number;
}

/**
 * The library grid with category filter chips. The server renders every
 * card (crawlers and visitors without JS see the whole library); the chips
 * only hide cards. Toggle buttons with `aria-pressed`, the visible count is
 * announced politely.
 */
export function PatternBrowser({
  patterns,
  filters,
  filterLabel,
  locale,
}: {
  patterns: readonly PatternCardData[];
  filters: readonly PatternFilterOption[];
  filterLabel: string;
  locale: EnabledLocale;
}) {
  const [active, setActive] = useState("all");
  const current = filters.find((f) => f.id === active) ?? filters[0];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <div role="group" aria-label={filterLabel} className="flex flex-wrap gap-2">
          {filters.map((filter) => (
            <button
              key={filter.id}
              type="button"
              aria-pressed={filter.id === active}
              onClick={() => setActive(filter.id)}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3.5 py-1.5 text-sm shadow-xs transition-colors",
                "hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
                "aria-pressed:border-foreground aria-pressed:bg-foreground aria-pressed:text-background",
              )}
            >
              {filter.label}
              <span className="text-xs tabular-nums opacity-80">{filter.count}</span>
            </button>
          ))}
        </div>
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
          {current?.countLabel}
        </p>
      </div>

      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {patterns.map((pattern) => (
          <li
            key={pattern.id}
            data-category={pattern.category}
            hidden={active !== "all" && pattern.category !== active}
          >
            <PatternCard pattern={pattern} locale={locale} headingLevel={2} />
          </li>
        ))}
      </ul>
    </div>
  );
}
