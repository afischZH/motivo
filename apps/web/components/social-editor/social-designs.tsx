"use client";

/**
 * "Social-Designs" section of "Meine Designs": the social editor's designs
 * saved in this browser (IndexedDB store `social-designs`), with open,
 * rename, duplicate, delete (with undo), and export/import as a
 * `motivo-social` file. The import is checked in a worker. Nothing leaves
 * the browser.
 */
import { designHash } from "@musterli/editor-ui/designs";
import {
  createSocialDesignStore,
  type SocialDesignRecord,
  type SocialDesignSummary,
} from "@musterli/storage";
import { MegaphoneIcon } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";

import { buttonVariants } from "@/components/ui/button";
import { readSocialFile } from "@/lib/social-editor/import-client";
import { socialFileName, socialFileTexts } from "@/lib/social-editor/transfer-format";
import { cn } from "@/lib/utils";

const OUTLINE = buttonVariants({ variant: "outline", size: "sm" });
const GHOST = buttonVariants({ variant: "ghost", size: "sm" });

interface Item extends SocialDesignSummary {
  url: string | null;
}

interface Notice {
  tone: "info" | "error";
  text: string;
  undo?: SocialDesignRecord;
}

export function SocialDesigns({ editorHref }: { editorHref: string }) {
  const t = useTranslations("SocialDesigns");
  const format = useFormatter();
  const ids = useId();
  const [store] = useState(() => createSocialDesignStore());
  const [items, setItems] = useState<Item[] | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const urls = useRef<string[]>([]);

  const reload = useCallback(async () => {
    try {
      const list = await store.list();
      for (const url of urls.current) URL.revokeObjectURL(url);
      urls.current = [];
      setItems(
        list.map((d) => {
          const url = d.thumbnail ? URL.createObjectURL(d.thumbnail) : null;
          if (url) urls.current.push(url);
          return { ...d, url };
        }),
      );
    } catch {
      setUnavailable(true);
    }
  }, [store]);

  useEffect(() => {
    void reload();
    return () => {
      for (const url of urls.current) URL.revokeObjectURL(url);
      store.close();
    };
  }, [reload, store]);

  const run = async (fn: () => Promise<Notice | null>) => {
    try {
      const next = await fn();
      if (next) setNotice(next);
    } catch {
      setNotice({ tone: "error", text: t("failed") });
    }
    await reload();
  };

  const exportAll = () =>
    run(async () => {
      setBusy(true);
      try {
        const all = await store.getAll();
        const texts = await socialFileTexts(all, Date.now());
        const { downloadBlob } = await import("@musterli/exporters");
        const now = new Date();
        texts.forEach((text, i) =>
          downloadBlob(
            new Blob([text], { type: "application/json" }),
            socialFileName(now, i, texts.length),
          ),
        );
        return { tone: "info", text: t("exported", { count: all.length }) };
      } finally {
        setBusy(false);
      }
    });

  const importFile = (file: File) =>
    run(async () => {
      setBusy(true);
      try {
        const parsed = await readSocialFile(file);
        if (!parsed.ok) return { tone: "error", text: t(`importErrors.${parsed.error}`) };
        const outcome = await store.importDesigns(parsed.designs);
        const parts = [t("imported", { added: outcome.added.length })];
        if (outcome.duplicates > 0)
          parts.push(t("importDuplicates", { count: outcome.duplicates }));
        if (parsed.skipped.length > 0)
          parts.push(t("importSkipped", { count: parsed.skipped.length }));
        return { tone: "info", text: parts.join(" ") };
      } finally {
        setBusy(false);
        if (fileRef.current) fileRef.current.value = "";
      }
    });

  return (
    <section
      aria-labelledby={`${ids}-title`}
      className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 pb-12"
      data-testid="social-designs"
    >
      <div className="flex flex-wrap items-end justify-between gap-3 border-t border-border pt-8">
        <div className="flex flex-col gap-1">
          <h2 id={`${ids}-title`} className="text-xl font-semibold tracking-tight">
            {t("title")}
          </h2>
          <p className="text-sm text-muted-foreground">{t("intro")}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={OUTLINE}
            onClick={() => void exportAll()}
            disabled={busy || !items || items.length === 0}
            data-testid="social-designs-export"
          >
            {t("exportAll")}
          </button>
          <button
            type="button"
            className={OUTLINE}
            onClick={() => fileRef.current?.click()}
            disabled={busy || unavailable}
            data-testid="social-designs-import"
          >
            {t("import")}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept=".json,application/json"
            className="sr-only"
            tabIndex={-1}
            aria-hidden="true"
            data-testid="social-designs-file"
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) void importFile(file);
            }}
          />
        </div>
      </div>

      <div
        role="status"
        aria-live="polite"
        className="empty:hidden"
        data-testid="social-designs-message"
      >
        {notice && (
          <div
            className={cn(
              "flex flex-wrap items-center gap-3 rounded-lg border border-border px-4 py-3 text-sm",
              notice.tone === "error" ? "bg-destructive/10" : "bg-muted",
            )}
          >
            <p className="min-w-0 flex-1">{notice.text}</p>
            {notice.undo && (
              <button
                type="button"
                className={OUTLINE}
                onClick={() => {
                  const record = notice.undo;
                  if (!record) return;
                  setNotice(null);
                  void run(async () => {
                    await store.restore(record);
                    return null;
                  });
                }}
              >
                {t("undo")}
              </button>
            )}
            <button type="button" className={GHOST} onClick={() => setNotice(null)}>
              {t("dismiss")}
            </button>
          </div>
        )}
      </div>

      {unavailable && (
        <p role="alert" className="rounded-lg bg-destructive/10 px-4 py-3">
          {t("unavailable")}
        </p>
      )}
      {items && items.length === 0 && (
        <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed border-border px-5 py-6">
          <p className="flex items-center gap-2 text-muted-foreground">
            <MegaphoneIcon aria-hidden="true" className="size-4 text-link" />
            {t("empty")}
          </p>
          <a
            href={editorHref}
            className={buttonVariants({ size: "sm", className: "rounded-full px-4" })}
          >
            {t("emptyCta")}
          </a>
        </div>
      )}
      {items && items.length > 0 && (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {items.map((d) => {
            const href = `${editorHref}${designHash(d.id)}`;
            return (
              <li
                key={d.id}
                className="flex flex-col overflow-hidden rounded-xl border border-border bg-card"
                data-testid="social-design-card"
                data-design-id={d.id}
              >
                <a
                  href={href}
                  tabIndex={-1}
                  aria-hidden="true"
                  className="flex aspect-[4/3] items-center justify-center bg-canvas p-2"
                >
                  {d.url ? (
                    // eslint-disable-next-line @next/next/no-img-element -- local blob URL
                    <img
                      src={d.url}
                      alt=""
                      className="size-full object-contain"
                      data-testid="social-design-thumbnail"
                    />
                  ) : (
                    <span className="text-xs text-muted-foreground">{t("noThumbnail")}</span>
                  )}
                </a>
                <div className="flex flex-1 flex-col gap-2 p-3">
                  {renaming === d.id ? (
                    <RenameForm
                      name={d.name}
                      onCancel={() => setRenaming(null)}
                      onSubmit={(name) => {
                        setRenaming(null);
                        void run(async () => {
                          await store.rename(d.id, name);
                          return null;
                        });
                      }}
                    />
                  ) : (
                    <h3
                      className="truncate font-medium"
                      title={d.name}
                      data-testid="social-design-name"
                    >
                      {d.name}
                    </h3>
                  )}
                  <p className="text-xs text-muted-foreground">
                    {t("meta", {
                      width: d.format.width,
                      height: d.format.height,
                      date: format.dateTime(d.updatedAt, {
                        dateStyle: "medium",
                        timeStyle: "short",
                      }),
                    })}
                  </p>
                  <div
                    role="group"
                    aria-label={t("actionsLabel", { name: d.name })}
                    className="mt-auto flex flex-wrap gap-1.5"
                  >
                    <a
                      href={href}
                      className={buttonVariants({ size: "sm" })}
                      aria-label={t("openLabel", { name: d.name })}
                      data-testid="social-design-open"
                    >
                      {t("open")}
                    </a>
                    <button type="button" className={OUTLINE} onClick={() => setRenaming(d.id)}>
                      {t("rename")}
                    </button>
                    <button
                      type="button"
                      className={OUTLINE}
                      onClick={() =>
                        void run(async () => {
                          await store.duplicate(d.id, t("copyName", { name: d.name }));
                          return null;
                        })
                      }
                    >
                      {t("duplicate")}
                    </button>
                    <button
                      type="button"
                      className={OUTLINE}
                      data-testid="social-design-delete"
                      onClick={() =>
                        void run(async () => {
                          const record = await store.get(d.id);
                          await store.remove(d.id);
                          return record
                            ? { tone: "info", text: t("deleted", { name: d.name }), undo: record }
                            : null;
                        })
                      }
                    >
                      {t("delete")}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function RenameForm(props: { name: string; onSubmit(name: string): void; onCancel(): void }) {
  const t = useTranslations("SocialDesigns");
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
