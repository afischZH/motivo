"use client";

/**
 * "Im Kontext ansehen" (W1-AP02): the motif as the background of a mock
 * website hero (navigation, title, text, button), so web designers judge it
 * where it will live. The text tone follows the better contrast unless the
 * user picks one, and the toolbar shows the WCAG contrast of the text on
 * the motif, measured on a small picture from the tool's own render path.
 * Generic: offered for every tool whose primary category makes backgrounds.
 */
import type { AnyToolDefinition, CanvasSize } from "@musterli/tool-registry";
import { useEffect, useState } from "react";
import { FOCUS_RING, cx } from "../controls/primitives";
import { useT } from "../i18n";
import { CONTEXT_TEXT_BOX, bestTone, contrastLevel, type ContextTone } from "./context-contrast";

/** Primary categories whose motifs sit behind website content. */
const CONTEXT_CATEGORIES: ReadonlySet<string> = new Set([
  "patterns",
  "css-patterns",
  "gradients",
  "backgrounds",
  "image-effects",
]);

export function supportsContextView(tool: AnyToolDefinition): boolean {
  return CONTEXT_CATEGORIES.has(tool.category[0]) && tool.exports.includes("png");
}

/** Width of the picture the contrast is measured on. */
const SAMPLE_WIDTH = 160;
/** Wait for edits to settle before measuring again. */
const SAMPLE_DELAY_MS = 300;

export type ContextToneChoice = "auto" | ContextTone;

export interface ContextMeasure {
  tone: ContextTone;
  ratio: number;
}

/**
 * Measures both text tones on the motif under the text block. `null` while
 * measuring or where the browser cannot (no `createImageBitmap`, a failed
 * render); the view then shows the auto tone "dark".
 */
export function useContextContrast(
  enabled: boolean,
  tool: AnyToolDefinition,
  params: Readonly<Record<string, unknown>>,
  seed: number,
  size: CanvasSize,
): Record<ContextTone, number> | null {
  const [ratios, setRatios] = useState<Record<ContextTone, number> | null>(null);
  useEffect(() => {
    if (!enabled || typeof createImageBitmap !== "function") return;
    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void (async () => {
        const { renderDesignImage } = await import("../designs/render-image");
        const out = {
          width: SAMPLE_WIDTH,
          height: Math.max(1, Math.round((SAMPLE_WIDTH * size.height) / size.width)),
        };
        const blob = await renderDesignImage(tool, params, seed, size, {
          out,
          format: "png",
          signal: controller.signal,
        });
        const bitmap = await createImageBitmap(blob);
        const canvas = document.createElement("canvas");
        canvas.width = out.width;
        canvas.height = out.height;
        const ctx = canvas.getContext("2d", { willReadFrequently: true });
        if (!ctx) return;
        ctx.drawImage(bitmap, 0, 0);
        bitmap.close();
        const box = CONTEXT_TEXT_BOX;
        const pixels = ctx.getImageData(
          Math.floor(box.x * out.width),
          Math.floor(box.y * out.height),
          Math.max(1, Math.round(box.width * out.width)),
          Math.max(1, Math.round(box.height * out.height)),
        ).data;
        if (!controller.signal.aborted) setRatios(bestTone(pixels).ratios);
      })().catch(() => {
        if (!controller.signal.aborted) setRatios(null);
      });
    }, SAMPLE_DELAY_MS);
    return () => {
      controller.abort();
      window.clearTimeout(timer);
    };
  }, [enabled, tool, params, seed, size]);
  return enabled ? ratios : null;
}

/** The tone shown: the user's choice, or the better one once measured. */
export function shownTone(
  choice: ContextToneChoice,
  ratios: Record<ContextTone, number> | null,
): ContextTone {
  if (choice !== "auto") return choice;
  return ratios && ratios.light > ratios.dark ? "light" : "dark";
}

/** The mock hero over the motif. Decorative: hidden from assistive tech. */
export function ContextLayer({ tone }: { tone: ContextTone }) {
  const t = useT();
  const light = tone === "light";
  const box = CONTEXT_TEXT_BOX;
  return (
    <div
      aria-hidden="true"
      className={cx(
        "pointer-events-none absolute inset-0 overflow-hidden [container-type:inline-size]",
        light ? "text-white" : "text-[#111]",
      )}
      data-testid="context-layer"
      data-tone={tone}
    >
      <div className="absolute inset-x-[4cqw] top-[3cqw] flex items-center justify-between">
        <span className="text-[2.2cqw] font-semibold">{t("Editor.context.sample.brand")}</span>
        <span className="flex gap-[3cqw] text-[1.6cqw] opacity-80">
          <span>{t("Editor.context.sample.nav1")}</span>
          <span>{t("Editor.context.sample.nav2")}</span>
          <span>{t("Editor.context.sample.nav3")}</span>
        </span>
      </div>
      <div
        className="absolute flex flex-col items-start gap-[1.6cqw]"
        style={{
          left: `${box.x * 100}%`,
          top: `${box.y * 100}%`,
          width: `${box.width * 100}%`,
        }}
      >
        <p className="text-[5.2cqw] leading-[1.05] font-bold tracking-tight text-balance">
          {t("Editor.context.sample.title")}
        </p>
        <p className="text-[1.9cqw] leading-snug opacity-90">{t("Editor.context.sample.text")}</p>
        <span
          className={cx(
            "mt-[0.6cqw] rounded-full px-[2.4cqw] py-[1cqw] text-[1.6cqw] font-semibold",
            light ? "bg-white text-[#111]" : "bg-[#111] text-white",
          )}
        >
          {t("Editor.context.sample.cta")}
        </span>
      </div>
    </div>
  );
}

const SEGMENT = cx(
  "inline-flex h-7 items-center rounded-[calc(var(--radius-md)-2px)] px-2 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground",
  "aria-pressed:bg-background aria-pressed:text-foreground aria-pressed:shadow-[0_1px_2px_oklch(0_0_0/0.12)]",
  FOCUS_RING,
);

/** Toolbar part: the toggle, then (while on) the text tone and the contrast. */
export function ContextControls(props: {
  on: boolean;
  onToggle(): void;
  choice: ContextToneChoice;
  onChoice(choice: ContextToneChoice): void;
  ratio: number | null;
}) {
  const t = useT();
  const level = props.ratio === null ? null : contrastLevel(props.ratio);
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <button
        type="button"
        className={cx(SEGMENT, "bg-foreground/[0.06]")}
        aria-pressed={props.on}
        onClick={props.onToggle}
        data-testid="context-toggle"
      >
        {t("Editor.context.toggle")}
      </button>
      {props.on && (
        <>
          <div
            role="group"
            aria-label={t("Editor.context.tone")}
            className="flex gap-0.5 rounded-md bg-foreground/[0.06] p-0.5"
          >
            {(["auto", "dark", "light"] as const).map((choice) => (
              <button
                key={choice}
                type="button"
                className={SEGMENT}
                aria-pressed={props.choice === choice}
                onClick={() => props.onChoice(choice)}
                data-testid={`context-tone-${choice}`}
              >
                {t(`Editor.context.tones.${choice}`)}
              </button>
            ))}
          </div>
          <output
            className={cx(
              "text-xs tabular-nums",
              level === "fail" ? "text-destructive" : "text-muted-foreground",
            )}
            aria-live="polite"
            title={t("Editor.context.contrastHint")}
            data-testid="context-contrast"
            data-level={level ?? undefined}
          >
            {props.ratio === null
              ? t("Editor.context.measuring")
              : t("Editor.context.contrast", {
                  ratio: props.ratio.toFixed(1),
                  level: t(`Editor.context.levels.${level ?? "fail"}`),
                })}
          </output>
        </>
      )}
    </div>
  );
}
