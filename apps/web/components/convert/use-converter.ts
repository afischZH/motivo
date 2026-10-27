"use client";

import { useEffect, useRef, useState } from "react";

import { createConverterClient, type ConverterClient } from "@/lib/convert/client";
import type { ConverterId } from "@/lib/convert/ids";
import type { ConverterInput, ConverterResult } from "@/lib/convert/run";

/** Typing pauses this long before a conversion starts. */
const DEBOUNCE_MS = 200;

type State = { requested: number; completed: number; result: ConverterResult | null };

const isEmpty = (input: ConverterInput | null) =>
  input === null || (typeof input === "string" ? input.trim() === "" : input.length === 0);

/**
 * Converts `input` in a Web Worker (falls back to a deferred main-thread call
 * where workers are unavailable or the worker fails). Only the response to the latest request is
 * kept, so fast typing never shows a stale result.
 */
export function useConverter(id: ConverterId, input: ConverterInput | null) {
  const clientRef = useRef<ConverterClient | null>(null);
  const counter = useRef(0);
  const [state, setState] = useState<State>({ requested: 0, completed: 0, result: null });

  useEffect(() => {
    const client = createConverterClient({
      createWorker: () =>
        new Worker(new URL("../../lib/convert/convert.worker.ts", import.meta.url), {
          type: "module",
        }),
      onResult: (requestId, result) =>
        setState((prev) =>
          requestId === prev.requested ? { ...prev, completed: requestId, result } : prev,
        ),
    });
    clientRef.current = client;
    return () => {
      client.dispose();
      clientRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (isEmpty(input)) return;
    const timer = setTimeout(
      () => {
        const requestId = ++counter.current;
        setState((prev) => ({ ...prev, requested: requestId }));
        if (input !== null) clientRef.current?.request({ requestId, id, input });
      },
      typeof input === "string" ? DEBOUNCE_MS : 0,
    );
    return () => clearTimeout(timer);
  }, [id, input]);

  if (isEmpty(input)) return { working: false, result: null };
  return { working: state.requested !== state.completed, result: state.result };
}
