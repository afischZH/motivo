/**
 * Editor state of the social editor: the scene history (undo/redo with the
 * merge rules of `@musterli/scene`), the selection, the design's name and
 * saved id. One `useReducer`; the scene only ever changes through the pure
 * operations of `@musterli/scene`, so every step is a plain value that the
 * history, the draft and the saved design share.
 */
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
  | { type: "commit" }
  | { type: "undo" }
  | { type: "redo" }
  | { type: "select"; selection: readonly string[] }
  | { type: "rename"; name: string }
  | { type: "load"; scene: Scene; name: string; designId: string | null; dirty?: boolean }
  | { type: "saved"; designId: string; name: string };

export function initialEditorState(scene: Scene, name: string): SocialEditorState {
  return { history: createHistory(scene), selection: [], name, designId: null, dirty: false };
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
      return { ...state, designId: action.designId, name: action.name, dirty: false };
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
