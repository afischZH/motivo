/**
 * Saving in the editor (M3-AP03), without React: save or update the current
 * design in the browser (`@musterli/storage`), keep an autosave draft per tool
 * and reopen designs from `#design=<id>`. Nothing is sent anywhere.
 *
 * On start:
 *  - `#design=<id>` opens that saved design. A newer draft of the same
 *    design (unsaved changes) is offered, not applied.
 *  - `#d=<code>` (share link) wins: the share hook has loaded it. An existing
 *    draft is only offered.
 *  - Otherwise the tool's draft is restored (with a notice and a way to
 *    start over), unless it is just the tool's starting state.
 *
 * The draft is written debounced after every change of design or name, and
 * right away when the page is hidden.
 */
import {
  StorageError,
  normalizeDesignName,
  type DesignRecord,
  type DesignStore,
  type Draft,
} from "@musterli/storage";
import type { AnyToolDefinition, CanvasSize } from "@musterli/tool-registry";
import { DEFAULT_SEED, type EditorStoreApi, type ParamValues } from "../store/editor-store";
import { valuesEqual } from "../store/values";
import { designHash, designIdFromHash } from "./hash";

export { DESIGN_HASH_PARAM, designHash, designIdFromHash } from "./hash";

/** Debounce of the autosave draft. */
export const DRAFT_DELAY_MS = 800;

export type LocalDesignErrorCode =
  "unavailable" | "quota" | "blocked" | "failed" | "not-found" | "other-tool" | "invalid";

export type LocalDesignNotice =
  | { kind: "draft-restored" }
  | { kind: "draft-available" }
  | { kind: "outdated" }
  | { kind: "error"; code: LocalDesignErrorCode };

export interface LocalDesignView {
  /** The start sequence (open, restore) has finished. */
  ready: boolean;
  /** The saved design being edited, `null` for an unsaved one. */
  designId: string | null;
  name: string;
  saving: boolean;
  /** The current design differs from what was saved (always true while unsaved). */
  dirty: boolean;
  notice: LocalDesignNotice | null;
}

export interface LocationLike {
  getHash(): string;
  /** Replaces the hash without a history entry and without `hashchange`. */
  replaceHash(hash: string): void;
}

export interface LocalDesignOptions {
  store: EditorStoreApi;
  designs: DesignStore;
  /** Thumbnail of the current design; `null` when none can be made. */
  thumbnail(design: { params: ParamValues; seed: number; size: CanvasSize }): Promise<Blob | null>;
  /** Name for a design saved without one (replaceable with `setDefaultName`). */
  defaultName(): string;
  location: LocationLike;
  draftDelayMs?: number;
  now?: () => number;
  setTimeout?: (fn: () => void, ms: number) => unknown;
  clearTimeout?: (handle: unknown) => void;
}

export interface LocalDesignController {
  getView(): LocalDesignView;
  subscribe(listener: () => void): () => void;
  /** Runs the start sequence and starts autosaving. Returns `stop`. */
  start(): () => void;
  /** Saves or updates. Resolves to whether it worked. */
  save(): Promise<boolean>;
  setName(name: string): void;
  /** Stores a changed name of a saved design (blur, Enter). */
  commitName(): Promise<void>;
  /** Applies the offered draft. */
  restoreDraft(): void;
  /** Leaves the current design and starts from the tool's defaults. */
  startNew(): void;
  dismissNotice(): void;
  /** Writes a pending draft now (page hidden). */
  flushDraft(): Promise<void>;
  /** Opens a saved design by id (hash changes). */
  open(id: string): Promise<void>;
  /** Replaces the name source, e.g. after a language change. */
  setDefaultName(defaultName: () => string): void;
}

const INITIAL_VIEW: LocalDesignView = {
  ready: false,
  designId: null,
  name: "",
  saving: false,
  dirty: true,
  notice: null,
};

interface Snapshot {
  params: ParamValues;
  seed: number;
  size: CanvasSize;
}

/** Whether the hash carries a share link (`#d=`). */
function hasShareCode(hash: string): boolean {
  const body = hash.startsWith("#") ? hash.slice(1) : hash;
  return body.split("&").some((p) => p.startsWith("d="));
}

function sameDesign(a: Snapshot, b: Snapshot): boolean {
  return (
    a.seed === b.seed &&
    a.size.width === b.size.width &&
    a.size.height === b.size.height &&
    valuesEqual(a.params, b.params)
  );
}

function errorCode(error: unknown): LocalDesignErrorCode {
  // `limit` only concerns the brand kit lists.
  return error instanceof StorageError && error.code !== "limit" ? error.code : "failed";
}

function startState(tool: AnyToolDefinition): Snapshot {
  const size = tool.defaultSize ?? { width: 1080, height: 1080 };
  return { params: tool.defaults, seed: DEFAULT_SEED, size };
}

export function createLocalDesignController(options: LocalDesignOptions): LocalDesignController {
  const { store, designs, location } = options;
  const now = options.now ?? Date.now;
  const later = options.setTimeout ?? ((fn: () => void, ms: number) => setTimeout(fn, ms));
  const cancel =
    options.clearTimeout ??
    ((handle: unknown) => clearTimeout(handle as ReturnType<typeof setTimeout>));
  const delay = options.draftDelayMs ?? DRAFT_DELAY_MS;
  let defaultName = options.defaultName;

  let view: LocalDesignView = INITIAL_VIEW;
  const listeners = new Set<() => void>();
  /** What was last saved (content and name); `null` while unsaved. */
  let baseline: (Snapshot & { name: string }) | null = null;
  /** A draft offered but not applied. */
  let offered: Draft | null = null;
  let draftTimer: unknown = null;
  let draftPending = false;
  let stopped = false;
  /** Bumped by every `start`, so a superseded start sequence stops (React strict mode). */
  let generation = 0;

  const current = (): Snapshot => {
    const s = store.getState();
    return { params: s.params, seed: s.seed, size: s.size };
  };

  const computeDirty = (name: string, designId: string | null): boolean =>
    designId === null ||
    baseline === null ||
    baseline.name !== normalizeDesignName(name) ||
    !sameDesign(current(), baseline);

  const update = (patch: Partial<LocalDesignView>) => {
    const next = { ...view, ...patch };
    next.dirty = computeDirty(next.name, next.designId);
    if (
      next.ready === view.ready &&
      next.designId === view.designId &&
      next.name === view.name &&
      next.saving === view.saving &&
      next.dirty === view.dirty &&
      next.notice === view.notice
    ) {
      return;
    }
    view = next;
    for (const listener of listeners) listener();
  };

  const writeDraft = async (): Promise<void> => {
    draftPending = false;
    if (draftTimer !== null) {
      cancel(draftTimer);
      draftTimer = null;
    }
    const s = store.getState();
    try {
      await designs.putDraft({
        toolId: s.toolId,
        toolVersion: s.tool.version,
        designId: view.designId,
        name: normalizeDesignName(view.name),
        params: s.params as Record<string, unknown>,
        seed: s.seed,
        size: { width: s.size.width, height: s.size.height },
        updatedAt: now(),
      });
    } catch {
      // Autosave is best effort; saving reports storage problems.
    }
  };

  const scheduleDraft = () => {
    if (!view.ready || stopped) return;
    draftPending = true;
    if (draftTimer !== null) cancel(draftTimer);
    draftTimer = later(() => {
      draftTimer = null;
      void writeDraft();
    }, delay);
  };

  const load = (design: Snapshot): boolean =>
    store.getState().loadDesign({
      toolId: store.getState().toolId,
      params: design.params,
      seed: design.seed,
      size: design.size,
    }).ok;

  const replaceHash = (designId: string | null) => {
    location.replaceHash(designId === null ? "" : designHash(designId));
  };

  /** The saved design a draft refers to, if it still exists. */
  const linkedRecord = async (designId: string | null): Promise<DesignRecord | null> => {
    if (designId === null) return null;
    try {
      return await designs.get(designId);
    } catch {
      return null;
    }
  };

  const applyDraft = async (draft: Draft): Promise<boolean> => {
    if (!load(draft)) return false;
    const record = await linkedRecord(draft.designId);
    baseline = record ? { ...record, name: record.name } : null;
    update({ designId: record ? record.id : null, name: draft.name });
    return true;
  };

  const openDesign = async (id: string): Promise<void> => {
    let record: DesignRecord | null;
    try {
      record = await designs.get(id);
    } catch (error) {
      update({ notice: { kind: "error", code: errorCode(error) } });
      return;
    }
    const s = store.getState();
    if (!record) {
      update({ notice: { kind: "error", code: "not-found" } });
      return;
    }
    if (record.toolId !== s.toolId) {
      update({ notice: { kind: "error", code: "other-tool" } });
      return;
    }
    if (!load(record)) {
      update({ notice: { kind: "error", code: "invalid" } });
      return;
    }
    baseline = {
      params: store.getState().params,
      seed: record.seed,
      size: record.size,
      name: record.name,
    };
    update({
      designId: record.id,
      name: record.name,
      notice: record.toolVersion !== s.tool.version ? { kind: "outdated" } : null,
    });
  };

  const run = async (gen: number) => {
    const live = () => gen === generation && !stopped;
    const hash = location.getHash();
    const toolId = store.getState().toolId;
    let draft: Draft | null = null;
    try {
      draft = await designs.getDraft(toolId);
    } catch {
      // No storage: saving explains it when tried.
    }
    if (!live()) return;
    const designId = designIdFromHash(hash);
    if (designId !== null) {
      await openDesign(designId);
      if (!live()) return;
      if (
        draft &&
        draft.designId === designId &&
        view.designId === designId &&
        baseline &&
        !sameDesign(draft, baseline)
      ) {
        offered = draft;
        update({ notice: { kind: "draft-available" } });
      }
    } else if (hasShareCode(hash)) {
      if (draft && !sameDesign(draft, current())) {
        offered = draft;
        update({ notice: { kind: "draft-available" } });
      }
    } else if (draft) {
      const fresh = draft.designId === null && sameDesign(draft, startState(store.getState().tool));
      if (!fresh && (await applyDraft(draft))) {
        if (!live()) return;
        update({ notice: { kind: "draft-restored" } });
        if (view.designId !== null) replaceHash(view.designId);
      }
    }
    if (live()) update({ ready: true });
  };

  return {
    getView: () => view,

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    start() {
      stopped = false;
      const gen = ++generation;
      let last = current();
      const unsubscribe = store.subscribe((s) => {
        if (s.params === last.params && s.seed === last.seed && s.size === last.size) return;
        last = { params: s.params, seed: s.seed, size: s.size };
        update({});
        scheduleDraft();
      });
      void run(gen);
      return () => {
        stopped = true;
        unsubscribe();
        if (draftPending) void writeDraft();
      };
    },

    async save() {
      if (view.saving || !view.ready) return false;
      const design = current();
      const name = normalizeDesignName(view.name) || normalizeDesignName(defaultName());
      update({ saving: true });
      let thumbnail: Blob | null = null;
      try {
        thumbnail = await options.thumbnail(design);
      } catch {
        // Saved without; "Meine Designs" draws it later.
      }
      const s = store.getState();
      const input = {
        toolId: s.toolId,
        toolVersion: s.tool.version,
        name,
        params: design.params as Record<string, unknown>,
        seed: design.seed,
        size: { width: design.size.width, height: design.size.height },
        thumbnail,
      };
      try {
        const first = view.designId === null;
        let record: DesignRecord;
        if (view.designId === null) {
          record = await designs.create(input);
        } else {
          try {
            record = await designs.update(view.designId, input);
          } catch (error) {
            // Deleted in another tab meanwhile: save it as a new design.
            if (!(error instanceof StorageError) || error.code !== "not-found") throw error;
            record = await designs.create(input);
          }
        }
        baseline = { ...design, name: record.name };
        offered = null;
        update({ saving: false, designId: record.id, name: record.name, notice: null });
        replaceHash(record.id);
        await writeDraft();
        if (first) void designs.requestPersistence().catch(() => undefined);
        return true;
      } catch (error) {
        update({ saving: false, notice: { kind: "error", code: errorCode(error) } });
        return false;
      }
    },

    setName(name) {
      update({ name });
      scheduleDraft();
    },

    async commitName() {
      const id = view.designId;
      const name = normalizeDesignName(view.name);
      if (id === null || baseline === null || name === "" || name === baseline.name) return;
      try {
        await designs.rename(id, name);
        baseline = { ...baseline, name };
        update({ name });
      } catch (error) {
        update({ notice: { kind: "error", code: errorCode(error) } });
      }
    },

    restoreDraft() {
      const draft = offered;
      offered = null;
      if (!draft) return;
      update({ notice: null });
      void applyDraft(draft).then((ok) => {
        if (ok) replaceHash(view.designId);
        else update({ notice: { kind: "error", code: "invalid" } });
      });
    },

    startNew() {
      offered = null;
      baseline = null;
      load(startState(store.getState().tool));
      update({ designId: null, name: "", notice: null });
      replaceHash(null);
      void designs.deleteDraft(store.getState().toolId).catch(() => undefined);
      if (draftTimer !== null) cancel(draftTimer);
      draftTimer = null;
      draftPending = false;
    },

    dismissNotice() {
      offered = null;
      update({ notice: null });
    },

    async flushDraft() {
      if (draftPending) await writeDraft();
    },

    open: openDesign,

    setDefaultName(next) {
      defaultName = next;
    },
  };
}
