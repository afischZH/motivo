"use client";

/**
 * Background and scene colours. The background is a design of any picture
 * tool: the tool is picked from a list, its params are the generic controls
 * of the tool editor (`ControlPanel` of `@musterli/editor-ui`), Space rolls a
 * new variant. The scene palette feeds the colour slots (brand-1 ...) of
 * texts and shapes; a brand kit palette can replace it.
 */
import { ControlPanel } from "@musterli/editor-ui";
import type { BrandPalette } from "@musterli/storage";
import type { AnyToolDefinition } from "@musterli/tool-registry";
import type { BackgroundLayer, Scene } from "@musterli/scene";
import { DicesIcon, PaletteIcon } from "lucide-react";
import { useTranslations } from "next-intl";
import { useId } from "react";

import { buttonVariants } from "@/components/ui/button";

import { INPUT, LABEL } from "./fields";
import { Section } from "./inspector";

const OUTLINE = buttonVariants({ variant: "outline", size: "sm" });

export interface BackgroundPanelProps {
  scene: Scene;
  layer: BackgroundLayer | null;
  tool: AnyToolDefinition | undefined;
  tools: readonly { id: string; name: string }[];
  locks: ReadonlySet<string>;
  brandPalettes: readonly BrandPalette[];
  onTool(toolId: string): void;
  onParam(key: string, value: unknown): void;
  onCommit(): void;
  onVariant(): void;
  onToggleLock(key: string): void;
  onApplyPalette(): void;
  onPalette(palette: string[], key: string): void;
}

export function BackgroundPanel(props: BackgroundPanelProps) {
  const t = useTranslations("SocialEditor.background");
  const selectId = useId();
  const { layer, tool } = props;
  return (
    <div className="flex flex-col gap-5" data-testid="background-panel">
      <Section title={t("title")}>
        <div className="flex flex-col gap-1">
          <label htmlFor={selectId} className={LABEL}>
            {t("tool")}
          </label>
          <select
            id={selectId}
            className={INPUT}
            value={layer?.toolId ?? ""}
            data-testid="background-tool"
            onChange={(event) => props.onTool(event.currentTarget.value)}
          >
            {props.tools.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            className={OUTLINE}
            onClick={props.onVariant}
            disabled={!layer}
            data-testid="background-variant"
            aria-keyshortcuts="Space"
          >
            <DicesIcon aria-hidden="true" />
            {t("variant")}
          </button>
          <button
            type="button"
            className={OUTLINE}
            onClick={props.onApplyPalette}
            disabled={!layer}
            data-testid="background-palette"
          >
            <PaletteIcon aria-hidden="true" />
            {t("applyPalette")}
          </button>
        </div>
        <p className="text-xs text-muted-foreground">{t("variantHint")}</p>
        {layer && tool && (
          <ControlPanel
            tool={tool}
            params={layer.params}
            locks={props.locks}
            onChange={props.onParam}
            onCommit={props.onCommit}
            onToggleLock={props.onToggleLock}
          />
        )}
      </Section>
      <PaletteSection {...props} />
    </div>
  );
}

function PaletteSection(props: BackgroundPanelProps) {
  const t = useTranslations("SocialEditor.palette");
  const selectId = useId();
  const { palette } = props.scene;
  return (
    <Section title={t("title")} testId="scene-palette">
      <p className="text-xs text-muted-foreground">{t("hint")}</p>
      <ul className="flex flex-wrap gap-2">
        {palette.map((color, i) => {
          const id = `${selectId}-${i}`;
          return (
            <li key={i} className="flex flex-col items-center gap-1">
              <input
                id={id}
                type="color"
                value={color}
                className="h-8 w-10 cursor-pointer rounded-md border border-input bg-background p-0.5 focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
                onChange={(event) => {
                  const next = [...palette];
                  next[i] = event.currentTarget.value.toLowerCase();
                  props.onPalette(next, `palette-${i}`);
                }}
                onBlur={props.onCommit}
              />
              <label htmlFor={id} className="text-[10px] text-muted-foreground">
                {t("slot", { n: i + 1 })}
              </label>
            </li>
          );
        })}
      </ul>
      {props.brandPalettes.length > 0 && (
        <div className="flex flex-col gap-1">
          <label htmlFor={selectId} className={LABEL}>
            {t("brand")}
          </label>
          <select
            id={selectId}
            className={INPUT}
            value=""
            data-testid="brand-palette"
            onChange={(event) => {
              const chosen = props.brandPalettes.find((p) => p.id === event.currentTarget.value);
              if (chosen) props.onPalette([...chosen.colors], "brand-palette");
            }}
          >
            <option value="">{t("brandPick")}</option>
            {props.brandPalettes.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name || t("brandUnnamed")}
              </option>
            ))}
          </select>
        </div>
      )}
    </Section>
  );
}
