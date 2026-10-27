"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { useStore } from "zustand";
import {
  createEditorStore,
  type EditorStore,
  type EditorStoreApi,
  type EditorStoreOptions,
} from "./editor-store";

const EditorStoreContext = createContext<EditorStoreApi | null>(null);

export type EditorStoreProviderProps =
  | { store: EditorStoreApi; options?: never; children: ReactNode }
  | { store?: never; options: EditorStoreOptions; children: ReactNode };

/**
 * Provides one editor store to its subtree. Pass an existing `store`, or
 * `options` to create one on first render (later option changes are ignored;
 * remount with a `key` to start over).
 */
export function EditorStoreProvider(props: EditorStoreProviderProps) {
  const [store] = useState<EditorStoreApi>(
    () => props.store ?? createEditorStore(props.options as EditorStoreOptions),
  );
  return (
    <EditorStoreContext.Provider value={props.store ?? store}>
      {props.children}
    </EditorStoreContext.Provider>
  );
}

/** The store of the nearest `EditorStoreProvider`. Throws outside of one. */
export function useEditorStoreApi(): EditorStoreApi {
  const store = useContext(EditorStoreContext);
  if (!store) throw new Error("useEditorStore must be used inside <EditorStoreProvider>");
  return store;
}

/** Subscribes to a slice of the editor store. Select primitives or stable references. */
export function useEditorStore<T>(selector: (state: EditorStore) => T): T {
  return useStore(useEditorStoreApi(), selector);
}
