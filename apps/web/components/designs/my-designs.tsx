"use client";

/**
 * "Meine Designs" (M3-AP04): grid of the designs saved in this browser with
 * search, rename, duplicate, delete (confirm dialog plus undo), open in the
 * editor, and export/import of all designs as one file. Everything runs in
 * the browser; the page never sends design data anywhere.
 */
import {
  StorageError,
  createDesignStore,
  designHash,
  designsFileName,
  designsFileTexts,
  readDesignsFile,
  type DesignRecord,
  type DesignStore,
  type DesignSummary,
  type SkippedDesign,
  type StorageErrorCode,
} from "@motivo/editor-ui/designs";
import { useFormatter, useLocale, useTranslations } from "next-intl";
import NextLink from "next/link";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export interface ToolInfo {
  name: string;
  /** Editor path in the current locale. */
  href: string;
}

interface MyDesignsProps {
  tools: Readonly<Record<string, ToolInfo>>;
  toolsHref: string;
}

type LoadState = "loading" | "ready" | "unavailable";

interface Message {
  tone: "info" | "error";
  text: string;
  /** Extra lines, e.g. skipped designs of an import. */
  details?: string[];
  /** A removed design that "Rückgängig" puts back. */
  undo?: DesignRecord;
}

const OUTLINE = buttonVariants({ variant: "outline", size: "sm" });
const GHOST = buttonVariants({ variant: "ghost", size: "sm" });
// The destructive variant dims its background in dark mode, which drops the
// label contrast below 4.5:1; the confirm button keeps the full colour.
const DANGER = cn(
  buttonVariants({ variant: "destructive", size: "sm" }),
  "dark:bg-destructive dark:hover:bg-destructive/90",
);

function storageMessageKey(error: unknown): `errors.${StorageErrorCode}` {
  const code = error instanceof StorageError ? error.code : "failed";
  return `errors.${code}`;
}

/** A design of the grid with its thumbnail as a data URL (no object URLs to revoke). */
type DesignItem = DesignSummary & { url: string | null };

function blobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

function withUrls(list: readonly DesignSummary[]): Promise<DesignItem[]> {
  return Promise.all(
    list.map(async (d) => ({ ...d, url: d.thumbnail ? await blobToDataUrl(d.thumbnail) : null })),
  );
}

export function MyDesigns({ tools, toolsHref }: MyDesignsProps) {
  const t = useTranslations("Designs");
  const tPage = useTranslations("Designs.page");
  const format = useFormatter();
  const locale = useLocale();
  const ids = useId();
  const [store] = useState<DesignStore>(() => createDesignStore());
  const [state, setState] = useState<LoadState>("loading");
  const [designs, setDesigns] = useState<DesignItem[]>([]);
  const [query, setQuery] = useState("");
  const [message, setMessage] = useState<Message | null>(null);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<DesignSummary | null>(null);
  const [busy, setBusy] = useState<"import" | "export" | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  /** Designs whose thumbnail could not be drawn; not tried again on this visit. */
  const [failed, setFailed] = useState<ReadonlySet<string>>(() => new Set());

  // Own keys only: a stored tool id like "constructor" must not find Object.prototype.
  const toolInfo = useCallback(
    (toolId: string): ToolInfo | undefined =>
      Object.hasOwn(tools, toolId) ? tools[toolId] : undefined,
    [tools],
  );
  const toolName = useCallback((toolId: string) => toolInfo(toolId)?.name ?? toolId, [toolInfo]);

  const showError = useCallback(
    (error: unknown) => {
      if (error instanceof StorageError && error.code === "unavailable") {
        setState("unavailable");
        return;
      }
      setMessage({ tone: "error", text: t(storageMessageKey(error)) });
      setState((s) => (s === "loading" ? "unavailable" : s));
    },
    [t],
  );

  const load = useCallback(
    () =>
      store
        .list()
        .then(withUrls)
        .then((items) => {
          setDesigns(items);
          setState("ready");
        }, showError),
    [store, showError],
  );

  useEffect(() => {
    let active = true;
    store
      .list()
      .then(withUrls)
      .then(
        (items) => {
          if (!active) return;
          setDesigns(items);
          setState("ready");
        },
        (error: unknown) => {
          if (active) showError(error);
        },
      );
    return () => {
      active = false;
      store.close();
    };
  }, [store, showError]);

  // Draws missing thumbnails (after an import, or when saving could not), one at a time.
  const missing = designs
    .filter((d) => d.thumbnail === null && toolInfo(d.toolId) && !failed.has(d.id))
    .map((d) => d.id);
  const missingKey = missing.join(",");
  useEffect(() => {
    if (missingKey === "") return;
    let cancelled = false;
    const queue = missingKey.split(",");
    void (async () => {
      const [{ createDesignThumbnail }, { registry, parseToolParams }] = await Promise.all([
        import("@motivo/editor-ui/designs/thumbnail"),
        import("@motivo/tool-registry"),
      ]);
      for (const id of queue) {
        if (cancelled) return;
        let ok = false;
        try {
          const record = await store.get(id);
          const tool = record ? registry.get(record.toolId) : undefined;
          // Same path as opening the design: older param forms are migrated first.
          const parsed = record && tool ? parseToolParams(tool, record.params) : undefined;
          if (record && tool && parsed?.success) {
            const blob = await createDesignThumbnail(tool, parsed.data, record.seed, record.size);
            if (cancelled) return;
            if (blob) {
              await store.setThumbnail(id, blob);
              const url = await blobToDataUrl(blob);
              setDesigns((list) =>
                list.map((d) => (d.id === id ? { ...d, thumbnail: blob, url } : d)),
              );
              ok = true;
            }
          }
        } catch {
          // Shown without a preview.
        }
        if (!ok && !cancelled) setFailed((f) => new Set(f).add(id));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [missingKey, store]);

  const shown = useMemo(() => {
    const q = query.trim().toLocaleLowerCase(locale);
    if (q === "") return designs;
    return designs.filter(
      (d) =>
        d.name.toLocaleLowerCase(locale).includes(q) ||
        toolName(d.toolId).toLocaleLowerCase(locale).includes(q),
    );
  }, [designs, query, locale, toolName]);

  const run = async (action: () => Promise<Message | null>) => {
    try {
      const next = await action();
      if (next) setMessage(next);
    } catch (error) {
      setMessage({ tone: "error", text: t(storageMessageKey(error)) });
    }
    await load();
  };

  const duplicate = (d: DesignItem) =>
    run(async () => {
      await store.duplicate(d.id, tPage("copyName", { name: d.name }));
      return { tone: "info", text: tPage("duplicated", { name: d.name }) };
    });

  const rename = (d: DesignSummary, name: string) =>
    run(async () => {
      const clean = name.trim();
      setRenaming(null);
      if (clean === "" || clean === d.name) return null;
      await store.rename(d.id, clean);
      return { tone: "info", text: tPage("renamed", { name: clean }) };
    });

  const remove = (d: DesignSummary) =>
    run(async () => {
      const record = await store.get(d.id);
      await store.remove(d.id);
      headingRef.current?.focus();
      return {
        tone: "info",
        text: tPage("deleted", { name: d.name }),
        ...(record ? { undo: record } : {}),
      };
    });

  const undo = (record: DesignRecord) =>
    run(async () => {
      await store.restore(record);
      return { tone: "info", text: tPage("restored", { name: record.name }) };
    });

  const exportAll = () =>
    run(async () => {
      setBusy("export");
      try {
        const all = await store.getAll();
        if (all.length === 0) return { tone: "info", text: tPage("exportEmpty") };
        // Several files when uploads make one too large to import again.
        const texts = await designsFileTexts(all, Date.now());
        const { downloadBlob } = await import("@motivo/exporters");
        const date = new Date();
        texts.forEach((text, part) => {
          const blob = new Blob([text], { type: "application/json" });
          downloadBlob(blob, designsFileName(date, part, texts.length));
        });
        return {
          tone: "info",
          text:
            texts.length > 1
              ? tPage("exportedParts", { count: all.length, files: texts.length })
              : tPage("exported", { count: all.length }),
        };
      } finally {
        setBusy(null);
      }
    });

  const skippedLine = (s: SkippedDesign) => {
    const reason = tPage(`skipReasons.${s.reason}`);
    return s.name
      ? tPage("skippedItem", { name: s.name, reason })
      : tPage("skippedUnnamed", { index: s.index + 1, reason });
  };

  const importFile = (file: File) =>
    run(async () => {
      setBusy("import");
      try {
        const parsed = await readDesignsFile(file);
        if (!parsed.ok) return { tone: "error", text: tPage(`importErrors.${parsed.error}`) };
        const outcome = await store.importDesigns(parsed.designs);
        const lines = [tPage("imported", { added: outcome.added.length })];
        if (outcome.duplicates > 0) {
          lines.push(tPage("importDuplicates", { count: outcome.duplicates }));
        }
        if (parsed.skipped.length > 0) {
          lines.push(tPage("importSkipped", { count: parsed.skipped.length }));
        }
        return {
          tone: outcome.added.length === 0 && parsed.skipped.length > 0 ? "error" : "info",
          text: lines.join(" "),
          ...(parsed.skipped.length > 0 ? { details: parsed.skipped.map(skippedLine) } : {}),
        };
      } finally {
        setBusy(null);
        if (fileRef.current) fileRef.current.value = "";
      }
    });

  const searchId = `${ids}-search`;

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-8 sm:py-12">
      <header className="flex flex-col gap-3">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-3xl font-semibold tracking-tight focus:outline-none"
        >
          {tPage("title")}
        </h1>
        <p className="max-w-prose text-lg text-muted-foreground">{tPage("intro")}</p>
        <p className="max-w-prose text-sm text-muted-foreground" data-testid="storage-hint">
          {tPage("storageHint")}
        </p>
      </header>

      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-[1_1_16rem]">
          <label htmlFor={searchId} className="sr-only">
            {tPage("searchLabel")}
          </label>
          <input
            id={searchId}
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder={tPage("searchPlaceholder")}
            disabled={state !== "ready"}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none disabled:opacity-50"
            data-testid="designs-search"
          />
        </div>
        <button
          type="button"
          className={OUTLINE}
          onClick={() => void exportAll()}
          disabled={state !== "ready" || busy !== null || designs.length === 0}
          data-testid="designs-export"
        >
          <DownloadGlyph />
          {tPage("exportAll")}
        </button>
        <button
          type="button"
          className={OUTLINE}
          onClick={() => fileRef.current?.click()}
          disabled={state !== "ready" || busy !== null}
          data-testid="designs-import"
        >
          <UploadGlyph />
          {busy === "import" ? tPage("importing") : tPage("import")}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".json,application/json"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0];
            if (file) void importFile(file);
          }}
          data-testid="designs-file"
        />
      </div>

      <div role="status" aria-live="polite" className="empty:hidden" data-testid="designs-message">
        {message && (
          <div
            className={cn(
              "flex flex-wrap items-start gap-x-3 gap-y-2 rounded-lg border border-border px-4 py-3 text-sm",
              message.tone === "error" ? "bg-destructive/10" : "bg-muted",
            )}
          >
            <div className="min-w-0 flex-[1_1_16rem]">
              <p>{message.text}</p>
              {message.details && (
                <ul className="mt-1 list-disc pl-5 text-muted-foreground">
                  {message.details.map((line, i) => (
                    <li key={i}>{line}</li>
                  ))}
                </ul>
              )}
            </div>
            {message.undo && (
              <button
                type="button"
                className={OUTLINE}
                onClick={() => {
                  const record = message.undo;
                  if (record) void undo(record);
                }}
                data-testid="designs-undo"
              >
                {tPage("undo")}
              </button>
            )}
            <button
              type="button"
              className={GHOST}
              onClick={() => setMessage(null)}
              aria-label={tPage("dismiss")}
            >
              <CloseGlyph />
            </button>
          </div>
        )}
      </div>

      {state === "loading" && <p className="text-muted-foreground">{tPage("loading")}</p>}
      {state === "unavailable" && (
        <p
          role="alert"
          className="rounded-lg bg-destructive/10 px-4 py-3"
          data-testid="designs-unavailable"
        >
          {t("errors.unavailable")}
        </p>
      )}
      {state === "ready" && designs.length === 0 && (
        <section
          aria-labelledby={`${ids}-empty`}
          className="flex flex-col items-start gap-3 rounded-xl border border-dashed border-border p-6"
          data-testid="designs-empty"
        >
          <h2 id={`${ids}-empty`} className="text-lg font-semibold">
            {tPage("emptyTitle")}
          </h2>
          <p className="max-w-prose text-muted-foreground">{tPage("emptyText")}</p>
          <NextLink href={toolsHref} className={buttonVariants({ size: "sm" })}>
            {tPage("emptyCta")}
          </NextLink>
        </section>
      )}
      {state === "ready" && designs.length > 0 && (
        <section aria-labelledby={`${ids}-list`} className="flex flex-col gap-3">
          <h2
            id={`${ids}-list`}
            className="text-sm text-muted-foreground"
            data-testid="designs-count"
          >
            {shown.length === designs.length
              ? tPage("count", { count: designs.length })
              : tPage("shown", { shown: shown.length, count: designs.length })}
          </h2>
          {shown.length === 0 ? (
            <p className="text-muted-foreground">{tPage("noResults", { query: query.trim() })}</p>
          ) : (
            <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {shown.map((d) => (
                <DesignCard
                  key={d.id}
                  design={d}
                  tool={toolInfo(d.toolId)}
                  toolName={toolName(d.toolId)}
                  thumbnail={d.url ?? undefined}
                  updated={tPage("updated", {
                    date: format.dateTime(d.updatedAt, { dateStyle: "medium", timeStyle: "short" }),
                  })}
                  renaming={renaming === d.id}
                  onRenameStart={() => setRenaming(d.id)}
                  onRenameCancel={() => setRenaming(null)}
                  onRename={(name) => void rename(d, name)}
                  onDuplicate={() => void duplicate(d)}
                  onDelete={() => setDeleting(d)}
                />
              ))}
            </ul>
          )}
        </section>
      )}

      <ConfirmDelete
        design={deleting}
        onCancel={() => setDeleting(null)}
        onConfirm={(d) => {
          setDeleting(null);
          void remove(d);
        }}
      />
    </div>
  );
}

function DesignCard(props: {
  design: DesignSummary;
  tool: ToolInfo | undefined;
  toolName: string;
  thumbnail: string | undefined;
  updated: string;
  renaming: boolean;
  onRenameStart(): void;
  onRenameCancel(): void;
  onRename(name: string): void;
  onDuplicate(): void;
  onDelete(): void;
}) {
  const t = useTranslations("Designs.page");
  const { design } = props;
  const href = props.tool ? `${props.tool.href}${designHash(design.id)}` : undefined;
  const renameButton = useRef<HTMLButtonElement>(null);
  const wasRenaming = useRef(false);

  // Back on the rename button after renaming or cancelling.
  useEffect(() => {
    if (wasRenaming.current && !props.renaming) renameButton.current?.focus();
    wasRenaming.current = props.renaming;
  }, [props.renaming]);

  const preview: ReactNode = props.thumbnail ? (
    // eslint-disable-next-line @next/next/no-img-element -- local blob URL, not optimisable
    <img
      src={props.thumbnail}
      alt={t("thumbnailAlt", { name: design.name })}
      className="size-full object-contain"
      data-testid="design-thumbnail"
    />
  ) : (
    <span className="text-xs text-muted-foreground">{t("noThumbnail")}</span>
  );

  return (
    <li
      className="flex flex-col overflow-hidden rounded-xl border border-border bg-card"
      data-testid="design-card"
      data-design-id={design.id}
    >
      <div className="flex aspect-[4/3] items-center justify-center bg-canvas p-2">
        {href ? (
          <a
            href={href}
            tabIndex={-1}
            aria-hidden="true"
            className="flex size-full items-center justify-center"
          >
            {preview}
          </a>
        ) : (
          preview
        )}
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        {props.renaming ? (
          <RenameForm
            name={design.name}
            onCancel={props.onRenameCancel}
            onSubmit={props.onRename}
          />
        ) : (
          <h3 className="truncate font-medium" title={design.name} data-testid="design-name">
            {design.name}
          </h3>
        )}
        <p className="text-xs text-muted-foreground">
          {props.toolName} · {props.updated}
        </p>
        <div
          role="group"
          aria-label={t("actionsLabel", { name: design.name })}
          className="mt-auto flex flex-wrap gap-1.5"
        >
          {href && (
            <a
              href={href}
              className={buttonVariants({ size: "sm" })}
              aria-label={t("openLabel", { name: design.name })}
              data-testid="design-open"
            >
              {t("open")}
            </a>
          )}
          <button
            ref={renameButton}
            type="button"
            className={OUTLINE}
            onClick={props.onRenameStart}
            disabled={props.renaming}
            data-testid="design-rename"
          >
            {t("rename")}
          </button>
          <button
            type="button"
            className={OUTLINE}
            onClick={props.onDuplicate}
            data-testid="design-duplicate"
          >
            {t("duplicate")}
          </button>
          <button
            type="button"
            className={OUTLINE}
            onClick={props.onDelete}
            data-testid="design-delete"
          >
            {t("delete")}
          </button>
        </div>
      </div>
    </li>
  );
}

function RenameForm(props: { name: string; onSubmit(name: string): void; onCancel(): void }) {
  const t = useTranslations("Designs.page");
  const id = useId();
  const [value, setValue] = useState(props.name);
  const submit = (event: FormEvent) => {
    event.preventDefault();
    props.onSubmit(value);
  };
  return (
    <form onSubmit={submit} className="flex flex-col gap-2">
      <label htmlFor={id} className="sr-only">
        {t("renameLabel", { name: props.name })}
      </label>
      <input
        id={id}
        value={value}
        maxLength={120}
        autoFocus
        onChange={(event) => setValue(event.currentTarget.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            props.onCancel();
          }
        }}
        className="h-8 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
        data-testid="design-rename-input"
      />
      <div className="flex gap-1.5">
        <button type="submit" className={buttonVariants({ size: "sm" })}>
          {t("renameSave")}
        </button>
        <button type="button" className={GHOST} onClick={props.onCancel}>
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}

/** Native modal dialog: focus is trapped and Escape cancels without extra code. */
function ConfirmDelete(props: {
  design: DesignSummary | null;
  onCancel(): void;
  onConfirm(design: DesignSummary): void;
}) {
  const t = useTranslations("Designs.page");
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const textId = useId();
  const open = props.design !== null;
  // Keeps the name visible while the dialog closes.
  const [shown, setShown] = useState<DesignSummary | null>(null);
  if (props.design && props.design !== shown) setShown(props.design);

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

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      aria-describedby={textId}
      onClose={() => {
        if (props.design) props.onCancel();
      }}
      className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-2xl border border-border bg-popover p-0 text-popover-foreground shadow-lg backdrop:bg-background/70 backdrop:backdrop-blur-sm"
      data-testid="delete-dialog"
    >
      <div className="grid gap-4 p-5">
        <h2 id={titleId} className="text-base font-semibold">
          {t("deleteTitle")}
        </h2>
        <p id={textId} className="text-sm text-muted-foreground">
          {t("deleteText", { name: shown?.name ?? "" })}
        </p>
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" className={OUTLINE} onClick={props.onCancel} autoFocus>
            {t("cancel")}
          </button>
          <button
            type="button"
            className={DANGER}
            onClick={() => {
              if (props.design) props.onConfirm(props.design);
            }}
            data-testid="delete-confirm"
          >
            {t("deleteConfirm")}
          </button>
        </div>
      </div>
    </dialog>
  );
}

const Glyph = ({ children }: { children: ReactNode }) => (
  <svg
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="2"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
    focusable="false"
  >
    {children}
  </svg>
);

const DownloadGlyph = () => (
  <Glyph>
    <path d="M12 3v12" />
    <path d="m7 10 5 5 5-5" />
    <path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
  </Glyph>
);

const UploadGlyph = () => (
  <Glyph>
    <path d="M12 15V3" />
    <path d="m7 8 5-5 5 5" />
    <path d="M5 15v4a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-4" />
  </Glyph>
);

const CloseGlyph = () => (
  <Glyph>
    <path d="M18 6 6 18" />
    <path d="m6 6 12 12" />
  </Glyph>
);
