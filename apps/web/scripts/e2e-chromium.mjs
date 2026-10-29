/**
 * Chromium E2E in two passes (`pnpm test:e2e:chromium [specs] [options]`):
 * first every test except the main-thread budget tests (tag `@long-tasks`,
 * `e2e/support/long-tasks.ts`) with the usual parallel workers, then those
 * tests alone with one worker. Parallel workers share the CPU and inflate
 * task times, so a 50 ms measurement is only meaningful on an idle CPU.
 * Both passes always run; the exit code fails if either does.
 *
 * Arguments (spec filters, `--headed`, ...) go to both passes. A plain
 * `playwright test --project=chromium` still runs every test in one pass
 * (CI does, with one worker).
 */
import { spawnSync } from "node:child_process";

const args = process.argv.slice(2);
const run = (extra) =>
  spawnSync(
    "playwright",
    ["test", "--project=chromium", "--pass-with-no-tests", ...extra, ...args],
    { stdio: "inherit", shell: process.platform === "win32" },
  ).status ?? 1;

const parallel = run(["--grep-invert=@long-tasks"]);
const alone = run(["--grep=@long-tasks", "--workers=1"]);
process.exit(parallel !== 0 ? parallel : alone);
