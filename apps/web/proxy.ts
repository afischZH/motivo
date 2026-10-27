import createMiddleware from "next-intl/middleware";

import { routing } from "./i18n/routing";

// Next 16 renamed `middleware` to `proxy`. next-intl handles locale
// detection (cookie, then Accept-Language, default "de") and redirects.
export default createMiddleware(routing);

export const config = {
  // Skip API routes, Next internals and files with an extension.
  matcher: "/((?!api|_next|_vercel|.*\\..*).*)",
};
