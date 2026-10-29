/**
 * Editor actions for the app's command palette (W1-AP01). The mounted editor
 * shell publishes the actions it can run right now; the palette lists them
 * and runs one by id. A module singleton, so the palette (in the site
 * header, outside the editor's React tree) imports only this small file,
 * never the editor itself (`@musterli/editor-ui/commands`).
 */

/** Order is the order in the palette. */
export const EDITOR_COMMAND_IDS = [
  "export",
  "newVariant",
  "save",
  "copyImage",
  "share",
  "applyBrandPalette",
  "undo",
  "redo",
  "help",
] as const;

export type EditorCommandId = (typeof EDITOR_COMMAND_IDS)[number];

export type EditorCommandHandlers = Partial<Record<EditorCommandId, () => void>>;

let current: EditorCommandHandlers | null = null;
const listeners = new Set<() => void>();

const notify = () => {
  for (const listener of listeners) listener();
};

/**
 * Publishes the editor's actions; returns the function that withdraws them
 * (on unmount). A later editor replaces an earlier one.
 */
export function publishEditorCommands(handlers: EditorCommandHandlers): () => void {
  current = handlers;
  notify();
  return () => {
    if (current !== handlers) return;
    current = null;
    notify();
  };
}

/** The actions available now, in palette order. */
export function availableEditorCommands(): EditorCommandId[] {
  const handlers = current;
  return handlers ? EDITOR_COMMAND_IDS.filter((id) => handlers[id] !== undefined) : [];
}

/** Runs an action; `false` if no editor offers it (any more). */
export function runEditorCommand(id: EditorCommandId): boolean {
  const handler = current?.[id];
  if (!handler) return false;
  handler();
  return true;
}

/** Called whenever the available actions change. */
export function subscribeEditorCommands(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
