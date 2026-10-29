"use client";

import { SearchIcon as SearchLucide } from "lucide-react";
import { type ReactNode, useDeferredValue, useEffect, useId, useRef, useState } from "react";

import { cn } from "@/lib/utils";

export interface CatalogueItem {
  key: string;
  /** Everything a search may match: name, description, category names. */
  terms: string;
  /** Rendered on the server (a tool card or a converter chip). */
  node: ReactNode;
}

export interface CatalogueSection {
  id: string;
  /** Heading row, rendered on the server; must contain the `${id}-heading` element. */
  header: ReactNode;
  items: CatalogueItem[];
  listClassName: string;
}

/** Translated by the page; plural and placeholders are filled in here. */
export interface CatalogueFilterLabels {
  search: string;
  placeholder: string;
  shortcut: string;
  resultsOne: string;
  /** Contains `{count}`. */
  resultsOther: string;
  /** Contains `{query}`. */
  noResults: string;
  noResultsHint: string;
  clear: string;
}

/** Lower case without accents, so "verlaufe" finds "Verläufe". */
function normalize(text: string): string {
  return text.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase();
}

function matches(terms: string, words: string[]): boolean {
  return words.every((word) => terms.includes(word));
}

function isTyping(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
  );
}

/**
 * Catalogue with an instant filter. Every card is in the server HTML (no JS
 * needed to browse or crawl); typing hides the cards that do not match and
 * the sections left empty. The search bar sticks below the header together
 * with the category jump links (`nav`).
 */
export function CatalogueFilter({
  sections,
  nav,
  labels,
}: {
  sections: CatalogueSection[];
  nav: ReactNode;
  labels: CatalogueFilterLabels;
}) {
  const [query, setQuery] = useState("");
  const deferred = useDeferredValue(query);
  const inputRef = useRef<HTMLInputElement>(null);
  const inputId = useId();
  const hintId = useId();

  // "/" focuses the search, as on most catalogue and docs sites.
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "/" || event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTyping(event.target)) return;
      event.preventDefault();
      inputRef.current?.focus();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const words = normalize(deferred).split(/\s+/).filter(Boolean);
  const filtering = words.length > 0;
  const shown = sections.map((section) => ({
    section,
    hits: new Set(
      section.items.filter((item) => !filtering || matches(normalize(item.terms), words)),
    ),
  }));
  const count = shown.reduce((sum, { hits }) => sum + hits.size, 0);

  const status = !filtering
    ? ""
    : count === 1
      ? labels.resultsOne
      : labels.resultsOther.replace("{count}", String(count));

  return (
    <>
      <div className="sticky top-14 z-20 -mx-4 flex flex-col gap-3 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-sm supports-[backdrop-filter]:bg-background/85">
        <div className="relative">
          <label htmlFor={inputId} className="sr-only">
            {labels.search}
          </label>
          <SearchIcon />
          <input
            ref={inputRef}
            id={inputId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape" && query) {
                event.preventDefault();
                setQuery("");
              }
            }}
            placeholder={labels.placeholder}
            aria-describedby={hintId}
            autoComplete="off"
            spellCheck={false}
            enterKeyHint="search"
            data-testid="catalogue-search"
            className="h-11 w-full rounded-full border border-input bg-background pr-12 pl-11 text-base shadow-xs transition-[border-color,box-shadow] duration-150 ease-out outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 sm:text-sm [&::-webkit-search-cancel-button]:hidden"
          />
          <kbd
            aria-hidden="true"
            className="pointer-events-none absolute top-1/2 right-4 hidden -translate-y-1/2 rounded border border-border bg-muted px-1.5 font-sans text-xs text-muted-foreground sm:block"
          >
            /
          </kbd>
          <span id={hintId} className="sr-only">
            {labels.shortcut}
          </span>
        </div>
        {/* Category jump links: one scrollable row on small screens. */}
        <div className="-mx-4 overflow-x-auto px-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {nav}
        </div>
      </div>

      <p
        role="status"
        aria-live="polite"
        className={cn("text-sm text-muted-foreground", (!filtering || count === 0) && "sr-only")}
      >
        {status}
      </p>

      {filtering && count === 0 && (
        <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-border px-6 py-14 text-center">
          <p className="text-lg font-semibold">
            {labels.noResults.replace("{query}", deferred.trim())}
          </p>
          <p className="text-muted-foreground">{labels.noResultsHint}</p>
          <button
            type="button"
            onClick={() => {
              setQuery("");
              inputRef.current?.focus();
            }}
            className="mt-1 rounded-control text-sm font-medium text-link underline-offset-4 hover:underline"
          >
            {labels.clear}
          </button>
        </div>
      )}

      {shown.map(({ section, hits }) => (
        <section
          key={section.id}
          id={section.id}
          aria-labelledby={`${section.id}-heading`}
          hidden={hits.size === 0}
          className="flex scroll-mt-52 flex-col gap-4"
        >
          {section.header}
          <ul className={section.listClassName}>
            {section.items.map((item) => (
              <li key={item.key} hidden={!hits.has(item)}>
                {item.node}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </>
  );
}

function SearchIcon() {
  return (
    <SearchLucide
      aria-hidden="true"
      className="pointer-events-none absolute top-1/2 left-4 size-4 -translate-y-1/2 text-muted-foreground"
    />
  );
}
