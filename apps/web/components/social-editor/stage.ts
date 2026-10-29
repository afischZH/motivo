/**
 * The editor stage: a Konva stage in a container, scaled to the zoom. It
 * draws the scene with `drawScene` (the export's render path), attaches the
 * transformer to the selection and reports what the pointer did. The scene
 * itself lives in React state; the stage never changes it, it only reports
 * new frames after a drag or transform, and selection clicks.
 *
 * Snapping while dragging (`snapBox` of `@musterli/scene`): the selection's
 * edges and centre snap to the canvas edges and centre and to other layers,
 * with guide lines; holding Alt moves freely.
 */
import {
  boundsOf,
  frameOf,
  snapBox,
  snapTargets,
  unionBoxes,
  type Box,
  type Scene,
  type SnapGuide,
} from "@musterli/scene";
import type { Layer as KonvaLayer } from "konva/lib/Layer";
import type { Node as KonvaNode } from "konva/lib/Node";
import type { Stage as KonvaStage } from "konva/lib/Stage";
import type { Transformer as KonvaTransformer } from "konva/lib/shapes/Transformer";

import type { KonvaKit } from "./konva";
import { drawScene, type ScenePictures } from "./konva-scene";

export interface FrameChange {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  rotation: number;
  /** Text scaled from a corner: the font scales by this factor. */
  fontScale: number;
}

export interface StageCallbacks {
  onSelect(id: string | null, additive: boolean): void;
  onFrames(changes: FrameChange[], key: "move" | "transform"): void;
  onEditText(id: string): void;
}

/** Snap distance in screen pixels. */
const SNAP_PX = 6;
const GUIDE_COLOR = "#0ea5e9";
const ROTATION_SNAPS = [0, 45, 90, 135, 180, 225, 270, 315];

export class SocialStage {
  private readonly kit: KonvaKit;
  private readonly stage: KonvaStage;
  private readonly content: KonvaLayer;
  private readonly ui: KonvaLayer;
  private readonly transformer: KonvaTransformer;
  private readonly callbacks: StageCallbacks;
  private nodes = new Map<string, KonvaNode>();
  private scene: Scene | null = null;
  private selection: readonly string[] = [];
  private zoom = 1;
  private drag: { start: Box; abs: { x: number; y: number } } | null = null;
  /** An update that came in while the pointer drags or transforms (applied after). */
  private pending: Parameters<SocialStage["update"]> | null = null;

  constructor(kit: KonvaKit, container: HTMLDivElement, callbacks: StageCallbacks) {
    this.kit = kit;
    this.callbacks = callbacks;
    this.stage = new kit.Konva.Stage({ container, width: 1, height: 1 });
    this.content = new kit.Konva.Layer();
    this.ui = new kit.Konva.Layer();
    this.transformer = new kit.Transformer({
      rotationSnaps: ROTATION_SNAPS,
      rotationSnapTolerance: 4,
      flipEnabled: false,
      anchorSize: 9,
      borderStroke: GUIDE_COLOR,
      anchorStroke: GUIDE_COLOR,
      anchorCornerRadius: 2,
      ignoreStroke: true,
      boundBoxFunc: (oldBox, newBox) =>
        Math.abs(newBox.width) < 4 || Math.abs(newBox.height) < 4 ? oldBox : newBox,
    });
    this.ui.add(this.transformer);
    this.stage.add(this.content);
    this.stage.add(this.ui);

    this.stage.on("click tap", (event) => {
      const target = event.target as KonvaNode;
      if (target === this.stage) {
        this.callbacks.onSelect(null, false);
        return;
      }
      const id = this.layerIdOf(target);
      if (!id) return;
      const pointer = event.evt as MouseEvent;
      this.callbacks.onSelect(id, Boolean(pointer.shiftKey || pointer.metaKey || pointer.ctrlKey));
    });
    this.stage.on("dblclick dbltap", (event) => {
      const id = this.layerIdOf(event.target as KonvaNode);
      const layer = id ? this.scene?.layers.find((l) => l.id === id) : undefined;
      if (layer?.kind === "text") this.callbacks.onEditText(layer.id);
    });
    this.transformer.on("transformend", () => this.reportTransform());
  }

  /** Scene layer id of a node (the node itself carries it). */
  private layerIdOf(node: KonvaNode): string | null {
    const id = node.id();
    return this.nodes.has(id) ? id : null;
  }

  setZoom(zoom: number): void {
    if (!this.scene) return;
    this.zoom = zoom;
    this.stage.size({
      width: Math.max(1, Math.round(this.scene.format.width * zoom)),
      height: Math.max(1, Math.round(this.scene.format.height * zoom)),
    });
    this.stage.scale({ x: zoom, y: zoom });
    this.transformer.forceUpdate();
  }

  update(scene: Scene, pictures: ScenePictures, selection: readonly string[], zoom: number): void {
    // Redrawing replaces the nodes: never under the pointer's hands.
    if (this.drag || this.transformer.isTransforming()) {
      this.pending = [scene, pictures, selection, zoom];
      return;
    }
    this.pending = null;
    const formatChanged =
      !this.scene ||
      this.scene.format.width !== scene.format.width ||
      this.scene.format.height !== scene.format.height;
    this.scene = scene;
    this.selection = selection;
    if (formatChanged || zoom !== this.zoom) this.setZoom(zoom);
    this.nodes = drawScene(this.kit, this.content, scene, pictures, { interactive: true });
    for (const [id, node] of this.nodes) {
      if (!node.draggable()) continue;
      node.on("dragstart", () => this.startDrag(id, node));
      node.dragBoundFunc((pos) => this.boundDrag(pos, node));
      node.on("dragend", () => this.endDrag(id));
    }
    this.attachTransformer();
    this.content.batchDraw();
  }

  private selectedLayers() {
    const set = new Set(this.selection);
    return (this.scene?.layers ?? []).filter(
      (l) => set.has(l.id) && l.visible && l.kind !== "background",
    );
  }

  private attachTransformer(): void {
    const layers = this.selectedLayers();
    const nodes = layers.map((l) => this.nodes.get(l.id)).filter((n): n is KonvaNode => !!n);
    const locked = layers.some((l) => l.locked);
    const onlyText = layers.length === 1 && layers[0]?.kind === "text";
    this.transformer.nodes(nodes);
    this.transformer.setAttrs({
      resizeEnabled: !locked,
      rotateEnabled: !locked,
      // Text: corners scale the font, the sides change the box width (wrap).
      enabledAnchors: onlyText
        ? ["top-left", "top-right", "bottom-left", "bottom-right", "middle-left", "middle-right"]
        : [
            "top-left",
            "top-center",
            "top-right",
            "middle-left",
            "middle-right",
            "bottom-left",
            "bottom-center",
            "bottom-right",
          ],
      keepRatio: true,
    });
    this.transformer.moveToTop();
    this.ui.batchDraw();
  }

  private movingIds(id: string): string[] {
    return this.selection.includes(id) ? [...this.selection] : [id];
  }

  private startDrag(id: string, node: KonvaNode): void {
    if (!this.selection.includes(id)) this.callbacks.onSelect(id, false);
    const ids = new Set(this.movingIds(id));
    const boxes = (this.scene?.layers ?? [])
      .filter((l) => ids.has(l.id))
      .map((l) => boundsOf(frameOf(l)));
    const start = unionBoxes(boxes);
    this.drag = start ? { start, abs: node.absolutePosition() } : null;
  }

  private boundDrag(pos: { x: number; y: number }, node: KonvaNode) {
    const drag = this.drag;
    const scene = this.scene;
    if (!drag || !scene) return pos;
    const dx = (pos.x - drag.abs.x) / this.zoom;
    const dy = (pos.y - drag.abs.y) / this.zoom;
    const moved = { ...drag.start, x: drag.start.x + dx, y: drag.start.y + dy };
    const free = Boolean(lastPointer?.altKey);
    if (free) {
      this.drawGuides([]);
      return pos;
    }
    const id = node.id();
    const snap = snapBox(
      moved,
      snapTargets(scene, new Set(this.movingIds(id))),
      SNAP_PX / this.zoom,
    );
    this.drawGuides(snap.guides);
    return { x: pos.x + snap.dx * this.zoom, y: pos.y + snap.dy * this.zoom };
  }

  private drawGuides(guides: readonly SnapGuide[]): void {
    this.ui.find(".guide").forEach((n) => n.destroy());
    const scene = this.scene;
    if (!scene) return;
    for (const g of guides) {
      const points =
        g.axis === "x"
          ? [g.position, 0, g.position, scene.format.height]
          : [0, g.position, scene.format.width, g.position];
      this.ui.add(
        new this.kit.Line({
          name: "guide",
          points,
          stroke: GUIDE_COLOR,
          strokeWidth: 1 / this.zoom,
          dash: [4 / this.zoom, 4 / this.zoom],
          listening: false,
        }),
      );
    }
    this.ui.batchDraw();
  }

  private frameOfNode(id: string): FrameChange | null {
    const node = this.nodes.get(id);
    const layer = this.scene?.layers.find((l) => l.id === id);
    if (!node || !layer) return null;
    const sx = Math.abs(node.scaleX());
    const sy = Math.abs(node.scaleY());
    const width = layer.width * sx;
    const height = layer.height * sy;
    const cx = node.x();
    const cy = node.y();
    return {
      id,
      x: cx - width / 2,
      y: cy - height / 2,
      width,
      height,
      rotation: Math.round(node.rotation() * 100) / 100,
      fontScale: 1,
    };
  }

  private endDrag(id: string): void {
    this.drawGuides([]);
    this.drag = null;
    const changes = this.movingIds(id)
      .map((i) => this.frameOfNode(i))
      .filter((c): c is FrameChange => c !== null);
    this.settle(changes, "move");
  }

  /** Reports the frames; React then calls `update` with the new scene. */
  private settle(changes: FrameChange[], key: "move" | "transform"): void {
    const pending = this.pending;
    this.pending = null;
    if (changes.length > 0) {
      // React answers with the new scene and the latest pictures.
      this.callbacks.onFrames(changes, key);
    } else if (pending) {
      this.update(...pending);
    }
  }

  private reportTransform(): void {
    const anchor = this.transformer.getActiveAnchor() ?? "";
    const corner = !anchor.startsWith("middle") && !anchor.includes("center");
    const changes: FrameChange[] = [];
    for (const node of this.transformer.nodes()) {
      const change = this.frameOfNode(node.id());
      if (!change) continue;
      const layer = this.scene?.layers.find((l) => l.id === change.id);
      if (layer?.kind === "text" && corner && anchor !== "rotater") {
        change.fontScale = Math.abs(node.scaleY());
      }
      changes.push(change);
    }
    this.settle(changes, "transform");
  }

  /** The selection's box on screen, relative to the container (for screen readers and tests). */
  selectionRect(): Box | null {
    const boxes = this.selectedLayers().map((l) => boundsOf(frameOf(l)));
    const box = unionBoxes(boxes);
    return box
      ? {
          x: box.x * this.zoom,
          y: box.y * this.zoom,
          width: box.width * this.zoom,
          height: box.height * this.zoom,
        }
      : null;
  }

  destroy(): void {
    this.stage.destroy();
  }
}

/** Last pointer event on the page: Alt state for free dragging. */
let lastPointer: PointerEvent | null = null;
if (typeof window !== "undefined") {
  window.addEventListener(
    "pointermove",
    (event) => {
      lastPointer = event;
    },
    { passive: true, capture: true },
  );
}
