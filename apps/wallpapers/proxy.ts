import createMiddleware from "next-intl/middleware";

import { routing } from "./i18n/routing";

// Locale redirect for "/" and unprefixed paths. Security headers come from
// next.config.ts (pages) and public/_headers (static files).
export default createMiddleware(routing);

export const config = {
  // Skip Next internals, API-free static files and anything with a file extension.
  matcher: ["/((?!_next|_vercel|.*\\..*).*)"],
};
