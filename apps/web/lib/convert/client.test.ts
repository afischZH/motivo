import { describe, expect, it, vi } from "vitest";
import { createConverterClient, type ConverterWorker } from "./client";
import type { WorkerRequest } from "./convert.worker";
import { runConverter } from "./run";

function fakeWorker() {
  const sent: WorkerRequest[] = [];
  const worker: ConverterWorker & { sent: WorkerRequest[]; terminated: boolean } = {
    sent,
    terminated: false,
    onmessage: null,
    onerror: null,
    onmessageerror: null,
    postMessage: (message) => sent.push(message),
    terminate() {
      worker.terminated = true;
    },
  };
  return worker;
}

const svg = '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"/>';
const request = (requestId: number): WorkerRequest => ({
  requestId,
  id: "svg-to-base64",
  input: svg,
});

describe("createConverterClient", () => {
  it("sends requests to the worker and reports its responses", () => {
    const worker = fakeWorker();
    const onResult = vi.fn();
    const client = createConverterClient({ createWorker: () => worker, onResult });
    client.request(request(1));
    expect(worker.sent).toEqual([request(1)]);
    expect(onResult).not.toHaveBeenCalled();

    const result = runConverter("svg-to-base64", svg);
    worker.onmessage?.({ data: { requestId: 1, result } } as MessageEvent);
    expect(onResult).toHaveBeenCalledWith(1, result);
  });

  it("converts on the main thread when no worker can be created", () => {
    const onResult = vi.fn();
    const client = createConverterClient({
      createWorker: () => {
        throw new Error("no workers here");
      },
      onResult,
    });
    client.request(request(1));
    expect(onResult).toHaveBeenCalledWith(1, runConverter("svg-to-base64", svg));
  });

  it.each(["onerror", "onmessageerror"] as const)(
    "falls back to the main thread after %s",
    (handler) => {
      const worker = fakeWorker();
      const onResult = vi.fn();
      const client = createConverterClient({ createWorker: () => worker, onResult });
      client.request(request(1));

      const event = { preventDefault: vi.fn() };
      (worker[handler] as ((e: unknown) => void) | null)?.(event);
      expect(worker.terminated).toBe(true);
      // The open request is finished here instead of hanging forever.
      expect(onResult).toHaveBeenCalledWith(1, runConverter("svg-to-base64", svg));

      client.request(request(2));
      expect(worker.sent).toHaveLength(1);
      expect(onResult).toHaveBeenLastCalledWith(2, runConverter("svg-to-base64", svg));
    },
  );

  it("terminates the worker on dispose", () => {
    const worker = fakeWorker();
    const client = createConverterClient({ createWorker: () => worker, onResult: vi.fn() });
    client.dispose();
    expect(worker.terminated).toBe(true);
  });
});
