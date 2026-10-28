"use client";

/**
 * Brand Kit (M3-AP05): palettes (2 to 10 colours, one default), logos and
 * own SVG shapes, kept in this browser (IndexedDB). Uploads run through the
 * editor's pipeline (magic bytes, sanitizer in a worker, raster re-encoded
 * in a worker), loaded on the first upload. Export and import as a
 * `motivo-brandkit` file; the import is validated in a worker. Nothing is
 * ever sent to a server.
 */
import {
  BRAND_LOGOS_MAX,
  BRAND_PALETTE_MAX,
  BRAND_PALETTE_MIN,
  BRAND_SHAPES_MAX,
  StorageError,
  brandKitFileName,
  brandKitFileTexts,
  createBrandKitStore,
  normalizeBrandHex,
  readBrandKitFile,
  svgDataUrl,
  type BrandAsset,
  type BrandAssetKind,
  type BrandKitStore,
  type BrandPalette,
  type SkippedBrandEntry,
  type StorageErrorCode,
} from "@motivo/editor-ui/brand-kit";
import { formatOklch } from "@motivo/engine";
import { useTranslations } from "next-intl";
import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type LoadState = "loading" | "ready" | "unavailable";

interface Message {
  tone: "info" | "error";
  text: string;
  details?: string[];
  /** Puts back what was just deleted. */
  undo?: () => Promise<string>;
}

type Upload = typeof import("@motivo/editor-ui/brand-kit/upload");
type UploadServices = {
  crop: ReturnType<Upload["browserImageInputServices"]>;
  svg: ReturnType<Upload["browserSvgSanitizer"]>;
};

const OUTLINE = buttonVariants({ variant: "outline", size: "sm" });
const GHOST = buttonVariants({ variant: "ghost", size: "sm" });
const PRIMARY = buttonVariants({ size: "sm" });
const INPUT =
  "h-9 w-full rounded-md border border-input bg-background px-3 text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none aria-invalid:border-destructive";

/** Starting colours of a new palette: neutral, easy to overwrite. */
const NEW_PALETTE_COLORS = ["#1e293b", "#3b82f6", "#f59e0b"];

const ASSET_ACCEPT: Record<BrandAssetKind, string> = {
  logo: "image/svg+xml,.svg,image/png,image/jpeg,image/webp",
  shape: "image/svg+xml,.svg",
};

function storageKey(error: unknown): `errors.${StorageErrorCode}` {
  return `errors.${error instanceof StorageError ? error.code : "failed"}`;
}

/** File name without its extension, as the default asset name. */
function baseName(name: string): string {
  const dot = name.lastIndexOf(".");
  return (dot > 0 ? name.slice(0, dot) : name).slice(0, 80);
}

const imageUrl = (asset: BrandAsset) =>
  asset.image.kind === "svg" ? svgDataUrl(asset.image.svg) : asset.image.href;

export function BrandKit() {
  const t = useTranslations("BrandKit");
  const ids = useId();
  const [store] = useState<BrandKitStore>(() => createBrandKitStore());
  const [state, setState] = useState<LoadState>("loading");
  const [palettes, setPalettes] = useState<BrandPalette[]>([]);
  const [defaultId, setDefaultId] = useState<string | null>(null);
  const [assets, setAssets] = useState<BrandAsset[]>([]);
  const [message, setMessage] = useState<Message | null>(null);
  /** `"new"`, the id of the palette being edited, or nothing. */
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<"import" | "export" | BrandAssetKind | null>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const services = useRef<UploadServices | null>(null);

  const showError = useCallback(
    (error: unknown) => {
      if (error instanceof StorageError && error.code === "unavailable") {
        setState("unavailable");
        return;
      }
      setMessage({ tone: "error", text: t(storageKey(error)) });
      setState((s) => (s === "loading" ? "unavailable" : s));
    },
    [t],
  );

  const load = useCallback(async () => {
    const [p, a] = await Promise.all([store.loadPalettes(), store.listAssets()]);
    setPalettes(p.palettes);
    setDefaultId(p.defaultId);
    setAssets(a);
    setState("ready");
  }, [store]);

  useEffect(() => {
    let active = true;
    Promise.all([store.loadPalettes(), store.listAssets()]).then(
      ([p, a]) => {
        if (!active) return;
        setPalettes(p.palettes);
        setDefaultId(p.defaultId);
        setAssets(a);
        setState("ready");
      },
      (error: unknown) => {
        if (active) showError(error);
      },
    );
    return () => {
      active = false;
      store.close();
      services.current?.crop.dispose();
      services.current?.svg.dispose();
    };
  }, [store, showError]);

  /** Runs a change, shows its message (or the storage error) and reloads. */
  const run = async (action: () => Promise<Message | null>) => {
    try {
      const next = await action();
      if (next) setMessage(next);
    } catch (error) {
      setMessage({ tone: "error", text: t(storageKey(error)) });
    }
    try {
      await load();
    } catch (error) {
      showError(error);
    }
  };

  const paletteName = (p: Pick<BrandPalette, "name">) => p.name || t("palettes.unnamed");
  const assetName = (a: Pick<BrandAsset, "name">) => a.name || t("assets.unnamed");

  const savePalette = (id: string | null, name: string, colors: string[]) =>
    run(async () => {
      const input = { name, colors };
      const saved = id ? await store.updatePalette(id, input) : await store.createPalette(input);
      setEditing(null);
      return { tone: "info", text: t("palettes.saved", { name: paletteName(saved) }) };
    });

  const removePalette = (p: BrandPalette) =>
    run(async () => {
      const wasDefault = p.id === defaultId;
      await store.removePalette(p.id);
      headingRef.current?.focus();
      return {
        tone: "info",
        text: t("palettes.deleted", { name: paletteName(p) }),
        undo: async () => {
          await store.restorePalette(p, wasDefault);
          return t("palettes.restored", { name: paletteName(p) });
        },
      };
    });

  const makeDefault = (p: BrandPalette) =>
    run(async () => {
      await store.setDefaultPalette(p.id);
      return { tone: "info", text: t("palettes.defaultSet", { name: paletteName(p) }) };
    });

  const uploadServices = async (): Promise<UploadServices & { mod: Upload }> => {
    const mod = await import("@motivo/editor-ui/brand-kit/upload");
    services.current ??= {
      crop: mod.browserImageInputServices(),
      svg: mod.browserSvgSanitizer(),
    };
    return { ...services.current, mod };
  };

  const addAsset = (kind: BrandAssetKind, file: File) =>
    run(async () => {
      setBusy(kind);
      try {
        const { mod, crop, svg } = await uploadServices();
        const result = await mod.prepareBrandImage(file, kind, { crop: crop.crop, svg });
        if (!result.ok) {
          return result.error === "aborted"
            ? null
            : { tone: "error", text: t(`assets.errors.${result.error}`) };
        }
        const added = await store.addAsset({
          kind,
          name: baseName(file.name),
          image: result.image,
        });
        const lines = [
          t(kind === "logo" ? "assets.logos.added" : "assets.shapes.added", {
            name: assetName(added),
          }),
        ];
        if (result.removed > 0) lines.push(t("assets.removedParts", { count: result.removed }));
        return { tone: "info", text: lines.join(" ") };
      } finally {
        setBusy(null);
      }
    });

  const removeAsset = (a: BrandAsset) =>
    run(async () => {
      await store.removeAsset(a.id);
      headingRef.current?.focus();
      return {
        tone: "info",
        text: t("assets.deleted", { name: assetName(a) }),
        undo: async () => {
          await store.restoreAsset(a);
          return t("assets.restored", { name: assetName(a) });
        },
      };
    });

  const exportKit = () =>
    run(async () => {
      setBusy("export");
      try {
        const kit = await store.getAll();
        if (kit.palettes.length === 0 && kit.assets.length === 0) {
          return { tone: "info", text: t("page.exportEmpty") };
        }
        // Several files when large logos make one too large to import again.
        const texts = await brandKitFileTexts(kit, Date.now());
        const { downloadBlob } = await import("@motivo/exporters");
        const date = new Date();
        texts.forEach((text, part) => {
          const blob = new Blob([text], { type: "application/json" });
          downloadBlob(blob, brandKitFileName(date, part, texts.length));
        });
        return {
          tone: "info",
          text:
            texts.length > 1
              ? t("page.exportedParts", { files: texts.length })
              : t("page.exported"),
        };
      } finally {
        setBusy(null);
      }
    });

  const skippedLine = (s: SkippedBrandEntry) => {
    const reason = t(`page.skipReasons.${s.reason}`);
    if (s.name === undefined) return t("page.skippedUnnamed", { index: s.index + 1, reason });
    return s.type === "palette"
      ? t("page.skippedPalette", { name: s.name, reason })
      : t("page.skippedAsset", { name: s.name, reason });
  };

  const importKit = (file: File) =>
    run(async () => {
      setBusy("import");
      try {
        const parsed = await readBrandKitFile(file);
        if (!parsed.ok) return { tone: "error", text: t(`page.importErrors.${parsed.error}`) };
        const outcome = await store.importBrandKit(parsed);
        const lines = [t("page.imported", { palettes: outcome.palettes, assets: outcome.assets })];
        if (outcome.duplicates > 0) {
          lines.push(t("page.importDuplicates", { count: outcome.duplicates }));
        }
        if (outcome.overLimit > 0) {
          lines.push(t("page.importOverLimit", { count: outcome.overLimit }));
        }
        if (parsed.removed > 0) lines.push(t("page.importRemoved", { count: parsed.removed }));
        if (parsed.skipped.length > 0) {
          lines.push(t("page.importSkipped", { count: parsed.skipped.length }));
        }
        const nothing = outcome.palettes + outcome.assets === 0;
        return {
          tone: nothing && parsed.skipped.length > 0 ? "error" : "info",
          text: lines.join(" "),
          ...(parsed.skipped.length > 0 ? { details: parsed.skipped.map(skippedLine) } : {}),
        };
      } finally {
        setBusy(null);
        if (fileRef.current) fileRef.current.value = "";
      }
    });

  const ready = state === "ready";
  const logos = assets.filter((a) => a.kind === "logo");
  const shapes = assets.filter((a) => a.kind === "shape");

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8 sm:py-12">
      <header className="flex flex-col gap-3">
        <h1
          ref={headingRef}
          tabIndex={-1}
          className="text-3xl font-semibold tracking-tight focus:outline-none"
        >
          {t("page.title")}
        </h1>
        <p className="max-w-prose text-lg text-muted-foreground">{t("page.intro")}</p>
        <p className="max-w-prose text-sm text-muted-foreground" data-testid="brand-storage-hint">
          {t("page.storageHint")}
        </p>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className={OUTLINE}
            onClick={() => void exportKit()}
            disabled={!ready || busy !== null}
            data-testid="brand-export"
          >
            <DownloadGlyph />
            {t("page.export")}
          </button>
          <button
            type="button"
            className={OUTLINE}
            onClick={() => fileRef.current?.click()}
            disabled={!ready || busy !== null}
            data-testid="brand-import"
          >
            <UploadGlyph />
            {busy === "import" ? t("page.importing") : t("page.import")}
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
              if (file) void importKit(file);
            }}
            data-testid="brand-file"
          />
        </div>
      </header>

      <div role="status" aria-live="polite" className="empty:hidden" data-testid="brand-message">
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
                  const undo = message.undo;
                  if (undo) void run(async () => ({ tone: "info", text: await undo() }));
                }}
                data-testid="brand-undo"
              >
                {t("page.undo")}
              </button>
            )}
            <button
              type="button"
              className={GHOST}
              onClick={() => setMessage(null)}
              aria-label={t("page.dismiss")}
            >
              <CloseGlyph />
            </button>
          </div>
        )}
      </div>

      {state === "loading" && <p className="text-muted-foreground">{t("page.loading")}</p>}
      {state === "unavailable" && (
        <p
          role="alert"
          className="rounded-lg bg-destructive/10 px-4 py-3"
          data-testid="brand-unavailable"
        >
          {t("errors.unavailable")}
        </p>
      )}

      {ready && (
        <>
          <section
            aria-labelledby={`${ids}-palettes`}
            className="flex flex-col gap-4"
            data-testid="brand-palettes"
          >
            <div className="flex flex-wrap items-end justify-between gap-3">
              <div className="flex flex-col gap-1">
                <h2 id={`${ids}-palettes`} className="text-xl font-semibold">
                  {t("palettes.title")}
                </h2>
                <p className="text-sm text-muted-foreground">{t("palettes.hint")}</p>
              </div>
              <button
                type="button"
                className={PRIMARY}
                onClick={() => setEditing("new")}
                disabled={editing !== null}
                data-testid="palette-new"
              >
                <PlusGlyph />
                {t("palettes.add")}
              </button>
            </div>
            {editing === "new" && (
              <PaletteForm
                title={t("palettes.form.createTitle")}
                initialName={t("palettes.newName", { index: palettes.length + 1 })}
                initialColors={NEW_PALETTE_COLORS}
                onCancel={() => setEditing(null)}
                onSave={(name, colors) => void savePalette(null, name, colors)}
              />
            )}
            {palettes.length === 0 && editing !== "new" ? (
              <p className="text-muted-foreground" data-testid="palettes-empty">
                {t("palettes.empty")}
              </p>
            ) : (
              <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
                {palettes.map((p) =>
                  editing === p.id ? (
                    <li key={p.id} className="md:col-span-2">
                      <PaletteForm
                        title={t("palettes.form.editTitle")}
                        initialName={p.name}
                        initialColors={p.colors}
                        onCancel={() => setEditing(null)}
                        onSave={(name, colors) => void savePalette(p.id, name, colors)}
                      />
                    </li>
                  ) : (
                    <PaletteCard
                      key={p.id}
                      palette={p}
                      name={paletteName(p)}
                      isDefault={p.id === defaultId}
                      disabled={editing !== null}
                      onEdit={() => setEditing(p.id)}
                      onDefault={() => void makeDefault(p)}
                      onDelete={() => void removePalette(p)}
                    />
                  ),
                )}
              </ul>
            )}
          </section>

          <AssetSection
            kind="logo"
            title={t("assets.logos.title")}
            hint={t("assets.logos.hint")}
            empty={t("assets.logos.empty")}
            addLabel={t("assets.logos.add")}
            assets={logos}
            full={logos.length >= BRAND_LOGOS_MAX}
            busy={busy}
            nameOf={assetName}
            onAdd={(file) => void addAsset("logo", file)}
            onDelete={(a) => void removeAsset(a)}
          />
          <AssetSection
            kind="shape"
            title={t("assets.shapes.title")}
            hint={t("assets.shapes.hint")}
            empty={t("assets.shapes.empty")}
            addLabel={t("assets.shapes.add")}
            assets={shapes}
            full={shapes.length >= BRAND_SHAPES_MAX}
            busy={busy}
            nameOf={assetName}
            onAdd={(file) => void addAsset("shape", file)}
            onDelete={(a) => void removeAsset(a)}
          />
          <p className="text-sm text-muted-foreground">{t("assets.usage")}</p>
        </>
      )}
    </div>
  );
}

function PaletteCard(props: {
  palette: BrandPalette;
  name: string;
  isDefault: boolean;
  disabled: boolean;
  onEdit(): void;
  onDefault(): void;
  onDelete(): void;
}) {
  const t = useTranslations("BrandKit.palettes");
  const { palette, name } = props;
  return (
    <li
      className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4"
      data-testid="palette-card"
      data-palette-id={palette.id}
    >
      <div className="flex min-w-0 items-center gap-2">
        <h3 className="min-w-0 truncate font-medium" title={name} data-testid="palette-name">
          {name}
        </h3>
        {props.isDefault && (
          <span
            className="shrink-0 rounded-full border border-border px-2 py-0.5 text-xs text-muted-foreground"
            data-testid="palette-default"
          >
            {t("defaultBadge")}
          </span>
        )}
      </div>
      <ul
        className="flex h-10 overflow-hidden rounded-md border border-border"
        aria-label={t("colorsLabel", { name })}
      >
        {palette.colors.map((color, i) => (
          <li
            key={i}
            className="flex-1"
            // The swatch shows user content, not a UI token.
            style={{ backgroundColor: color }}
            title={color}
            data-color={color}
          >
            <span className="sr-only">{color}</span>
          </li>
        ))}
      </ul>
      <div role="group" aria-label={name} className="flex flex-wrap gap-1.5">
        <button
          type="button"
          className={OUTLINE}
          onClick={props.onEdit}
          disabled={props.disabled}
          aria-label={t("editLabel", { name })}
          data-testid="palette-edit"
        >
          {t("edit")}
        </button>
        {!props.isDefault && (
          <button
            type="button"
            className={OUTLINE}
            onClick={props.onDefault}
            aria-label={t("makeDefaultLabel", { name })}
            data-testid="palette-make-default"
          >
            {t("makeDefault")}
          </button>
        )}
        <button
          type="button"
          className={OUTLINE}
          onClick={props.onDelete}
          aria-label={t("deleteLabel", { name })}
          data-testid="palette-delete"
        >
          {t("delete")}
        </button>
      </div>
    </li>
  );
}

interface ColorRow {
  /** Stable key while rows move. */
  key: number;
  /** What the hex field shows (may be invalid while typing). */
  text: string;
}

function PaletteForm(props: {
  title: string;
  initialName: string;
  initialColors: readonly string[];
  onSave(name: string, colors: string[]): void;
  onCancel(): void;
}) {
  const t = useTranslations("BrandKit.palettes.form");
  const ids = useId();
  const nextKey = useRef(props.initialColors.length);
  const [name, setName] = useState(props.initialName);
  const [rows, setRows] = useState<ColorRow[]>(() =>
    props.initialColors.map((text, key) => ({ key, text })),
  );
  const [invalid, setInvalid] = useState<number | null>(null);
  const [announcement, setAnnouncement] = useState("");
  // Where the focus goes once the rows re-rendered (a ref, so no extra render).
  const pendingFocus = useRef<{ index: number; action: string } | null>(null);
  const setFocus = (next: { index: number; action: string }) => {
    pendingFocus.current = next;
  };
  const listRef = useRef<HTMLOListElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => nameRef.current?.focus(), []);

  // Keeps the focus on the button that was used after a row moved or vanished.
  useEffect(() => {
    const focus = pendingFocus.current;
    if (!focus) return;
    pendingFocus.current = null;
    const row = listRef.current?.children[focus.index];
    const target =
      row?.querySelector<HTMLElement>(`[data-action="${focus.action}"]:not(:disabled)`) ??
      row?.querySelector<HTMLElement>("input[type=text]");
    target?.focus();
  }, [rows]);

  const setText = (index: number, text: string) => {
    setRows((r) => r.map((row, i) => (i === index ? { ...row, text } : row)));
    if (invalid === index && normalizeBrandHex(text)) setInvalid(null);
  };

  const move = (from: number, to: number, action: string) => {
    setRows((r) => {
      const next = [...r];
      const [row] = next.splice(from, 1);
      if (row) next.splice(to, 0, row);
      return next;
    });
    setAnnouncement(t("moved", { index: from + 1, position: to + 1 }));
    setFocus({ index: to, action });
  };

  const remove = (index: number) => {
    setRows((r) => r.filter((_, i) => i !== index));
    setFocus({ index: Math.min(index, rows.length - 2), action: "remove" });
  };

  const add = () => {
    const last = rows.at(-1)?.text;
    const text = (last && normalizeBrandHex(last)) || "#000000";
    setRows((r) => [...r, { key: nextKey.current++, text }]);
    setFocus({ index: rows.length, action: "hex" });
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const colors: string[] = [];
    for (const [i, row] of rows.entries()) {
      const hex = normalizeBrandHex(row.text);
      if (!hex) {
        setInvalid(i);
        listRef.current?.children[i]?.querySelector<HTMLElement>("input[type=text]")?.focus();
        return;
      }
      colors.push(hex);
    }
    props.onSave(name, colors);
  };

  return (
    <form
      onSubmit={submit}
      onKeyDown={(event) => {
        if (event.key === "Escape") {
          event.preventDefault();
          props.onCancel();
        }
      }}
      aria-labelledby={`${ids}-title`}
      className="flex flex-col gap-4 rounded-xl border border-border bg-card p-4"
      data-testid="palette-form"
    >
      <h3 id={`${ids}-title`} className="font-semibold">
        {props.title}
      </h3>
      <div className="flex max-w-sm flex-col gap-1.5">
        <label htmlFor={`${ids}-name`} className="text-sm font-medium">
          {t("name")}
        </label>
        <input
          ref={nameRef}
          id={`${ids}-name`}
          value={name}
          maxLength={80}
          onChange={(event) => setName(event.currentTarget.value)}
          className={INPUT}
          data-testid="palette-form-name"
        />
      </div>
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-2 text-sm font-medium">
          {t("colors")}{" "}
          <span className="font-normal text-muted-foreground">
            ({t("count", { count: rows.length })})
          </span>
        </legend>
        <ol ref={listRef} className="flex flex-col gap-2">
          {rows.map((row, i) => {
            const hex = normalizeBrandHex(row.text);
            const errorId = `${ids}-err-${row.key}`;
            return (
              <li
                key={row.key}
                className="flex flex-wrap items-center gap-2"
                data-testid="palette-form-row"
              >
                <input
                  type="color"
                  value={hex ?? "#000000"}
                  onChange={(event) => setText(i, event.currentTarget.value)}
                  aria-label={t("picker", { index: i + 1 })}
                  className="h-9 w-12 shrink-0 cursor-pointer rounded-md border border-input bg-background focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                />
                <input
                  type="text"
                  value={row.text}
                  spellCheck={false}
                  autoComplete="off"
                  maxLength={7}
                  onChange={(event) => setText(i, event.currentTarget.value)}
                  aria-label={t("hex", { index: i + 1 })}
                  aria-invalid={invalid === i || undefined}
                  aria-describedby={invalid === i ? errorId : undefined}
                  className={cn(INPUT, "w-28 font-mono")}
                  data-action="hex"
                  data-testid="palette-form-hex"
                />
                <span className="min-w-0 flex-[1_1_8rem] truncate font-mono text-xs text-muted-foreground">
                  {hex ? formatOklch(hex) : ""}
                </span>
                <span className="flex gap-1">
                  <button
                    type="button"
                    className={GHOST}
                    onClick={() => move(i, i - 1, "up")}
                    disabled={i === 0}
                    aria-label={t("moveUp", { index: i + 1 })}
                    title={t("moveUp", { index: i + 1 })}
                    data-action="up"
                  >
                    <ChevronGlyph dir="up" />
                  </button>
                  <button
                    type="button"
                    className={GHOST}
                    onClick={() => move(i, i + 1, "down")}
                    disabled={i === rows.length - 1}
                    aria-label={t("moveDown", { index: i + 1 })}
                    title={t("moveDown", { index: i + 1 })}
                    data-action="down"
                  >
                    <ChevronGlyph dir="down" />
                  </button>
                  <button
                    type="button"
                    className={GHOST}
                    onClick={() => remove(i)}
                    disabled={rows.length <= BRAND_PALETTE_MIN}
                    aria-label={t("remove", { index: i + 1 })}
                    title={t("remove", { index: i + 1 })}
                    data-action="remove"
                  >
                    <CloseGlyph />
                  </button>
                </span>
                {invalid === i && (
                  <p id={errorId} role="alert" className="w-full text-sm text-destructive">
                    {t("invalidHex", { index: i + 1 })}
                  </p>
                )}
              </li>
            );
          })}
        </ol>
        <p role="status" aria-live="polite" className="sr-only">
          {announcement}
        </p>
        <div>
          <button
            type="button"
            className={OUTLINE}
            onClick={add}
            disabled={rows.length >= BRAND_PALETTE_MAX}
            data-testid="palette-form-add"
          >
            <PlusGlyph />
            {t("addColor")}
          </button>
        </div>
      </fieldset>
      <div className="flex flex-wrap gap-2">
        <button type="submit" className={PRIMARY} data-testid="palette-form-save">
          {t("save")}
        </button>
        <button type="button" className={GHOST} onClick={props.onCancel}>
          {t("cancel")}
        </button>
      </div>
    </form>
  );
}

function AssetSection(props: {
  kind: BrandAssetKind;
  title: string;
  hint: string;
  empty: string;
  addLabel: string;
  assets: BrandAsset[];
  full: boolean;
  busy: string | null;
  nameOf(asset: BrandAsset): string;
  onAdd(file: File): void;
  onDelete(asset: BrandAsset): void;
}) {
  const t = useTranslations("BrandKit.assets");
  const ids = useId();
  const adding = props.busy === props.kind;
  return (
    <section
      aria-labelledby={`${ids}-title`}
      className="flex flex-col gap-4"
      data-testid={`brand-${props.kind}s`}
    >
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-col gap-1">
          <h2 id={`${ids}-title`} className="text-xl font-semibold">
            {props.title}
          </h2>
          <p id={`${ids}-hint`} className="max-w-prose text-sm text-muted-foreground">
            {props.hint}
          </p>
        </div>
        <div>
          <input
            id={`${ids}-file`}
            type="file"
            accept={ASSET_ACCEPT[props.kind]}
            className="peer sr-only"
            aria-describedby={`${ids}-hint`}
            disabled={props.busy !== null || props.full}
            onChange={(event) => {
              const file = event.currentTarget.files?.[0];
              if (file) props.onAdd(file);
              event.currentTarget.value = "";
            }}
            data-testid={`${props.kind}-file`}
          />
          <label
            htmlFor={`${ids}-file`}
            className={cn(
              OUTLINE,
              "cursor-pointer peer-focus-visible:border-ring peer-focus-visible:ring-[3px] peer-focus-visible:ring-ring/50 peer-disabled:cursor-not-allowed peer-disabled:opacity-50",
            )}
          >
            <PlusGlyph />
            {adding ? t("adding") : props.addLabel}
          </label>
        </div>
      </div>
      {props.assets.length === 0 ? (
        <p className="text-muted-foreground">{props.empty}</p>
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          {props.assets.map((asset) => {
            const name = props.nameOf(asset);
            return (
              <li
                key={asset.id}
                className="flex flex-col overflow-hidden rounded-xl border border-border bg-card"
                data-testid={`${props.kind}-card`}
              >
                <div className="flex aspect-square items-center justify-center bg-canvas p-3">
                  {/* eslint-disable-next-line @next/next/no-img-element -- local data URL, user content only via <img> */}
                  <img
                    src={imageUrl(asset)}
                    alt={t("previewAlt", { name })}
                    className="max-h-full max-w-full object-contain"
                    data-testid={`${props.kind}-image`}
                  />
                </div>
                <div className="flex items-center gap-1 p-2">
                  <p className="min-w-0 flex-1 truncate text-sm" title={name}>
                    {name}
                  </p>
                  <button
                    type="button"
                    className={GHOST}
                    onClick={() => props.onDelete(asset)}
                    aria-label={t("deleteLabel", { name })}
                    title={t("delete")}
                    data-testid={`${props.kind}-delete`}
                  >
                    <TrashGlyph />
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
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

const PlusGlyph = () => (
  <Glyph>
    <path d="M12 5v14M5 12h14" />
  </Glyph>
);

const TrashGlyph = () => (
  <Glyph>
    <path d="M3 6h18" />
    <path d="M8 6V4h8v2" />
    <path d="M19 6l-1 14H6L5 6" />
  </Glyph>
);

const ChevronGlyph = ({ dir }: { dir: "up" | "down" }) => (
  <Glyph>
    <path d={dir === "up" ? "m18 15-6-6-6 6" : "m6 9 6 6 6-6"} />
  </Glyph>
);
