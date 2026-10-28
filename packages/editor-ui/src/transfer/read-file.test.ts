import { describe, expect, it } from "vitest";
import {
  readFileInWorker,
  serveFileWorker,
  type FileImporter,
  type FileWorkerRequest,
  type FileWorkerResponse,
} from "./read-file";

type Result = { ok: true; text: string } | { ok: false; error: string };

/** A scope like a worker's, driven by hand. */
function fakeScope() {
  let listener: ((event: MessageEvent<FileWorkerRequest>) => void) | null = null;
  const replies: FileWorkerResponse<unknown>[] = [];
  let resolveReply: () => void = () => undefined;
  const replied = new Promise<void>((resolve) => {
    resolveReply = resolve;
  });
  return {
    scope: {
      addEventListener(_type: "message", fn: (event: MessageEvent<FileWorkerRequest>) => void) {
        listener = fn;
      },
      postMessage(message: FileWorkerResponse<unknown>) {
        replies.push(message);
        resolveReply();
      },
    },
    send(file: Blob) {
      listener?.({ data: { id: 7, file } } as MessageEvent<FileWorkerRequest>);
    },
    replies,
    replied,
  };
}

const options = (parse: (text: string) => Result) => ({
  maxBytes: 100,
  tooLarge: { ok: false, error: "too-large" } as Result,
  unreadable: { ok: false, error: "malformed" } as Result,
  parse,
});

describe("serveFileWorker", () => {
  it("answers with the parse result", async () => {
    const w = fakeScope();
    serveFileWorker(
      w.scope,
      options((text) => ({ ok: true, text })),
    );
    w.send(new Blob(["hi"]));
    await w.replied;
    expect(w.replies).toEqual([{ id: 7, result: { ok: true, text: "hi" } }]);
  });

  it("still answers when parsing throws (e.g. stack overflow)", async () => {
    const w = fakeScope();
    serveFileWorker(
      w.scope,
      options(() => {
        throw new RangeError("Maximum call stack size exceeded");
      }),
    );
    w.send(new Blob(["x"]));
    await w.replied;
    expect(w.replies).toEqual([{ id: 7, result: { ok: false, error: "malformed" } }]);
  });

  it("refuses files over the limit unread", async () => {
    const w = fakeScope();
    serveFileWorker(
      w.scope,
      options(() => ({ ok: true, text: "" })),
    );
    w.send({ size: 101, text: () => Promise.reject(new Error("read")) } as unknown as Blob);
    await w.replied;
    expect(w.replies).toEqual([{ id: 7, result: { ok: false, error: "too-large" } }]);
  });
});

describe("readFileInWorker", () => {
  const importer = (parseOnMain: () => Promise<Result>): FileImporter<Result> => ({
    maxBytes: 100,
    defaultTimeoutMs: 1_000,
    tooLarge: { ok: false, error: "too-large" },
    empty: { ok: false, error: "empty" },
    createWorker: () => Promise.reject(new Error("unused")),
    parseOnMain,
  });

  /** A worker that never answers. */
  const silentWorker = () => {
    let terminated = false;
    const worker = {
      onmessage: null,
      onerror: null,
      onmessageerror: null,
      postMessage: () => undefined,
      terminate: () => {
        terminated = true;
      },
    };
    return { worker: worker as unknown as Worker, terminated: () => terminated };
  };

  it("gives up after the timeout and stops the worker, without parsing on the main thread", async () => {
    const silent = silentWorker();
    let mainCalls = 0;
    const result = await readFileInWorker(
      importer(() => {
        mainCalls++;
        return Promise.resolve({ ok: true, text: "" });
      }),
      new Blob(["x"]),
      { createWorker: () => Promise.resolve(silent.worker), timeoutMs: 10 },
    );
    expect(result).toEqual({ ok: false, error: "timeout" });
    expect(silent.terminated()).toBe(true);
    expect(mainCalls).toBe(0);
  });

  it("can be aborted", async () => {
    const silent = silentWorker();
    const controller = new AbortController();
    const pending = readFileInWorker(
      importer(() => Promise.resolve({ ok: true, text: "" })),
      new Blob(["x"]),
      { createWorker: () => Promise.resolve(silent.worker), signal: controller.signal },
    );
    await Promise.resolve();
    await Promise.resolve();
    controller.abort();
    expect(await pending).toEqual({ ok: false, error: "aborted" });
    expect(silent.terminated()).toBe(true);
  });

  it("ignores answers to other requests", async () => {
    let onmessage: ((event: MessageEvent) => void) | null = null;
    const worker = {
      set onmessage(fn: (event: MessageEvent) => void) {
        onmessage = fn;
      },
      onerror: null,
      onmessageerror: null,
      postMessage: (request: FileWorkerRequest) => {
        onmessage?.({
          data: { id: request.id + 1000, result: { ok: true, text: "forged" } },
        } as MessageEvent);
        onmessage?.({
          data: { id: request.id, result: { ok: true, text: "real" } },
        } as MessageEvent);
      },
      terminate: () => undefined,
    };
    const result = await readFileInWorker(
      importer(() => Promise.resolve({ ok: false, error: "main" })),
      new Blob(["x"]),
      { createWorker: () => Promise.resolve(worker as unknown as Worker) },
    );
    expect(result).toEqual({ ok: true, text: "real" });
  });
});
