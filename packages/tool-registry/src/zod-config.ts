import * as z from "zod";

/**
 * Zod 4 compiles object parsers with `new Function` unless JIT is off. Its
 * probe for that (`Function("")`) is a CSP violation on our pages, whose
 * policy forbids eval (apps/web/lib/security-headers.ts). The interpreted
 * parser is fast enough for tool params. Imported first by the package
 * entry so it runs before any schema is parsed.
 */
z.config({ jitless: true });
