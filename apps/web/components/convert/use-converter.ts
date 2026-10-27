"use client";

import { useEffect, useRef, useState } from "react";

import type { WorkerRequest, WorkerResponse } from "@/lib/convert/convert.worker";
import type { ConverterId } from "@/lib/convert/ids";
import { runConverter, type ConverterInput, type ConverterResult } from "@/lib/convert/run";

/** Typing pauses this long before a conversion starts. */
const DEBOUNCE_MS = 200;

type State = { requested: number; completed: number; result: ConverterResult | null };

const isEmpty = (input: ConverterInput | null) =>
  input === null || (typeof input === "string" ? input.trim() === "" : input.length === 0);

/**
 * Converts `input` in a Web Worker (falls back to a deferred main-thread call
 * where workers are unavailable). Only the response to the latest request is
 * kept, so fast typing never shows a stale result.
 */
export function useConverter(id: ConverterId, input: ConverterInput | null) {
  const workerRef = useRef<Worker | null>(null);
  const counter = useRef(0);
  const [state, setState] = useState<State>({ requested: 0, completed: 0, result: null });

  useEffect(() => {
    let worker: Worker | null = null;
    try {
      worker = new Worker(new URL("../../lib/convert/convert.worker.ts", import.meta.url), {
        type: "module",
      });
    } catch {
      worker = null;
    }
    if (worker) {
      worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
        const { requestId, result } = event.data;
        setState((prev) =>
          requestId === prev.requested ? { ...prev, completed: requestId, result } : prev,
        );
      };
    }
    workerRef.current = worker;
    return () => {
      worker?.terminate();
      workerRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (isEmpty(input)) return;
    const timer = setTimeout(
      () => {
        const requestId = ++counter.current;
        setState((prev) => ({ ...prev, requested: requestId }));
        const worker = workerRef.current;
        if (worker && input !== null) {
          const request: WorkerRequest = { requestId, id, input };
          worker.postMessage(request);
        } else if (input !== null) {
          const result = runConverter(id, input);
          setState((prev) =>
            requestId === prev.requested ? { ...prev, completed: requestId, result } : prev,
          );
        }
      },
      typeof input === "string" ? DEBOUNCE_MS : 0,
    );
    return () => clearTimeout(timer);
  }, [id, input]);

  if (isEmpty(input)) return { working: false, result: null };
  return { working: state.requested !== state.completed, result: state.result };
}
