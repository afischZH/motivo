import { decodeDesign, encodeDesign } from "@musterli/editor-ui/share";
import { getDevice } from "@musterli/devices";

import { isWallpaperToolId, type WallpaperToolId } from "./generators";
import { clampEdge, resolveTarget, type Target } from "./target";

/** Everything a wallpaper link restores. */
export interface WallpaperState {
  readonly toolId: WallpaperToolId;
  readonly params: Readonly<Record<string, unknown>>;
  readonly seed: number;
  readonly target: Target;
}

const CUSTOM = /^(\d{2,5})x(\d{2,5})$/;

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
 * device id or `<width>x<height>` for a custom size. Returns undefined when
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
  };
}
