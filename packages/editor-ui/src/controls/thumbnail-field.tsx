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
 */
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type RefObject } from "react";
import { useT } from "../i18n";
import { cssToStyle, parseCssDeclarations, svgDataUrl } from "../shell/render";
import type { FieldProps } from "./fields";
import { FOCUS_RING, cx } from "./primitives";
import type { OptionValue, ThumbnailControl } from "./resolve";

/** Tiles per row; matches `grid-cols-5` below. */
export const THUMBNAIL_COLUMNS = 5;

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

export function ThumbnailField(props: FieldProps<ThumbnailControl, OptionValue>) {
  const t = useT();
  const { control, value } = props;
  const rootRef = useRef<HTMLDivElement | null>(null);
  const tiles = useRef<(HTMLButtonElement | null)[]>([]);
  const checkedIndex = control.options.findIndex((o) => o.value === value);

  const select = (index: number) => {
    const option = control.options[index];
    if (option && option.value !== value) props.onChange(option.value);
  };

  const onKeyDown = (index: number) => (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const target = thumbnailKeyTarget(event.key, index, control.options.length);
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
      {control.options.map((option, i) => (
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
