/**
 * Details for tests that measure main-thread long tasks (the 50 ms rule).
 * The tag moves them into the `chromium` project of playwright.config.ts,
 * which runs them one at a time after every other test, so parallel
 * workers never share the CPU with a measurement.
 */
export const LONG_TASKS = { tag: "@long-tasks" } as const;
