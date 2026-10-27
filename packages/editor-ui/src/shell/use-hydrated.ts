"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => undefined;

/** False on the server and during hydration, true once the client has taken over. */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}
