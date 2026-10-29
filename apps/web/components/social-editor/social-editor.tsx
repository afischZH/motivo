"use client";

/**
 * The social media editor (M6-AP02): a scene of layers over a tool
 * background, edited on a Konva stage. Konva is loaded on this page only
 * (`loadKonva`, a dynamic import); everything else is React around the pure
 * scene model of `@musterli/scene`.
 *
 * Data flow: the scene lives in the reducer (state.ts) with its undo
 * history. The stage (stage.ts) draws it and reports pointer edits back as
 * frames; the side panels change it through the scene operations. Saving
 * and the autosave draft go to IndexedDB (`createSocialDesignStore`),
 * nothing leaves the browser.
 */
import { isShortcutBlocked, resolveShortcut, useT } from "@musterli/editor-ui";
import {
  ASSET_ACCEPT,
  browserImageInputServices,
  browserSvgSanitizer,
  finishAsset,
  readAsset,
} from "@musterli/editor-ui/asset-input";
import { svgDataUrl } from "@musterli/editor-ui/brand-kit";
import { designHash, designIdFromHash } from "@musterli/editor-ui/designs";
import {
  DEFAULT_FORMAT_ID,
  SCENE_IMAGE_MAX_EDGE,
  SCENE_LAYERS_MAX,
  SOCIAL_FORMATS,
  addLayer,
  alignLayers,
  applyBrandKit,
  backgroundBrandColors,
  boundsOf,
  checkSceneFit,
  createBackgroundLayer,
  createImageLayer,
  createLogoLayer,
  createScene,
  createShapeLayer,
  createTextLayer,
  distributeLayers,
  duplicateLayers,
  expandSelection,
  findLayer,
  fontFamilyFor,
  frameOf,
  groupLayers,
  inferConstraints,
  libraryFont,
  libraryFontRef,
  moveInStack,
  nearestWeight,
  moveLayers,
  removeLayers,
  reorderLayer,
  resizeScene,
  sceneFormat,
  sceneImageSchema,
  settleTextLayer,
  ungroup,
  unionBoxes,
  updateLayer,
  updateLayers,
  DEFAULT_LIBRARY_FONT_ID,
  SYSTEM_FONT_STACKS,
  type BackgroundLayer,
  type FontRef,
  type Layer,
  type Scene,
  type SceneImage,
  type ShapeLayer,
  type StackMove,
  type TextLayer,
  type TextMeasure,
} from "@musterli/scene";
import {
  createBrandKitStore,
  createSocialDesignStore,
  type BrandAsset,
  type BrandPalette,
} from "@musterli/storage";
import type { SceneTemplate } from "@musterli/scene/templates";
import { applyBrandPalette, registry } from "@musterli/tool-registry";
import {
  ChevronLeftIcon,
  CircleIcon,
  DownloadIcon,
  FilePlusIcon,
  ImagePlusIcon,
  LayoutTemplateIcon,
  MinusIcon,
  MonitorSmartphoneIcon,
  PaletteIcon,
  Redo2Icon,
  SaveIcon,
  SquareIcon,
  StampIcon,
  StarIcon,
  TypeIcon,
  Undo2Icon,
} from "lucide-react";
import { useTranslations } from "next-intl";
import {
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
  type ReactNode,
} from "react";

import { buttonVariants } from "@/components/ui/button";
import { templateScene, templateTextMessageKey } from "@/lib/social-editor/templates";
import { cn } from "@/lib/utils";

import { BackgroundPanel } from "./background-panel";
import { DEFAULT_BACKGROUND_TOOL, backgroundVariant, isBackgroundTool } from "./backgrounds";
import { exportFileName, exportScene, sceneThumbnail, type SceneExportFormat } from "./export";
import { INPUT } from "./fields";
import { loadFont, loadSceneFonts, sceneFontKey, setBrandFontSources } from "./fonts";
import { Inspector, type BrandFontOption, type FontChoice } from "./inspector";
import { loadKonva, type KonvaKit } from "./konva";
import { LayerList, useLayerName } from "./layer-list";
import { SCENE_EXPORT_EDGE_MAX, exportScaleFits } from "./export-size";
import { createKonvaMeasure } from "./measure";
import { SocialStage, type FrameChange } from "./stage";
import {
  draftWins,
  initialEditorState,
  newSceneId,
  randomSeed,
  shouldWriteDraft,
  socialEditorReducer,
  updateOrCreate,
  type SocialEditorState,
} from "./state";
import { TemplatePicker, type TemplateLibrary, type TemplatePickerHandle } from "./template-picker";
import { useScenePictures } from "./use-pictures";

export interface SocialEditorProps {
  landingHref: string;
  myDesignsHref: string;
  brandKitHref: string;
}

const OUTLINE = buttonVariants({ variant: "outline", size: "sm" });
const GHOST_ICON = buttonVariants({ variant: "ghost", size: "icon-sm" });
const DRAFT_DELAY_MS = 800;
const NUDGE = 1;
const NUDGE_BIG = 10;
const DEFAULT_LIBRARY_SHAPE = "star";

type LoadState = "loading" | "ready" | "failed";

/** Background tools in the user's language, by name. */
function useBackgroundTools() {
  const t = useT();
  return useMemo(
    () =>
      registry
        .list()
        .filter(isBackgroundTool)
        .map((tool) => ({ id: tool.id, name: t(`tools.${tool.id}.name`) }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [t],
  );
}

/** A fresh background layer of a tool (its defaults, a random seed). */
function backgroundFor(toolId: string, scene: Pick<Scene, "format">, id = newSceneId("bg")) {
  const tool = registry.get(toolId) ?? registry.get(DEFAULT_BACKGROUND_TOOL);
  if (!tool) return null;
  return createBackgroundLayer(
    id,
    scene.format,
    {
      id: tool.id,
      version: tool.version,
      params: { ...(tool.defaults as Record<string, unknown>) },
    },
    randomSeed(),
  );
}

/** The starting scene: a background, a headline, and the brand palette when there is one. */
function starterScene(headline: string, palette: readonly string[] | null): Scene {
  const scene = createScene(DEFAULT_FORMAT_ID);
  const background = backgroundFor(DEFAULT_BACKGROUND_TOOL, scene);
  const text = createTextLayer(newSceneId("t"), scene.format, headline, { color: "brand-1" });
  return {
    ...scene,
    palette: palette && palette.length >= 2 ? [...palette] : scene.palette,
    layers: background ? [background, text] : [text],
  };
}

/** Text layers grown to fit their text with the current fonts (never cut, never shrunk). */
function settleTexts(
  scene: Scene,
  measure: TextMeasure,
  /** Results per layer object and canvas size: history steps share most layers. */
  cache?: WeakMap<Layer, Map<string, Layer>>,
): Scene {
  let next = scene;
  const size = `${scene.format.width}x${scene.format.height}`;
  for (const layer of scene.layers) {
    if (layer.kind !== "text") continue;
    let known = cache?.get(layer);
    let settled = known?.get(size);
    if (!settled) {
      settled = settleTextLayer(layer, measure, scene.format);
      if (cache) {
        if (!known) {
          known = new Map();
          cache.set(layer, known);
        }
        known.set(size, settled);
      }
    }
    const result = settled;
    if (result !== layer) next = updateLayer(next, layer.id, () => result);
  }
  return next;
}

/** A new layer moved down and right while another one sits at the same place. */
function cascade(scene: Scene, layer: Layer): Layer {
  if (layer.kind === "background") return layer;
  const step = Math.round(Math.min(scene.format.width, scene.format.height) * 0.04);
  let { x, y } = layer;
  for (let i = 0; i < 20; i++) {
    const taken = scene.layers.some(
      (l) => l.kind !== "background" && Math.abs(l.x - x) < 1 && Math.abs(l.y - y) < 1,
    );
    if (!taken) break;
    x += step;
    y += step;
  }
  if (x === layer.x) return layer;
  const moved = { ...layer, x, y };
  const inferred = inferConstraints(
    boundsOf(frameOf(moved)),
    scene.format,
    layer.constraints.bleed,
  );
  return { ...moved, constraints: { ...inferred, size: layer.constraints.size } };
}

/** Constraints follow where the user put a layer (h/v anchors; size mode and bleed stay). */
function reinferConstraints(scene: Scene, ids: ReadonlySet<string>): Scene {
  let next = updateLayers(scene, [...ids], (l) => {
    if (l.kind === "background" || l.groupId !== null) return l;
    const inferred = inferConstraints(boundsOf(frameOf(l)), scene.format, l.constraints.bleed);
    return { ...l, constraints: { ...inferred, size: l.constraints.size } };
  });
  const groups = new Set(
    next.layers.filter((l) => ids.has(l.id) && l.groupId).map((l) => l.groupId as string),
  );
  if (groups.size > 0) {
    next = {
      ...next,
      groups: next.groups.map((g) => {
        if (!groups.has(g.id)) return g;
        const box = unionBoxes(
          next.layers.filter((l) => l.groupId === g.id).map((l) => boundsOf(frameOf(l))),
        );
        if (!box) return g;
        const inferred = inferConstraints(box, next.format, g.constraints.bleed);
        return { ...g, constraints: { ...inferred, size: g.constraints.size } };
      }),
    };
  }
  return next;
}

export function SocialEditor(props: SocialEditorProps) {
  const t = useTranslations("SocialEditor");
  const tRoot = useT();
  const nameOf = useLayerName();
  const textFieldId = useId();
  const fileId = useId();
  const backgroundTools = useBackgroundTools();

  const [store] = useState(() => createSocialDesignStore());
  const [brandKit] = useState(() => createBrandKitStore());
  useEffect(
    () => () => {
      store.close();
      brandKit.close();
    },
    [store, brandKit],
  );

  const [state, dispatch] = useReducer(socialEditorReducer, undefined, (): SocialEditorState =>
    initialEditorState(createScene(DEFAULT_FORMAT_ID), ""),
  );
  const scene = state.history.present;
  const [load, setLoad] = useState<LoadState>("loading");
  const [kit, setKit] = useState<KonvaKit | null>(null);
  const [kitFailed, setKitFailed] = useState(false);
  const [announcement, setAnnouncement] = useState("");
  const [busy, setBusy] = useState<"save" | "export" | "upload" | "brand" | "template" | null>(
    null,
  );
  const [exportFormat, setExportFormat] = useState<"png" | "jpg">("png");
  const [exportScale, setExportScale] = useState<1 | 2>(1);
  const [brandPalettes, setBrandPalettes] = useState<readonly BrandPalette[]>([]);
  const [bgLocks, setBgLocks] = useState<ReadonlySet<string>>(() => new Set());
  const [logos, setLogos] = useState<readonly BrandAsset[] | null>(null);
  const [brandFonts, setBrandFonts] = useState<readonly BrandFontOption[]>([]);
  const [missingFonts, setMissingFonts] = useState<ReadonlySet<string>>(() => new Set());
  /** Bumped whenever fonts finished loading: the stage redraws with them. */
  const [fontsVersion, setFontsVersion] = useState(0);
  const pictures = useScenePictures(scene);

  const announce = useCallback((text: string) => {
    // Same text twice in a row: clear first, so screen readers read it again.
    setAnnouncement("");
    window.setTimeout(() => setAnnouncement(text), 30);
  }, []);

  // Konva on this page only, in its own chunk.
  useEffect(() => {
    let active = true;
    loadKonva().then(
      (loaded) => active && setKit(loaded),
      () => active && setKitFailed(true),
    );
    return () => {
      active = false;
    };
  }, []);
  const measure = useMemo<TextMeasure | null>(() => (kit ? createKonvaMeasure(kit) : null), [kit]);

  // Start: a saved design from `#design=<id>`, else the draft, else a new scene.
  // The scene's fonts load first, so the first frame and the first export
  // never fall back to a system font.
  useEffect(() => {
    let active = true;
    (async () => {
      const [palettes, fonts] = await Promise.all([
        brandKit.loadPalettes().catch(() => null),
        brandKit.listFonts().catch(() => []),
      ]);
      if (active && palettes) setBrandPalettes(palettes.palettes);
      setBrandFontSources(fonts);
      if (active) setBrandFonts(fonts.map((f) => ({ id: f.id, name: f.name })));
      const brand = palettes?.palettes.find((p) => p.id === palettes.defaultId)?.colors ?? null;
      const open = async (action: Extract<Parameters<typeof dispatch>[0], { type: "load" }>) => {
        const [result] = await Promise.all([
          loadSceneFonts(action.scene),
          // New text layers use the default font: ready before the first click on "Text".
          loadFont(libraryFontRef(DEFAULT_LIBRARY_FONT_ID), 700, "normal"),
        ]);
        if (!active) return;
        setMissingFonts(result.missing);
        dispatch(action);
        setLoad("ready");
      };
      const id = designIdFromHash(window.location.hash);
      try {
        const draft = await store.getDraft().catch(() => null);
        if (id) {
          const record = await store.get(id);
          if (record && active) {
            // Unsaved changes of this design (reload, crash) win over the saved version.
            await open(
              draftWins(draft, record) && draft
                ? {
                    type: "load",
                    scene: draft.scene,
                    name: draft.name,
                    designId: record.id,
                    dirty: true,
                  }
                : { type: "load", scene: record.scene, name: record.name, designId: record.id },
            );
            return;
          }
        }
        if (draft && active && !id) {
          await open({
            type: "load",
            scene: draft.scene,
            name: draft.name,
            designId: draft.designId,
            dirty: true,
          });
          return;
        }
      } catch {
        // No IndexedDB (private mode): the editor still works, without saving.
      }
      if (!active) return;
      await open({
        type: "load",
        scene: starterScene(t("starterHeadline"), brand),
        name: "",
        designId: null,
      });
    })();
    return () => {
      active = false;
    };
    // Runs once on mount; texts and stores are stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Latest values for event handlers that outlive a render (stage, keyboard).
  const stateRef = useRef(state);
  const measureRef = useRef(measure);

  // Autosave draft (not for a saved design without changes, see `shouldWriteDraft`).
  useEffect(() => {
    if (load !== "ready") return;
    const timer = window.setTimeout(() => {
      // Checked when the timer fires: a save in between makes the draft unnecessary.
      if (!shouldWriteDraft(stateRef.current)) return;
      void store
        .putDraft(
          { designId: state.designId, name: state.name, scene, updatedAt: Date.now() },
          { edited: true },
        )
        .catch(() => undefined);
    }, DRAFT_DELAY_MS);
    return () => window.clearTimeout(timer);
  }, [load, store, scene, state.name, state.designId]);

  // ---- scene changes ------------------------------------------------------

  const change = useCallback(
    (next: Scene, key: string | null = null, selection?: readonly string[]) =>
      dispatch({ type: "change", scene: next, key, ...(selection ? { selection } : {}) }),
    [],
  );

  /** Text after an edit: grows its box, shrinks only if it must (never cut). */
  const settle = useCallback((layer: Layer, format: Scene["format"]): Layer => {
    const m = measureRef.current;
    if (layer.kind !== "text" || !m) return layer;
    return settleTextLayer(layer, m, format);
  }, []);

  const updateOne = useCallback(
    (id: string, fn: (layer: Layer) => Layer, key: string) => {
      const current = stateRef.current.history.present;
      change(
        updateLayer(current, id, (l) => settle(fn(l), current.format)),
        key,
      );
    },
    [change, settle],
  );

  const onFrames = useCallback(
    (changes: FrameChange[]) => {
      const current = stateRef.current.history.present;
      let next = current;
      for (const c of changes) {
        next = updateLayer(next, c.id, (l) => {
          const framed = {
            ...l,
            x: c.x,
            y: c.y,
            width: c.width,
            height: c.height,
            rotation: c.rotation,
          };
          if (framed.kind === "text" && c.fontScale !== 1) {
            const fontSize = Math.min(1000, Math.max(4, Math.round(framed.fontSize * c.fontScale)));
            const minFontSize = Math.min(
              fontSize,
              Math.max(4, Math.round(framed.minFontSize * c.fontScale)),
            );
            return settle({ ...framed, fontSize, minFontSize }, current.format);
          }
          return settle(framed as Layer, current.format);
        });
      }
      change(reinferConstraints(next, new Set(changes.map((c) => c.id))));
    },
    [change, settle],
  );

  const select = useCallback((id: string | null, additive: boolean) => {
    const s = stateRef.current;
    if (id === null) {
      dispatch({ type: "select", selection: [] });
      return;
    }
    const ids = expandSelection(s.history.present, [id]);
    if (!additive) {
      dispatch({ type: "select", selection: ids });
      return;
    }
    const set = new Set(s.selection);
    const on = !set.has(id);
    for (const i of ids) {
      if (on) set.add(i);
      else set.delete(i);
    }
    dispatch({
      type: "select",
      selection: s.history.present.layers.filter((l) => set.has(l.id)).map((l) => l.id),
    });
  }, []);

  const selectFromList = useCallback((id: string, additive: boolean) => {
    const s = stateRef.current;
    if (!additive) {
      dispatch({ type: "select", selection: [id] });
      return;
    }
    const set = new Set(s.selection);
    if (set.has(id)) set.delete(id);
    else set.add(id);
    dispatch({
      type: "select",
      selection: s.history.present.layers.filter((l) => set.has(l.id)).map((l) => l.id),
    });
  }, []);

  const selectedLayers = useMemo(() => {
    const set = new Set(state.selection);
    return scene.layers.filter((l) => set.has(l.id));
  }, [scene.layers, state.selection]);
  const editable = selectedLayers.filter((l) => l.kind !== "background");
  const background = scene.layers[0]?.kind === "background" ? scene.layers[0] : null;
  const backgroundTool = background ? registry.get(background.toolId) : undefined;

  const addNew = useCallback(
    (layer: Layer, message: string) => {
      const current = stateRef.current.history.present;
      if (current.layers.length >= SCENE_LAYERS_MAX) {
        announce(t("limitLayers"));
        return;
      }
      change(addLayer(current, cascade(current, layer)), null, [layer.id]);
      announce(message);
    },
    [announce, change, t],
  );

  const addText = () =>
    addNew(
      createTextLayer(newSceneId("t"), scene.format, t("newText"), { fontWeight: 700 }),
      t("added.text"),
    );
  const addShape = (shape: ShapeLayer["shape"]) =>
    addNew(
      createShapeLayer(
        newSceneId("s"),
        scene.format,
        shape,
        shape === "library" ? DEFAULT_LIBRARY_SHAPE : null,
      ),
      t(`added.${shape}`),
    );

  const removeSelected = useCallback(() => {
    const s = stateRef.current;
    const ids = s.selection.filter((id) => findLayer(s.history.present, id)?.kind !== "background");
    if (ids.length === 0) return;
    change(removeLayers(s.history.present, ids), null, []);
    announce(t("removed", { count: ids.length }));
  }, [announce, change, t]);

  const duplicateSelected = useCallback(() => {
    const s = stateRef.current;
    const current = s.history.present;
    const ids = expandSelection(current, s.selection).filter(
      (id) => findLayer(current, id)?.kind !== "background",
    );
    if (ids.length === 0) return;
    const out = duplicateLayers(current, ids, () => newSceneId("l"));
    if (out.ids.length === 0) {
      announce(t("limitLayers"));
      return;
    }
    change(out.scene, null, out.ids);
    announce(t("duplicated", { count: out.ids.length }));
  }, [announce, change, t]);

  const groupSelected = useCallback(() => {
    const s = stateRef.current;
    const next = groupLayers(s.history.present, s.selection, { id: newSceneId("g"), name: "" });
    if (next !== s.history.present) {
      change(next);
      announce(t("grouped"));
    }
  }, [announce, change, t]);

  const ungroupSelected = useCallback(() => {
    const s = stateRef.current;
    let next = s.history.present;
    const groups = new Set(
      s.selection.map((id) => findLayer(next, id)?.groupId).filter((g): g is string => !!g),
    );
    for (const g of groups) next = ungroup(next, g);
    if (next !== s.history.present) {
      change(next);
      announce(t("ungrouped"));
    }
  }, [announce, change, t]);

  const nudge = useCallback(
    (dx: number, dy: number) => {
      const s = stateRef.current;
      if (s.selection.length === 0) return false;
      const ids = expandSelection(s.history.present, s.selection);
      const moved = moveLayers(s.history.present, ids, dx, dy);
      if (moved === s.history.present) return true;
      change(reinferConstraints(moved, new Set(ids)), "nudge");
      return true;
    },
    [change],
  );

  // ---- fonts --------------------------------------------------------------

  /** Loads the font first, then applies it: text is measured with the real metrics. */
  const pickFont = useCallback(
    async (id: string, choice: FontChoice, weight?: number) => {
      const layer = findLayer(stateRef.current.history.present, id);
      if (layer?.kind !== "text") return;
      let patch: Partial<TextLayer> & { font?: FontRef | undefined };
      if (choice.kind === "system") {
        patch = { fontFamily: SYSTEM_FONT_STACKS[choice.id], font: undefined };
      } else {
        const ref: FontRef =
          choice.kind === "library"
            ? libraryFontRef(choice.id)
            : {
                kind: "brand",
                id: choice.id,
                name:
                  brandFonts.find((f) => f.id === choice.id)?.name ??
                  (layer.font?.id === choice.id ? layer.font.name : ""),
              };
        const wanted = weight ?? layer.fontWeight;
        const fontWeight =
          choice.kind === "library"
            ? nearestWeight(libraryFont(choice.id)?.weights ?? [], wanted)
            : wanted;
        const ok = await loadFont(ref, fontWeight, layer.fontStyle, layer.text);
        if (!ok) {
          announce(t("text.fontLoadFailed", { name: ref.name }));
          if (ref.kind === "brand") setMissingFonts((m) => new Set([...m, ref.id]));
          return;
        }
        if (ref.kind === "brand") {
          setMissingFonts((m) => {
            if (!m.has(ref.id)) return m;
            const next = new Set(m);
            next.delete(ref.id);
            return next;
          });
        }
        patch = { fontFamily: fontFamilyFor(ref), font: ref, fontWeight };
      }
      updateOne(
        id,
        (l) => {
          if (l.kind !== "text") return l;
          const next = { ...l, ...patch } as TextLayer;
          if (patch.font === undefined) delete next.font;
          return next;
        },
        "text-font",
      );
      dispatch({ type: "commit" });
      setFontsVersion((v) => v + 1);
    },
    [announce, brandFonts, t, updateOne],
  );

  // Fonts the scene needs (another font, weight, or characters outside latin):
  // load them, redraw, and grow text boxes the real font needs more room in.
  const fontKey = sceneFontKey(scene);
  useEffect(() => {
    if (load !== "ready") return;
    let active = true;
    void loadSceneFonts(stateRef.current.history.present).then((result) => {
      if (!active) return;
      setMissingFonts((m) =>
        m.size === result.missing.size && [...m].every((id) => result.missing.has(id))
          ? m
          : result.missing,
      );
      setFontsVersion((v) => v + 1);
      const m = measureRef.current;
      if (m) {
        // Every step of the history with these fonts (now loaded): undo stays settled.
        const key = sceneFontKey(stateRef.current.history.present);
        const cache = new WeakMap<Layer, Map<string, Layer>>();
        dispatch({
          type: "settle",
          fix: (s) => (sceneFontKey(s) === key ? settleTexts(s, m, cache) : s),
        });
      }
    });
    return () => {
      active = false;
    };
  }, [fontKey, load]);

  // ---- background ---------------------------------------------------------

  const setBackground = useCallback(
    (fn: (layer: BackgroundLayer) => BackgroundLayer, key: string | null) => {
      const current = stateRef.current.history.present;
      const bg = current.layers[0];
      if (bg?.kind !== "background") return;
      change(
        updateLayer(current, bg.id, () => fn(bg)),
        key,
      );
    },
    [change],
  );

  const newVariant = useCallback(() => {
    const current = stateRef.current.history.present;
    const bg = current.layers[0];
    if (bg?.kind !== "background") return;
    const tool = registry.get(bg.toolId);
    if (!tool) return;
    const variant = backgroundVariant(tool, bg, randomSeed(), bgLocks);
    change(updateLayer(current, bg.id, () => ({ ...bg, ...variant })));
    announce(t("background.newVariant"));
  }, [announce, bgLocks, change, t]);

  const changeTool = (toolId: string) => {
    const current = stateRef.current.history.present;
    const old = current.layers[0];
    const layer = backgroundFor(toolId, current, old?.kind === "background" ? old.id : undefined);
    if (!layer) return;
    const placed =
      old?.kind === "background"
        ? { ...layer, visible: old.visible, opacity: old.opacity, name: old.name }
        : layer;
    setBgLocks(new Set());
    change(addLayer(current, placed));
  };

  const applyPalette = () => {
    const current = stateRef.current.history.present;
    const bg = current.layers[0];
    if (bg?.kind !== "background") return;
    const tool = registry.get(bg.toolId);
    const result = tool ? applyBrandPalette(tool, bg.params, current.palette, bgLocks) : null;
    if (!result) {
      announce(t("background.paletteUnsupported"));
      return;
    }
    setBgLocks((locks) => new Set([...locks, ...result.applied]));
    change(updateLayer(current, bg.id, () => ({ ...bg, params: result.params })));
    announce(t("background.paletteApplied"));
  };

  // ---- format (Magic Resize) ---------------------------------------------

  // Switching formats back and forth resizes from the scene before the
  // first switch, so repeated switches do not drift.
  const resizeChain = useRef<{ base: Scene; result: Scene } | null>(null);
  const changeFormat = async (formatId: string) => {
    const m = measureRef.current;
    if (!m || formatId === scene.format.id) return;
    const chain = resizeChain.current;
    const base = chain && chain.result === scene ? chain.base : scene;
    // Text fitting measures with the real fonts, never with a fallback.
    await loadSceneFonts(base);
    if (stateRef.current.history.present !== scene) return;
    const next =
      base.format.id === formatId ? base : resizeScene(base, sceneFormat(formatId), { measure: m });
    resizeChain.current = { base, result: next };
    change(next);
    announce(
      t("formatChanged", {
        format: tRoot(`sizes.${formatId}`),
        width: next.format.width,
        height: next.format.height,
      }),
    );
  };

  // ---- pictures -----------------------------------------------------------

  const fileRef = useRef<HTMLInputElement>(null);
  const servicesRef = useRef<{
    svg: ReturnType<typeof browserSvgSanitizer>;
    image: ReturnType<typeof browserImageInputServices>;
  } | null>(null);
  const upload = async (file: File) => {
    servicesRef.current ??= { svg: browserSvgSanitizer(), image: browserImageInputServices() };
    const services = servicesRef.current;
    setBusy("upload");
    try {
      const read = await readAsset(file, { svg: services.svg });
      if (!read.ok) {
        if (read.error !== "aborted") announce(tRoot(`Editor.asset.errors.${read.error}`));
        return;
      }
      const done = await finishAsset(
        read.source,
        { x: 0, y: 0, w: 1, h: 1 },
        { crop: services.image.crop, svg: services.svg },
        undefined,
        { maxEdge: SCENE_IMAGE_MAX_EDGE, schema: sceneImageSchema },
      );
      if (!done.ok) {
        if (done.error !== "aborted") announce(tRoot(`Editor.asset.errors.${done.error}`));
        return;
      }
      const image = done.asset as SceneImage;
      addNew(
        createImageLayer(newSceneId("i"), stateRef.current.history.present.format, image),
        t("added.image"),
      );
    } finally {
      setBusy(null);
    }
  };

  const logoDialog = useRef<HTMLDialogElement>(null);
  const openLogos = async () => {
    logoDialog.current?.showModal();
    setLogos(null);
    try {
      setLogos(await brandKit.listAssets("logo"));
    } catch {
      setLogos([]);
    }
  };
  const addLogo = (asset: BrandAsset) => {
    logoDialog.current?.close();
    const parsed = sceneImageSchema.safeParse(asset.image);
    if (!parsed.success) {
      announce(t("logoInvalid"));
      return;
    }
    addNew(
      createLogoLayer(
        newSceneId("o"),
        stateRef.current.history.present.format,
        parsed.data,
        asset.id,
        asset.name,
      ),
      t("added.logo"),
    );
  };

  // ---- save, export -------------------------------------------------------

  const imagesRef = useRef(pictures.images);

  const save = useCallback(
    async (asCopy = false) => {
      const s = stateRef.current;
      if (!kit || busy) return;
      setBusy("save");
      const name = s.name.trim() || t("untitled");
      try {
        const current = s.history.present;
        const thumbnail = await sceneThumbnail(kit, current, imagesRef.current);
        // The reducer holds validated scenes only: `edited` skips re-reading picture data.
        const createNew = () =>
          store.create({
            name: asCopy ? t("copyName", { name }) : name,
            scene: current,
            thumbnail,
            edited: true,
          });
        const designId = s.designId;
        const record =
          designId && !asCopy
            ? await updateOrCreate(
                () => store.update(designId, { name, scene: current, thumbnail, edited: true }),
                createNew,
              )
            : await createNew();
        dispatch({ type: "saved", designId: record.id, name: record.name, scene: current });
        // The draft follows the saved version, with its time: never newer than the design.
        // In a task of its own: copying 20 MB of pictures into IndexedDB takes about
        // 30 ms, which must not add up with the save's own work in one task.
        const draft = {
          designId: record.id,
          name: record.name,
          scene: record.scene,
          updatedAt: record.updatedAt,
        };
        window.setTimeout(() => {
          void store.putDraft(draft, { edited: true }).catch(() => undefined);
        }, 0);
        window.history.replaceState(
          null,
          "",
          `${window.location.pathname}${designHash(record.id)}`,
        );
        announce(
          asCopy ? t("savedCopy", { name: record.name }) : t("saved", { name: record.name }),
        );
      } catch {
        announce(t("saveFailed"));
      } finally {
        setBusy(null);
      }
    },
    [announce, busy, kit, store, t],
  );

  const runExport = useCallback(async () => {
    if (!kit || busy) return;
    setBusy("export");
    const current = stateRef.current.history.present;
    const format: SceneExportFormat = exportFormat;
    try {
      const blob = await exportScene(kit, current, {
        format,
        scale: exportScale,
        quality: 0.92,
        images: imagesRef.current,
      });
      const { downloadBlob } = await import("@musterli/exporters");
      const file = exportFileName(current, format, exportScale);
      downloadBlob(blob, file);
      announce(t("exported", { file }));
    } catch {
      announce(t("exportFailed"));
    } finally {
      setBusy(null);
    }
  }, [announce, busy, exportFormat, exportScale, kit, t]);

  const startNew = () => {
    if (stateRef.current.dirty && !window.confirm(t("newConfirm"))) return;
    resizeChain.current = null;
    setBgLocks(new Set());
    const brand = brandPalettes[0]?.colors ?? null;
    dispatch({
      type: "load",
      scene: starterScene(t("starterHeadline"), brand),
      name: "",
      designId: null,
    });
    window.history.replaceState(null, "", window.location.pathname);
    announce(t("newDesign"));
  };

  // ---- templates and brand ------------------------------------------------

  const tTemplates = useTranslations("SocialEditor.templates");
  /** Sample text of a template text (`<template>.<layer>`) in the user's language. */
  const templateText = useCallback(
    // Keys are built from the template data; the template tests check every one exists.
    (key: string) => tTemplates(templateTextMessageKey(key) as "intro"),
    [tTemplates],
  );
  const pickerRef = useRef<TemplatePickerHandle>(null);

  /** A template as a new design: fonts first, then fitted by Magic Resize. */
  const openTemplate = async (
    template: SceneTemplate,
    library: TemplateLibrary,
    formatId: string | null,
  ) => {
    const m = measureRef.current;
    if (!m || busy) return;
    if (stateRef.current.dirty && !window.confirm(tTemplates("confirm"))) return;
    setBusy("template");
    try {
      const raw = library.instantiateTemplate(template, {
        text: templateText,
        background: () => null,
      });
      const fonts = await loadSceneFonts(raw);
      const scene = templateScene(library.instantiateTemplate, template, templateText, m, formatId);
      resizeChain.current = null;
      setBgLocks(new Set());
      setMissingFonts(fonts.missing);
      const name = tTemplates(`names.${template.id}` as "names.launch-bold");
      dispatch({ type: "load", scene, name, designId: null });
      window.history.replaceState(null, "", window.location.pathname);
      announce(
        tTemplates("opened", {
          name,
          format: tRoot(`sizes.${scene.format.id ?? template.format}`),
        }),
      );
    } finally {
      setBusy(null);
    }
  };

  const brandEmptyDialog = useRef<HTMLDialogElement>(null);
  const applyBrandButton = useRef<HTMLButtonElement>(null);
  const tBrand = useTranslations("SocialEditor.brand");

  /** Palette, fonts and logo of the brand kit on the scene, as one undo step. */
  const applyBrand = async () => {
    const m = measureRef.current;
    if (!m || busy) return;
    setBusy("brand");
    try {
      const [palettes, fonts, logos] = await Promise.all([
        brandKit.loadPalettes(),
        brandKit.listFonts(),
        brandKit.listAssets("logo"),
      ]);
      setBrandPalettes(palettes.palettes);
      setBrandFontSources(fonts);
      setBrandFonts(fonts.map((f) => ({ id: f.id, name: f.name })));
      const palette =
        palettes.palettes.find((p) => p.id === palettes.defaultId) ?? palettes.palettes[0];
      const first = logos[0];
      const logoImage = first ? sceneImageSchema.safeParse(first.image) : null;
      const logo =
        first && logoImage?.success
          ? { image: logoImage.data, assetId: first.id, name: first.name }
          : null;
      const refs: FontRef[] = fonts
        .slice(0, 2)
        .map((f) => ({ kind: "brand", id: f.id, name: f.name }));
      if (!palette && refs.length === 0 && !logo) {
        brandEmptyDialog.current?.showModal();
        return;
      }
      // Brand fonts load before anything is measured with them.
      const loaded = await Promise.all(refs.map((ref) => loadFont(ref, 700, "normal")));
      const usable = refs.filter((_, i) => loaded[i]);
      const current = stateRef.current.history.present;
      const result = applyBrandKit(
        current,
        { colors: palette?.colors ?? null, fonts: usable, logo },
        { measure: m, newLogoId: newSceneId("o") },
      );
      let next = result.scene;
      // The background tool takes the brand colours the texts do not use.
      const bg = next.layers[0];
      const tool = bg?.kind === "background" && !bg.locked ? registry.get(bg.toolId) : undefined;
      if (result.colors && bg?.kind === "background" && tool) {
        const recolored = applyBrandPalette(tool, bg.params, backgroundBrandColors(next), bgLocks);
        if (recolored) {
          next = updateLayer(next, bg.id, () => ({ ...bg, params: recolored.params }));
          setBgLocks((locks) => new Set([...locks, ...recolored.applied]));
        }
      }
      if (next === current) {
        announce(tBrand("nothing"));
        return;
      }
      change(next);
      setFontsVersion((v) => v + 1);
      const parts = [
        result.colors ? tBrand("partColors") : null,
        result.fonts > 0 ? tBrand("partFonts", { count: result.fonts }) : null,
        result.logos > 0 ? tBrand("partLogo") : null,
      ].filter((p): p is string => p !== null);
      announce(tBrand("applied", { parts: parts.join(", ") }));
    } catch {
      announce(tBrand("failed"));
    } finally {
      setBusy(null);
    }
  };

  // ---- keyboard -----------------------------------------------------------

  const handlers = {
    save,
    runExport,
    newVariant,
    removeSelected,
    duplicateSelected,
    groupSelected,
    ungroupSelected,
    nudge,
  };
  const keyHandlers = useRef(handlers);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const h = keyHandlers.current;
      if (event.defaultPrevented || event.isComposing) return;
      const target = event.target;
      const mod = event.metaKey || event.ctrlKey;
      // Arrows move the selection: 1 px, 10 px with Shift.
      if (!mod && !event.altKey && event.key.startsWith("Arrow")) {
        if (isShortcutBlocked(target, "previousVariant")) return;
        const step = event.shiftKey ? NUDGE_BIG : NUDGE;
        const d = {
          ArrowLeft: [-step, 0],
          ArrowRight: [step, 0],
          ArrowUp: [0, -step],
          ArrowDown: [0, step],
        }[event.key];
        if (d && h.nudge(d[0] as number, d[1] as number)) event.preventDefault();
        return;
      }
      if (!mod && !event.altKey && (event.key === "Delete" || event.key === "Backspace")) {
        if (isShortcutBlocked(target, "undo")) return;
        event.preventDefault();
        h.removeSelected();
        return;
      }
      if (!mod && event.key === "Escape") {
        if (isShortcutBlocked(target, "undo")) return;
        dispatch({ type: "select", selection: [] });
        return;
      }
      if (mod && !event.altKey) {
        const key = event.key.toLowerCase();
        if ((key === "d" || key === "g") && !isShortcutBlocked(target, "undo")) {
          event.preventDefault();
          if (key === "d") h.duplicateSelected();
          else if (event.shiftKey) h.ungroupSelected();
          else h.groupSelected();
          return;
        }
      }
      const action = resolveShortcut(event);
      switch (action) {
        case "undo":
          event.preventDefault();
          dispatch({ type: "undo" });
          break;
        case "redo":
          event.preventDefault();
          dispatch({ type: "redo" });
          break;
        case "save":
          event.preventDefault();
          void h.save();
          break;
        case "export":
          event.preventDefault();
          void h.runExport();
          break;
        case "newVariant":
          if (event.repeat) return;
          event.preventDefault();
          h.newVariant();
          break;
        default:
          break;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // ---- stage --------------------------------------------------------------

  const viewportRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<SocialStage | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  useEffect(() => {
    const el = viewportRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      if (!entry) return;
      setViewport({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [load]);
  const zoom = useMemo(() => {
    if (viewport.width === 0) return 0.25;
    const pad = 32;
    return Math.max(
      0.05,
      Math.min(
        1,
        (viewport.width - pad) / scene.format.width,
        (viewport.height - pad) / scene.format.height,
      ),
    );
  }, [viewport, scene.format.width, scene.format.height]);

  const editText = useCallback(
    (id: string) => {
      dispatch({ type: "select", selection: [id] });
      window.requestAnimationFrame(() => document.getElementById(textFieldId)?.focus());
    },
    [textFieldId],
  );
  const stageCallbacks = { select, onFrames, editText };
  const callbacksRef = useRef(stageCallbacks);

  // Long-lived handlers (stage, keyboard) read the values of the last commit.
  useLayoutEffect(() => {
    stateRef.current = state;
    measureRef.current = measure;
    imagesRef.current = pictures.images;
    keyHandlers.current = handlers;
    callbacksRef.current = stageCallbacks;
  });

  useEffect(() => {
    const container = containerRef.current;
    if (!kit || !container || load !== "ready") return;
    const stage = new SocialStage(kit, container, {
      onSelect: (id, additive) => callbacksRef.current.select(id, additive),
      onFrames: (changes) => callbacksRef.current.onFrames(changes),
      onEditText: (id) => callbacksRef.current.editText(id),
    });
    stageRef.current = stage;
    return () => {
      stage.destroy();
      stageRef.current = null;
    };
  }, [kit, load]);

  useEffect(() => {
    stageRef.current?.update(scene, pictures, state.selection, zoom);
  }, [scene, pictures, state.selection, zoom, kit, load, fontsVersion]);

  const fitProblems = useMemo(
    () => (measure ? checkSceneFit(scene, measure).length : 0),
    // fontsVersion: the same scene measures differently once its fonts are in.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [scene, measure, fontsVersion],
  );

  // ---- render -------------------------------------------------------------

  const canUndo = state.history.past.length > 0;
  const canRedo = state.history.future.length > 0;
  const nameId = `${fileId}-name`;
  const formatId = `${fileId}-format`;
  const exportFormatId = `${fileId}-export-format`;
  const exportScaleId = `${fileId}-export-scale`;
  const formatLabel = (id: string, w: number, h: number) => `${tRoot(`sizes.${id}`)} (${w} × ${h})`;

  if (kitFailed) {
    return (
      <p role="alert" className="m-6 rounded-lg bg-destructive/10 px-4 py-3">
        {t("loadFailed")}
      </p>
    );
  }

  return (
    <div
      className="flex min-h-0 flex-1 flex-col"
      data-testid="social-editor"
      data-ready={load === "ready" && kit ? "true" : "false"}
    >
      <h1 className="sr-only">{t("title")}</h1>
      <p
        className="flex items-center gap-2 border-b border-border bg-muted px-4 py-2 text-sm lg:hidden"
        data-testid="small-screen-hint"
      >
        <MonitorSmartphoneIcon aria-hidden="true" className="size-4 shrink-0 text-link" />
        {t("smallScreen")}
      </p>

      <div
        role="group"
        aria-label={t("toolbar")}
        className="flex flex-wrap items-end gap-2 border-b border-border px-3 py-2"
      >
        <a
          href={props.landingHref}
          className="inline-flex h-8 shrink-0 items-center gap-1 rounded-full border border-border bg-background ps-1.5 pe-3 text-sm text-muted-foreground shadow-xs transition-colors hover:bg-accent hover:text-foreground"
        >
          <ChevronLeftIcon aria-hidden="true" className="size-4" />
          {t("back")}
        </a>
        <div className="flex min-w-36 flex-[1_1_10rem] flex-col gap-0.5">
          <label htmlFor={nameId} className="text-[11px] text-muted-foreground">
            {t("name")}
          </label>
          <input
            id={nameId}
            className={INPUT}
            value={state.name}
            placeholder={t("untitled")}
            maxLength={120}
            data-testid="design-name"
            onChange={(event) => dispatch({ type: "rename", name: event.currentTarget.value })}
          />
        </div>
        <div className="flex min-w-44 flex-[1_1_12rem] flex-col gap-0.5">
          <label htmlFor={formatId} className="text-[11px] text-muted-foreground">
            {t("format")}
          </label>
          <select
            id={formatId}
            className={INPUT}
            value={scene.format.id ?? ""}
            disabled={!measure}
            data-testid="format"
            onChange={(event) => void changeFormat(event.currentTarget.value)}
          >
            {scene.format.id === null && (
              <option value="">
                {t("customFormat", { width: scene.format.width, height: scene.format.height })}
              </option>
            )}
            {SOCIAL_FORMATS.map((f) => (
              <option key={f.id} value={f.id}>
                {formatLabel(f.id, f.width, f.height)}
              </option>
            ))}
          </select>
        </div>
        <div className="flex items-center gap-1">
          <button
            type="button"
            className={GHOST_ICON}
            aria-label={t("undo")}
            title={t("undo")}
            aria-keyshortcuts="Control+Z Meta+Z"
            disabled={!canUndo}
            data-testid="undo"
            onClick={() => dispatch({ type: "undo" })}
          >
            <Undo2Icon aria-hidden="true" />
          </button>
          <button
            type="button"
            className={GHOST_ICON}
            aria-label={t("redo")}
            title={t("redo")}
            aria-keyshortcuts="Control+Shift+Z Meta+Shift+Z Control+Y"
            disabled={!canRedo}
            data-testid="redo"
            onClick={() => dispatch({ type: "redo" })}
          >
            <Redo2Icon aria-hidden="true" />
          </button>
        </div>
        <div className="ms-auto flex flex-wrap items-end gap-1.5">
          <button type="button" className={OUTLINE} onClick={startNew} data-testid="new-design">
            <FilePlusIcon aria-hidden="true" />
            {t("new")}
          </button>
          <button
            type="button"
            className={OUTLINE}
            onClick={() => pickerRef.current?.open()}
            disabled={!kit || busy !== null}
            aria-haspopup="dialog"
            data-testid="open-templates"
          >
            <LayoutTemplateIcon aria-hidden="true" />
            {busy === "template" ? t("loading") : tTemplates("open")}
          </button>
          <button
            ref={applyBrandButton}
            type="button"
            className={OUTLINE}
            onClick={() => void applyBrand()}
            disabled={!kit || busy !== null || load !== "ready"}
            aria-describedby={`${fileId}-brand-hint`}
            data-testid="apply-brand"
          >
            <PaletteIcon aria-hidden="true" />
            {busy === "brand" ? tBrand("applying") : tBrand("apply")}
          </button>
          <span id={`${fileId}-brand-hint`} hidden>
            {tBrand("applyHint")}
          </span>
          <button
            type="button"
            className={OUTLINE}
            onClick={() => void save(true)}
            disabled={!kit || busy !== null || state.designId === null}
            data-testid="save-copy"
          >
            {t("saveCopy")}
          </button>
          <button
            type="button"
            className={buttonVariants({ size: "sm" })}
            onClick={() => void save()}
            disabled={!kit || busy !== null}
            aria-keyshortcuts="Control+S Meta+S"
            data-testid="save"
          >
            <SaveIcon aria-hidden="true" />
            {busy === "save" ? t("saving") : t("save")}
          </button>
          <a href={props.myDesignsHref} className={OUTLINE}>
            {t("myDesigns")}
          </a>
        </div>
      </div>

      <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[16rem_minmax(0,1fr)_20rem]">
        <aside
          aria-label={t("layersPanel")}
          className="order-2 flex min-h-0 flex-col gap-4 overflow-y-auto border-border p-3 lg:order-1 lg:border-e"
        >
          <section aria-labelledby={`${fileId}-add`} className="flex flex-col gap-2">
            <h2 id={`${fileId}-add`} className="text-sm font-semibold">
              {t("add.title")}
            </h2>
            <div className="grid grid-cols-2 gap-1.5">
              <AddButton
                icon={<TypeIcon />}
                label={t("add.text")}
                testId="add-text"
                onClick={addText}
              />
              <AddButton
                icon={<SquareIcon />}
                label={t("add.rect")}
                testId="add-rect"
                onClick={() => addShape("rect")}
              />
              <AddButton
                icon={<CircleIcon />}
                label={t("add.ellipse")}
                testId="add-ellipse"
                onClick={() => addShape("ellipse")}
              />
              <AddButton
                icon={<MinusIcon />}
                label={t("add.line")}
                testId="add-line"
                onClick={() => addShape("line")}
              />
              <AddButton
                icon={<StarIcon />}
                label={t("add.library")}
                testId="add-library"
                onClick={() => addShape("library")}
              />
              <AddButton
                icon={<ImagePlusIcon />}
                label={busy === "upload" ? t("add.uploading") : t("add.image")}
                testId="add-image"
                disabled={busy === "upload"}
                onClick={() => fileRef.current?.click()}
              />
              <AddButton
                icon={<StampIcon />}
                label={t("add.logo")}
                testId="add-logo"
                onClick={() => void openLogos()}
              />
            </div>
            <input
              ref={fileRef}
              type="file"
              accept={ASSET_ACCEPT}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              data-testid="image-file"
              onChange={(event) => {
                const file = event.currentTarget.files?.[0];
                event.currentTarget.value = "";
                if (file) void upload(file);
              }}
            />
          </section>
          <section aria-labelledby={`${fileId}-layers`} className="flex flex-col gap-2">
            <h2 id={`${fileId}-layers`} className="text-sm font-semibold">
              {t("layers.title")}
            </h2>
            <p className="text-xs text-muted-foreground">{t("layers.hint")}</p>
            <LayerList
              scene={scene}
              selection={state.selection}
              onSelect={selectFromList}
              onToggleVisible={(id) =>
                updateOne(id, (l) => ({ ...l, visible: !l.visible }), `visible-${id}`)
              }
              onToggleLock={(id) =>
                updateOne(id, (l) => ({ ...l, locked: !l.locked }), `lock-${id}`)
              }
              onRename={(id, name) =>
                updateOne(id, (l) => ({ ...l, name: name.trim().slice(0, 80) }), `name-${id}`)
              }
              onMove={(id, move: StackMove) => change(moveInStack(scene, id, move))}
              onReorder={(id, index) => change(reorderLayer(scene, id, index))}
            />
          </section>
        </aside>

        <section
          className="order-1 flex min-h-[50vh] min-w-0 flex-col bg-canvas lg:order-2 lg:min-h-0"
          aria-label={t("canvasRegion")}
        >
          <div
            ref={viewportRef}
            className="relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-4"
          >
            {load !== "ready" || !kit ? (
              <p className="text-sm text-muted-foreground" data-testid="editor-loading">
                {t("loading")}
              </p>
            ) : (
              <div
                tabIndex={0}
                role="group"
                aria-roledescription={t("canvasRole")}
                aria-label={t("canvasLabel", {
                  width: scene.format.width,
                  height: scene.format.height,
                  selection:
                    editable.length === 0
                      ? t("nothingSelected")
                      : editable.map((l) => nameOf(l)).join(", "),
                })}
                className="rounded-sm shadow-lg ring-1 ring-black/10 focus-visible:ring-[3px] focus-visible:ring-ring focus-visible:outline-none"
                style={{
                  width: Math.round(scene.format.width * zoom),
                  height: Math.round(scene.format.height * zoom),
                }}
                data-testid="stage"
                data-format={`${scene.format.width}x${scene.format.height}`}
                data-fit-problems={fitProblems}
                data-fonts={fontsVersion}
                data-pictures={pictures.images.size}
                data-background={
                  pictures.rendering ? "rendering" : pictures.failed ? "failed" : "ready"
                }
              >
                <div ref={containerRef} />
              </div>
            )}
          </div>
          <div className="flex flex-wrap items-end justify-center gap-2 border-t border-border bg-background px-3 py-2">
            <div className="flex flex-col gap-0.5">
              <label htmlFor={exportFormatId} className="text-[11px] text-muted-foreground">
                {t("export.format")}
              </label>
              <select
                id={exportFormatId}
                className={cn(INPUT, "w-24")}
                value={exportFormat}
                data-testid="export-format"
                onChange={(event) => setExportFormat(event.currentTarget.value as "png" | "jpg")}
              >
                <option value="png">PNG</option>
                <option value="jpg">JPG</option>
              </select>
            </div>
            <div className="flex flex-col gap-0.5">
              <label htmlFor={exportScaleId} className="text-[11px] text-muted-foreground">
                {t("export.size")}
              </label>
              <select
                id={exportScaleId}
                className={cn(INPUT, "w-44")}
                value={exportScaleFits(scene.format, exportScale) ? exportScale : 1}
                data-testid="export-scale"
                onChange={(event) => setExportScale(event.currentTarget.value === "2" ? 2 : 1)}
              >
                <option value="1">
                  {t("export.scale", {
                    scale: 1,
                    width: scene.format.width,
                    height: scene.format.height,
                  })}
                </option>
                {/* Over the canvas limit (a huge custom size): 2x is not offered. */}
                <option value="2" disabled={!exportScaleFits(scene.format, 2)}>
                  {exportScaleFits(scene.format, 2)
                    ? t("export.scale", {
                        scale: 2,
                        width: scene.format.width * 2,
                        height: scene.format.height * 2,
                      })
                    : t("export.scaleTooLarge", { scale: 2, max: SCENE_EXPORT_EDGE_MAX })}
                </option>
              </select>
            </div>
            <button
              type="button"
              className={buttonVariants({ size: "sm" })}
              onClick={() => void runExport()}
              disabled={!kit || busy !== null}
              aria-keyshortcuts="Control+E Meta+E"
              data-testid="export"
            >
              <DownloadIcon aria-hidden="true" />
              {busy === "export" ? t("export.running") : t("export.run")}
            </button>
          </div>
        </section>

        <aside
          aria-label={t("propertiesPanel")}
          className="order-3 min-h-0 overflow-y-auto border-border p-3 lg:border-s"
        >
          {editable.length > 0 ? (
            <Inspector
              scene={scene}
              layers={editable}
              brandFonts={brandFonts}
              missingFonts={missingFonts}
              onFont={(id, choice, weight) => void pickFont(id, choice, weight)}
              textFieldId={textFieldId}
              onUpdate={updateOne}
              onCommit={() => dispatch({ type: "commit" })}
              onAlign={(mode) => {
                const ids = expandSelection(scene, state.selection);
                change(reinferConstraints(alignLayers(scene, ids, mode), new Set(ids)));
              }}
              onDistribute={(axis) => {
                const ids = expandSelection(scene, state.selection);
                change(reinferConstraints(distributeLayers(scene, ids, axis), new Set(ids)));
              }}
              onGroup={groupSelected}
              onUngroup={ungroupSelected}
              onDuplicate={duplicateSelected}
              onDelete={removeSelected}
              onStack={(move) => {
                const id = editable[0]?.id;
                if (id) change(moveInStack(scene, id, move));
              }}
            />
          ) : (
            <BackgroundPanel
              scene={scene}
              layer={background}
              tool={backgroundTool}
              tools={backgroundTools}
              locks={bgLocks}
              brandPalettes={brandPalettes}
              onTool={changeTool}
              onParam={(key, value) =>
                setBackground(
                  (bg) => ({ ...bg, params: { ...bg.params, [key]: value } }),
                  `bg-${key}`,
                )
              }
              onCommit={() => dispatch({ type: "commit" })}
              onVariant={newVariant}
              onToggleLock={(key) =>
                setBgLocks((locks) => {
                  const next = new Set(locks);
                  if (next.has(key)) next.delete(key);
                  else next.add(key);
                  return next;
                })
              }
              onApplyPalette={applyPalette}
              onPalette={(palette, key) => change({ ...scene, palette }, key)}
            />
          )}
        </aside>
      </div>

      <p role="status" aria-live="polite" className="sr-only" data-testid="announcer">
        {announcement}
      </p>

      <TemplatePicker
        ref={pickerRef}
        kit={kit}
        measure={measure}
        currentFormat={scene.format}
        text={templateText}
        onPick={(template, library, formatId) => void openTemplate(template, library, formatId)}
      />

      <dialog
        ref={brandEmptyDialog}
        aria-labelledby={`${fileId}-brand-empty`}
        // The button was disabled while the brand kit loaded: focus goes back explicitly.
        onClose={() => applyBrandButton.current?.focus()}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-border bg-popover p-0 text-popover-foreground shadow-lg backdrop:bg-background/70 backdrop:backdrop-blur-sm"
        data-testid="brand-empty-dialog"
      >
        <div className="grid gap-4 p-5">
          <h2 id={`${fileId}-brand-empty`} className="text-base font-semibold">
            {tBrand("emptyTitle")}
          </h2>
          <p className="text-sm text-muted-foreground">
            {tBrand.rich("emptyText", {
              link: (chunks) => (
                <a href={props.brandKitHref} className="text-link underline underline-offset-4">
                  {chunks}
                </a>
              ),
            })}
          </p>
          <div className="flex justify-end">
            <button
              type="button"
              className={OUTLINE}
              onClick={() => brandEmptyDialog.current?.close()}
            >
              {tBrand("close")}
            </button>
          </div>
        </div>
      </dialog>

      <dialog
        ref={logoDialog}
        aria-labelledby={`${fileId}-logos`}
        className="m-auto w-[min(28rem,calc(100vw-2rem))] rounded-2xl border border-border bg-popover p-0 text-popover-foreground shadow-lg backdrop:bg-background/70 backdrop:backdrop-blur-sm"
        data-testid="logo-dialog"
      >
        <div className="grid gap-4 p-5">
          <h2 id={`${fileId}-logos`} className="text-base font-semibold">
            {t("logos.title")}
          </h2>
          {logos === null ? (
            <p className="text-sm text-muted-foreground">{t("loading")}</p>
          ) : logos.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t.rich("logos.empty", {
                link: (chunks) => (
                  <a href={props.brandKitHref} className="text-link underline underline-offset-4">
                    {chunks}
                  </a>
                ),
              })}
            </p>
          ) : (
            <ul className="grid grid-cols-3 gap-2">
              {logos.map((logo) => (
                <li key={logo.id}>
                  <LogoButton logo={logo} onPick={() => addLogo(logo)} />
                </li>
              ))}
            </ul>
          )}
          <div className="flex justify-end">
            <button type="button" className={OUTLINE} onClick={() => logoDialog.current?.close()}>
              {t("logos.close")}
            </button>
          </div>
        </div>
      </dialog>
    </div>
  );
}

function AddButton(props: {
  icon: ReactNode;
  label: string;
  testId: string;
  disabled?: boolean;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      className={cn(OUTLINE, "justify-start")}
      onClick={props.onClick}
      disabled={props.disabled}
      data-testid={props.testId}
    >
      <span aria-hidden="true" className="contents">
        {props.icon}
      </span>
      {props.label}
    </button>
  );
}

function LogoButton(props: { logo: BrandAsset; onPick(): void }) {
  const t = useTranslations("SocialEditor.logos");
  const image = props.logo.image;
  const src = useMemo(
    () => (image.kind === "raster" ? image.href : svgDataUrl(image.svg)),
    [image],
  );
  return (
    <button
      type="button"
      onClick={props.onPick}
      aria-label={t("pick", { name: props.logo.name || t("unnamed") })}
      className="flex aspect-square w-full items-center justify-center rounded-lg border border-border bg-canvas p-2 hover:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 focus-visible:outline-none"
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- local data URL of the brand kit */}
      <img src={src} alt="" className="max-h-full max-w-full object-contain" />
    </button>
  );
}
