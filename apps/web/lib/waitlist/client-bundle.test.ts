/**
 * Secrets stay on the server (CLAUDE.md "Sicherheit"):
 * 1. No client component can reach a server-only waitlist module through
 *    its imports (static walk over every "use client" file).
 * 2. After a build, the browser bundle contains none of the secret variable
 *    names, backend endpoints or (if set during the build) secret values.
 *    Skipped when there is no build output.
 */
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const APP = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

/** Modules that read secrets or call backends. */
const SERVER_ONLY = [
  "lib/waitlist/config.ts",
  "lib/waitlist/deps.ts",
  "lib/waitlist/email.ts",
  "lib/waitlist/handlers.ts",
  "lib/waitlist/schema.ts",
  "lib/waitlist/supabase.ts",
  "lib/waitlist/turnstile.ts",
  "lib/waitlist/crypto.ts",
];

const SOURCE_DIRS = ["app", "components", "lib", "i18n"];
const EXTENSIONS = [".ts", ".tsx"];

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return walk(path);
    return EXTENSIONS.some((ext) => name.endsWith(ext)) && !name.endsWith(".test.ts") ? [path] : [];
  });
}

function resolveImport(from: string, specifier: string): string | null {
  let base: string;
  if (specifier.startsWith("@/")) base = join(APP, specifier.slice(2));
  else if (specifier.startsWith(".")) base = resolve(dirname(from), specifier);
  else return null; // packages: none of them reads app secrets
  for (const candidate of [base, ...EXTENSIONS.map((ext) => base + ext), join(base, "index.ts")]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate;
  }
  return null;
}

function imports(file: string): string[] {
  const source = readFileSync(file, "utf8");
  // Type-only imports are erased and cannot leak anything.
  const pattern = /^\s*(?:import|export)\s+(?!type\b)(?:[^'"]*?\sfrom\s+)?["']([^"']+)["']/gm;
  return [...source.matchAll(pattern)].flatMap(([, spec]) => {
    const target = spec ? resolveImport(file, spec) : null;
    return target ? [target] : [];
  });
}

function reachable(entry: string): Set<string> {
  const seen = new Set<string>();
  const stack = [entry];
  while (stack.length > 0) {
    const file = stack.pop() as string;
    if (seen.has(file)) continue;
    seen.add(file);
    stack.push(...imports(file));
  }
  return seen;
}

describe("client components", () => {
  const files = SOURCE_DIRS.flatMap((dir) => walk(join(APP, dir)));
  const clientEntries = files.filter((file) =>
    /^\s*["']use client["']/.test(readFileSync(file, "utf8")),
  );

  it("include the waitlist form and unsubscribe page", () => {
    const names = clientEntries.map((file) => relative(APP, file));
    expect(names).toContain("components/waitlist/waitlist-form.tsx");
    expect(names).toContain("components/waitlist/unsubscribe-form.tsx");
  });

  it.each(SERVER_ONLY)("never reach %s", (serverModule) => {
    const target = join(APP, serverModule);
    for (const entry of clientEntries) {
      expect(reachable(entry).has(target), relative(APP, entry)).toBe(false);
    }
  });
});

const STATIC_DIRS = [join(APP, ".next/static"), join(APP, ".open-next/assets/_next/static")];
const built = STATIC_DIRS.filter((dir) => existsSync(dir));

describe.skipIf(built.length === 0)("built browser bundle", () => {
  const forbidden = [
    "SUPABASE_SERVICE_ROLE_KEY",
    "RESEND_API_KEY",
    "TURNSTILE_SECRET_KEY",
    "WAITLIST_FROM_EMAIL",
    "api.resend.com",
    "/rest/v1/rpc",
    "turnstile/v0/siteverify",
    // Values of the secrets when the build ran with them set.
    ...["SUPABASE_SERVICE_ROLE_KEY", "RESEND_API_KEY", "TURNSTILE_SECRET_KEY", "SUPABASE_URL"]
      .map((name) => process.env[name]?.trim())
      .filter((value): value is string => Boolean(value && value.length >= 8)),
  ];

  it.each(built.map((dir) => [relative(APP, dir), dir]))(
    "%s holds no secret names, values or backend endpoints",
    (_, dir) => {
      const scripts = readdirSync(dir as string, { recursive: true, encoding: "utf8" })
        .map((name) => join(dir as string, name))
        .filter((path) => path.endsWith(".js") && statSync(path).isFile());
      expect(scripts.length).toBeGreaterThan(0);
      for (const file of scripts) {
        const content = readFileSync(file, "utf8");
        for (const needle of forbidden) {
          expect(content.includes(needle), `${needle} in ${relative(APP, file)}`).toBe(false);
        }
      }
    },
  );
});
