/**
 * Editor state (M1-AP02): current tool, params, seed, canvas size, locks,
 * undo/redo history and the variant filmstrip.
 *
 * The store is tool-agnostic: everything tool-specific (defaults, presets,
 * randomize, lockability) comes from the `ToolDefinition`. It is a vanilla
 * zustand store so it can be created per editor instance, used in tests
 * without React and bound to React via `EditorStoreProvider`.
 *
 * Invariants:
 *  - `params`, `seed` and `size` describe the current design. Params are
 *    treated as immutable; every change replaces the object.
 *  - The active variant in the filmstrip always mirrors `params` and `seed`,
 *    so browsing variants never loses tweaks.
 *  - Undo/redo covers params, seed, size and the active variant. Locks and
 *    the filmstrip itself are not part of the history.
 */
import { createRng, toUint32 } from "@motivo/engine";
import {
  DEFAULT_CANVAS_SIZE,
  canvasSizeSchema,
  keepLocked,
  registry as defaultRegistry,
  seedSchema,
  type AnyToolDefinition,
  type CanvasSize,
  type ToolRegistry,
} from "@motivo/tool-registry";
import { createStore, type StoreApi } from "zustand/vanilla";
import { valuesEqual } from "./values";

/** Parameter object of the current tool, erased to its runtime shape. */
export type ParamValues = Readonly<Record<string, unknown>>;

/** One entry of the variant filmstrip. */
export interface Variant {
  /** Unique within the store, increasing. */
  readonly id: number;
  readonly params: ParamValues;
  readonly seed: number;
}

/** A point in the undo history. */
export interface HistoryEntry {
  readonly params: ParamValues;
  readonly seed: number;
  readonly size: CanvasSize;
  /** Variant that was active; `null` if it has since left the filmstrip. */
  readonly variantId: number | null;
}

/** A complete, serialisable design (share links, saving). */
export interface Design {
  toolId: string;
  params: ParamValues;
  seed: number;
  size: CanvasSize;
}

export interface EditorState {
  readonly tool: AnyToolDefinition;
  readonly toolId: string;
  readonly params: ParamValues;
  readonly seed: number;
  readonly size: CanvasSize;
  /** Param keys kept unchanged by `newVariant`. */
  readonly locks: ReadonlySet<string>;
  /** Oldest first. The last entry is what `undo` restores. */
  readonly past: readonly HistoryEntry[];
  /** Nearest first. The first entry is what `redo` restores. */
  readonly future: readonly HistoryEntry[];
  /** Filmstrip, oldest first, at most `variantLimit` entries. */
  readonly variants: readonly Variant[];
  readonly activeVariantId: number | null;
  /** Internal: open coalescing window of the last change. */
  readonly coalesce: { readonly key: string; readonly at: number } | null;
  /** Internal: id for the next variant. */
  readonly nextVariantId: number;
}

export type LoadDesignResult = { ok: true } | { ok: false; error: string };

export interface EditorActions {
  /** Switches tool and starts fresh (defaults, no history, no locks). */
  setTool(toolId: string): void;
  /** Replaces the whole design, e.g. from a share link. Validates first; starts a fresh history. */
  loadDesign(design: Partial<Design> & Pick<Design, "params">): LoadDesignResult;
  /** Sets one param. Consecutive changes of the same key are coalesced into one undo step. */
  setParam(key: string, value: unknown): void;
  /** Sets several params as one undo step. */
  setParams(patch: ParamValues): void;
  /**
   * Merges params derived from an image input (`tool.imageInput`) into the
   * current design and its filmstrip entry, without an undo step: they follow
   * from the image and the seed, and the seed is already in the history.
   * Unknown keys are ignored.
   */
  applyDerived(patch: ParamValues): void;
  /** Resets one param to the tool default (double-click on a control). */
  resetParam(key: string): void;
  /** Resets all params to the tool defaults. */
  resetParams(): void;
  setSeed(seed: number): void;
  setSize(size: CanvasSize): void;
  toggleLock(key: string): void;
  setLocked(key: string, locked: boolean): void;
  clearLocks(): void;
  /** Space: new seed plus `tool.randomize` with locks, appended to the filmstrip. */
  newVariant(): void;
  /** Applies a preset as a new filmstrip variant. Unknown ids are ignored. */
  applyPreset(presetId: string): void;
  selectVariant(id: number): void;
  /** Arrow right: next variant in the filmstrip (no wrap-around). */
  nextVariant(): void;
  /** Arrow left: previous variant in the filmstrip (no wrap-around). */
  previousVariant(): void;
  undo(): void;
  redo(): void;
  /** Closes the current coalescing window, e.g. on slider pointer-up or blur. */
  commit(): void;
}

export type EditorStore = EditorState & EditorActions;
export type EditorStoreApi = StoreApi<EditorStore>;

export interface EditorStoreOptions {
  toolId: string;
  /** Where tools are looked up. Default: the app-wide registry. */
  registry?: Pick<ToolRegistry, "get">;
  /** Initial params; must be valid for the tool. Default: `tool.defaults`. */
  params?: ParamValues;
  /** Initial seed. Default: `DEFAULT_SEED`, so server and client render the same. */
  seed?: number;
  /** Initial size. Default: `tool.defaultSize` or `DEFAULT_CANVAS_SIZE`. */
  size?: CanvasSize;
  /** Max undo steps. Default 100. */
  historyLimit?: number;
  /** Max filmstrip entries. Default 24. */
  variantLimit?: number;
  /** Changes of the same key within this window form one undo step. Default 500 ms. */
  coalesceMs?: number;
  /** Clock for coalescing. Default `Date.now`. */
  now?: () => number;
  /** Source of new variant seeds. Default: `crypto.getRandomValues`. */
  randomSeed?: () => number;
}

export const DEFAULT_SEED = 1;
export const DEFAULT_HISTORY_LIMIT = 100;
export const DEFAULT_VARIANT_LIMIT = 24;
export const DEFAULT_COALESCE_MS = 500;

/**
 * XORed into the variant seed for the `randomize` rng, so the params of a
 * variant are not correlated with the random stream its renderer consumes.
 */
export const RANDOMIZE_SALT = 0x5bd1e995;

const SIZE_COALESCE_KEY = "$size";

function cryptoSeed(): number {
  const buf = new Uint32Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0] ?? 0;
}

function resolveTool(registry: Pick<ToolRegistry, "get">, toolId: string): AnyToolDefinition {
  const tool = registry.get(toolId);
  if (!tool) throw new Error(`Unknown tool "${toolId}"`);
  return tool;
}

function initialSize(tool: AnyToolDefinition): CanvasSize {
  const size = tool.defaultSize ?? DEFAULT_CANVAS_SIZE;
  return { width: size.width, height: size.height };
}

/** Whether `key` is a top-level param of the tool that may be locked. */
export function isLockable(tool: AnyToolDefinition, key: string): boolean {
  if (!Object.prototype.hasOwnProperty.call(tool.schema.shape, key)) return false;
  const hint = (
    tool.controls?.params as Record<string, { lockable?: boolean } | undefined> | undefined
  )?.[key];
  return hint?.lockable !== false;
}

function freshState(
  tool: AnyToolDefinition,
  params: ParamValues,
  seed: number,
  size: CanvasSize,
): Omit<EditorState, "locks"> {
  return {
    tool,
    toolId: tool.id,
    params,
    seed,
    size,
    past: [],
    future: [],
    variants: [{ id: 0, params, seed }],
    activeVariantId: 0,
    coalesce: null,
    nextVariantId: 1,
  };
}

/** `params` with the known, changed keys of `patch` applied, or `null` if nothing changes. */
function mergePatch(s: EditorState, patch: ParamValues): ParamValues | null {
  const shape = s.tool.schema.shape;
  let next: Record<string, unknown> | null = null;
  for (const [key, value] of Object.entries(patch)) {
    if (!Object.prototype.hasOwnProperty.call(shape, key)) continue;
    if (valuesEqual((next ?? s.params)[key], value)) continue;
    next ??= { ...s.params };
    next[key] = value;
  }
  return next;
}

export function createEditorStore(options: EditorStoreOptions): EditorStoreApi {
  const registry = options.registry ?? defaultRegistry;
  const historyLimit = Math.max(1, options.historyLimit ?? DEFAULT_HISTORY_LIMIT);
  const variantLimit = Math.max(1, options.variantLimit ?? DEFAULT_VARIANT_LIMIT);
  const coalesceMs = options.coalesceMs ?? DEFAULT_COALESCE_MS;
  const now = options.now ?? Date.now;
  const randomSeed = options.randomSeed ?? cryptoSeed;

  const initialTool = resolveTool(registry, options.toolId);

  return createStore<EditorStore>()((set, get) => {
    const snapshot = (s: EditorState): HistoryEntry => ({
      params: s.params,
      seed: s.seed,
      size: s.size,
      variantId: s.activeVariantId,
    });

    /** Writes the current design into the active filmstrip entry. */
    const syncVariants = (
      variants: readonly Variant[],
      id: number | null,
      params: ParamValues,
      seed: number,
    ): readonly Variant[] =>
      id === null ? variants : variants.map((v) => (v.id === id ? { id, params, seed } : v));

    /**
     * Applies a design change as one undo step. With a `coalesceKey`, a change
     * of the same key inside the window extends the previous step instead.
     */
    const change = (
      next: { params?: ParamValues; seed?: number; size?: CanvasSize },
      coalesceKey?: string,
    ): void => {
      const s = get();
      const params = next.params ?? s.params;
      const seed = next.seed ?? s.seed;
      const size = next.size ?? s.size;
      if (
        params === s.params &&
        seed === s.seed &&
        size.width === s.size.width &&
        size.height === s.size.height
      ) {
        return;
      }
      const t = now();
      const c = s.coalesce;
      const merge =
        coalesceKey !== undefined && c !== null && c.key === coalesceKey && t - c.at <= coalesceMs;
      set({
        params,
        seed,
        size,
        past: merge ? s.past : [...s.past, snapshot(s)].slice(-historyLimit),
        future: [],
        variants: syncVariants(s.variants, s.activeVariantId, params, seed),
        coalesce: coalesceKey === undefined ? null : { key: coalesceKey, at: t },
      });
    };

    /** Appends a filmstrip variant, makes it active and records an undo step. */
    const pushVariant = (params: ParamValues, seed: number): void => {
      const s = get();
      const id = s.nextVariantId;
      set({
        params,
        seed,
        past: [...s.past, snapshot(s)].slice(-historyLimit),
        future: [],
        variants: [...s.variants, { id, params, seed }].slice(-variantLimit),
        activeVariantId: id,
        nextVariantId: id + 1,
        coalesce: null,
      });
    };

    /** Restores a history entry and syncs the filmstrip. */
    const restore = (entry: HistoryEntry): Partial<EditorState> => {
      const s = get();
      const variantId =
        entry.variantId !== null && s.variants.some((v) => v.id === entry.variantId)
          ? entry.variantId
          : null;
      return {
        params: entry.params,
        seed: entry.seed,
        size: entry.size,
        activeVariantId: variantId,
        variants: syncVariants(s.variants, variantId, entry.params, entry.seed),
        coalesce: null,
      };
    };

    const selectVariantAt = (index: number): void => {
      const target = get().variants[index];
      if (target) get().selectVariant(target.id);
    };

    const activeIndex = (): number => {
      const s = get();
      return s.variants.findIndex((v) => v.id === s.activeVariantId);
    };

    return {
      ...freshState(
        initialTool,
        options.params ?? initialTool.defaults,
        toUint32(options.seed ?? DEFAULT_SEED),
        options.size ?? initialSize(initialTool),
      ),
      locks: new Set<string>(),

      setTool(toolId) {
        if (toolId === get().toolId) return;
        const tool = resolveTool(registry, toolId);
        set({
          ...freshState(tool, tool.defaults, get().seed, initialSize(tool)),
          locks: new Set<string>(),
        });
      },

      loadDesign(design) {
        let tool: AnyToolDefinition;
        try {
          tool = resolveTool(registry, design.toolId ?? get().toolId);
        } catch (error) {
          return { ok: false, error: (error as Error).message };
        }
        const params = tool.schema.safeParse(design.params);
        if (!params.success) return { ok: false, error: params.error.message };
        const seed = seedSchema.safeParse(design.seed ?? get().seed);
        if (!seed.success) return { ok: false, error: seed.error.message };
        const size = canvasSizeSchema.safeParse(design.size ?? initialSize(tool));
        if (!size.success) return { ok: false, error: size.error.message };
        const keepLocks = tool.id === get().toolId;
        set({
          ...freshState(tool, params.data, seed.data, size.data),
          locks: keepLocks ? get().locks : new Set<string>(),
        });
        return { ok: true };
      },

      setParam(key, value) {
        const s = get();
        if (!Object.prototype.hasOwnProperty.call(s.tool.schema.shape, key)) return;
        if (valuesEqual(s.params[key], value)) return;
        change({ params: { ...s.params, [key]: value } }, key);
      },

      setParams(patch) {
        const next = mergePatch(get(), patch);
        if (next) change({ params: next });
      },

      applyDerived(patch) {
        const s = get();
        const next = mergePatch(s, patch);
        if (!next) return;
        set({
          params: next,
          variants: syncVariants(s.variants, s.activeVariantId, next, s.seed),
        });
      },

      resetParam(key) {
        const s = get();
        const defaults = s.tool.defaults as ParamValues;
        if (!Object.prototype.hasOwnProperty.call(defaults, key)) return;
        if (valuesEqual(s.params[key], defaults[key])) return;
        change({ params: { ...s.params, [key]: defaults[key] } });
      },

      resetParams() {
        const s = get();
        if (valuesEqual(s.params, s.tool.defaults)) return;
        change({ params: s.tool.defaults });
      },

      setSeed(seed) {
        change({ seed: toUint32(seed) });
      },

      setSize(size) {
        const parsed = canvasSizeSchema.safeParse(size);
        if (!parsed.success) return;
        change({ size: parsed.data }, SIZE_COALESCE_KEY);
      },

      toggleLock(key) {
        get().setLocked(key, !get().locks.has(key));
      },

      setLocked(key, locked) {
        const s = get();
        if (!isLockable(s.tool, key) || s.locks.has(key) === locked) return;
        const locks = new Set(s.locks);
        if (locked) locks.add(key);
        else locks.delete(key);
        set({ locks });
      },

      clearLocks() {
        if (get().locks.size > 0) set({ locks: new Set<string>() });
      },

      newVariant() {
        const s = get();
        const seed = toUint32(randomSeed());
        const rng = createRng((seed ^ RANDOMIZE_SALT) >>> 0);
        // Re-applying the locks guards against a tool that forgets keepLocked.
        const params = keepLocked(s.tool.randomize(rng, s.params, s.locks), s.params, s.locks);
        pushVariant(params, seed);
      },

      applyPreset(presetId) {
        const s = get();
        const preset = s.tool.presets.find((p) => p.id === presetId);
        if (!preset) return;
        pushVariant(preset.params, preset.seed === undefined ? s.seed : toUint32(preset.seed));
      },

      selectVariant(id) {
        const s = get();
        if (id === s.activeVariantId) return;
        const target = s.variants.find((v) => v.id === id);
        if (!target) return;
        set({
          params: target.params,
          seed: target.seed,
          activeVariantId: id,
          past: [...s.past, snapshot(s)].slice(-historyLimit),
          future: [],
          coalesce: null,
        });
      },

      nextVariant() {
        const i = activeIndex();
        // Without an active variant, "next" starts at the newest one.
        selectVariantAt(i === -1 ? get().variants.length - 1 : i + 1);
      },

      previousVariant() {
        const i = activeIndex();
        selectVariantAt(i === -1 ? get().variants.length - 1 : i - 1);
      },

      undo() {
        const s = get();
        const entry = s.past.at(-1);
        if (!entry) return;
        set({
          ...restore(entry),
          past: s.past.slice(0, -1),
          future: [snapshot(s), ...s.future].slice(0, historyLimit),
        });
      },

      redo() {
        const s = get();
        const entry = s.future[0];
        if (!entry) return;
        set({
          ...restore(entry),
          past: [...s.past, snapshot(s)].slice(-historyLimit),
          future: s.future.slice(1),
        });
      },

      commit() {
        if (get().coalesce !== null) set({ coalesce: null });
      },
    };
  });
}

// ---------------------------------------------------------------------------
// Selectors
// ---------------------------------------------------------------------------

export const selectCanUndo = (s: EditorState): boolean => s.past.length > 0;
export const selectCanRedo = (s: EditorState): boolean => s.future.length > 0;

/** The current design as a plain, serialisable object. */
export const selectDesign = (s: EditorState): Design => ({
  toolId: s.toolId,
  params: s.params,
  seed: s.seed,
  size: s.size,
});

/** Id of the preset whose params equal the current params, if any. */
export function findMatchingPresetId(
  tool: AnyToolDefinition,
  params: ParamValues,
): string | undefined {
  return tool.presets.find((p) => valuesEqual(p.params, params))?.id;
}
