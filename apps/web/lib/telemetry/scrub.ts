/**
 * Removes personal or design data from an error event before it leaves the
 * browser. Structural types (no Sentry import), so it is unit-testable and
 * stays out of the main bundle.
 */
import { scrubText, stripUrl } from "./reporter";

interface Frame {
  filename?: string;
  abs_path?: string;
  [key: string]: unknown;
}

export interface ScrubbableEvent {
  message?: string;
  request?: { url?: string; [key: string]: unknown };
  exception?: {
    values?: { value?: string; stacktrace?: { frames?: Frame[] }; [key: string]: unknown }[];
  };
  breadcrumbs?: unknown;
  user?: unknown;
  extra?: unknown;
  [key: string]: unknown;
}

/**
 * Keeps message, exception and stack, with every URL cut before `?` or `#`.
 * The request is reduced to the page URL (no headers, no query, no
 * fragment); user, breadcrumbs and extra data are dropped.
 */
export function scrubEvent<E extends ScrubbableEvent>(event: E, pageUrl: string): E {
  const values = event.exception?.values?.map((value) => ({
    ...value,
    ...(value.value !== undefined ? { value: scrubText(value.value) } : {}),
    ...(value.stacktrace
      ? {
          stacktrace: {
            ...value.stacktrace,
            frames: value.stacktrace.frames?.map((frame) => ({
              ...frame,
              ...(frame.filename !== undefined ? { filename: stripUrl(frame.filename) } : {}),
              ...(frame.abs_path !== undefined ? { abs_path: stripUrl(frame.abs_path) } : {}),
            })),
          },
        }
      : {}),
  }));

  const scrubbed: E = {
    ...event,
    request: { url: stripUrl(pageUrl) },
    ...(event.message !== undefined ? { message: scrubText(event.message) } : {}),
    ...(event.exception ? { exception: { ...event.exception, values } } : {}),
  };
  delete scrubbed.user;
  delete scrubbed.breadcrumbs;
  delete scrubbed.extra;
  return scrubbed;
}
