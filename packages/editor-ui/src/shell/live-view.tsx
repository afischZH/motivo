"use client";

/**
 * Live view (`ToolDefinition.liveView`, M4b-AP07): web pages in sandboxed
 * frames over parts of the preview (the screens of a website mockup), and
 * "Take this view", which captures them with the browser's screen capture
 * of this tab and writes the pictures into the tool's image params.
 *
 * Everything stays in the browser: the visitor's browser loads the page
 * directly (Musterli never fetches it), the capture is drawn into a canvas
 * here and goes through the normal upload pipeline (PNG, size limits,
 * local params never in share links). Many sites forbid framing
 * (X-Frame-Options, `frame-ancestors`); that cannot be detected from here,
 * so a hint is always shown with the frames.
 */
import {
  createRenderContext,
  type AnyToolDefinition,
  type CanvasSize,
  type ImageAsset,
  type LiveFrame,
  type Params,
  type ParamsSchema,
} from "@musterli/tool-registry";
import {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
} from "react";
import { finishAsset, readAsset } from "../asset-input/prepare";
import { useAssetServices, useSvgSanitizer } from "../asset-input/services-context";
import { useT } from "../i18n";
import type { ParamValues } from "../store/editor-store";
import { useEditorStoreApi } from "../store/react";
import { BUTTON_CLASS } from "./styles";

/** Sandbox of every live frame: the page runs, keeps its own origin, may submit forms and open popups. */
export const LIVE_FRAME_SANDBOX = "allow-scripts allow-same-origin allow-forms allow-popups";

/** Longest edge of a captured picture (the screenshot schema's limit). */
const CAPTURE_MAX_EDGE = 3840;

/** Frames of the tool for these params (empty without `liveView` or when it is off). */
export function liveFramesOf(
  tool: AnyToolDefinition,
  params: ParamValues,
  seed: number,
  size: CanvasSize,
): readonly LiveFrame[] {
  const view = tool.liveView;
  if (!view) return [];
  // The store only holds params that passed the tool's schema.
  return view.frames(params as Params<ParamsSchema>, createRenderContext(seed, size));
}

const pct = (v: number, of: number) => `${(v / Math.max(1, of)) * 100}%`;

/** `border-radius` in percent of the box, so it scales with the preview. */
export function radiiPercent(f: Pick<LiveFrame, "width" | "height" | "radii">): string {
  const h = f.radii.map((r) => pct(r, f.width)).join(" ");
  const v = f.radii.map((r) => pct(r, f.height)).join(" ");
  return `${h} / ${v}`;
}

/**
 * Mask that hides the parts of a frame the design paints on top (devices
 * in front, a camera cut-out), as an SVG data URL in the frame's own
 * design px. An SVG `<mask>` inside the image, so it works with the
 * default alpha mask mode.
 */
export function occluderMask(f: Pick<LiveFrame, "x" | "y" | "width" | "height" | "occluders">) {
  if (f.occluders.length === 0) return null;
  const box = `x="${f.x}" y="${f.y}" width="${f.width}" height="${f.height}"`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${f.x} ${f.y} ${f.width} ${f.height}" preserveAspectRatio="none">` +
    `<mask id="m"><rect ${box} fill="#fff"/><path d="${f.occluders.join("")}" fill="#000"/></mask>` +
    `<rect ${box} fill="#000" mask="url(#m)"/></svg>`;
  return `url("data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}")`;
}

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

/** Region Capture (Chrome): crops a tab capture to one element. Not in the DOM typings yet. */
interface CropTargetStatic {
  fromElement(element: Element): Promise<unknown>;
}
type CroppableTrack = MediaStreamTrack & { cropTo?(target: unknown): Promise<void> };

const noopSubscribe = () => () => undefined;

/** Whether this browser can capture the tab (`getDisplayMedia`). */
export function canCaptureTab(): boolean {
  return (
    typeof navigator !== "undefined" &&
    typeof navigator.mediaDevices?.getDisplayMedia === "function" &&
    typeof document !== "undefined"
  );
}

const nextFrame = () =>
  new Promise<void>((resolve) =>
    requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
  );
const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/** Waits for a new video frame (after a crop or a layout change). */
async function freshFrame(video: HTMLVideoElement): Promise<void> {
  const v = video as HTMLVideoElement & {
    requestVideoFrameCallback?(cb: () => void): number;
  };
  if (typeof v.requestVideoFrameCallback === "function") {
    await Promise.race([
      new Promise<void>((resolve) => v.requestVideoFrameCallback?.(() => resolve())),
      sleep(1000),
    ]);
  } else {
    await sleep(250);
  }
}

/** Part of the video showing `rect` (CSS px of the viewport), scaled to the video. */
export function cropOfViewport(
  rect: { x: number; y: number; width: number; height: number },
  viewport: { width: number; height: number },
  video: { width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  const sx = video.width / Math.max(1, viewport.width);
  const sy = video.height / Math.max(1, viewport.height);
  const x = Math.max(0, Math.round(rect.x * sx));
  const y = Math.max(0, Math.round(rect.y * sy));
  return {
    x,
    y,
    width: Math.max(1, Math.min(video.width - x, Math.round(rect.width * sx))),
    height: Math.max(1, Math.min(video.height - y, Math.round(rect.height * sy))),
  };
}

async function grab(
  video: HTMLVideoElement,
  crop: { x: number; y: number; width: number; height: number },
): Promise<Blob | null> {
  const k = Math.min(1, CAPTURE_MAX_EDGE / Math.max(crop.width, crop.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(crop.width * k));
  canvas.height = Math.max(1, Math.round(crop.height * k));
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;
  ctx.drawImage(video, crop.x, crop.y, crop.width, crop.height, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

export type LiveCaptureState =
  | { kind: "idle" }
  | { kind: "busy"; frameId: string | null }
  | { kind: "done"; count: number }
  | { kind: "error"; reason: "denied" | "failed" | "unsupported" };

export interface LiveViewApi {
  frames: readonly LiveFrame[];
  state: LiveCaptureState;
  /** Frame shown enlarged for the capture, or `null`. */
  capturing: string | null;
  supported: boolean;
  capture(): Promise<void>;
  register(id: string, element: HTMLIFrameElement | null): void;
}

/** State and capture of the live view for the current design. */
export function useLiveView(
  tool: AnyToolDefinition,
  params: ParamValues,
  seed: number,
  size: CanvasSize,
): LiveViewApi {
  const store = useEditorStoreApi();
  const getServices = useAssetServices();
  const getSanitizer = useSvgSanitizer();
  const frames = useMemo(() => liveFramesOf(tool, params, seed, size), [tool, params, seed, size]);
  const [state, setState] = useState<LiveCaptureState>({ kind: "idle" });
  // After hydration only: the server cannot know the browser.
  const supported = useSyncExternalStore(noopSubscribe, canCaptureTab, () => false);
  const elements = useRef(new Map<string, HTMLIFrameElement>());

  const register = useCallback((id: string, element: HTMLIFrameElement | null) => {
    if (element) elements.current.set(id, element);
    else elements.current.delete(id);
  }, []);

  const capture = useCallback(async () => {
    const targets = frames.filter((f) => f.param);
    if (targets.length === 0 || !canCaptureTab()) {
      setState({ kind: "error", reason: "unsupported" });
      return;
    }
    setState({ kind: "busy", frameId: null });
    let stream: MediaStream;
    try {
      // Chrome: offer this tab first; the capture never leaves the page.
      stream = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
        preferCurrentTab: true,
        selfBrowserSurface: "include",
      } as DisplayMediaStreamOptions);
    } catch {
      setState({ kind: "error", reason: "denied" });
      return;
    }
    const track = stream.getVideoTracks()[0] as CroppableTrack | undefined;
    const video = document.createElement("video");
    video.muted = true;
    video.playsInline = true;
    const patch: Record<string, ImageAsset> = {};
    try {
      if (!track) throw new Error("no video track");
      video.srcObject = stream;
      await video.play();
      const cropTarget = (globalThis as { CropTarget?: CropTargetStatic }).CropTarget;
      const services = getServices();
      const svg = getSanitizer();
      for (const frame of targets) {
        setState({ kind: "busy", frameId: frame.id });
        // The frame is shown enlarged (fixed, on top) so the picture has as many pixels as possible.
        await nextFrame();
        await sleep(150);
        const element = elements.current.get(frame.id);
        if (!element) continue;
        let region: { x: number; y: number; width: number; height: number };
        if (cropTarget && typeof track.cropTo === "function") {
          await track.cropTo(await cropTarget.fromElement(element));
          await freshFrame(video);
          region = { x: 0, y: 0, width: video.videoWidth, height: video.videoHeight };
        } else {
          await freshFrame(video);
          const r = element.getBoundingClientRect();
          region = cropOfViewport(
            r,
            { width: window.innerWidth, height: window.innerHeight },
            { width: video.videoWidth, height: video.videoHeight },
          );
        }
        const blob = await grab(video, region);
        if (!blob) throw new Error("no picture");
        const file = new File([blob], `${frame.id}-live.png`, { type: "image/png" });
        const read = await readAsset(file, { svg });
        if (!read.ok) throw new Error(read.error);
        const schema = tool.schema.shape[frame.param] as
          { safeParse(value: unknown): { success: boolean; data?: unknown } } | undefined;
        const done = await finishAsset(
          read.source,
          { x: 0, y: 0, w: 1, h: 1 },
          { ...services, svg },
          undefined,
          {
            maxEdge: CAPTURE_MAX_EDGE,
            ...(schema ? { schema } : {}),
          },
        );
        if (!done.ok) throw new Error(done.error);
        patch[frame.param] = done.asset;
      }
    } catch {
      setState({ kind: "error", reason: "failed" });
      return;
    } finally {
      for (const t of stream.getTracks()) t.stop();
      video.srcObject = null;
    }
    const count = Object.keys(patch).length;
    store.getState().setParams({ ...patch, ...(tool.liveView?.afterCapture ?? {}) });
    setState({ kind: "done", count });
  }, [frames, getServices, getSanitizer, store, tool]);

  const capturing = state.kind === "busy" ? state.frameId : null;
  return { frames, state, capturing, supported, capture, register };
}

// ---------------------------------------------------------------------------
// Views
// ---------------------------------------------------------------------------

function LiveFrameView({
  frame,
  size,
  enlarged,
  register,
}: {
  frame: LiveFrame;
  size: CanvasSize;
  enlarged: boolean;
  register(id: string, element: HTMLIFrameElement | null): void;
}) {
  const t = useT();
  const boxRef = useRef<HTMLDivElement>(null);
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const el = boxRef.current;
    if (!el) return;
    const measure = () => setShown(el.getBoundingClientRect().width);
    measure();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, [enlarged]);
  const mask = useMemo(() => occluderMask(frame), [frame]);
  const onRef = useCallback(
    (el: HTMLIFrameElement | null) => register(frame.id, el),
    [frame.id, register],
  );

  const box: CSSProperties = enlarged
    ? {
        // On top of everything while the capture runs, as large as the window allows.
        position: "fixed",
        zIndex: 2147483647,
        left: "50%",
        top: "50%",
        width: `min(${frame.viewportWidth}px, 96vw, calc(96vh * ${frame.viewportWidth / frame.viewportHeight}))`,
        aspectRatio: `${frame.viewportWidth} / ${frame.viewportHeight}`,
        transform: "translate(-50%, -50%)",
        overflow: "hidden",
        pointerEvents: "auto",
      }
    : {
        position: "absolute",
        left: pct(frame.x, size.width),
        top: pct(frame.y, size.height),
        width: pct(frame.width, size.width),
        height: pct(frame.height, size.height),
        borderRadius: radiiPercent(frame),
        overflow: "hidden",
        pointerEvents: "auto",
        ...(mask ? { maskImage: mask, maskSize: "100% 100%", maskRepeat: "no-repeat" } : {}),
      };
  const k = shown > 0 ? shown / frame.viewportWidth : 0;
  return (
    <div ref={boxRef} style={box} data-live-frame={frame.id}>
      <iframe
        ref={onRef}
        src={frame.url}
        title={t("Editor.live.frameTitle", { device: t(frame.titleKey) })}
        sandbox={LIVE_FRAME_SANDBOX}
        referrerPolicy="no-referrer"
        loading="lazy"
        style={{
          width: frame.viewportWidth,
          height: frame.viewportHeight,
          border: 0,
          transform: `scale(${k})`,
          transformOrigin: "0 0",
          background: "#fff",
          visibility: k > 0 ? "visible" : "hidden",
        }}
      />
    </div>
  );
}

/** The frames over the preview (inside the box sized like the motif). */
export function LiveFrameLayer({ live, size }: { live: LiveViewApi; size: CanvasSize }) {
  if (live.frames.length === 0) return null;
  return (
    <div className="pointer-events-none absolute inset-0" data-testid="live-layer">
      {live.capturing !== null && (
        <div aria-hidden="true" className="fixed inset-0 z-[2147483646] bg-background/90" />
      )}
      {live.frames.map((frame) => (
        <LiveFrameView
          key={frame.id}
          frame={frame}
          size={size}
          enlarged={live.capturing === frame.id}
          register={live.register}
        />
      ))}
    </div>
  );
}

/** Hint, capture button and status under the preview while live frames show. */
export function LiveCaptureBar({ live }: { live: LiveViewApi }) {
  const t = useT();
  const id = useId();
  if (live.frames.length === 0) return null;
  const busy = live.state.kind === "busy";
  const status =
    live.state.kind === "busy"
      ? t("Editor.live.capturing")
      : live.state.kind === "done"
        ? t("Editor.live.done", { count: live.state.count })
        : live.state.kind === "error"
          ? t(`Editor.live.errors.${live.state.reason}`)
          : "";
  return (
    <div
      className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-border px-4 py-2 text-sm"
      data-testid="live-bar"
    >
      <p id={`${id}-hint`} className="min-w-0 flex-1 basis-64 text-muted-foreground">
        {t("Editor.live.hint")}
        {!live.supported && ` ${t("Editor.live.unsupported")}`}
      </p>
      <button
        type="button"
        className={BUTTON_CLASS}
        onClick={() => void live.capture()}
        disabled={busy || !live.supported}
        aria-describedby={`${id}-hint`}
        data-testid="live-capture"
      >
        {t("Editor.live.capture")}
      </button>
      <p role="status" aria-live="polite" className="basis-full empty:hidden">
        {status}
      </p>
    </div>
  );
}
