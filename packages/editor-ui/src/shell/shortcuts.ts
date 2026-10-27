/**
 * Editor keyboard shortcuts (docs/DESIGN.md section 4).
 *
 * Pure functions: `matchShortcut` maps a key event to an action, and
 * `isShortcutBlocked` decides whether the focused element owns the key
 * (typing in a field, Space on a button, arrows in a slider or radio group).
 * `useEditorShortcuts` binds both to `window`.
 */

export type ShortcutAction =
  | "newVariant"
  | "undo"
  | "redo"
  | "previousVariant"
  | "nextVariant"
  | "zoomFit"
  | "zoom100"
  | "help"
  | "export"
  | "copyImage";

/** The parts of a `KeyboardEvent` the matcher reads. */
export interface ShortcutKeyEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  shiftKey: boolean;
  altKey: boolean;
}

/** Maps a key combination to an editor action, ignoring focus. */
export function matchShortcut(event: ShortcutKeyEvent): ShortcutAction | null {
  // Alt (and AltGr, reported as Ctrl+Alt on Windows) types characters.
  if (event.altKey) return null;
  const mod = event.metaKey || event.ctrlKey;
  if (mod) {
    const key = event.key.toLowerCase();
    if (key === "z") return event.shiftKey ? "redo" : "undo";
    if (key === "y" && event.ctrlKey && !event.metaKey && !event.shiftKey) return "redo";
    if (key === "e" && !event.shiftKey) return "export";
    if (key === "c" && event.shiftKey) return "copyImage";
    return null;
  }
  // "?" needs Shift on most layouts, so it is matched before the Shift check.
  if (event.key === "?") return "help";
  if (event.shiftKey) return null;
  switch (event.key) {
    case " ":
    case "Spacebar":
      return "newVariant";
    case "ArrowLeft":
      return "previousVariant";
    case "ArrowRight":
      return "nextVariant";
    case "0":
      return "zoomFit";
    case "1":
      return "zoom100";
    default:
      return null;
  }
}

/** Input types that only react to clicks, Space and Enter. */
const BUTTON_LIKE_INPUTS = new Set([
  "button",
  "submit",
  "reset",
  "checkbox",
  "radio",
  "color",
  "file",
  "image",
  "range",
]);

/** Roles activated by Space. */
const SPACE_ROLES = new Set([
  "button",
  "checkbox",
  "radio",
  "switch",
  "tab",
  "option",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "treeitem",
]);

/** Roles whose element handles arrow keys itself. */
const ARROW_ROLES = new Set([
  "slider",
  "spinbutton",
  "scrollbar",
  "radio",
  "tab",
  "option",
  "menuitem",
  "menuitemcheckbox",
  "menuitemradio",
  "treeitem",
  "gridcell",
]);

/** Composite widgets that move focus between their items with arrow keys. */
const ARROW_CONTAINER_SELECTOR =
  '[role="radiogroup"], [role="tablist"], [role="listbox"], [role="menu"], [role="menubar"], [role="toolbar"], [role="tree"], [role="grid"]';

const DIALOG_SELECTOR = 'dialog, [role="dialog"], [role="alertdialog"]';

const TEXT_ROLES = new Set(["textbox", "searchbox", "combobox", "spinbutton"]);

function isElement(target: unknown): target is Element {
  return (
    typeof target === "object" &&
    target !== null &&
    (target as { nodeType?: unknown }).nodeType === 1
  );
}

/** Text fields, selects and rich-text areas: every printable key and Ctrl+Z belong to them. */
export function isEditableTarget(el: Element): boolean {
  const tag = el.tagName;
  if (tag === "TEXTAREA" || tag === "SELECT") return true;
  if (tag === "INPUT") {
    const type = (el.getAttribute("type") ?? "text").toLowerCase();
    return !BUTTON_LIKE_INPUTS.has(type);
  }
  if ((el as HTMLElement).isContentEditable) return true;
  if (el.closest('[contenteditable]:not([contenteditable="false"])')) return true;
  const role = el.getAttribute("role");
  return role !== null && TEXT_ROLES.has(role);
}

/**
 * Marks preset and filmstrip tiles. After a click they keep focus, but Space
 * still means "new variant" there (DESIGN.md 4); Enter activates the tile.
 */
export const EDITOR_TILE_ATTRIBUTE = "data-editor-tile";

function nativeSpaceTarget(el: Element): boolean {
  if (el.hasAttribute(EDITOR_TILE_ATTRIBUTE)) return false;
  const tag = el.tagName;
  if (tag === "BUTTON" || tag === "SUMMARY") return true;
  if (tag === "INPUT") return true; // remaining inputs are button-like
  const role = el.getAttribute("role");
  return role !== null && SPACE_ROLES.has(role);
}

function nativeArrowTarget(el: Element): boolean {
  if (el.tagName === "INPUT") {
    const type = (el.getAttribute("type") ?? "text").toLowerCase();
    if (type === "range" || type === "radio") return true;
  }
  const role = el.getAttribute("role");
  if (role !== null && ARROW_ROLES.has(role)) return true;
  return el.closest(ARROW_CONTAINER_SELECTOR) !== null;
}

/**
 * Whether the focused element gives `action` a native meaning, so the editor
 * must not handle it. `target` is usually `event.target`.
 */
export function isShortcutBlocked(target: EventTarget | null, action: ShortcutAction): boolean {
  if (!isElement(target)) return false;
  // Open dialogs and popovers (shortcut help, colour picker) own the keyboard.
  if (target.closest(DIALOG_SELECTOR)) return true;
  if (isEditableTarget(target)) return true;
  switch (action) {
    case "newVariant":
      return nativeSpaceTarget(target);
    case "previousVariant":
    case "nextVariant":
      return nativeArrowTarget(target);
    default:
      return false;
  }
}

/** Matches a keydown event and applies the focus rules. */
export function resolveShortcut(
  event: ShortcutKeyEvent & {
    target: EventTarget | null;
    defaultPrevented?: boolean;
    isComposing?: boolean;
  },
): ShortcutAction | null {
  if (event.defaultPrevented || event.isComposing) return null;
  const action = matchShortcut(event);
  if (action === null || isShortcutBlocked(event.target, action)) return null;
  return action;
}

/** Actions that must not fire again while the key is held down. */
export const NON_REPEATING_ACTIONS: ReadonlySet<ShortcutAction> = new Set([
  "newVariant",
  "help",
  "export",
  "copyImage",
  "zoomFit",
  "zoom100",
]);

/** One row of the shortcut help, with key labels as shown to the user. */
export interface ShortcutHelpEntry {
  /** Key caps; `"mod"` renders as ⌘/Ctrl, `"space"` and `"shift"` are translated. */
  keys: readonly (readonly string[])[];
  /** Message key under `Editor.shortcuts.actions`. */
  action: ShortcutAction | "theme";
}

/** Shortcuts shown in the help dialog, in display order. */
export const SHORTCUT_HELP: readonly ShortcutHelpEntry[] = [
  { action: "newVariant", keys: [["space"]] },
  { action: "undo", keys: [["mod", "Z"]] },
  {
    action: "redo",
    keys: [
      ["shift", "mod", "Z"],
      ["Ctrl", "Y"],
    ],
  },
  { action: "previousVariant", keys: [["←"]] },
  { action: "nextVariant", keys: [["→"]] },
  { action: "zoomFit", keys: [["0"]] },
  { action: "zoom100", keys: [["1"]] },
  { action: "export", keys: [["mod", "E"]] },
  { action: "copyImage", keys: [["mod", "shift", "C"]] },
  { action: "theme", keys: [["mod", "shift", "K"]] },
  { action: "help", keys: [["?"]] },
];
