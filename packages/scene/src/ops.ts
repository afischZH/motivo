/**
 * Pure scene operations for the editor: add, remove, reorder, duplicate,
 * group, move, align and distribute. Each returns a new scene (or the same
 * one when nothing changed), never mutates. The background stays the bottom
 * layer and is never moved, grouped or aligned; locked layers are not moved.
 */
import { inferConstraints } from "./constraints";
import { boundsOf, frameOf, unionBoxes, type Box } from "./geometry";
import type { Layer, Scene, SceneGroup } from "./schema";
import { SCENE_LAYERS_MAX } from "./schema";

const isBackground = (l: Layer) => l.kind === "background";

/** Index of the first layer above the background. */
function firstFree(scene: Scene): number {
  return scene.layers[0]?.kind === "background" ? 1 : 0;
}

export function findLayer(scene: Scene, id: string): Layer | undefined {
  return scene.layers.find((l) => l.id === id);
}

/** Selected ids plus every member of a group one of them belongs to, in scene order. */
export function expandSelection(scene: Scene, ids: readonly string[]): string[] {
  const wanted = new Set(ids);
  const groups = new Set<string>();
  for (const l of scene.layers) if (wanted.has(l.id) && l.groupId) groups.add(l.groupId);
  return scene.layers
    .filter((l) => wanted.has(l.id) || (l.groupId !== null && groups.has(l.groupId)))
    .map((l) => l.id);
}

export function updateLayer(scene: Scene, id: string, change: (layer: Layer) => Layer): Scene {
  let changed = false;
  const layers = scene.layers.map((l) => {
    if (l.id !== id) return l;
    const next = change(l);
    if (next !== l) changed = true;
    return next;
  });
  return changed ? { ...scene, layers } : scene;
}

export function updateLayers(
  scene: Scene,
  ids: readonly string[],
  change: (layer: Layer) => Layer,
): Scene {
  const set = new Set(ids);
  let changed = false;
  const layers = scene.layers.map((l) => {
    if (!set.has(l.id)) return l;
    const next = change(l);
    if (next !== l) changed = true;
    return next;
  });
  return changed ? { ...scene, layers } : scene;
}

/**
 * Adds a layer on top (or right above `aboveId`). A background replaces the
 * existing one at the bottom. Returns the same scene when the layer limit
 * is reached.
 */
export function addLayer(scene: Scene, layer: Layer, aboveId?: string): Scene {
  if (layer.kind === "background") {
    const rest = scene.layers.filter((l) => !isBackground(l));
    return { ...scene, layers: [layer, ...rest] };
  }
  if (scene.layers.length >= SCENE_LAYERS_MAX) return scene;
  const layers = [...scene.layers];
  const anchor = aboveId ? layers.findIndex((l) => l.id === aboveId) : -1;
  const at = anchor >= 0 ? Math.max(anchor + 1, firstFree(scene)) : layers.length;
  layers.splice(at, 0, layer);
  return { ...scene, layers };
}

/** Removes layers; groups left with fewer than two members dissolve. */
export function removeLayers(scene: Scene, ids: readonly string[]): Scene {
  const set = new Set(ids);
  const layers = scene.layers.filter((l) => !set.has(l.id));
  if (layers.length === scene.layers.length) return scene;
  return pruneGroups({ ...scene, layers });
}

function pruneGroups(scene: Scene): Scene {
  const counts = new Map<string, number>();
  for (const l of scene.layers)
    if (l.groupId) counts.set(l.groupId, (counts.get(l.groupId) ?? 0) + 1);
  const keep = new Set([...counts].filter(([, n]) => n >= 2).map(([id]) => id));
  const groups = scene.groups.filter((g) => keep.has(g.id));
  if (groups.length === scene.groups.length) return scene;
  return {
    ...scene,
    groups,
    layers: scene.layers.map((l) =>
      l.groupId !== null && !keep.has(l.groupId) ? { ...l, groupId: null } : l,
    ),
  };
}

/** Moves a layer to `index` (clamped above the background). */
export function reorderLayer(scene: Scene, id: string, index: number): Scene {
  const from = scene.layers.findIndex((l) => l.id === id);
  const layer = scene.layers[from];
  if (!layer || isBackground(layer)) return scene;
  const layers = [...scene.layers];
  layers.splice(from, 1);
  const to = Math.max(firstFree({ ...scene, layers }), Math.min(layers.length, Math.round(index)));
  if (to === from) return scene;
  layers.splice(to, 0, layer);
  return { ...scene, layers };
}

export type StackMove = "up" | "down" | "top" | "bottom";

export function moveInStack(scene: Scene, id: string, move: StackMove): Scene {
  const from = scene.layers.findIndex((l) => l.id === id);
  if (from < 0) return scene;
  const target =
    move === "up"
      ? from + 1
      : move === "down"
        ? from - 1
        : move === "top"
          ? scene.layers.length - 1
          : 0;
  return reorderLayer(scene, id, target);
}

/** Copies layers right above the topmost of them, with new ids and a small offset. */
export function duplicateLayers(
  scene: Scene,
  ids: readonly string[],
  newId: () => string,
  offset = 24,
): { scene: Scene; ids: string[] } {
  const set = new Set(ids);
  const copies: Layer[] = [];
  for (const l of scene.layers) {
    if (!set.has(l.id) || isBackground(l)) continue;
    copies.push({
      ...l,
      id: newId(),
      groupId: null,
      x: l.x + offset,
      y: l.y + offset,
      locked: false,
    } as Layer);
  }
  if (copies.length === 0 || scene.layers.length + copies.length > SCENE_LAYERS_MAX) {
    return { scene, ids: [] };
  }
  const top = Math.max(...scene.layers.map((l, i) => (set.has(l.id) ? i : -1)));
  const layers = [...scene.layers];
  layers.splice(top + 1, 0, ...copies);
  return { scene: { ...scene, layers }, ids: copies.map((c) => c.id) };
}

/** Groups at least two layers (not the background); members leave other groups. */
export function groupLayers(
  scene: Scene,
  ids: readonly string[],
  group: Pick<SceneGroup, "id" | "name">,
): Scene {
  const set = new Set(ids);
  const members = scene.layers.filter((l) => set.has(l.id) && !isBackground(l));
  if (members.length < 2) return scene;
  const box = unionBoxes(members.map((l) => boundsOf(frameOf(l))));
  if (!box) return scene;
  const next: Scene = {
    ...scene,
    groups: [...scene.groups, { ...group, constraints: inferConstraints(box, scene.format) }],
    layers: scene.layers.map((l) =>
      set.has(l.id) && !isBackground(l) ? { ...l, groupId: group.id } : l,
    ),
  };
  return pruneGroups(next);
}

export function ungroup(scene: Scene, groupId: string): Scene {
  if (!scene.groups.some((g) => g.id === groupId)) return scene;
  return {
    ...scene,
    groups: scene.groups.filter((g) => g.id !== groupId),
    layers: scene.layers.map((l) => (l.groupId === groupId ? { ...l, groupId: null } : l)),
  };
}

/** Moves unlocked layers by a delta. */
export function moveLayers(scene: Scene, ids: readonly string[], dx: number, dy: number): Scene {
  if (dx === 0 && dy === 0) return scene;
  return updateLayers(scene, ids, (l) =>
    l.locked || isBackground(l) ? l : { ...l, x: l.x + dx, y: l.y + dy },
  );
}

export type AlignMode = "left" | "hcenter" | "right" | "top" | "vcenter" | "bottom";

function movable(scene: Scene, ids: readonly string[]): Layer[] {
  const set = new Set(ids);
  return scene.layers.filter((l) => set.has(l.id) && !isBackground(l) && !l.locked);
}

/** Units for alignment: a group moves as one box, other layers alone. */
function units(layers: readonly Layer[]): { ids: string[]; box: Box }[] {
  const byGroup = new Map<string, Layer[]>();
  const out: { ids: string[]; box: Box }[] = [];
  for (const l of layers) {
    if (l.groupId) {
      const list = byGroup.get(l.groupId) ?? [];
      list.push(l);
      byGroup.set(l.groupId, list);
    } else out.push({ ids: [l.id], box: boundsOf(frameOf(l)) });
  }
  for (const members of byGroup.values()) {
    const box = unionBoxes(members.map((m) => boundsOf(frameOf(m))));
    if (box) out.push({ ids: members.map((m) => m.id), box });
  }
  return out;
}

/**
 * Aligns layers: one unit (a single layer or one group) to the canvas,
 * several to the box around them.
 */
export function alignLayers(scene: Scene, ids: readonly string[], mode: AlignMode): Scene {
  const list = units(movable(scene, ids));
  if (list.length === 0) return scene;
  const ref: Box =
    list.length === 1
      ? { x: 0, y: 0, width: scene.format.width, height: scene.format.height }
      : (unionBoxes(list.map((u) => u.box)) ?? { x: 0, y: 0, width: 0, height: 0 });
  let next = scene;
  for (const u of list) {
    const b = u.box;
    const dx =
      mode === "left"
        ? ref.x - b.x
        : mode === "right"
          ? ref.x + ref.width - (b.x + b.width)
          : mode === "hcenter"
            ? ref.x + ref.width / 2 - (b.x + b.width / 2)
            : 0;
    const dy =
      mode === "top"
        ? ref.y - b.y
        : mode === "bottom"
          ? ref.y + ref.height - (b.y + b.height)
          : mode === "vcenter"
            ? ref.y + ref.height / 2 - (b.y + b.height / 2)
            : 0;
    next = moveLayers(next, u.ids, dx, dy);
  }
  return next;
}

/** Spreads at least three units evenly (equal gaps) between the outermost ones. */
export function distributeLayers(scene: Scene, ids: readonly string[], axis: "x" | "y"): Scene {
  const list = units(movable(scene, ids));
  if (list.length < 3) return scene;
  const pos = (b: Box) => (axis === "x" ? b.x : b.y);
  const len = (b: Box) => (axis === "x" ? b.width : b.height);
  const sorted = [...list].sort((a, b) => pos(a.box) - pos(b.box));
  const first = sorted[0];
  const last = sorted[sorted.length - 1];
  if (!first || !last) return scene;
  const span = pos(last.box) + len(last.box) - pos(first.box);
  const total = sorted.reduce((sum, u) => sum + len(u.box), 0);
  const gap = (span - total) / (sorted.length - 1);
  let cursor = pos(first.box);
  let next = scene;
  for (const u of sorted) {
    const delta = cursor - pos(u.box);
    next = axis === "x" ? moveLayers(next, u.ids, delta, 0) : moveLayers(next, u.ids, 0, delta);
    cursor += len(u.box) + gap;
  }
  return next;
}
