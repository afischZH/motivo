/**
 * Editor state of the social editor: the scene history (undo/redo with the
 * merge rules of `@musterli/scene`), the selection, the design's name and
 * saved id. One `useReducer`; the scene only ever changes through the pure
 * operations of `@musterli/scene`, so every step is a plain value that the
 * history, the draft and the saved design share.
 */
import { StorageError } from "@musterli/storage";
import {
  commitHistory,
  createHistory,
  pushHistory,
  redoHistory,
  undoHistory,
  type History,
  type Scene,
} from "@musterli/scene";

export interface SocialEditorState {
  history: History<Scene>;
  selection: readonly string[];
  name: string;
  /** Saved design this scene belongs to; `null` until the first save. */
  designId: string | null;
  /** The scene was changed since the last save (or since it was opened). */
  dirty: boolean;
}

export type SocialEditorAction =
  | { type: "change"; scene: Scene; key?: string | null; selection?: readonly string[] }
  /**
   * Corrects scenes without an undo step: text boxes grown once a font
   * finished loading (the text would be cut otherwise). `fix` runs over
   * the whole history (past, present and future), so undo and redo never
   * bring back a box that was too small; it returns the same scene when
   * nothing needs fixing.
   */
  | { type: "settle"; fix: (scene: Scene) => Scene }
  | { type: "commit" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "select"; selection: readonly string[] }
  | { type: "rename"; name: string }
  | { type: "load"; scene: Scene; name: string; designId: string | null; dirty?: boolean }
  /** `scene`: the scene that was saved; changes made while saving keep the editor dirty. */
  | { type: "saved"; designId: string; name: string; scene: Scene };

export function initialEditorState(scene: Scene, name: string): SocialEditorState {
  return { history: createHistory(scene), selection: [], name, designId: null, dirty: false };
}

/** `list` with `fn` applied, or `list` itself when `fn` changed nothing. */
function mapKeepingSame<T>(list: readonly T[], fn: (item: T) => T): readonly T[] {
  let changed = false;
  const out = list.map((item) => {
    const next = fn(item);
    if (next !== item) changed = true;
    return next;
  });
  return changed ? out : list;
}

/** The selection without ids the scene no longer has. */
function pruneSelection(scene: Scene, selection: readonly string[]): readonly string[] {
  const ids = new Set(scene.layers.map((l) => l.id));
  const kept = selection.filter((id) => ids.has(id));
  return kept.length === selection.length ? selection : kept;
}

export function socialEditorReducer(
  state: SocialEditorState,
  action: SocialEditorAction,
): SocialEditorState {
  switch (action.type) {
    case "change": {
      const history = pushHistory(state.history, action.scene, performance.now(), action.key);
      if (history === state.history && action.selection === undefined) return state;
      return {
        ...state,
        history,
        selection: pruneSelection(action.scene, action.selection ?? state.selection),
        dirty: state.dirty || history !== state.history,
      };
    }
    case "settle": {
      const h = state.history;
      const present = action.fix(h.present);
      const past = mapKeepingSame(h.past, action.fix);
      const future = mapKeepingSame(h.future, action.fix);
      if (present === h.present && past === h.past && future === h.future) return state;
      return { ...state, history: { ...h, past, present, future } };
    }
    case "commit": {
      const history = commitHistory(state.history);
      return history === state.history ? state : { ...state, history };
    }
    case "undo":
    case "redo": {
      const history =
        action.type === "undo" ? undoHistory(state.history) : redoHistory(state.history);
      if (history === state.history) return state;
      return {
        ...state,
        history,
        selection: pruneSelection(history.present, state.selection),
        dirty: true,
      };
    }
    case "select":
      return { ...state, selection: action.selection };
    case "rename":
      return action.name === state.name ? state : { ...state, name: action.name, dirty: true };
    case "load":
      return {
        history: createHistory(action.scene),
        selection: [],
        name: action.name,
        designId: action.designId,
        dirty: action.dirty ?? false,
      };
    case "saved":
      return {
        ...state,
        designId: action.designId,
        name: action.name,
        dirty: state.history.present !== action.scene,
      };
  }
}

/** A new layer or group id (letters and digits, unique enough within one scene). */
export function newSceneId(prefix = "l"): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return prefix + Array.from(bytes, (b) => b.toString(36).padStart(2, "0")).join("");
}

/** A new random seed for a background variant. */
export function randomSeed(): number {
  const value = new Uint32Array(1);
  crypto.getRandomValues(value);
  return value[0] ?? 1;
}

/**
 * Whether the autosave draft should be written for this state. A saved
 * design without changes is already safe in IndexedDB: writing it again
 * would give the draft a newer timestamp than the saved design and make an
 * unchanged design look edited after a reload (see `draftWins`). New,
 * unsaved scenes (a starter scene, a template) are always kept.
 */
export function shouldWriteDraft(state: Pick<SocialEditorState, "designId" | "dirty">): boolean {
  return state.designId === null || state.dirty;
}

/**
 * Whether the autosave draft holds newer, unsaved changes of the saved
 * design `record` (a reload or a crash after editing it): then the draft
 * opens instead of the saved version, so those changes are not lost.
 */
export function draftWins(
  draft: { designId: string | null; updatedAt: number } | null,
  record: { id: string; updatedAt: number },
): boolean {
  return draft !== null && draft.designId === record.id && draft.updatedAt > record.updatedAt;
}

/**
 * Saves over the design, or as a new one when it no longer exists (deleted
 * in another tab or on "My designs" meanwhile): a save never gets stuck on
 * a design that is gone.
 */
export async function updateOrCreate<T>(
  update: () => Promise<T>,
  create: () => Promise<T>,
): Promise<T> {
  try {
    return await update();
  } catch (error) {
    if (error instanceof StorageError && error.code === "not-found") return create();
    throw error;
  }
}
