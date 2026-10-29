"use client";

/**
 * The layer list, topmost layer first. Every row is reachable with Tab:
 * the row button selects (Shift or Cmd/Ctrl adds to the selection), F2 or
 * a double click renames, Alt+Arrow up/down moves the layer in the stack;
 * the eye and lock buttons toggle visibility and lock. Rows can also be
 * dragged to a new place.
 */
import type { Layer, Scene, StackMove } from "@musterli/scene";
import {
  EyeIcon,
  EyeOffIcon,
  ImageIcon,
  LockIcon,
  LockOpenIcon,
  ShapesIcon,
  SparklesIcon,
  StampIcon,
  TypeIcon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, type DragEvent, type KeyboardEvent } from "react";

import { cn } from "@/lib/utils";

import { INPUT } from "./fields";

export interface LayerListProps {
  scene: Scene;
  selection: readonly string[];
  onSelect(id: string, additive: boolean): void;
  onToggleVisible(id: string): void;
  onToggleLock(id: string): void;
  onRename(id: string, name: string): void;
  onMove(id: string, move: StackMove): void;
  onReorder(id: string, index: number): void;
}

const KIND_ICON = {
  background: SparklesIcon,
  text: TypeIcon,
  image: ImageIcon,
  shape: ShapesIcon,
  logo: StampIcon,
} as const;

/** Display name of a layer: its own name, else the start of its text, else its kind. */
export function useLayerName() {
  const t = useTranslations("SocialEditor.layers");
  return (layer: Layer): string => {
    if (layer.name.trim() !== "") return layer.name;
    if (layer.kind === "text") {
      const text = layer.text.replace(/\s+/g, " ").trim();
      if (text !== "") return text.length > 32 ? `${text.slice(0, 31)}…` : text;
    }
    return t(`kinds.${layer.kind}`);
  };
}

export function LayerList(props: LayerListProps) {
  const t = useTranslations("SocialEditor.layers");
  const nameOf = useLayerName();
  const [renaming, setRenaming] = useState<string | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const [dropIndex, setDropIndex] = useState<number | null>(null);
  const selected = new Set(props.selection);
  const groups = new Map(props.scene.groups.map((g) => [g.id, g.name]));
  const rows = [...props.scene.layers].reverse();
  const count = props.scene.layers.length;

  const onDrop = (event: DragEvent, index: number) => {
    event.preventDefault();
    if (dragging) props.onReorder(dragging, index);
    setDragging(null);
    setDropIndex(null);
  };

  return (
    <ul className="flex flex-col gap-0.5" data-testid="layer-list" aria-label={t("label")}>
      {rows.map((layer) => {
        const index = props.scene.layers.indexOf(layer);
        const isBackground = layer.kind === "background";
        const Icon = KIND_ICON[layer.kind];
        const name = nameOf(layer);
        const group = layer.groupId ? groups.get(layer.groupId) || t("group") : undefined;
        return (
          <li
            key={layer.id}
            data-testid="layer-row"
            data-layer-id={layer.id}
            data-kind={layer.kind}
            draggable={!isBackground && renaming !== layer.id}
            onDragStart={(event) => {
              event.dataTransfer.effectAllowed = "move";
              event.dataTransfer.setData("text/plain", layer.id);
              setDragging(layer.id);
            }}
            onDragEnd={() => {
              setDragging(null);
              setDropIndex(null);
            }}
            onDragOver={(event) => {
              if (!dragging || isBackground) return;
              event.preventDefault();
              setDropIndex(index);
            }}
            onDrop={(event) => onDrop(event, index)}
            className={cn(
              "group flex items-center gap-0.5 rounded-md border border-transparent",
              selected.has(layer.id) && "border-ring/40 bg-accent",
              dropIndex === index && dragging !== layer.id && "border-dashed border-ring",
              dragging === layer.id && "opacity-50",
              group && "ms-3",
            )}
          >
            {renaming === layer.id ? (
              <RenameInput
                name={layer.name || name}
                label={t("renameLabel", { name })}
                onCancel={() => setRenaming(null)}
                onSubmit={(value) => {
                  setRenaming(null);
                  props.onRename(layer.id, value);
                }}
              />
            ) : (
              <button
                type="button"
                aria-pressed={selected.has(layer.id)}
                aria-label={t("rowLabel", {
                  name,
                  kind: t(`kinds.${layer.kind}`),
                  position: count - index,
                  count,
                })}
                className={cn(
                  "flex h-8 min-w-0 flex-1 items-center gap-2 rounded-md px-2 text-left text-sm focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none",
                  !layer.visible && "text-muted-foreground line-through",
                )}
                data-testid="layer-select"
                onClick={(event) =>
                  props.onSelect(layer.id, event.shiftKey || event.metaKey || event.ctrlKey)
                }
                onDoubleClick={() => setRenaming(layer.id)}
                onKeyDown={(event: KeyboardEvent) => {
                  if (event.key === "F2") {
                    event.preventDefault();
                    setRenaming(layer.id);
                  } else if (
                    event.altKey &&
                    (event.key === "ArrowUp" || event.key === "ArrowDown")
                  ) {
                    event.preventDefault();
                    event.stopPropagation();
                    if (!isBackground)
                      props.onMove(layer.id, event.key === "ArrowUp" ? "up" : "down");
                  }
                }}
              >
                <Icon aria-hidden="true" className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate" data-testid="layer-name">
                  {name}
                </span>
                {group && (
                  <span className="ms-auto shrink-0 rounded-full bg-muted px-1.5 text-[10px] text-muted-foreground">
                    {group}
                  </span>
                )}
              </button>
            )}
            <IconToggle
              label={layer.visible ? t("hide", { name }) : t("show", { name })}
              pressed={!layer.visible}
              testId="layer-visible"
              onClick={() => props.onToggleVisible(layer.id)}
            >
              {layer.visible ? <EyeIcon aria-hidden="true" /> : <EyeOffIcon aria-hidden="true" />}
            </IconToggle>
            {!isBackground && (
              <IconToggle
                label={layer.locked ? t("unlock", { name }) : t("lock", { name })}
                pressed={layer.locked}
                testId="layer-lock"
                onClick={() => props.onToggleLock(layer.id)}
              >
                {layer.locked ? (
                  <LockIcon aria-hidden="true" />
                ) : (
                  <LockOpenIcon aria-hidden="true" />
                )}
              </IconToggle>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function IconToggle(props: {
  label: string;
  pressed: boolean;
  testId: string;
  onClick(): void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={props.label}
      title={props.label}
      aria-pressed={props.pressed}
      data-testid={props.testId}
      onClick={props.onClick}
      className={cn(
        "flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none [&_svg]:size-3.5",
        props.pressed && "text-foreground",
      )}
    >
      {props.children}
    </button>
  );
}

function RenameInput(props: {
  name: string;
  label: string;
  onSubmit(name: string): void;
  onCancel(): void;
}) {
  const [value, setValue] = useState(props.name);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    ref.current?.focus();
    ref.current?.select();
  }, []);
  return (
    <input
      ref={ref}
      aria-label={props.label}
      className={cn(INPUT, "flex-1")}
      value={value}
      maxLength={80}
      data-testid="layer-rename-input"
      onChange={(event) => setValue(event.currentTarget.value)}
      onBlur={() => props.onSubmit(value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          props.onSubmit(value);
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.stopPropagation();
          props.onCancel();
        }
      }}
    />
  );
}
