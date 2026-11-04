"use client";

import { DEVICE_GROUPS, DEVICES, detectScreen, type SafeZone } from "@musterli/devices";
import { createRng } from "@musterli/engine";
import { downloadBlob, svgToDataUri } from "@musterli/exporters";
import type { AnyToolDefinition } from "@musterli/tool-registry";
import {
  Check,
  ChevronDown,
  Download,
  Link2,
  Palette,
  ScanLine,
  Shuffle,
  SlidersHorizontal,
  Smartphone,
  Sparkles,
} from "lucide-react";
import { useCallback, useEffect, useId, useState, type CSSProperties, type ReactNode } from "react";

import { downloadSet, rasterWallpaper } from "@/lib/download";
import { clampFinish, DIM_MAX, NO_FINISH, type Finish } from "@/lib/finish";
import { formatSize } from "@/lib/format";
import {
  WALLPAPER_STYLE_GROUPS,
  WALLPAPER_TOOL_IDS,
  wallpaperTool,
  type WallpaperStyleGroup,
  type WallpaperToolId,
} from "@/lib/generators";
import { hasClockZone, wallpaperSvg } from "@/lib/render";
import { thumbnail } from "@/lib/thumbs";
import { groupItems, pairItems, wallpaperBaseName } from "@/lib/sets";
import { stateFromHash, stateToHash, type WallpaperState } from "@/lib/share";
import { clampEdge, resolveTarget, type Target } from "@/lib/target";

/** Texts resolved on the server; the editor loads no message formatter. */
export interface EditorLabels {
  device: string;
  yourScreen: string;
  customSize: string;
  width: string;
  height: string;
  style: string;
  styleGroups: Record<WallpaperStyleGroup, string>;
  look: string;
  newLook: string;
  newLookHint: string;
  tapHint: string;
  clickHint: string;
  download: string;
  close: string;
  safeZones: string;
  downloadPng: string;
  downloadJpg: string;
  exporting: string;
  exportFailed: string;
  copyLink: string;
  linkCopied: string;
  previewAlt: string;
  sizeNote: string;
  finish: string;
  grain: string;
  dim: string;
  calmClock: string;
  sets: string;
  downloadPair: string;
  downloadSet: string;
  progress: string;
  groups: Record<string, string>;
  zones: Record<SafeZone["kind"], string>;
  tools: Record<string, { name: string; presets: Record<string, string> }>;
}

interface WallpaperEditorProps {
  locale: string;
  labels: EditorLabels;
  /** Device preselected by a device page; a shared link still wins. */
  initialDeviceId?: string | undefined;
}

type Tab = "style" | "look" | "finish" | "device";

const CUSTOM_VALUE = "custom";
const STYLE_THUMB = { width: 90, height: 120 };
const DETECTED_VALUE = "detected";

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
}

/** Starts from the first look of a generator. */
function startState(toolId: WallpaperToolId, target: Target, finish: Finish): WallpaperState {
  const tool = wallpaperTool(toolId);
  const preset = tool.presets[0];
  return {
    toolId,
    params: (preset?.params ?? tool.defaults) as Record<string, unknown>,
    seed: preset?.seed ?? randomSeed(),
    target,
    finish,
  };
}

/** The visitor's screen: a catalog device or its exact pixel size. */
function detectedTarget(): Target {
  const detection = detectScreen({
    width: window.screen.width,
    height: window.screen.height,
    pixelRatio: window.devicePixelRatio,
  });
  if (detection?.device) return { kind: "device", id: detection.device.id };
  if (detection) return { kind: "custom", width: detection.width, height: detection.height };
  return { kind: "device", id: "iphone-6-3" };
}

function initialState(deviceId: string | undefined): WallpaperState {
  const target: Target = deviceId ? { kind: "device", id: deviceId } : detectedTarget();
  return (
    stateFromHash(window.location.hash) ?? startState(WALLPAPER_TOOL_IDS[0], target, NO_FINISH)
  );
}

/** Keys typed into a form control must not trigger the space shortcut. */
function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(target.tagName))
  );
}

export default function WallpaperEditor({ locale, labels, initialDeviceId }: WallpaperEditorProps) {
  const [state, setState] = useState<WallpaperState>(() => initialState(initialDeviceId));
  const [detected] = useState<Target>(detectedTarget);
  const [showZones, setShowZones] = useState(true);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const finishId = useId();
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);
  const [tab, setTab] = useState<Tab>("style");
  const [menuOpen, setMenuOpen] = useState(false);

  const tool: AnyToolDefinition = wallpaperTool(state.toolId);
  const resolved = resolveTarget(state.target) ?? resolveTarget(detected);
  const sizeText = resolved ? formatSize(resolved.width, resolved.height, locale) : "";

  // Plain computation: the React Compiler memoizes it per (look, size).
  const svg = resolved ? wallpaperSvg(state, resolved) : "";
  const src = svg ? svgToDataUri(svg) : "";

  // Keep the address shareable; replaceState adds no history entries.
  useEffect(() => {
    const hash = stateToHash(state);
    if (hash) window.history.replaceState(null, "", hash);
  }, [state]);

  const newLook = useCallback(() => {
    setState((current) => {
      const seed = randomSeed();
      const currentTool = wallpaperTool(current.toolId);
      const params = currentTool.randomize(createRng(seed), current.params, new Set());
      return { ...current, params: params as Record<string, unknown>, seed };
    });
  }, []);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.code !== "Space" || event.repeat || isTypingTarget(event.target)) return;
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      event.preventDefault();
      newLook();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [newLook]);

  async function run(job: () => Promise<void>) {
    setBusy(true);
    setError(false);
    try {
      await job();
    } catch {
      setError(true);
    } finally {
      setBusy(false);
      setProgress(null);
    }
  }

  function download(format: "png" | "jpg") {
    if (!resolved) return;
    setMenuOpen(false);
    void run(async () => {
      const blob = await rasterWallpaper(state, resolved, format);
      downloadBlob(blob, `${wallpaperBaseName(state.target, state.toolId, state.seed)}.${format}`);
    });
  }

  function downloadZip(kind: "pair" | "group") {
    const device = resolved?.device;
    const items =
      kind === "pair"
        ? pairItems(state.target, state.toolId, state.seed, state.finish)
        : device
          ? groupItems(device, state.toolId, state.seed, state.finish)
          : [];
    if (items.length === 0) return;
    setMenuOpen(false);
    const name =
      kind === "pair"
        ? wallpaperBaseName(state.target, state.toolId, state.seed)
        : `wallpapers-${device?.group ?? "set"}-${state.toolId}-${state.seed}`;
    void run(() =>
      downloadSet(state, items, `${name}.zip`, (done, total) => setProgress({ done, total })),
    );
  }

  function setFinish(patch: Partial<Finish>) {
    setState((s) => ({ ...s, finish: clampFinish({ ...s.finish, ...patch }) }));
  }

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  const deviceValue =
    state.target.kind === "device"
      ? state.target.id
      : detected.kind === "custom" &&
          state.target.width === detected.width &&
          state.target.height === detected.height
        ? DETECTED_VALUE
        : CUSTOM_VALUE;

  function onDeviceChange(value: string) {
    if (value === DETECTED_VALUE) setState((s) => ({ ...s, target: detected }));
    else if (value === CUSTOM_VALUE)
      setState((s) => ({
        ...s,
        target: {
          kind: "custom",
          width: resolved?.width ?? 1920,
          height: resolved?.height ?? 1080,
        },
      }));
    else setState((s) => ({ ...s, target: { kind: "device", id: value } }));
  }

  function onCustomSize(edge: "width" | "height", value: number) {
    setState((s) => {
      if (s.target.kind !== "custom") return s;
      return { ...s, target: { ...s.target, [edge]: clampEdge(value) } };
    });
  }

  const toolLabels = labels.tools[state.toolId];
  const presetIndex = tool.presets.findIndex(
    (preset) =>
      JSON.stringify(preset.params) === JSON.stringify(state.params) &&
      (preset.seed === undefined || preset.seed === state.seed),
  );
  const portrait = resolved ? resolved.height > resolved.width : false;
  const ratio = resolved ? resolved.width / resolved.height : 1;
  const zones = showZones ? (resolved?.device?.safeZones ?? []) : [];
  const deviceName =
    resolved?.device?.name ??
    (deviceValue === DETECTED_VALUE
      ? labels.yourScreen.replace(" ({size})", "")
      : labels.customSize);
  const lookThumb = portrait ? { width: 72, height: 128 } : { width: 128, height: 80 };
  const status = error
    ? labels.exportFailed
    : progress
      ? labels.progress
          .replace("{done}", String(progress.done))
          .replace("{total}", String(progress.total))
      : busy
        ? labels.exporting
        : "";

  // Escape closes the download menu.
  useEffect(() => {
    if (!menuOpen) return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") setMenuOpen(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [menuOpen]);

  const tabs: { id: Tab; label: string; icon: ReactNode }[] = [
    { id: "style", label: labels.style, icon: <Palette className="size-4" aria-hidden /> },
    { id: "look", label: labels.look, icon: <Sparkles className="size-4" aria-hidden /> },
    {
      id: "finish",
      label: labels.finish,
      icon: <SlidersHorizontal className="size-4" aria-hidden />,
    },
    { id: "device", label: labels.device, icon: <Smartphone className="size-4" aria-hidden /> },
  ];
  // On large screens every section shows; on phones only the chosen tab.
  const panel = (id: Tab) => `${tab === id ? "block" : "hidden"} lg:block`;

  const downloadMenu = menuOpen ? (
    <div className="fixed inset-0 z-50 flex items-end lg:absolute lg:inset-auto lg:right-0 lg:bottom-full lg:mb-3 lg:block lg:w-80">
      <button
        type="button"
        aria-label={labels.close}
        className="absolute inset-0 bg-black/40 backdrop-blur-[2px] lg:hidden"
        onClick={() => setMenuOpen(false)}
      />
      <div
        role="menu"
        aria-label={labels.download}
        className="bg-background border-border relative w-full rounded-t-3xl border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-2xl lg:rounded-2xl lg:pb-3"
      >
        <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-neutral-300 lg:hidden dark:bg-neutral-700" />
        <div className="flex items-center justify-between px-2 pb-2">
          <p className="text-sm font-semibold">{labels.download}</p>
          <p className="text-muted text-xs tabular-nums">{sizeText} px</p>
        </div>
        <MenuItem onClick={() => download("png")} title={labels.downloadPng} />
        <MenuItem onClick={() => download("jpg")} title={labels.downloadJpg} />
        <p className="text-muted px-3 pt-3 pb-1 text-xs font-medium tracking-wide uppercase">
          {labels.sets}
        </p>
        <MenuItem onClick={() => downloadZip("pair")} title={labels.downloadPair} />
        {resolved?.device ? (
          <MenuItem
            onClick={() => downloadZip("group")}
            title={labels.downloadSet.replace(
              "{group}",
              labels.groups[resolved.device.group] ?? resolved.device.group,
            )}
          />
        ) : null}
        <div className="border-border mt-2 border-t pt-2">
          <MenuItem
            onClick={() => void copyLink()}
            title={copied ? labels.linkCopied : labels.copyLink}
            icon={
              copied ? (
                <Check className="size-4" aria-hidden />
              ) : (
                <Link2 className="size-4" aria-hidden />
              )
            }
          />
        </div>
      </div>
    </div>
  ) : null;

  return (
    <div className="lg:grid lg:h-[calc(100dvh-14.5rem)] lg:min-h-[620px] lg:grid-cols-[minmax(0,1fr)_380px] lg:gap-5">
      {/* Stage: the wallpaper on a dark studio backdrop. Tap or click for a new look. */}
      <div
        className="studio relative h-[min(64dvh,720px)] min-h-[380px] overflow-hidden rounded-[28px] lg:h-full"
        style={{ containerType: "size" }}
      >
        <button
          type="button"
          onClick={newLook}
          aria-label={labels.newLook}
          className="group absolute inset-0 flex cursor-pointer items-center justify-center focus-visible:outline-offset-[-4px]"
        >
          {resolved && src ? (
            <span
              className={`relative block overflow-hidden shadow-[0_30px_80px_-20px_rgba(0,0,0,0.7)] ring-1 ring-white/10 transition-transform duration-200 group-active:scale-[0.985] ${portrait ? "rounded-[clamp(18px,7cqw,36px)]" : "rounded-xl"}`}
              style={{
                aspectRatio: `${resolved.width} / ${resolved.height}`,
                width: `min(calc(100cqw - 40px), calc((100cqh - 112px) * ${ratio}))`,
              }}
            >
              {/* eslint-disable-next-line @next/next/no-img-element -- generated data URI, nothing to optimize */}
              <img
                src={src}
                alt={labels.previewAlt.replace("{size}", sizeText)}
                className="block h-full w-full"
                draggable={false}
              />
              {zones.map((zone) => (
                <span
                  key={zone.kind}
                  aria-hidden="true"
                  className="absolute flex items-center justify-center rounded-md border border-dashed border-white/70 bg-black/10 text-[10px] font-medium text-white/90 sm:text-xs"
                  style={{
                    left: `${zone.rect.x * 100}%`,
                    top: `${zone.rect.y * 100}%`,
                    width: `${zone.rect.width * 100}%`,
                    height: `${zone.rect.height * 100}%`,
                  }}
                >
                  {zone.rect.height > 0.08 ? labels.zones[zone.kind] : null}
                </span>
              ))}
            </span>
          ) : null}
        </button>

        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-2 p-3">
          <span className="max-w-[70%] truncate rounded-full bg-black/45 px-3 py-1.5 text-xs font-medium text-white backdrop-blur-md">
            {deviceName} · <span className="tabular-nums">{sizeText}</span>
          </span>
          {resolved?.device ? (
            <button
              type="button"
              aria-pressed={showZones}
              aria-label={labels.safeZones}
              onClick={() => setShowZones((v) => !v)}
              className="pointer-events-auto flex size-11 items-center justify-center rounded-full bg-black/45 text-white backdrop-blur-md transition hover:bg-black/60 aria-pressed:bg-white aria-pressed:text-neutral-900"
            >
              <ScanLine className="size-5" aria-hidden />
            </button>
          ) : null}
        </div>
        <p className="pointer-events-none absolute inset-x-0 bottom-3 text-center text-xs font-medium text-white/70">
          <span className="lg:hidden">{labels.tapHint}</span>
          <span className="hidden lg:inline">{labels.clickHint}</span>
        </p>
      </div>

      {/* Controls: tabs on phones, one scrolling column on large screens. */}
      <div className="relative mt-4 flex min-h-0 flex-col lg:mt-0">
        <div
          role="tablist"
          aria-label={labels.style}
          className="bg-surface border-border grid grid-cols-4 gap-1 rounded-2xl border p-1 lg:hidden"
        >
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              onClick={() => setTab(t.id)}
              className="text-muted aria-selected:bg-background aria-selected:text-foreground flex h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[11px] font-medium transition aria-selected:shadow-sm"
            >
              {t.icon}
              {t.label}
            </button>
          ))}
        </div>

        <div className="flex min-h-0 flex-1 flex-col gap-6 pt-5 lg:overflow-y-auto lg:pt-0 lg:pr-1 lg:pb-4">
          <section className={panel("style")} aria-label={labels.style}>
            <SectionTitle>{labels.style}</SectionTitle>
            {(Object.keys(WALLPAPER_STYLE_GROUPS) as WallpaperStyleGroup[]).map((group) => (
              <div key={group} className="mt-3">
                <p className="text-muted mb-2 text-xs font-medium tracking-wide uppercase">
                  {labels.styleGroups[group]}
                </p>
                <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 lg:grid-cols-4">
                  {WALLPAPER_STYLE_GROUPS[group].map((id) => (
                    <button
                      key={id}
                      type="button"
                      aria-pressed={state.toolId === id}
                      onClick={() => setState((s) => startState(id, s.target, s.finish))}
                      className="group flex min-w-0 flex-col gap-1 text-left"
                    >
                      <span className="ring-border group-aria-pressed:ring-accent relative block aspect-[3/4] overflow-hidden rounded-xl ring-1 transition group-hover:ring-2 group-aria-pressed:ring-[3px]">
                        {/* eslint-disable-next-line @next/next/no-img-element -- generated data URI */}
                        <img
                          src={thumbnail(id, 0, STYLE_THUMB)}
                          alt=""
                          loading="lazy"
                          className="h-full w-full object-cover"
                        />
                        {state.toolId === id ? (
                          <span className="bg-accent absolute right-1 bottom-1 flex size-5 items-center justify-center rounded-full text-white">
                            <Check className="size-3" aria-hidden />
                          </span>
                        ) : null}
                      </span>
                      <span className="text-muted group-aria-pressed:text-foreground truncate text-[11px] font-medium">
                        {labels.tools[id]?.name ?? id}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ))}
          </section>

          <section className={panel("look")} aria-label={labels.look}>
            <SectionTitle>
              {labels.look}
              <span className="text-muted ml-2 font-normal">
                {labels.tools[state.toolId]?.name}
              </span>
            </SectionTitle>
            <div className="-mx-1 mt-3 flex snap-x gap-2 overflow-x-auto px-1 pb-2 lg:grid lg:grid-cols-3 lg:overflow-visible">
              {tool.presets.map((preset, index) => (
                <button
                  key={preset.id}
                  type="button"
                  aria-pressed={presetIndex === index}
                  onClick={() =>
                    setState((s) => ({
                      ...s,
                      params: preset.params as Record<string, unknown>,
                      seed: preset.seed ?? s.seed,
                    }))
                  }
                  className="group flex shrink-0 snap-start flex-col gap-1 text-left"
                >
                  <span
                    className="ring-border group-aria-pressed:ring-accent block overflow-hidden rounded-xl ring-1 transition group-hover:ring-2 group-aria-pressed:ring-[3px]"
                    style={{
                      aspectRatio: `${lookThumb.width} / ${lookThumb.height}`,
                      width: portrait ? 72 : undefined,
                    }}
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element -- generated data URI */}
                    <img
                      src={thumbnail(state.toolId, index, lookThumb)}
                      alt=""
                      loading="lazy"
                      className="h-full w-full object-cover"
                    />
                  </span>
                  <span className="text-muted group-aria-pressed:text-foreground max-w-[72px] truncate text-[11px] font-medium lg:max-w-none">
                    {toolLabels?.presets[preset.id] ?? preset.id}
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={newLook}
              className="border-border hover:bg-surface mt-2 flex h-12 w-full items-center justify-between rounded-2xl border px-4 text-sm font-medium"
            >
              <span className="flex items-center gap-2">
                <Shuffle className="size-4" aria-hidden />
                {labels.newLook}
              </span>
              <kbd className="text-muted border-border hidden rounded-md border px-1.5 text-xs font-normal lg:inline">
                {labels.newLookHint}
              </kbd>
            </button>
          </section>

          <section className={panel("finish")} aria-label={labels.finish}>
            <SectionTitle>{labels.finish}</SectionTitle>
            <div className="bg-surface border-border mt-3 flex flex-col gap-4 rounded-2xl border p-4">
              {(
                [
                  ["grain", labels.grain, 100],
                  ["dim", labels.dim, DIM_MAX],
                ] as const
              ).map(([key, label, max]) => (
                <div key={key} className="flex flex-col gap-1.5">
                  <div className="flex justify-between text-sm">
                    <label htmlFor={`${finishId}-${key}`} className="font-medium">
                      {label}
                    </label>
                    <output htmlFor={`${finishId}-${key}`} className="text-muted tabular-nums">
                      {state.finish[key]}
                    </output>
                  </div>
                  <input
                    id={`${finishId}-${key}`}
                    type="range"
                    min={0}
                    max={max}
                    step={1}
                    value={state.finish[key]}
                    onChange={(event) => setFinish({ [key]: event.target.valueAsNumber })}
                    className="range"
                    style={{ "--fill": `${(state.finish[key] / max) * 100}%` } as CSSProperties}
                  />
                </div>
              ))}
              {hasClockZone(resolved) ? (
                <Switch
                  checked={state.finish.calmClock}
                  onChange={(checked) => setFinish({ calmClock: checked })}
                  label={labels.calmClock}
                />
              ) : null}
              {resolved?.device ? (
                <Switch checked={showZones} onChange={setShowZones} label={labels.safeZones} />
              ) : null}
            </div>
          </section>

          <section className={panel("device")} aria-label={labels.device}>
            <SectionTitle>{labels.device}</SectionTitle>
            <div className="relative mt-3">
              <select
                id="device"
                aria-label={labels.device}
                value={deviceValue}
                onChange={(event) => onDeviceChange(event.target.value)}
                className="border-border bg-background h-12 w-full min-w-0 appearance-none rounded-2xl border pr-10 pl-4 text-sm font-medium"
              >
                {detected.kind === "custom" ? (
                  <option value={DETECTED_VALUE}>
                    {labels.yourScreen.replace(
                      "{size}",
                      formatSize(detected.width, detected.height, locale),
                    )}
                  </option>
                ) : null}
                {DEVICE_GROUPS.map((group) => (
                  <optgroup key={group} label={labels.groups[group] ?? group}>
                    {DEVICES.filter((d) => d.group === group).map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.name} ({formatSize(d.width, d.height, locale)})
                      </option>
                    ))}
                  </optgroup>
                ))}
                <option value={CUSTOM_VALUE}>{labels.customSize}</option>
              </select>
              <ChevronDown
                className="text-muted pointer-events-none absolute top-1/2 right-4 size-4 -translate-y-1/2"
                aria-hidden
              />
            </div>
            {state.target.kind === "custom" && deviceValue === CUSTOM_VALUE ? (
              <div className="mt-3 grid grid-cols-2 gap-3">
                {(["width", "height"] as const).map((edge) => (
                  <label key={edge} className="flex flex-col gap-1 text-sm font-medium">
                    {labels[edge]}
                    <input
                      type="number"
                      inputMode="numeric"
                      min={64}
                      max={8192}
                      value={state.target.kind === "custom" ? state.target[edge] : 0}
                      onChange={(event) => onCustomSize(edge, event.target.valueAsNumber)}
                      className="border-border bg-background h-12 rounded-2xl border px-4 tabular-nums"
                    />
                  </label>
                ))}
              </div>
            ) : null}
            <p className="text-muted mt-2 text-xs">{labels.sizeNote.replace("{size}", sizeText)}</p>
          </section>
        </div>

        {/* Actions: sticky at the bottom of the editor on phones, of the column on desktop. */}
        <div className="bg-background/85 border-border sticky bottom-0 z-40 -mx-4 mt-4 border-t px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] backdrop-blur-xl lg:static lg:mx-0 lg:border-t-0 lg:bg-transparent lg:px-0 lg:pb-0 lg:backdrop-blur-none">
          <p
            className="text-muted mb-2 min-h-4 text-center text-xs lg:text-left"
            aria-live="polite"
          >
            {status}
          </p>
          <div className="relative flex gap-2">
            <button
              type="button"
              onClick={newLook}
              aria-label={labels.newLook}
              className="border-border hover:bg-surface flex h-14 shrink-0 items-center justify-center gap-2 rounded-2xl border px-5 font-medium active:scale-[0.98]"
            >
              <Shuffle className="size-5" aria-hidden />
              <span className="hidden sm:inline">{labels.newLook}</span>
            </button>
            <button
              type="button"
              disabled={busy}
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen((open) => !open)}
              className="bg-accent flex h-14 flex-1 items-center justify-center gap-2 rounded-2xl font-semibold text-white shadow-lg shadow-indigo-500/25 transition active:scale-[0.98] disabled:opacity-60"
            >
              <Download className="size-5" aria-hidden />
              {busy ? labels.exporting : labels.download}
            </button>
            {downloadMenu}
          </div>
        </div>
      </div>
    </div>
  );
}

function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="hidden text-sm font-semibold lg:block">{children}</h2>;
}

function MenuItem({
  title,
  onClick,
  icon,
}: {
  title: string;
  onClick: () => void;
  icon?: ReactNode;
}) {
  return (
    <button
      type="button"
      role="menuitem"
      onClick={onClick}
      className="hover:bg-surface flex h-12 w-full items-center gap-3 rounded-xl px-3 text-left text-sm font-medium"
    >
      {icon ?? <Download className="text-muted size-4" aria-hidden />}
      {title}
    </button>
  );
}

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="flex min-h-11 w-full items-center justify-between gap-3 text-left text-sm font-medium"
    >
      {label}
      <span
        aria-hidden
        className={`relative h-7 w-12 shrink-0 rounded-full transition ${checked ? "bg-accent" : "bg-neutral-300 dark:bg-neutral-600"}`}
      >
        <span
          className={`absolute top-0.5 size-6 rounded-full bg-white shadow transition-all ${checked ? "left-[22px]" : "left-0.5"}`}
        />
      </span>
    </button>
  );
}
