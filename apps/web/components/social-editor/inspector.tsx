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
  FONT_CATEGORIES,
  FONT_SIZE_MAX,
  FONT_SIZE_MIN,
  LIBRARY_FONTS,
  SIZE_MODES,
  SYSTEM_FONT_STACKS,
  TEXT_ALIGNS,
  TEXT_VALIGNS,
  TEXT_MAX_LENGTH,
  libraryFont,
  systemFontOf,
  type AlignMode,
  type Layer,
  type Scene,
  type StackMove,
  type SystemFontId,
  type TextEffects,
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

/** A choice of the font picker: a library font, a brand font or a system stack. */
export type FontChoice =
  | { kind: "library"; id: string }
  | { kind: "brand"; id: string }
  | { kind: "system"; id: SystemFontId };

/** A brand font as the picker lists it (the bytes stay with the editor). */
export interface BrandFontOption {
  id: string;
  name: string;
}

/** The system stack a family list stands for (AP02 scenes may hold any list). */
function systemStackOf(family: string): SystemFontId {
  const exact = systemFontOf(family);
  if (exact) return exact;
  if (/mono/i.test(family)) return "mono";
  if (/serif/i.test(family) && !/sans-serif/i.test(family)) return "serif";
  return "sans";
}

/** `<select>` value of a layer's font. */
export function fontChoiceValue(layer: Pick<TextLayer, "font" | "fontFamily">): string {
  if (layer.font) return `${layer.font.kind}:${layer.font.id}`;
  return `system:${systemStackOf(layer.fontFamily)}`;
}

function parseFontChoice(value: string): FontChoice | null {
  const [kind, ...rest] = value.split(":");
  const id = rest.join(":");
  if (kind === "library" && libraryFont(id)) return { kind, id };
  if (kind === "brand" && id) return { kind, id };
  if (kind === "system" && id in SYSTEM_FONT_STACKS) return { kind, id: id as SystemFontId };
  return null;
}

/** Weights the weight picker offers: the font's own, or the usual four. */
function weightOptions(layer: TextLayer): number[] {
  const own = layer.font?.kind === "library" ? libraryFont(layer.font.id)?.weights : undefined;
  const list = own ? [...own] : [400, 500, 700, 900];
  if (!list.includes(layer.fontWeight)) list.push(layer.fontWeight);
  return list.sort((a, b) => a - b);
}

export interface InspectorProps {
  scene: Scene;
  layers: readonly Layer[];
  /** Brand fonts of this browser, in brand kit order. */
  brandFonts: readonly BrandFontOption[];
  /** Brand fonts the scene uses that this browser lacks (by id). */
  missingFonts: ReadonlySet<string>;
  /** Loads the font, then applies it (one undo step). */
  onFont(id: string, choice: FontChoice, weight?: number): void;
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
      {single?.kind === "text" && <TextEffectFields {...props} layer={single} />}
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

function FontField({
  layer,
  brandFonts,
  missingFonts,
  onFont,
}: Pick<LayerProps<TextLayer>, "layer" | "brandFonts" | "missingFonts" | "onFont">) {
  const t = useTranslations("SocialEditor.text");
  const id = useId();
  const hintId = `${id}-hint`;
  const value = fontChoiceValue(layer);
  const brandMissing =
    layer.font?.kind === "brand" &&
    (missingFonts.has(layer.font.id) || !brandFonts.some((f) => f.id === layer.font?.id));
  return (
    <div className="col-span-2 flex flex-col gap-1">
      <label htmlFor={id} className={LABEL}>
        {t("font")}
      </label>
      <select
        id={id}
        className={INPUT}
        value={value}
        aria-describedby={hintId}
        data-testid="text-font"
        onChange={(event) => {
          const choice = parseFontChoice(event.currentTarget.value);
          if (choice) onFont(layer.id, choice);
        }}
      >
        {(brandFonts.length > 0 || brandMissing) && (
          <optgroup label={t("fontGroups.brand")}>
            {brandMissing && layer.font && (
              <option value={value}>{t("fontMissingOption", { name: layer.font.name })}</option>
            )}
            {brandFonts.map((f) => (
              <option key={f.id} value={`brand:${f.id}`}>
                {f.name}
              </option>
            ))}
          </optgroup>
        )}
        {FONT_CATEGORIES.map((category) => (
          <optgroup key={category} label={t(`fontGroups.${category}`)}>
            {LIBRARY_FONTS.filter((f) => f.category === category).map((f) => (
              <option key={f.id} value={`library:${f.id}`}>
                {f.name}
              </option>
            ))}
          </optgroup>
        ))}
        <optgroup label={t("fontGroups.system")}>
          {(Object.keys(SYSTEM_FONT_STACKS) as SystemFontId[]).map((s) => (
            <option key={s} value={`system:${s}`}>
              {t(`systemFonts.${s}`)}
            </option>
          ))}
        </optgroup>
      </select>
      {brandMissing && layer.font ? (
        <p id={hintId} role="note" className="text-xs text-destructive" data-testid="font-missing">
          {t("fontMissing", { name: layer.font.name })}
        </p>
      ) : (
        <p id={hintId} className="text-xs text-muted-foreground">
          {t("fontHint")}
        </p>
      )}
    </div>
  );
}

function TextFields(props: LayerProps<TextLayer>) {
  const { layer, scene, textFieldId, onUpdate, onCommit } = props;
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
        <FontField {...props} />
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
          value={String(layer.fontWeight)}
          options={weightOptions(layer).map((w) => ({
            value: String(w),
            label: ["400", "500", "700", "900"].includes(String(w))
              ? t(`weights.${String(w) as "400" | "500" | "700" | "900"}`)
              : String(w),
          }))}
          testId="text-weight"
          onChange={(w) => {
            const choice = parseFontChoice(fontChoiceValue(layer));
            // Library fonts load the file of the new weight first.
            if (choice && choice.kind === "library") {
              props.onFont(layer.id, choice, Number(w));
            } else {
              set({ fontWeight: Number(w) }, "weight");
            }
          }}
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
        label={t("placeholder")}
        checked={layer.placeholder}
        onChange={(placeholder) => set({ placeholder }, "placeholder")}
      />
    </Section>
  );
}

type EffectKey = keyof TextEffects;

/** Starting values of an effect, sized to the text and the format. */
function defaultEffect<K extends EffectKey>(
  key: K,
  layer: TextLayer,
  scene: Scene,
): NonNullable<TextEffects[K]> {
  const s = Math.min(scene.format.width, scene.format.height);
  const f = layer.fontSize;
  const values: { [E in EffectKey]-?: NonNullable<TextEffects[E]> } = {
    shadow: {
      color: "#000000",
      blur: Math.round(s * 0.02),
      offsetX: 0,
      offsetY: Math.round(s * 0.006),
      opacity: 0.35,
    },
    stroke: { color: "#ffffff", width: Math.max(1, Math.round(f * 0.05)) },
    highlight: { color: "brand-3", padding: Math.max(2, Math.round(f * 0.2)) },
    gradient: { from: "brand-2", to: "brand-4", angle: 90 },
  };
  return values[key] as NonNullable<TextEffects[K]>;
}

function TextEffectFields({ layer, scene, onUpdate, onCommit }: LayerProps<TextLayer>) {
  const t = useTranslations("SocialEditor.text.effects");
  const e = layer.effects;
  const setEffect = <K extends EffectKey>(key: K, value: TextEffects[K] | undefined) =>
    onUpdate(
      layer.id,
      (l) => {
        if (l.kind !== "text") return l;
        const effects = Object.fromEntries(
          Object.entries({ ...l.effects, [key]: value }).filter(([, v]) => v !== undefined),
        ) as TextEffects;
        return { ...l, effects };
      },
      `text-effect-${key}`,
    );
  const toggle = (key: EffectKey) => (on: boolean) =>
    setEffect(key, on ? defaultEffect(key, layer, scene) : undefined);
  const patch = <K extends EffectKey>(key: K, change: Partial<NonNullable<TextEffects[K]>>) => {
    const current = e[key];
    if (current) setEffect(key, { ...current, ...change } as TextEffects[K]);
  };
  const box = "flex flex-col gap-2 border-s-2 border-border ps-3";
  return (
    <Section title={t("title")} testId="text-effects">
      <CheckField
        label={t("shadow")}
        checked={e.shadow !== undefined}
        testId="text-shadow"
        onChange={toggle("shadow")}
      />
      {e.shadow && (
        <div className={box}>
          <ColorRefField
            label={t("shadowColor")}
            value={e.shadow.color}
            palette={scene.palette}
            onChange={(color) => color !== null && patch("shadow", { color })}
          />
          <div className="grid grid-cols-2 gap-2">
            <NumberField
              label={t("shadowBlur")}
              value={e.shadow.blur}
              min={0}
              max={500}
              onChange={(blur) => patch("shadow", { blur })}
              onCommit={onCommit}
            />
            <NumberField
              label={t("shadowOpacity")}
              value={Math.round(e.shadow.opacity * 100)}
              min={0}
              max={100}
              onChange={(v) => patch("shadow", { opacity: v / 100 })}
              onCommit={onCommit}
            />
            <NumberField
              label={t("shadowX")}
              value={e.shadow.offsetX}
              min={-500}
              max={500}
              onChange={(offsetX) => patch("shadow", { offsetX })}
              onCommit={onCommit}
            />
            <NumberField
              label={t("shadowY")}
              value={e.shadow.offsetY}
              min={-500}
              max={500}
              onChange={(offsetY) => patch("shadow", { offsetY })}
              onCommit={onCommit}
            />
          </div>
        </div>
      )}
      <CheckField
        label={t("stroke")}
        checked={e.stroke !== undefined}
        testId="text-stroke"
        onChange={toggle("stroke")}
      />
      {e.stroke && (
        <div className={box}>
          <ColorRefField
            label={t("strokeColor")}
            value={e.stroke.color}
            palette={scene.palette}
            onChange={(color) => color !== null && patch("stroke", { color })}
          />
          <NumberField
            label={t("strokeWidth")}
            value={e.stroke.width}
            min={0}
            max={200}
            step={0.5}
            digits={1}
            onChange={(width) => patch("stroke", { width })}
            onCommit={onCommit}
          />
        </div>
      )}
      <CheckField
        label={t("highlight")}
        checked={e.highlight !== undefined}
        testId="text-highlight"
        onChange={toggle("highlight")}
      />
      {e.highlight && (
        <div className={box}>
          <ColorRefField
            label={t("highlightColor")}
            value={e.highlight.color}
            palette={scene.palette}
            testId="text-highlight-color"
            onChange={(color) => color !== null && patch("highlight", { color })}
          />
          <NumberField
            label={t("highlightPadding")}
            value={e.highlight.padding}
            min={0}
            max={200}
            testId="text-highlight-padding"
            onChange={(padding) => patch("highlight", { padding })}
            onCommit={onCommit}
          />
        </div>
      )}
      <CheckField
        label={t("gradient")}
        checked={e.gradient !== undefined}
        testId="text-gradient"
        onChange={toggle("gradient")}
      />
      {e.gradient && (
        <div className={box}>
          <p className="text-xs text-muted-foreground">{t("gradientHint")}</p>
          <ColorRefField
            label={t("gradientFrom")}
            value={e.gradient.from}
            palette={scene.palette}
            testId="text-gradient-from"
            onChange={(from) => from !== null && patch("gradient", { from })}
          />
          <ColorRefField
            label={t("gradientTo")}
            value={e.gradient.to}
            palette={scene.palette}
            testId="text-gradient-to"
            onChange={(to) => to !== null && patch("gradient", { to })}
          />
          <NumberField
            label={t("gradientAngle")}
            value={e.gradient.angle}
            min={-360}
            max={360}
            step={5}
            testId="text-gradient-angle"
            onChange={(angle) => patch("gradient", { angle })}
            onCommit={onCommit}
          />
        </div>
      )}
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
