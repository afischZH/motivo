/**
 * A tiny error reporter interface and the lazy loader in front of it. The
 * page only ships these few lines; the actual reporter (Sentry, see
 * `sentry.ts`) is imported on the first error, so healthy sessions never
 * download it. Swapping Sentry for another service means one new
 * `ErrorReporter` implementation.
 */

export interface ErrorReporter {
  capture(error: unknown): void;
}

export interface LazyReporterOptions {
  /** Errors kept while the reporter loads; later ones are dropped. */
  maxQueue?: number;
  /** Errors reported per page view at most (protects the free quota). */
  maxEvents?: number;
}

/**
 * Forwards errors to the reporter that `load` resolves to, calling `load`
 * once, on the first error. Never throws: a failed load disables reporting
 * for the rest of the page view.
 */
export function createLazyReporter(
  load: () => Promise<ErrorReporter>,
  { maxQueue = 10, maxEvents = 25 }: LazyReporterOptions = {},
): ErrorReporter {
  let state: "idle" | "loading" | "ready" | "failed" = "idle";
  let reporter: ErrorReporter | undefined;
  let sent = 0;
  const queue: unknown[] = [];

  const send = (error: unknown) => {
    if (sent >= maxEvents) return;
    sent++;
    try {
      reporter?.capture(error);
    } catch {
      // Reporting must never break the page.
    }
  };

  return {
    capture(error) {
      if (state === "failed") return;
      if (state === "ready") return send(error);
      if (queue.length < maxQueue) queue.push(error);
      if (state === "loading") return;
      state = "loading";
      load().then(
        (loaded) => {
          reporter = loaded;
          state = "ready";
          for (const queued of queue.splice(0)) send(queued);
        },
        () => {
          state = "failed";
          queue.length = 0;
        },
      );
    },
  };
}

/** The window events the global handlers need (a subset of `Window`). */
export interface ErrorEventTarget {
  addEventListener(type: "error" | "unhandledrejection", listener: (event: Event) => void): void;
  removeEventListener(type: "error" | "unhandledrejection", listener: (event: Event) => void): void;
}

/**
 * Sends uncaught errors and unhandled promise rejections to `reporter`.
 * Returns a function that removes the listeners.
 */
export function installGlobalHandlers(reporter: ErrorReporter, target: ErrorEventTarget) {
  const onError = (event: Event) => {
    const { error, message } = event as Event & { error?: unknown; message?: string };
    // Resource load errors do not bubble to window; scripts from other
    // origins arrive as "Script error." without details and are skipped.
    if (error === undefined || error === null) {
      if (message && message !== "Script error.") reporter.capture(new Error(message));
      return;
    }
    reporter.capture(error);
  };
  const onRejection = (event: Event) => {
    reporter.capture((event as Event & { reason?: unknown }).reason);
  };
  target.addEventListener("error", onError);
  target.addEventListener("unhandledrejection", onRejection);
  return () => {
    target.removeEventListener("error", onError);
    target.removeEventListener("unhandledrejection", onRejection);
  };
}

/** `url` without query string and fragment (share links carry designs in `#d=`). */
export function stripUrl(url: string): string {
  const cut = url.search(/[?#]/);
  return cut === -1 ? url : url.slice(0, cut);
}

/** Removes query strings and fragments from every URL inside a free text. */
export function scrubText(text: string): string {
  return text
    .replace(/\b(?:https?|blob):[^\s"'`<>)]+/g, (url) => stripUrl(url))
    .replace(/#d=[^\s"'`<>)]*/g, "");
}
