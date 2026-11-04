"use client";

import { DEVICE_GROUPS, DEVICES, detectScreen, type SafeZone } from "@musterli/devices";
import { createRng } from "@musterli/engine";
import {
  defaultRasterEnv,
  downloadBlob,
  exportRaster,
  renderDesignSvg,
  svgToDataUri,
} from "@musterli/exporters";
import { createRenderContext, type AnyToolDefinition } from "@musterli/tool-registry";
import { useCallback, useEffect, useState } from "react";

import { formatSize } from "@/lib/format";
import { WALLPAPER_TOOL_IDS, wallpaperTool, type WallpaperToolId } from "@/lib/generators";
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
  look: string;
  newLook: string;
  newLookHint: string;
  safeZones: string;
  downloadPng: string;
  downloadJpg: string;
  exporting: string;
  exportFailed: string;
  copyLink: string;
  linkCopied: string;
  previewAlt: string;
  sizeNote: string;
  groups: Record<string, string>;
  zones: Record<SafeZone["kind"], string>;
  tools: Record<string, { name: string; presets: Record<string, string> }>;
}

interface WallpaperEditorProps {
  locale: string;
  labels: EditorLabels;
}

const CUSTOM_VALUE = "custom";
const DETECTED_VALUE = "detected";

function randomSeed(): number {
  return crypto.getRandomValues(new Uint32Array(1))[0] ?? 1;
}

/** Starts from the first look of a generator. */
function startState(toolId: WallpaperToolId, target: Target): WallpaperState {
  const tool = wallpaperTool(toolId);
  const preset = tool.presets[0];
  return {
    toolId,
    params: (preset?.params ?? tool.defaults) as Record<string, unknown>,
    seed: preset?.seed ?? randomSeed(),
    target,
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

function initialState(): WallpaperState {
  return stateFromHash(window.location.hash) ?? startState(WALLPAPER_TOOL_IDS[0], detectedTarget());
}

/** Keys typed into a form control must not trigger the space shortcut. */
function isTypingTarget(target: EventTarget | null): boolean {
  return (
    target instanceof HTMLElement &&
    (target.isContentEditable || ["INPUT", "SELECT", "TEXTAREA", "BUTTON"].includes(target.tagName))
  );
}

export default function WallpaperEditor({ locale, labels }: WallpaperEditorProps) {
  const [state, setState] = useState<WallpaperState>(initialState);
  const [detected] = useState<Target>(detectedTarget);
  const [showZones, setShowZones] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(false);
  const [copied, setCopied] = useState(false);

  const tool: AnyToolDefinition = wallpaperTool(state.toolId);
  const resolved = resolveTarget(state.target) ?? resolveTarget(detected);
  const sizeText = resolved ? formatSize(resolved.width, resolved.height, locale) : "";

  // Plain computation: the React Compiler memoizes it per (tool, params, seed, size).
  const svg = resolved
    ? renderDesignSvg(tool, state.params, createRenderContext(state.seed, resolved.design))
    : "";
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

  async function download(format: "png" | "jpg") {
    if (!resolved) return;
    setBusy(true);
    setError(false);
    try {
      const result = await exportRaster(
        tool,
        state.params,
        createRenderContext(state.seed, resolved.design),
        { format, size: { width: resolved.width, height: resolved.height }, svg },
        await defaultRasterEnv(),
      );
      const name =
        state.target.kind === "device" ? state.target.id : `${resolved.width}x${resolved.height}`;
      downloadBlob(result.blob, `wallpaper-${name}-${state.toolId}-${state.seed}.${format}`);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
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
  const presetId = tool.presets.find(
    (preset) => JSON.stringify(preset.params) === JSON.stringify(state.params),
  )?.id;
  const portrait = resolved ? resolved.height > resolved.width : false;
  const zones = showZones ? (resolved?.device?.safeZones ?? []) : [];

  return (
    <div className="grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_320px]">
      <div className="bg-surface border-border flex min-h-[420px] items-center justify-center rounded-[14px] border p-4 sm:p-8">
        {resolved && src ? (
          <div
            className={`relative box-content overflow-hidden shadow-xl ${portrait ? "rounded-[28px] border-[6px] border-neutral-900" : "rounded-md border-[6px] border-neutral-900"}`}
            style={{
              aspectRatio: `${resolved.width} / ${resolved.height}`,
              // Content box plus a 6px frame on each side; the aspect ratio sets the height.
              width: portrait
                ? `min(calc(100% - 12px), calc(min(70vh, 640px) * ${resolved.width / resolved.height}))`
                : "calc(100% - 12px)",
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
              <div
                key={zone.kind}
                aria-hidden="true"
                className="absolute flex items-center justify-center border border-dashed border-white/80 bg-black/15 text-[10px] font-medium text-white sm:text-xs"
                style={{
                  left: `${zone.rect.x * 100}%`,
                  top: `${zone.rect.y * 100}%`,
                  width: `${zone.rect.width * 100}%`,
                  height: `${zone.rect.height * 100}%`,
                }}
              >
                {zone.rect.height > 0.08 ? labels.zones[zone.kind] : null}
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <div className="flex min-w-0 flex-col gap-6">
        <div className="flex flex-col gap-2">
          <label htmlFor="device" className="text-sm font-medium">
            {labels.device}
          </label>
          <select
            id="device"
            value={deviceValue}
            onChange={(event) => onDeviceChange(event.target.value)}
            className="border-border bg-background h-10 w-full min-w-0 rounded-lg border px-3"
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
          {state.target.kind === "custom" && deviceValue === CUSTOM_VALUE ? (
            <div className="grid grid-cols-2 gap-3">
              {(["width", "height"] as const).map((edge) => (
                <label key={edge} className="flex flex-col gap-1 text-sm">
                  {labels[edge]}
                  <input
                    type="number"
                    min={64}
                    max={8192}
                    value={state.target.kind === "custom" ? state.target[edge] : 0}
                    onChange={(event) => onCustomSize(edge, event.target.valueAsNumber)}
                    className="border-border bg-background h-10 rounded-lg border px-3 tabular-nums"
                  />
                </label>
              ))}
            </div>
          ) : null}
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium">{labels.style}</legend>
          <div className="flex flex-wrap gap-2">
            {WALLPAPER_TOOL_IDS.map((id) => (
              <button
                key={id}
                type="button"
                aria-pressed={state.toolId === id}
                onClick={() => setState((s) => startState(id, s.target))}
                className="border-border hover:bg-surface aria-pressed:bg-accent aria-pressed:border-accent rounded-full border px-3 py-1.5 text-sm aria-pressed:text-white"
              >
                {labels.tools[id]?.name ?? id}
              </button>
            ))}
          </div>
        </fieldset>

        <div className="flex flex-col gap-2">
          <label htmlFor="look" className="text-sm font-medium">
            {labels.look}
          </label>
          <select
            id="look"
            value={presetId ?? ""}
            onChange={(event) => {
              const preset = tool.presets.find((p) => p.id === event.target.value);
              if (preset)
                setState((s) => ({
                  ...s,
                  params: preset.params as Record<string, unknown>,
                  seed: preset.seed ?? s.seed,
                }));
            }}
            className="border-border bg-background h-10 w-full min-w-0 rounded-lg border px-3"
          >
            {presetId === undefined ? <option value="">{labels.newLook}</option> : null}
            {tool.presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {toolLabels?.presets[preset.id] ?? preset.id}
              </option>
            ))}
          </select>
        </div>

        <button
          type="button"
          onClick={newLook}
          className="border-border hover:bg-surface flex h-11 items-center justify-between rounded-full border px-5 font-medium"
        >
          {labels.newLook}
          <kbd className="text-muted border-border rounded border px-1.5 text-xs font-normal">
            {labels.newLookHint}
          </kbd>
        </button>

        {resolved?.device ? (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showZones}
              onChange={(event) => setShowZones(event.target.checked)}
              className="accent-accent size-4"
            />
            {labels.safeZones}
          </label>
        ) : null}

        <div className="flex flex-col gap-2">
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={busy}
              onClick={() => void download("png")}
              className="bg-accent h-11 rounded-full font-medium text-white disabled:opacity-60"
            >
              {busy ? labels.exporting : labels.downloadPng}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => void download("jpg")}
              className="border-border hover:bg-surface h-11 rounded-full border font-medium disabled:opacity-60"
            >
              {labels.downloadJpg}
            </button>
          </div>
          <p className="text-muted text-sm" aria-live="polite">
            {error ? labels.exportFailed : labels.sizeNote.replace("{size}", sizeText)}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void copyLink()}
          className="text-accent-text self-start text-sm underline-offset-4 hover:underline"
          aria-live="polite"
        >
          {copied ? labels.linkCopied : labels.copyLink}
        </button>
      </div>
    </div>
  );
}
