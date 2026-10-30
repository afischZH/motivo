"use client";

/**
 * Template picker of the social editor (M6-AP05): a modal dialog with the
 * template grid, filters by theme and native format, and the choice to open
 * a template in the current format (Magic Resize) instead of its own.
 *
 * The template library is its own chunk (`import("@musterli/scene/templates")`),
 * loaded when the dialog opens for the first time. Thumbnails are drawn in
 * the browser (template-thumbnails.ts), visible cards first.
 *
 * Keyboard: the grid is one tab stop; arrow keys, Home and End move between
 * the cards (roving tabindex), Enter or Space opens the template, Escape
 * closes the dialog (native `<dialog>`, which returns focus to the button
 * that opened it).
 */
import { SOCIAL_FORMATS, type SceneFormat, type TextMeasure } from "@musterli/scene";
import type { SceneTemplate } from "@musterli/scene/templates";
import { useT } from "@musterli/editor-ui";
import { useLocale, useTranslations } from "next-intl";
import {
  useCallback,
  useEffect,
  useId,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type Ref,
} from "react";

import { buttonVariants } from "@/components/ui/button";
import { templateScene } from "@/lib/social-editor/templates";
import { cn } from "@/lib/utils";

import { exportScene } from "./export";
import { INPUT, LABEL } from "./fields";
import { loadSceneFonts } from "./fonts";
import type { KonvaKit } from "./konva";
import { THUMBNAIL_EDGE, templateThumbnail, yieldToBrowser } from "./template-thumbnails";

export type TemplateLibrary = typeof import("@musterli/scene/templates");

let libraryPromise: Promise<TemplateLibrary> | null = null;

/** The template library chunk, loaded once. */
export function loadTemplateLibrary(): Promise<TemplateLibrary> {
  // Browser only: the guard keeps the templates out of the server bundle (Worker size).
  if (typeof window === "undefined") return Promise.reject(new Error("browser only"));
  libraryPromise ??= import("@musterli/scene/templates").catch((error: unknown) => {
    libraryPromise = null;
    throw error;
  });
  return libraryPromise;
}

export interface TemplatePickerHandle {
  open(): void;
}

export interface TemplatePickerProps {
  ref?: Ref<TemplatePickerHandle>;
  kit: KonvaKit | null;
  measure: TextMeasure | null;
  /** The format of the scene being edited (offered as the target format). */
  currentFormat: SceneFormat;
  /** The sample text of a template text key in the user's language. */
  text(key: string): string;
  onPick(template: SceneTemplate, library: TemplateLibrary, formatId: string | null): void;
}

type Load = "idle" | "loading" | "ready" | "failed";

export function TemplatePicker({
  ref,
  kit,
  measure,
  currentFormat,
  text,
  onPick,
}: TemplatePickerProps) {
  const t = useTranslations("SocialEditor.templates");
  const tRoot = useT();
  const id = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const gridRef = useRef<HTMLUListElement>(null);
  const [load, setLoad] = useState<Load>("idle");
  const [library, setLibrary] = useState<TemplateLibrary | null>(null);
  const [theme, setTheme] = useState("");
  const [format, setFormat] = useState("");
  const [useCurrent, setUseCurrent] = useState(false);
  const [active, setActive] = useState(0);

  // Focus goes to the active card once the dialog shows the grid.
  const focusPending = useRef(false);
  const focusTabbableCard = () =>
    gridRef.current
      ?.querySelector<HTMLButtonElement>('button[data-template][tabindex="0"]')
      ?.focus();
  const open = useCallback(() => {
    dialogRef.current?.showModal();
    if (library) {
      focusTabbableCard();
      return;
    }
    focusPending.current = true;
    setLoad("loading");
    loadTemplateLibrary().then(
      (lib) => {
        setLibrary(lib);
        setLoad("ready");
      },
      () => setLoad("failed"),
    );
  }, [library]);
  useImperativeHandle(ref, () => ({ open }), [open]);

  const templates = useMemo(
    () =>
      (library?.TEMPLATES ?? []).filter(
        (tpl) => (theme === "" || tpl.theme === theme) && (format === "" || tpl.format === format),
      ),
    [library, theme, format],
  );
  const formats = useMemo(
    () => SOCIAL_FORMATS.filter((f) => library?.TEMPLATES.some((tpl) => tpl.format === f.id)),
    [library],
  );
  const current = Math.min(active, Math.max(0, templates.length - 1));

  // Roving focus inside the grid (arrow keys, Home, End).
  const focusCard = (index: number) => {
    const buttons = gridRef.current?.querySelectorAll<HTMLButtonElement>("button[data-template]");
    buttons?.[index]?.focus();
  };

  useEffect(() => {
    if (!focusPending.current || load !== "ready") return;
    focusPending.current = false;
    focusTabbableCard();
  }, [load]);

  const onGridKey = (event: KeyboardEvent<HTMLUListElement>) => {
    const count = templates.length;
    if (count === 0) return;
    const buttons = [
      ...(gridRef.current?.querySelectorAll<HTMLButtonElement>("button[data-template]") ?? []),
    ];
    const top = buttons[0]?.offsetTop ?? 0;
    const columns = Math.max(1, buttons.filter((b) => b.offsetTop === top).length);
    const step: Record<string, number> = {
      ArrowRight: 1,
      ArrowLeft: -1,
      ArrowDown: columns,
      ArrowUp: -columns,
    };
    let next: number | null = null;
    if (event.key in step) next = current + (step[event.key] as number);
    else if (event.key === "Home") next = 0;
    else if (event.key === "End") next = count - 1;
    if (next === null) return;
    event.preventDefault();
    next = Math.max(0, Math.min(count - 1, next));
    setActive(next);
    focusCard(next);
  };

  const formatName = (formatId: string) => {
    const f = SOCIAL_FORMATS.find((x) => x.id === formatId);
    return f ? `${tRoot(`sizes.${f.id}`)} (${f.width} × ${f.height})` : formatId;
  };
  const currentLabel = currentFormat.id
    ? formatName(currentFormat.id)
    : `${currentFormat.width} × ${currentFormat.height}`;

  const pick = (template: SceneTemplate) => {
    if (!library) return;
    dialogRef.current?.close();
    onPick(template, library, useCurrent && currentFormat.id ? currentFormat.id : null);
  };

  const titleId = `${id}-title`;
  const introId = `${id}-intro`;
  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      aria-describedby={introId}
      className="m-auto flex max-h-[min(52rem,calc(100dvh-2rem))] w-[min(64rem,calc(100vw-2rem))] flex-col rounded-2xl border border-border bg-popover p-0 text-popover-foreground shadow-lg backdrop:bg-background/70 backdrop:backdrop-blur-sm [&:not([open])]:hidden"
      data-testid="template-dialog"
    >
      <div className="flex flex-col gap-3 border-b border-border p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-col gap-1">
            <h2 id={titleId} className="text-base font-semibold">
              {t("title")}
            </h2>
            <p id={introId} className="text-sm text-muted-foreground">
              {t("intro")}
            </p>
          </div>
          <button
            type="button"
            className={buttonVariants({ variant: "outline", size: "sm" })}
            onClick={() => dialogRef.current?.close()}
            data-testid="template-close"
          >
            {t("close")}
          </button>
        </div>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex min-w-40 flex-col gap-1">
            <label htmlFor={`${id}-theme`} className={LABEL}>
              {t("theme")}
            </label>
            <select
              id={`${id}-theme`}
              className={INPUT}
              value={theme}
              data-testid="template-theme"
              onChange={(event) => {
                setTheme(event.currentTarget.value);
                setActive(0);
              }}
            >
              <option value="">{t("allThemes")}</option>
              {(library?.TEMPLATE_THEMES ?? []).map((th) => (
                <option key={th} value={th}>
                  {t(`themes.${th}`)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex min-w-48 flex-col gap-1">
            <label htmlFor={`${id}-format`} className={LABEL}>
              {t("format")}
            </label>
            <select
              id={`${id}-format`}
              className={INPUT}
              value={format}
              data-testid="template-format"
              onChange={(event) => {
                setFormat(event.currentTarget.value);
                setActive(0);
              }}
            >
              <option value="">{t("allFormats")}</option>
              {formats.map((f) => (
                <option key={f.id} value={f.id}>
                  {formatName(f.id)}
                </option>
              ))}
            </select>
          </div>
          <label className="flex min-h-8 items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 accent-primary"
              checked={useCurrent}
              disabled={!currentFormat.id}
              data-testid="template-use-current"
              onChange={(event) => setUseCurrent(event.currentTarget.checked)}
            />
            {t("useCurrent", { format: currentLabel })}
          </label>
          <p className="ms-auto text-xs text-muted-foreground" aria-live="polite">
            {load === "ready" ? t("count", { count: templates.length }) : ""}
          </p>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-5">
        {load === "loading" || load === "idle" ? (
          <p className="text-sm text-muted-foreground">{t("loading")}</p>
        ) : load === "failed" ? (
          <p role="alert" className="text-sm text-destructive">
            {t("loadFailed")}
          </p>
        ) : templates.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <ul
            ref={gridRef}
            className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4"
            aria-label={t("title")}
            onKeyDown={onGridKey}
            data-testid="template-grid"
          >
            {templates.map((template, index) => (
              <li key={template.id}>
                <TemplateCard
                  template={template}
                  library={library}
                  kit={kit}
                  measure={measure}
                  text={text}
                  tabbable={index === current}
                  prefix={t("pick")}
                  details={t("details", {
                    theme: t(`themes.${template.theme}`),
                    width: SOCIAL_FORMATS.find((f) => f.id === template.format)?.width ?? 0,
                    height: SOCIAL_FORMATS.find((f) => f.id === template.format)?.height ?? 0,
                  })}
                  name={t(`names.${template.id}` as "names.launch-bold")}
                  formatLabel={tRoot(`sizes.${template.format}`)}
                  onFocus={() => setActive(index)}
                  onPick={() => pick(template)}
                />
              </li>
            ))}
          </ul>
        )}
      </div>
    </dialog>
  );
}

function TemplateCard(props: {
  template: SceneTemplate;
  library: TemplateLibrary | null;
  kit: KonvaKit | null;
  measure: TextMeasure | null;
  text(key: string): string;
  tabbable: boolean;
  /** Read before the visible name ("Open template:"). */
  prefix: string;
  /** Read after the visible text (theme and size). */
  details: string;
  name: string;
  formatLabel: string;
  onFocus(): void;
  onPick(): void;
}) {
  const t = useTranslations("SocialEditor.templates");
  const locale = useLocale();
  const ref = useRef<HTMLButtonElement>(null);
  const [src, setSrc] = useState<string | null | undefined>(undefined);
  const { template, library, kit, measure, text } = props;
  const format = SOCIAL_FORMATS.find((f) => f.id === template.format);
  const ratio = format ? `${format.width} / ${format.height}` : "1 / 1";

  // Drawn once the card scrolls into view (the queue keeps one at a time).
  useEffect(() => {
    const el = ref.current;
    if (!el || !library || !kit || !measure) return;
    let active = true;
    const request = () => {
      void templateThumbnail(`${locale}:${template.id}`, async () => {
        const raw = library.instantiateTemplate(template, {
          text,
          background: () => null,
        });
        await loadSceneFonts(raw);
        // Each step gets its own task, so none of them blocks input for long.
        await yieldToBrowser();
        const scene = templateScene(library.instantiateTemplate, template, text, measure);
        await yieldToBrowser();
        const scale = THUMBNAIL_EDGE / Math.max(scene.format.width, scene.format.height);
        return exportScene(kit, scene, { format: "webp", scale, quality: 0.8 });
      }).then((url) => active && setSrc(url));
    };
    if (typeof IntersectionObserver === "undefined") {
      request();
      return () => {
        active = false;
      };
    }
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        observer.disconnect();
        request();
      }
    });
    observer.observe(el);
    return () => {
      active = false;
      observer.disconnect();
    };
  }, [library, kit, measure, template, text, locale]);

  return (
    <button
      ref={ref}
      type="button"
      tabIndex={props.tabbable ? 0 : -1}
      data-template={template.id}
      data-thumbnail={src === undefined ? "pending" : src === null ? "failed" : "ready"}
      onFocus={props.onFocus}
      onClick={props.onPick}
      className="group flex w-full flex-col gap-2 rounded-xl border border-border bg-card p-2 text-start transition-colors hover:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      <span className="flex aspect-square w-full items-center justify-center overflow-hidden rounded-lg bg-canvas">
        <span
          className={cn("block max-h-full max-w-full", src ? "" : "animate-pulse bg-muted")}
          style={{
            aspectRatio: ratio,
            width: format && format.width < format.height ? "auto" : "100%",
            height: format && format.width < format.height ? "100%" : "auto",
          }}
        >
          {src ? (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL drawn in this tab
            <img src={src} alt="" className="block size-full rounded-sm object-contain" />
          ) : src === null ? (
            <span className="flex size-full items-center justify-center text-xs text-muted-foreground">
              {t("previewFailed")}
            </span>
          ) : null}
        </span>
      </span>
      <span className="flex flex-col px-1">
        <span className="sr-only">{props.prefix} </span>
        <span className="truncate text-sm font-medium">{props.name}</span>
        <span className="truncate text-xs text-muted-foreground">{props.formatLabel}</span>
        <span className="sr-only">, {props.details}</span>
      </span>
    </button>
  );
}
