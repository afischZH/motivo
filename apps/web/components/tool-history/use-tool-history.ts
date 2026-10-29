"use client";

import { useEffect, useState } from "react";

import { readFavoriteTools, readRecentTools, subscribeToolHistory } from "@/lib/tool-history";

export interface ToolHistory {
  recent: string[];
  favorites: string[];
  /** False until read in the browser (server HTML and first render show nothing). */
  loaded: boolean;
}

const EMPTY: ToolHistory = { recent: [], favorites: [], loaded: false };

/** Favourite and recent tool ids of this browser, kept fresh across tabs. */
export function useToolHistory(): ToolHistory {
  const [history, setHistory] = useState<ToolHistory>(EMPTY);
  useEffect(() => {
    const load = () =>
      setHistory({ recent: readRecentTools(), favorites: readFavoriteTools(), loaded: true });
    load();
    return subscribeToolHistory(load);
  }, []);
  return history;
}
