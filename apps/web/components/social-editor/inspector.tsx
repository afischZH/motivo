"use client";

/**
 * Side panel for the selected layers: position and size, Magic Resize
 * constraints, and the fields of the layer's kind (text, shape, image).
 * With several layers: align, distribute, group. Every change goes through
 * `onUpdate`, which records it in the history (merged per field while the
 * user types or drags a number).
 */
import { listShapePacks } from "@musterli/engine";
import {
  ANCHORS,
  DEFAULT_FONT_FAMILY,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  SIZE_MODES,
  TEXT_ALIGNS,
  TEXT_VALIGNS,
  TEXT_MAX_LENGTH,
  type AlignMode,
  type Layer,
  type Scene,
  type StackMove,
  type TextLayer,
} from "@musterli/scene";
import {
  AlignCenterHorizontalIcon,
  AlignCenterVerticalIcon,
  AlignEndHorizontalIcon,
  AlignEndVerticalIcon,
  AlignHorizontalSpaceAroundIcon,
  AlignStartHorizontalIcon,
  AlignStartVerticalIcon,
  AlignVerticalSpaceAroundIcon,
  ArrowDownIcon,
  ArrowUpIcon,
  CopyIcon,
  GroupIcon,
  Trash2Icon,
  UngroupIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useId, type ReactNode } from "react";

import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import { CheckField, ColorRefField, INPUT, LABEL, NumberField, SelectField } from "./fields";

export const FONT_STACKS = {
  sans: DEFAULT_FONT_FAMILY,
  serif: 'Georgia, Cambria, "Times New Roman", Times, serif',
  mono: 'ui-monospace, "SF Mono", Menlo, Consolas, "Liberation Mono", monospace',
} as const;
export type FontStackId = keyof typeof FONT_STACKS;

function fontStackOf(family: string): FontStackId {
  for (const [id, stack] of Object.entries(FONT_STACKS))
    if (stack === family) return id as FontStackId;
  if (/mono/i.test(family)) return "mono";
  if (/serif/i.test(family) && !/sans-serif/i.test(family)) return "serif";
  return "sans";
}

export interface InspectorProps {
  scene: Scene;
  layers: readonly Layer[];
  /** Id of the text field, focused by a double click on a text layer. */
  textFieldId: string;
  onUpdate(id: string, change: (layer: Layer) => Layer, key: string): void;
  onCommit(): void;
  onAlign(mode: AlignMode): void;
  onDistribute(axis: "x" | "y"): void;
  onGroup(): void;
  onUngroup(): void;
  onDuplicate(): void;
  onDelete(): void;
  onStack(move: StackMove): void;
}

const OUTLINE = buttonVariants({ variant: "outline", size: "sm" });
const ICON = buttonVariants({ variant: "outline", size: "icon-sm" });

export function Inspector(props: InspectorProps) {
  const t = useTranslations("SocialEditor.inspector");
  const { layers } = props;
  const single = layers.length === 1 ? layers[0] : undefined;
  const grouped = layers.some((l) => l.groupId !== null);
  const units = new Set(layers.map((l) => l.groupId ?? l.id)).size;

  return (
    <div className="flex flex-col gap-5" data-testid="inspector">
      <Section
        title={layers.length > 1 ? t("arrangeMany", { count: layers.length }) : t("arrange")}
      >
        <div role="group" aria-label={t("align")} className="flex flex-wrap gap-1">
          <AlignButton label={t("alignLeft")} onClick={() => props.onAlign("left")}>
            <AlignStartVerticalIcon />
          </AlignButton>
          <AlignButton label={t("alignHCenter")} onClick={() => props.onAlign("hcenter")}>
            <AlignCenterVerticalIcon />
          </AlignButton>
          <AlignButton label={t("alignRight")} onClick={() => props.onAlign("right")}>
            <AlignEndVerticalIcon />
          </AlignButton>
          <AlignButton label={t("alignTop")} onClick={() => props.onAlign("top")}>
            <AlignStartHorizontalIcon />
          </AlignButton>
          <AlignButton label={t("alignVCenter")} onClick={() => props.onAlign("vcenter")}>
            <AlignCenterHorizontalIcon />
          </AlignButton>
          <AlignButton label={t("alignBottom")} onClick={() => props.onAlign("bottom")}>
            <AlignEndHorizontalIcon />
          </AlignButton>
          <AlignButton
            label={t("distributeX")}
            disabled={units < 3}
            onClick={() => props.onDistribute("x")}
          >
            <AlignHorizontalSpaceAroundIcon />
          </AlignButton>
          <AlignButton
            label={t("distributeY")}
            disabled={units < 3}
            onClick={() => props.onDistribute("y")}
          >
            <AlignVerticalSpaceAroundIcon />
          </AlignButton>
        </div>
        <p className="text-xs text-muted-foreground">
          {units > 1 ? t("alignHintMany") : t("alignHintOne")}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {layers.length > 1 && (
            <button type="button" className={OUTLINE} onClick={props.onGroup} data-testid="group">
              <GroupIcon aria-hidden="true" />
              {t("group")}
            </button>
          )}
          {grouped && (
            <button
              type="button"
              className={OUTLINE}
              onClick={props.onUngroup}
              data-testid="ungroup"
            >
              <UngroupIcon aria-hidden="true" />
              {t("ungroup")}
            </button>
          )}
          {single && (
            <>
              <button
                type="button"
                className={ICON}
                aria-label={t("forward")}
                title={t("forward")}
                onClick={() => props.onStack("up")}
              >
                <ArrowUpIcon aria-hidden="true" />
              </button>
              <button
                type="button"
                className={ICON}
                aria-label={t("backward")}
                title={t("backward")}
                onClick={() => props.onStack("down")}
              >
                <ArrowDownIcon aria-hidden="true" />
              </button>
            </>
          )}
          <button
            type="button"
            className={OUTLINE}
            onClick={props.onDuplicate}
            data-testid="duplicate"
          >
            <CopyIcon aria-hidden="true" />
            {t("duplicate")}
          </button>
          <button
            type="button"
            className={OUTLINE}
            onClick={props.onDelete}
            data-testid="delete-layer"
          >
            <Trash2Icon aria-hidden="true" />
            {t("delete")}
          </button>
        </div>
      </Section>

      {single && <FrameFields {...props} layer={single} />}
      {single?.kind === "text" && <TextFields {...props} layer={single} />}
      {single?.kind === "shape" && <ShapeFields {...props} layer={single} />}
      {single?.kind === "image" && <ImageFields {...props} layer={single} />}
      {single && <ConstraintFields {...props} layer={single} />}
    </div>
  );
}

export function Section(props: { title: string; children: ReactNode; testId?: string }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-3" data-testid={props.testId}>
      <h3 id={id} className="text-sm font-semibold">
        {props.title}
      </h3>
      {props.children}
    </section>
  );
}

function AlignButton(props: {
  label: string;
  disabled?: boolean;
  onClick(): void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      className={ICON}
      aria-label={props.label}
      title={props.label}
      disabled={props.disabled}
      onClick={props.onClick}
    >
      {props.children}
    </button>
  );
}

type LayerProps<L extends Layer> = InspectorProps & { layer: L };

function FrameFields({ layer, onUpdate, onCommit }: LayerProps<Layer>) {
  const t = useTranslations("SocialEditor.inspector");
  const set = (key: keyof Layer, value: number) =>
    onUpdate(layer.id, (l) => ({ ...l, [key]: value }) as Layer, `frame-${key}`);
  const locked = layer.locked;
  return (
    <Section title={t("frame")}>
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label={t("x")}
          value={layer.x}
          min={-16384}
          max={16384}
          disabled={locked}
          testId="field-x"
          onChange={(v) => set("x", v)}
          onCommit={onCommit}
        />
        <NumberField
          label={t("y")}
          value={layer.y}
          min={-16384}
          max={16384}
          disabled={locked}
          testId="field-y"
          onChange={(v) => set("y", v)}
          onCommit={onCommit}
        />
        <NumberField
          label={t("width")}
          value={layer.width}
          min={1}
          max={16384}
          disabled={locked}
          testId="field-width"
          onChange={(v) => set("width", v)}
          onCommit={onCommit}
        />
        <NumberField
          label={t("height")}
          value={layer.height}
          min={1}
          max={16384}
          disabled={locked}
          testId="field-height"
          onChange={(v) => set("height", v)}
          onCommit={onCommit}
        />
        <NumberField
          label={t("rotation")}
          value={layer.rotation}
          min={-360}
          max={360}
          disabled={locked}
          testId="field-rotation"
          onChange={(v) => set("rotation", v)}
          onCommit={onCommit}
        />
        <NumberField
          label={t("opacity")}
          value={Math.round(layer.opacity * 100)}
          min={0}
          max={100}
          testId="field-opacity"
          onChange={(v) => set("opacity", v / 100)}
          onCommit={onCommit}
        />
      </div>
    </Section>
  );
}

function TextFields({ layer, scene, textFieldId, onUpdate, onCommit }: LayerProps<TextLayer>) {
  const t = useTranslations("SocialEditor.text");
  const set = (patch: Partial<TextLayer>, key: string) =>
    onUpdate(layer.id, (l) => ({ ...l, ...patch }) as Layer, `text-${key}`);
  return (
    <Section title={t("title")}>
      <div className="flex flex-col gap-1">
        <label htmlFor={textFieldId} className={LABEL}>
          {t("content")}
        </label>
        <textarea
          id={textFieldId}
          className={cn(INPUT, "h-auto min-h-20 py-1.5")}
          value={layer.text}
          maxLength={TEXT_MAX_LENGTH}
          rows={3}
          data-testid="text-content"
          onChange={(event) => set({ text: event.currentTarget.value }, "content")}
          onBlur={onCommit}
        />
      </div>
      <div className="grid grid-cols-2 gap-2">
        <SelectField
          label={t("font")}
          value={fontStackOf(layer.fontFamily)}
          options={(Object.keys(FONT_STACKS) as FontStackId[]).map((id) => ({
            value: id,
            label: t(`fonts.${id}`),
          }))}
          testId="text-font"
          onChange={(id) => set({ fontFamily: FONT_STACKS[id] }, "font")}
        />
        <NumberField
          label={t("size")}
          value={layer.fontSize}
          min={FONT_SIZE_MIN}
          max={FONT_SIZE_MAX}
          testId="text-size"
          onChange={(v) =>
            set({ fontSize: v, minFontSize: Math.min(layer.minFontSize, v) }, "size")
          }
          onCommit={onCommit}
        />
        <SelectField
          label={t("weight")}
          value={String(layer.fontWeight) as "400" | "500" | "700" | "900"}
          options={(["400", "500", "700", "900"] as const).map((w) => ({
            value: w,
            label: t(`weights.${w}`),
          }))}
          testId="text-weight"
          onChange={(w) => set({ fontWeight: Number(w) }, "weight")}
        />
        <NumberField
          label={t("minSize")}
          value={layer.minFontSize}
          min={FONT_SIZE_MIN}
          max={layer.fontSize}
          testId="text-min-size"
          onChange={(v) => set({ minFontSize: v }, "min-size")}
          onCommit={onCommit}
        />
        <SelectField
          label={t("align")}
          value={layer.align}
          options={TEXT_ALIGNS.map((a) => ({ value: a, label: t(`aligns.${a}`) }))}
          testId="text-align"
          onChange={(align) => set({ align }, "align")}
        />
        <SelectField
          label={t("valign")}
          value={layer.valign}
          options={TEXT_VALIGNS.map((a) => ({ value: a, label: t(`valigns.${a}`) }))}
          testId="text-valign"
          onChange={(valign) => set({ valign }, "valign")}
        />
        <NumberField
          label={t("lineHeight")}
          value={layer.lineHeight}
          min={0.7}
          max={3}
          step={0.05}
          digits={2}
          onChange={(v) => set({ lineHeight: v }, "line-height")}
          onCommit={onCommit}
        />
        <NumberField
          label={t("letterSpacing")}
          value={layer.letterSpacing}
          min={-0.2}
          max={1}
          step={0.01}
          digits={2}
          onChange={(v) => set({ letterSpacing: v }, "letter-spacing")}
          onCommit={onCommit}
        />
      </div>
      <ColorRefField
        label={t("color")}
        value={layer.color}
        palette={scene.palette}
        testId="text-color"
        onChange={(color) => color !== null && set({ color }, "color")}
      />
      <CheckField
        label={t("italic")}
        checked={layer.fontStyle === "italic"}
        onChange={(on) => set({ fontStyle: on ? "italic" : "normal" }, "italic")}
      />
      <CheckField
        label={t("shadow")}
        checked={layer.effects.shadow !== undefined}
        testId="text-shadow"
        onChange={(on) => {
          const rest = { ...layer.effects };
          delete rest.shadow;
          const s = Math.min(scene.format.width, scene.format.height);
          set(
            {
              effects: on
                ? {
                    ...rest,
                    shadow: {
                      color: "#000000",
                      blur: Math.round(s * 0.02),
                      offsetX: 0,
                      offsetY: Math.round(s * 0.006),
                      opacity: 0.35,
                    },
                  }
                : rest,
            },
            "shadow",
          );
        }}
      />
      <CheckField
        label={t("placeholder")}
        checked={layer.placeholder}
        onChange={(placeholder) => set({ placeholder }, "placeholder")}
      />
    </Section>
  );
}

function ShapeFields({
  layer,
  scene,
  onUpdate,
  onCommit,
}: LayerProps<Extract<Layer, { kind: "shape" }>>) {
  const t = useTranslations("SocialEditor.shape");
  const tShapes = useTranslations("Shapes");
  const shapeSelectId = useId();
  const set = (patch: Partial<typeof layer>, key: string) =>
    onUpdate(layer.id, (l) => ({ ...l, ...patch }) as Layer, `shape-${key}`);
  const shapeName = tShapes as unknown as (key: string) => string;
  return (
    <Section title={t("title")}>
      {layer.shape === "library" && (
        <div className="flex flex-col gap-1">
          <label htmlFor={shapeSelectId} className={LABEL}>
            {t("form")}
          </label>
          <select
            id={shapeSelectId}
            className={INPUT}
            value={layer.shapeId ?? ""}
            data-testid="shape-library"
            onChange={(event) => set({ shapeId: event.currentTarget.value }, "form")}
          >
            {listShapePacks()
              .filter((p) => p.id !== "tiles")
              .map((pack) => (
                <optgroup key={pack.id} label={shapeName(`packs.${pack.id}`)}>
                  {pack.shapes.map((id) => (
                    <option key={id} value={id}>
                      {shapeName(`names.${id}`)}
                    </option>
                  ))}
                </optgroup>
              ))}
          </select>
        </div>
      )}
      {layer.shape !== "line" && (
        <ColorRefField
          label={t("fill")}
          value={layer.fill}
          palette={scene.palette}
          allowNone
          testId="shape-fill"
          onChange={(fill) => set({ fill }, "fill")}
        />
      )}
      <ColorRefField
        label={layer.shape === "line" ? t("lineColor") : t("stroke")}
        value={layer.stroke}
        palette={scene.palette}
        allowNone={layer.shape !== "line"}
        onChange={(stroke) => set({ stroke }, "stroke")}
      />
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label={layer.shape === "line" ? t("lineWidth") : t("strokeWidth")}
          value={layer.strokeWidth}
          min={0}
          max={500}
          onChange={(strokeWidth) => set({ strokeWidth }, "stroke-width")}
          onCommit={onCommit}
        />
        {layer.shape === "rect" && (
          <NumberField
            label={t("radius")}
            value={layer.cornerRadius}
            min={0}
            max={4096}
            onChange={(cornerRadius) => set({ cornerRadius }, "radius")}
            onCommit={onCommit}
          />
        )}
      </div>
    </Section>
  );
}

function ImageFields({ layer, onUpdate, onCommit }: LayerProps<Extract<Layer, { kind: "image" }>>) {
  const t = useTranslations("SocialEditor.image");
  const set = (patch: Partial<typeof layer>, key: string) =>
    onUpdate(layer.id, (l) => ({ ...l, ...patch }) as Layer, `image-${key}`);
  return (
    <Section title={t("title")}>
      <div className="grid grid-cols-2 gap-2">
        <SelectField
          label={t("fit")}
          value={layer.fit}
          options={(["cover", "contain"] as const).map((f) => ({
            value: f,
            label: t(`fits.${f}`),
          }))}
          onChange={(fit) => set({ fit }, "fit")}
        />
        <NumberField
          label={t("radius")}
          value={layer.cornerRadius}
          min={0}
          max={4096}
          onChange={(cornerRadius) => set({ cornerRadius }, "radius")}
          onCommit={onCommit}
        />
      </div>
      <CheckField
        label={t("placeholder")}
        checked={layer.placeholder}
        onChange={(placeholder) => set({ placeholder }, "placeholder")}
      />
    </Section>
  );
}

function ConstraintFields({ layer, onUpdate }: LayerProps<Layer>) {
  const t = useTranslations("SocialEditor.constraints");
  if (layer.kind === "background") return null;
  const c = layer.constraints;
  const set = (patch: Partial<typeof c>) =>
    onUpdate(
      layer.id,
      (l) => ({ ...l, constraints: { ...l.constraints, ...patch } }),
      "constraints",
    );
  return (
    <Section title={t("title")}>
      <p className="text-xs text-muted-foreground">{t("hint")}</p>
      <div className="grid grid-cols-2 gap-2">
        <SelectField
          label={t("h")}
          value={c.h}
          options={ANCHORS.map((a) => ({ value: a, label: t(`hAnchors.${a}`) }))}
          testId="constraint-h"
          onChange={(h) => set({ h })}
        />
        <SelectField
          label={t("v")}
          value={c.v}
          options={ANCHORS.map((a) => ({ value: a, label: t(`vAnchors.${a}`) }))}
          testId="constraint-v"
          onChange={(v) => set({ v })}
        />
        <SelectField
          label={t("size")}
          value={c.size}
          options={SIZE_MODES.map((m) => ({ value: m, label: t(`sizes.${m}`) }))}
          className="col-span-2"
          onChange={(size) => set({ size })}
        />
      </div>
      <CheckField label={t("bleed")} checked={c.bleed} onChange={(bleed) => set({ bleed })} />
    </Section>
  );
}
