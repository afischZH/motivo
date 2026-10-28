"use client";

/**
 * Thumbnail picker for choice params with an `optionPreview` hint (M2-AP04,
 * docs/TOOLS.md B1): a grid of small previews with radio group semantics.
 *
 * - One tab stop (roving tabindex on the checked tile); arrow keys move and
 *   select (Left/Right by one, Up/Down by a row), Home/End jump to the ends.
 * - Every tile is named by its option label (`aria-label`, also as tooltip).
 * - Previews are drawn lazily: a tile computes its preview only once it has
 *   scrolled into view (IntersectionObserver on the scroll box), so a long
 *   list costs nothing until it is seen. Previews are small CSS or SVG
 *   strings from the registry: CSS goes into an inline style, SVG into
 *   `<img>`, never into markup.
 * - Grouped options (`ControlHint.optionGroups`, e.g. the packs of the
 *   shape library, M4-AP01) are shown one group at a time behind a group
 *   select; the group follows the value when it changes elsewhere
 *   (variant, undo, preset).
 * - With `brandShapesParam` and a Brand Kit, an extra "Brand Kit" group
 *   lists the kit's own shapes. Picking one runs it through the upload
 *   pipeline (checks, sanitizer worker, crop dialog) into that image param.
 */
import type { BrandAsset } from "@musterli/storage";
import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent,
  type RefObject,
} from "react";
import { useAssetLoader } from "../asset-input/use-asset-loader";
import { useBrandKit, type BrandKitView } from "../brand-kit/context";
import { brandImageToFile } from "../brand-kit/prepare";
import { useT } from "../i18n";
import { cssToStyle, parseCssDeclarations, svgDataUrl } from "../shell/render";
import type { FieldProps } from "./fields";
import { assetThumbnailUrl } from "./image-field";
import { FOCUS_RING, INPUT_CLASS, cx } from "./primitives";
import type { ControlOption, OptionValue, ThumbnailControl } from "./resolve";

/** Tiles per row; matches `grid-cols-5` below. */
export const THUMBNAIL_COLUMNS = 5;

/** Group id of the Brand Kit's own shapes (never a group id of a tool). */
export const BRAND_GROUP = "__brand-kit";

/** Index after a navigation key, or `null` for other keys. */
export function thumbnailKeyTarget(key: string, index: number, count: number): number | null {
  const last = count - 1;
  switch (key) {
    case "ArrowRight":
      return index >= last ? 0 : index + 1;
    case "ArrowLeft":
      return index <= 0 ? last : index - 1;
    case "ArrowDown":
      return Math.min(index + THUMBNAIL_COLUMNS, last);
    case "ArrowUp":
      return Math.max(index - THUMBNAIL_COLUMNS, 0);
    case "Home":
      return 0;
    case "End":
      return last;
    default:
      return null;
  }
}

/** The group that holds `value` (else the first group), or `undefined` without groups. */
export function thumbnailGroupOf(
  control: ThumbnailControl,
  value: OptionValue,
): string | undefined {
  const groups = control.groups;
  if (!groups) return undefined;
  return (groups.find((g) => g.options.some((o) => o.value === value)) ?? groups[0])?.id;
}

/** Becomes true once the element is (nearly) visible in `root`, and stays true. */
function useSeen(ref: RefObject<Element | null>, root: RefObject<Element | null>): boolean {
  const hasObserver = typeof IntersectionObserver === "function";
  const [seen, setSeen] = useState(!hasObserver);
  useEffect(() => {
    const el = ref.current;
    if (seen || !el || !hasObserver) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setSeen(true);
          observer.disconnect();
        }
      },
      { root: root.current, rootMargin: "48px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [ref, root, seen, hasObserver]);
  return seen;
}

interface TileProps {
  value: OptionValue;
  label: string;
  checked: boolean;
  tabbable: boolean;
  preview: ThumbnailControl["preview"];
  rootRef: RefObject<HTMLDivElement | null>;
  setRef(el: HTMLButtonElement | null): void;
  onSelect(): void;
  onKeyDown(event: KeyboardEvent<HTMLButtonElement>): void;
}

function Tile(props: TileProps) {
  const ref = useRef<HTMLButtonElement | null>(null);
  const seen = useSeen(ref, props.rootRef);
  const { preview, value } = props;
  const art = useMemo(() => {
    if (!seen) return null;
    const out = preview(value);
    if ("svg" in out) return { src: svgDataUrl(out.svg) };
    return { style: cssToStyle(parseCssDeclarations(out.css)) };
  }, [seen, preview, value]);

  return (
    <button
      ref={(el) => {
        ref.current = el;
        props.setRef(el);
      }}
      type="button"
      role="radio"
      aria-checked={props.checked}
      aria-label={props.label}
      title={props.label}
      tabIndex={props.tabbable ? 0 : -1}
      onClick={props.onSelect}
      onKeyDown={props.onKeyDown}
      data-value={String(value)}
      className={cx(
        "relative aspect-square overflow-hidden rounded-md border border-border bg-muted",
        "hover:border-foreground/40 aria-checked:border-primary aria-checked:ring-2 aria-checked:ring-primary",
        FOCUS_RING,
      )}
    >
      {art?.src !== undefined && (
        <img src={art.src} alt="" aria-hidden="true" className="size-full" draggable={false} />
      )}
      {art?.style !== undefined && (
        <span aria-hidden="true" className="absolute inset-0" style={art.style} />
      )}
    </button>
  );
}

export interface ThumbnailFieldProps extends FieldProps<ThumbnailControl, OptionValue> {
  /** Sets another param of the same level (Brand Kit shapes go into `brandShapesParam`). */
  onChangeParam?(key: string, value: unknown): void;
}

export function ThumbnailField(props: ThumbnailFieldProps) {
  const t = useT();
  const { control, value, onChangeParam } = props;
  const brandKit = useBrandKit();
  const brandParam =
    control.groups && control.brandShapesParam && brandKit && onChangeParam
      ? control.brandShapesParam
      : null;
  const [view, setView] = useState(() => ({ value, group: thumbnailGroupOf(control, value) }));
  // The value changed elsewhere (variant, undo, preset): show its group.
  if (view.value !== value) {
    const current = control.groups?.find((g) => g.id === view.group);
    const keep = current?.options.some((o) => o.value === value) ?? false;
    setView({ value, group: keep ? view.group : thumbnailGroupOf(control, value) });
  }
  const groupId =
    view.group === BRAND_GROUP && !brandParam ? thumbnailGroupOf(control, value) : view.group;
  const groupSelectId = useId();

  const options =
    groupId === undefined
      ? control.options
      : (control.groups?.find((g) => g.id === groupId)?.options ?? []);

  return (
    <div className="grid min-w-0 gap-2">
      {control.groups && (
        <select
          id={groupSelectId}
          className={cx(INPUT_CLASS, "w-full")}
          aria-label={t("Editor.thumbnails.group", { label: props.label })}
          value={groupId ?? ""}
          onChange={(event) => setView({ value, group: event.target.value })}
          data-testid="thumbnail-group"
        >
          {control.groups.map((g) => (
            <option key={g.id} value={g.id}>
              {t(g.labelKey)}
            </option>
          ))}
          {brandParam && <option value={BRAND_GROUP}>{t("Editor.thumbnails.brandKit")}</option>}
        </select>
      )}
      {groupId === BRAND_GROUP && brandKit && brandParam && onChangeParam ? (
        <BrandShapeGroup
          kit={brandKit}
          param={brandParam}
          labelId={props.ids.label}
          onChangeParam={onChangeParam}
          {...(props.onCommit ? { onCommit: props.onCommit } : {})}
        />
      ) : (
        <ThumbnailGrid {...props} options={options} />
      )}
    </div>
  );
}

/** The radio grid of one set of options. */
function ThumbnailGrid(props: ThumbnailFieldProps & { options: ControlOption[] }) {
  const t = useT();
  const { control, value, options } = props;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const tiles = useRef<(HTMLButtonElement | null)[]>([]);
  const checkedIndex = options.findIndex((o) => o.value === value);

  const select = (index: number) => {
    const option = options[index];
    if (option && option.value !== value) props.onChange(option.value);
  };

  const onKeyDown = (index: number) => (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const target = thumbnailKeyTarget(event.key, index, options.length);
    if (target === null) return;
    event.preventDefault();
    tiles.current[target]?.focus();
    select(target);
  };

  return (
    <div
      ref={rootRef}
      id={props.ids.input}
      role="radiogroup"
      aria-labelledby={props.ids.label}
      aria-describedby={props.ids.description}
      className="grid max-h-64 grid-cols-5 gap-1.5 overflow-y-auto p-1"
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) props.onCommit?.();
      }}
    >
      {options.map((option, i) => (
        <Tile
          key={String(option.value)}
          value={option.value}
          label={t(option.labelKey)}
          checked={i === checkedIndex}
          tabbable={i === (checkedIndex === -1 ? 0 : checkedIndex)}
          preview={control.preview}
          rootRef={rootRef}
          setRef={(el) => {
            tiles.current[i] = el;
          }}
          onSelect={() => select(i)}
          onKeyDown={onKeyDown(i)}
        />
      ))}
    </div>
  );
}

/**
 * The Brand Kit's own shapes as a source for an image param. A picked shape
 * goes through the same checks, sanitizer and crop dialog as a file from
 * disk; afterwards the focus moves to that param's upload field (this
 * picker hides once a file is set).
 */
function BrandShapeGroup(props: {
  kit: BrandKitView;
  param: string;
  labelId: string;
  onChangeParam(key: string, value: unknown): void;
  onCommit?(): void;
}) {
  const t = useT();
  const rootRef = useRef<HTMLDivElement | null>(null);
  const lastButton = useRef<HTMLButtonElement | null>(null);
  const applied = useRef(false);
  const [assets, setAssets] = useState<BrandAsset[] | null>(null);
  const { kit, param } = props;

  useEffect(() => {
    let active = true;
    kit.listAssets().then(
      (all) => {
        if (active) setAssets(all.filter((a) => a.kind === "shape"));
      },
      () => {
        if (active) setAssets([]);
      },
    );
    return () => {
      active = false;
    };
  }, [kit]);

  const loader = useAssetLoader({
    onAsset: (asset) => {
      applied.current = true;
      // Find the target field's panel before this picker unmounts.
      const panel = rootRef.current?.closest("[data-tool]") ?? document;
      props.onChangeParam(param, asset);
      props.onCommit?.();
      requestAnimationFrame(() => {
        panel
          .querySelector<HTMLElement>(`[data-control="${CSS.escape(param)}"] input[type="file"]`)
          ?.focus();
      });
    },
    onClose: () => {
      if (!applied.current) lastButton.current?.focus();
      applied.current = false;
    },
  });

  return (
    <div ref={rootRef} className="grid min-w-0 gap-2" data-testid="thumbnail-brand-shapes">
      {assets === null ? (
        <p className="text-xs text-muted-foreground">{t("Editor.brand.loading")}</p>
      ) : assets.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          {t("Editor.brand.shapesEmpty")}{" "}
          {kit.href && (
            <a href={kit.href} className="rounded-sm text-link underline underline-offset-4">
              {t("Editor.brand.openKit")}
            </a>
          )}
        </p>
      ) : (
        <ul
          aria-labelledby={props.labelId}
          className="grid max-h-64 grid-cols-5 gap-1.5 overflow-y-auto p-1"
        >
          {assets.map((a) => {
            const name = a.name || t("Editor.brand.unnamed");
            return (
              <li key={a.id}>
                <button
                  type="button"
                  disabled={loader.reading}
                  aria-label={t("Editor.brand.useAsset", { name })}
                  title={name}
                  className={cx(
                    "flex aspect-square w-full items-center justify-center overflow-hidden rounded-md border border-border bg-canvas p-1 hover:border-foreground/40",
                    FOCUS_RING,
                  )}
                  onClick={(event) => {
                    lastButton.current = event.currentTarget;
                    void loader.loadFile(brandImageToFile(a.image, a.image.name || a.name));
                  }}
                  data-testid="thumbnail-brand-item"
                >
                  <img
                    src={assetThumbnailUrl(a.image)}
                    alt=""
                    className="max-h-full max-w-full object-contain"
                    draggable={false}
                  />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <p role="status" aria-live="polite" className="text-xs text-muted-foreground">
        {loader.status}
      </p>
      {loader.error && (
        <p role="alert" className="rounded-md bg-destructive/10 p-2 text-sm">
          {t(`Editor.asset.errors.${loader.error}`)}
        </p>
      )}
      {loader.dialog}
    </div>
  );
}

/** Name of the checked option, shown next to the label. */
export function ThumbnailValue(props: { control: ThumbnailControl; value: unknown }) {
  const t = useT();
  const option = props.control.options.find((o) => o.value === props.value);
  if (!option) return null;
  return (
    <span className="truncate text-xs text-muted-foreground" aria-hidden="true">
      {t(option.labelKey)}
    </span>
  );
}
