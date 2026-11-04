import { devicesInGroup, type Device } from "@musterli/devices";

import { darkVersion, type Finish } from "./finish";
import type { WallpaperToolId } from "./generators";
import { resolveTarget, type ResolvedTarget, type Target } from "./target";

/** One image of a download: where it goes in the ZIP and how it is rendered. */
export interface SetItem {
  readonly path: string;
  readonly target: ResolvedTarget;
  readonly finish: Finish;
}

/** Most images a set may hold; the largest group (iPhone) has 7 devices. */
export const SET_MAX_ITEMS = 16;

function targetName(target: Target): string {
  return target.kind === "device" ? target.id : `${target.width}x${target.height}`;
}

export function wallpaperBaseName(target: Target, toolId: WallpaperToolId, seed: number): string {
  return `wallpaper-${targetName(target)}-${toolId}-${seed}`;
}

/** Light and dark version of one wallpaper (the dark one dimmed, `darkVersion`). */
export function pairItems(
  target: Target,
  toolId: WallpaperToolId,
  seed: number,
  finish: Finish,
): SetItem[] {
  const resolved = resolveTarget(target);
  if (!resolved) return [];
  const base = wallpaperBaseName(target, toolId, seed);
  return [
    { path: `${base}-light.png`, target: resolved, finish },
    { path: `${base}-dark.png`, target: resolved, finish: darkVersion(finish) },
  ];
}

/**
 * The same look for every device of a group, each at its own native size.
 * With `withDark`, a dark version of each joins in a `dark/` folder.
 */
export function groupItems(
  device: Device,
  toolId: WallpaperToolId,
  seed: number,
  finish: Finish,
  withDark = false,
): SetItem[] {
  const items: SetItem[] = [];
  for (const member of devicesInGroup(device.group)) {
    const target: Target = { kind: "device", id: member.id };
    const resolved = resolveTarget(target);
    if (!resolved) continue;
    const name = `${wallpaperBaseName(target, toolId, seed)}.png`;
    items.push({ path: name, target: resolved, finish });
    if (withDark)
      items.push({ path: `dark/${name}`, target: resolved, finish: darkVersion(finish) });
  }
  return items.slice(0, SET_MAX_ITEMS);
}
