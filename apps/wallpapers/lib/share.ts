import { decodeDesign, encodeDesign } from "@musterli/editor-ui/share";
import { getDevice } from "@musterli/devices";

import { clampFinish, isPlainFinish, NO_FINISH, type Finish } from "./finish";
import { isWallpaperToolId, type WallpaperToolId } from "./generators";
import { clampEdge, resolveTarget, type Target } from "./target";

/** Everything a wallpaper link restores. */
export interface WallpaperState {
  readonly toolId: WallpaperToolId;
  readonly params: Readonly<Record<string, unknown>>;
  readonly seed: number;
  readonly target: Target;
  readonly finish: Finish;
}

const CUSTOM = /^(\d{2,5})x(\d{2,5})$/;
const FINISH = /^(\d{1,3})\.(\d{1,3})\.([01])$/;

/** `<grain>.<dim>.<calm clock 0|1>`, e.g. `30.0.1`. */
function finishToken(finish: Finish): string {
  return `${finish.grain}.${finish.dim}.${finish.calmClock ? 1 : 0}`;
}

function parseFinish(token: string | null): Finish {
  const match = token ? FINISH.exec(token) : null;
  if (!match) return NO_FINISH;
  return clampFinish({
    grain: Number(match[1]),
    dim: Number(match[2]),
    calmClock: match[3] === "1",
  });
}

function targetToken(target: Target): string {
  return target.kind === "device" ? target.id : `${target.width}x${target.height}`;
}

function parseTarget(token: string | null): Target | undefined {
  if (!token) return undefined;
  const custom = CUSTOM.exec(token);
  if (custom) {
    return {
      kind: "custom",
      width: clampEdge(Number(custom[1])),
      height: clampEdge(Number(custom[2])),
    };
  }
  return getDevice(token) ? { kind: "device", id: token } : undefined;
}

/**
 * URL hash of a wallpaper: `d` is Musterli's share code (tool, params, seed,
 * design size; validated through the tool schema on the way back), `t` the
 * device id or `<width>x<height>` for a custom size, `f` the finish (left
 * out when plain, so T1 links stay valid). Returns undefined when
 * the design does not fit into a link.
 */
export function stateToHash(state: WallpaperState): string | undefined {
  const resolved = resolveTarget(state.target);
  if (!resolved) return undefined;
  const code = encodeDesign({
    toolId: state.toolId,
    params: state.params as Record<string, unknown>,
    seed: state.seed,
    size: resolved.design,
  });
  if (!code.ok) return undefined;
  const query = new URLSearchParams({ d: code.value, t: targetToken(state.target) });
  if (!isPlainFinish(state.finish)) query.set("f", finishToken(state.finish));
  return `#${query.toString()}`;
}

/** Reads a hash written by `stateToHash`. Never throws; undefined on anything invalid. */
export function stateFromHash(hash: string): WallpaperState | undefined {
  const query = new URLSearchParams(hash.replace(/^#/, ""));
  const target = parseTarget(query.get("t"));
  const code = query.get("d");
  if (!target || !code) return undefined;
  const decoded = decodeDesign(code);
  if (!decoded.ok || !isWallpaperToolId(decoded.design.toolId)) return undefined;
  return {
    toolId: decoded.design.toolId,
    params: decoded.design.params,
    seed: decoded.design.seed,
    target,
    finish: parseFinish(query.get("f")),
  };
}
