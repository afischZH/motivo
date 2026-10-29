"use client";

/**
 * Command palette (W1-AP01, ⌘/Ctrl+K): jump to any tool or page, run the
 * open editor's actions (export, new variant, brand palette, ...) and switch
 * the theme, all from the keyboard. Tool and page entries are translated by
 * the server (`SiteHeader`); editor actions come from the mounted editor
 * shell through `@musterli/editor-ui/commands`. A combobox with a listbox
 * (WAI-ARIA APG): focus stays in the input, arrows move the active option.
 */
import {
  availableEditorCommands,
  onToolSwitcherRequest,
  runEditorCommand,
  subscribeEditorCommands,
  type EditorCommandId,
} from "@musterli/editor-ui/commands";
import {
  ArrowRightIcon,
  CommandIcon,
  FileTextIcon,
  SearchIcon,
  ShapesIcon,
  StarIcon,
  HistoryIcon,
  SunMoonIcon,
  ZapIcon,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { Dialog } from "radix-ui";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useState,
  useSyncExternalStore,
  type KeyboardEvent,
} from "react";

import { toggleTheme } from "@/components/theme/use-theme";
import { useToolHistory } from "@/components/tool-history/use-tool-history";
import { cn } from "@/lib/utils";

import { isPaletteShortcut, normalizeSearch, rankEntries } from "./search";

export interface PaletteLink {
  /** Unique within the palette (tool id, `page:<name>`, `converter:<id>`). */
  id: string;
  kind: "tool" | "page" | "converter";
  label: string;
  /** Shown on the right, e.g. the tool's category. */
  hint?: string;
  href: string;
  /** Extra search words (categories, the English id). */
  terms: string;
}

/** Translated by the server component around it. */
export interface CommandPaletteLabels {
  open: string;
  title: string;
  placeholder: string;
  /** Placeholder when opened as a tool switcher. */
  toolPlaceholder: string;
  empty: string;
  groups: Record<"actions" | "favorites" | "recent" | "pages" | "tools", string>;
  editorCommands: Record<EditorCommandId, string>;
  toggleTheme: string;
  shortcutHint: string;
}

type Entry =
  | (PaletteLink & { group: "favorites" | "recent" | "pages" | "tools" })
  | { id: string; group: "actions"; kind: "editor"; label: string; command: EditorCommandId }
  | { id: string; group: "actions"; kind: "theme"; label: string };

const GROUP_ORDER = ["actions", "favorites", "recent", "pages", "tools"] as const;
/** While searching, tools (the usual target) come before pages. */
const SEARCH_GROUP_ORDER = ["actions", "tools", "pages"] as const;

const GROUP_ICONS = {
  actions: ZapIcon,
  favorites: StarIcon,
  recent: HistoryIcon,
  pages: FileTextIcon,
  tools: ShapesIcon,
} as const;

const noCommands: EditorCommandId[] = [];
let cachedKey = "";
let cachedCommands: EditorCommandId[] = noCommands;

/** Stable snapshot for `useSyncExternalStore` (same array while nothing changed). */
function commandSnapshot(): EditorCommandId[] {
  const next = availableEditorCommands();
  const key = next.join(",");
  if (key !== cachedKey) {
    cachedKey = key;
    cachedCommands = next;
  }
  return cachedCommands;
}

export function CommandPalette({
  links,
  labels,
}: {
  links: PaletteLink[];
  labels: CommandPaletteLabels;
}) {
  const router = useRouter();
  const ids = useId();
  const [open, setOpen] = useState(false);
  // "tools": opened from an editor's tool name pill, lists only tools.
  const [scope, setScope] = useState<"all" | "tools">("all");
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(0);
  const commands = useSyncExternalStore(subscribeEditorCommands, commandSnapshot, () => noCommands);
  const history = useToolHistory();

  useEffect(() => {
    const onKeyDown = (event: globalThis.KeyboardEvent) => {
      if (!isPaletteShortcut(event)) return;
      event.preventDefault();
      setOpen((was) => !was);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(
    () =>
      onToolSwitcherRequest(() => {
        setScope("tools");
        setOpen(true);
      }),
    [],
  );

  const entries = useMemo(() => {
    const tools = new Map(links.filter((l) => l.kind === "tool").map((l) => [l.id, l]));
    let all: Entry[] = [
      ...commands.map((command) => ({
        id: `editor:${command}`,
        group: "actions" as const,
        kind: "editor" as const,
        label: labels.editorCommands[command],
        command,
      })),
      { id: "theme", group: "actions", kind: "theme", label: labels.toggleTheme },
      ...history.favorites.flatMap((id) => {
        const tool = tools.get(id);
        return tool ? [{ ...tool, id: `favorite:${id}`, group: "favorites" as const }] : [];
      }),
      ...history.recent.flatMap((id) => {
        const tool = tools.get(id);
        return tool ? [{ ...tool, id: `recent:${id}`, group: "recent" as const }] : [];
      }),
      ...links.map((link) => ({
        ...link,
        group: link.kind === "tool" ? ("tools" as const) : ("pages" as const),
      })),
    ];
    if (scope === "tools") {
      all = all.filter((e) => e.kind === "tool");
    }
    const words = normalizeSearch(query);
    // Listed in display order, so the arrow keys follow what the eye sees.
    const inOrder = (list: Entry[], order: readonly Entry["group"][]) =>
      order.flatMap((group) => list.filter((e) => e.group === group));
    if (words.length === 0) return inOrder(all, GROUP_ORDER);
    // While searching, a tool shows once (favourites and recent repeat it).
    const ranked = rankEntries(
      all.filter((e) => e.group !== "favorites" && e.group !== "recent"),
      (e) => ({ label: e.label, terms: "terms" in e ? e.terms : "" }),
      words,
    );
    return inOrder(ranked, SEARCH_GROUP_ORDER);
  }, [links, labels, commands, history, query, scope]);

  // Keep the active option in range and visible.
  const activeIndex = Math.min(active, Math.max(0, entries.length - 1));
  const activeId = entries[activeIndex] ? `${ids}-${entries[activeIndex].id}` : undefined;
  useEffect(() => {
    if (!open || !activeId) return;
    document.getElementById(activeId)?.scrollIntoView({ block: "nearest" });
  }, [open, activeId]);

  const close = useCallback(() => {
    setOpen(false);
    setScope("all");
    setQuery("");
    setActive(0);
  }, []);

  const run = (entry: Entry) => {
    close();
    // After the dialog has closed and returned focus, so an action that
    // opens its own dialog (export) gets the focus.
    window.setTimeout(() => {
      if (entry.kind === "editor") runEditorCommand(entry.command);
      else if (entry.kind === "theme") toggleTheme();
      else router.push(entry.href);
    }, 0);
  };

  const onInputKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    const last = entries.length - 1;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActive(activeIndex >= last ? 0 : activeIndex + 1);
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActive(activeIndex <= 0 ? last : activeIndex - 1);
    } else if (event.key === "Home" && event.ctrlKey) {
      event.preventDefault();
      setActive(0);
    } else if (event.key === "End" && event.ctrlKey) {
      event.preventDefault();
      setActive(last);
    } else if (event.key === "Enter") {
      const entry = entries[activeIndex];
      if (!entry) return;
      event.preventDefault();
      run(entry);
    }
  };

  const groups = (normalizeSearch(query).length > 0 ? SEARCH_GROUP_ORDER : GROUP_ORDER)
    .map((group) => ({
      group,
      items: entries
        .map((entry, index) => ({ entry, index }))
        .filter(({ entry }) => entry.group === group),
    }))
    .filter(({ items }) => items.length > 0);

  return (
    <Dialog.Root open={open} onOpenChange={(next) => (next ? setOpen(true) : close())}>
      <Dialog.Trigger
        className="inline-flex h-9 items-center gap-2 rounded-full border border-border bg-background px-2.5 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground sm:pe-1.5"
        data-testid="command-palette-open"
        aria-keyshortcuts="Control+K Meta+K"
      >
        <SearchIcon aria-hidden="true" className="size-4" />
        <span className="max-sm:sr-only">{labels.open}</span>
        <kbd className="hidden items-center gap-0.5 rounded-full border border-border bg-muted px-1.5 font-sans text-xs sm:inline-flex">
          <CommandIcon aria-hidden="true" className="size-3" />K
        </kbd>
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40 backdrop-blur-[2px] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <Dialog.Content
          className="fixed top-[12vh] left-1/2 z-50 flex max-h-[min(32rem,76vh)] w-[min(40rem,calc(100vw-2rem))] -translate-x-1/2 flex-col overflow-hidden rounded-2xl border border-border bg-popover text-popover-foreground shadow-2xl data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 motion-reduce:animate-none"
          data-testid="command-palette"
          aria-describedby={`${ids}-hint`}
        >
          <Dialog.Title className="sr-only">{labels.title}</Dialog.Title>
          <div className="flex items-center gap-2 border-b border-border px-4">
            <SearchIcon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
            <input
              role="combobox"
              aria-expanded="true"
              aria-controls={`${ids}-list`}
              aria-activedescendant={activeId}
              aria-autocomplete="list"
              aria-label={labels.title}
              autoComplete="off"
              spellCheck={false}
              value={query}
              placeholder={scope === "tools" ? labels.toolPlaceholder : labels.placeholder}
              onChange={(event) => {
                setQuery(event.target.value);
                setActive(0);
              }}
              onKeyDown={onInputKeyDown}
              className="h-12 min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground"
              data-testid="command-palette-input"
            />
          </div>
          <div
            id={`${ids}-list`}
            role="listbox"
            aria-label={labels.title}
            className="min-h-0 flex-1 overflow-y-auto overscroll-contain p-2"
          >
            {groups.length === 0 && (
              <p
                className="px-3 py-6 text-center text-sm text-muted-foreground"
                role="presentation"
              >
                {labels.empty}
              </p>
            )}
            {groups.map(({ group, items }) => {
              const Icon = GROUP_ICONS[group];
              return (
                <div key={group} role="group" aria-labelledby={`${ids}-${group}`} className="pb-1">
                  <div
                    id={`${ids}-${group}`}
                    role="presentation"
                    className="px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground"
                  >
                    {labels.groups[group]}
                  </div>
                  {items.map(({ entry, index }) => (
                    <div
                      key={entry.id}
                      id={`${ids}-${entry.id}`}
                      role="option"
                      aria-selected={index === activeIndex}
                      data-entry={entry.id}
                      onPointerMove={() => {
                        if (index !== activeIndex) setActive(index);
                      }}
                      onClick={() => run(entry)}
                      className={cn(
                        "flex h-10 cursor-pointer items-center gap-3 rounded-lg px-3 text-sm",
                        index === activeIndex
                          ? "bg-accent text-accent-foreground"
                          : "text-foreground",
                      )}
                    >
                      {entry.kind === "theme" ? (
                        <SunMoonIcon
                          aria-hidden="true"
                          className="size-4 shrink-0 text-muted-foreground"
                        />
                      ) : (
                        <Icon
                          aria-hidden="true"
                          className="size-4 shrink-0 text-muted-foreground"
                        />
                      )}
                      <span className="min-w-0 flex-1 truncate">{entry.label}</span>
                      {"hint" in entry && entry.hint && (
                        <span className="shrink-0 text-xs text-muted-foreground">{entry.hint}</span>
                      )}
                      {index === activeIndex && (
                        <ArrowRightIcon
                          aria-hidden="true"
                          className="size-3.5 shrink-0 text-muted-foreground"
                        />
                      )}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
          <p
            id={`${ids}-hint`}
            className="border-t border-border px-4 py-2 text-xs text-muted-foreground"
          >
            {labels.shortcutHint}
          </p>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
